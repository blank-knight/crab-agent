"""Regression tests from the 2026-11-17 review pilot (commit 2331a9eb05).

Drives the REAL WeixinQrSession state machine with a scripted _api_get —
HTTP contract tests (test_web_server_weixin_onboarding.py, FakeQrSession)
and state-machine unit tests are two deliverables (REVIEW.md red line #9:
stub is not coverage). Covers the findings:
- refresh budget accounting on "expired" (was: zero direct coverage)
- confirmed → credentials capture / missing-fields guard
- concurrent poll double-digest race (was: no lock)
"""
import asyncio
from unittest import mock as _mock
from unittest.mock import patch

import pytest

from gateway.platforms.weixin import WeixinQrSession


class ScriptedApi:
    """Replaces gateway.platforms.weixin._api_get; plays a scripted list."""

    def __init__(self, script):
        self.script = list(script)
        self.calls = []

    async def __call__(self, session, base_url, endpoint, timeout_ms):
        self.calls.append((base_url, endpoint))
        item = self.script.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


def make_session(script):
    """Create a session whose ENTIRE _api_get call chain is scripted.

    patch covers start() and every later poll() (poll self-calls _fetch_qr
    which hits module-level _api_get — patching only around start() lets
    refreshes escape to the real network, observed as real iLink tokens in
    assertions).
    """
    s = WeixinQrSession()
    rec = ScriptedApi(script)
    patcher = patch("gateway.platforms.weixin._api_get", rec)
    patcher.start()
    assert asyncio.run(s.start()) is True
    s._patcher = patcher          # test must stop it (or use fixture teardown)
    return s, rec


@pytest.fixture(autouse=True)
def _stop_patcher():
    """Safety net: undo any patch left by a failing assertion mid-test."""
    yield
    _mock.patch.stopall()


def qr(qrcode="tok", url="https://qr/img"):
    return {"qrcode": qrcode, "qrcode_img_content": url}


def test_poll_expired_within_budget_refreshes_token():
    s, rec = make_session(
        [qr("tok_1"), {"status": "expired"}, qr("tok_2")],
    )
    snap = asyncio.run(s.poll())
    assert s.refresh_count == 1
    assert s.qr_token == "tok_2"          # new token fetched
    assert s.status != "timeout"          # within budget
    assert snap["refresh_count"] == 1


def test_poll_expired_beyond_budget_times_out():
    s, rec = make_session(
        [qr("t0")]
        + [{"status": "expired"}, qr("t1")]
        + [{"status": "expired"}, qr("t2")]
        + [{"status": "expired"}, qr("t3")]
        + [{"status": "expired"}]          # 4th expiry: no budget left
    )
    
    for _ in range(3):
        asyncio.run(s.poll())
        assert s.status != "timeout"
    asyncio.run(s.poll())
    assert s.status == "timeout"
    assert s.last_error == "二维码多次过期"


def test_poll_confirmed_captures_credentials():
    s, rec = make_session(
        [qr("t0"),
         {"status": "confirmed", "ilink_bot_id": "acc_9", "bot_token": "tok_9",
          "baseurl": "https://b.example", "ilink_user_id": "u_9"}],
    )
    snap = asyncio.run(s.poll())
    assert s.status == "confirmed"
    assert s.credentials["account_id"] == "acc_9"
    assert s.credentials["token"] == "tok_9"
    assert s.credentials["base_url"] == "https://b.example"
    assert s.credentials["user_id"] == "u_9"
    assert snap["user_id"] == "u_9"


def test_poll_confirmed_missing_fields_times_out():
    s, rec = make_session([qr("t0"), {"status": "confirmed"}])
    asyncio.run(s.poll())
    assert s.status == "timeout"
    assert s.last_error == "确认响应缺少凭证字段"


def test_poll_scaned_redirect_switches_base_url():
    s, rec = make_session(
        [qr("t0"), {"status": "scaned_but_redirect", "redirect_host": "r.example"}],
    )
    # Terminal-original semantics: redirect only hops the base URL for the
    # NEXT poll; the visible status keeps its previous value ("wait").
    asyncio.run(s.poll())
    assert s._base_url == "https://r.example"
    assert s.status == "wait"
    # the NEXT status poll goes to the redirected host:
    rec.script.append({"status": "wait"})
    asyncio.run(s.poll())
    assert "r.example" in rec.calls[-1][0]


def test_poll_concurrent_expired_counts_single_refresh():
    """Two overlapping polls; one 'expired' event must burn exactly one refresh.

    Regression for the review race finding. Server-side truth is keyed by
    token: the OLD token answers "expired" to EVERY concurrent query about
    it (that is the race window); the refreshed token answers "wait".
    Serialization (poll lock) is what makes poll #2 query the NEW token —
    unlocked, both queries hit the old token and each burned a refresh.
    """
    
    # tok_1 (from start) is ALREADY expired — user left the page for 15 min.
    # A fresh fetch (the refresh inside poll) returns a live token.
    expired_tokens = {"tok_1"}
    fetches = {"n": 0}

    async def server_api(session, *, base_url, endpoint, timeout_ms):
        await asyncio.sleep(0.02)           # widen the race window
        if "get_qrcode_status" in endpoint:
            asked = endpoint.split("qrcode=", 1)[1]
            return ({"status": "expired"} if asked in expired_tokens
                    else {"status": "wait"})
        fetches["n"] += 1
        return qr(f"tok_{fetches['n']}")    # fetch #1 = tok_1 (dies), #2 = tok_2 (live)

    s = WeixinQrSession()

    async def scenario():
        assert await s.start() is True
        assert s.qr_token == "tok_1"
        await asyncio.gather(s.poll(), s.poll())

    with patch("gateway.platforms.weixin._api_get", server_api):
        asyncio.run(scenario())

    assert s.refresh_count == 1, (
        f"concurrent polls double-digested one expired event "
        f"(refresh_count={s.refresh_count}) — poll() lacks serialization"
    )
    assert s.qr_token == "tok_2"
