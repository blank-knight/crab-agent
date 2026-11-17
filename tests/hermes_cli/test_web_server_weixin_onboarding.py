"""Weixin (iLink) QR onboarding endpoint tests.

The onboarding flow mirrors Telegram's (start → poll → apply/cancel) but runs
locally against WeixinQrSession. These tests pin the HTTP contract: routes
register, a fake session drives the state machine through wait → confirmed,
apply persists the credentials to the scoped .env and enables the platform,
cancel drops the session without touching disk.
"""
import pytest


class FakeQrSession:
    """Stands in for gateway.platforms.weixin.WeixinQrSession."""

    def __init__(self, script=("wait", "confirmed")):
        self.script = list(script)
        self.status = "wait"
        self.qr_url = "https://work.weixin.qq.com/liteapp/fake"
        self.qr_token = "faketoken123"
        self.last_error = ""
        self.credentials = None
        self.closed = False
        self.created_at = 0.0  # never hard-expires

    async def start(self):
        return True

    def expired(self):
        return False

    async def poll(self):
        if self.script:
            nxt = self.script.pop(0)
            self.status = nxt
            if nxt == "confirmed":
                self.credentials = {
                    "account_id": "acc_123",
                    "token": "tok_456",
                    "base_url": "https://ilinkai.weixin.qq.com",
                    "user_id": "wx_user_9",
                }
        return self.snapshot()

    def snapshot(self):
        return {
            "status": self.status,
            "qr_url": self.qr_url,
            "expires_at": "2026-10-14T00:00:00Z",
            "refresh_count": 0,
            "error": self.last_error,
            "user_id": (self.credentials or {}).get("user_id", ""),
        }

    async def close(self):
        self.closed = True


@pytest.fixture
def client(monkeypatch, tmp_path, _isolate_hermes_home):
    try:
        from starlette.testclient import TestClient
    except ImportError:
        pytest.skip("fastapi/starlette not installed")

    from hermes_cli import web_server
    from hermes_cli.web_server import app, _SESSION_HEADER_NAME, _SESSION_TOKEN

    restart_calls: list = []

    def _fake_restart(profile=None):
        restart_calls.append(profile)
        return {"restart_started": True}

    monkeypatch.setattr(web_server, "_restart_gateway_after_telegram_onboarding",
                        _fake_restart)
    c = TestClient(app)
    c.headers[_SESSION_HEADER_NAME] = _SESSION_TOKEN
    yield c, web_server, monkeypatch, restart_calls


def test_weixin_onboarding_routes_registered(client):
    _, web_server, _, _ = client
    paths = {getattr(r, "path", "") for r in web_server.app.routes}
    assert "/api/messaging/weixin/onboarding/start" in paths
    assert "/api/messaging/weixin/onboarding/{pairing_id}" in paths
    assert "/api/messaging/weixin/onboarding/{pairing_id}/apply" in paths


def test_weixin_onboarding_full_flow_persists_credentials(client):
    c, web_server, monkeypatch, restart_calls = client
    fake = FakeQrSession(script=["wait", "confirmed"])
    monkeypatch.setattr(
        "gateway.platforms.weixin.WeixinQrSession", lambda: fake, raising=True
    )
    monkeypatch.setattr(
        "gateway.platforms.weixin.check_weixin_requirements", lambda: True
    )

    r = c.post("/api/messaging/weixin/onboarding/start")
    assert r.status_code == 200, r.text
    pairing_id = r.json()["pairing_id"]
    assert r.json()["qr_url"].startswith("https://")

    # First poll: waiting
    r = c.get(f"/api/messaging/weixin/onboarding/{pairing_id}")
    assert r.status_code == 200
    assert r.json()["status"] == "wait"

    # Second poll: confirmed → apply persists to .env
    r = c.get(f"/api/messaging/weixin/onboarding/{pairing_id}")
    assert r.json()["status"] == "confirmed"

    r = c.post(f"/api/messaging/weixin/onboarding/{pairing_id}/apply", json={})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["platform"] == "weixin"
    assert body["account_id"] == "acc_123"
    # Red line #9 (REVIEW.md): a claimed side effect needs a call-level
    # assertion — the restart must actually be invoked by apply.
    assert restart_calls == [None], "apply must call the gateway restart exactly once"

    from hermes_cli.config import get_env_value
    assert get_env_value("WEIXIN_ACCOUNT_ID") == "acc_123"
    assert get_env_value("WEIXIN_TOKEN") == "tok_456"
    assert get_env_value("WEIXIN_BASE_URL") == "https://ilinkai.weixin.qq.com"
    assert get_env_value("WEIXIN_CDN_BASE_URL")

    # Session consumed: apply twice → 404
    r = c.post(f"/api/messaging/weixin/onboarding/{pairing_id}/apply", json={})
    assert r.status_code == 404


def test_weixin_onboarding_apply_before_confirm_is_409(client):
    c, web_server, monkeypatch, _ = client
    fake = FakeQrSession(script=["wait", "wait", "wait"])
    monkeypatch.setattr("gateway.platforms.weixin.WeixinQrSession", lambda: fake)
    monkeypatch.setattr(
        "gateway.platforms.weixin.check_weixin_requirements", lambda: True
    )
    r = c.post("/api/messaging/weixin/onboarding/start")
    pairing_id = r.json()["pairing_id"]
    r = c.post(f"/api/messaging/weixin/onboarding/{pairing_id}/apply", json={})
    assert r.status_code == 409


def test_weixin_onboarding_cancel_drops_session(client):
    c, web_server, monkeypatch, _ = client
    fake = FakeQrSession()
    monkeypatch.setattr("gateway.platforms.weixin.WeixinQrSession", lambda: fake)
    monkeypatch.setattr(
        "gateway.platforms.weixin.check_weixin_requirements", lambda: True
    )
    r = c.post("/api/messaging/weixin/onboarding/start")
    pairing_id = r.json()["pairing_id"]
    r = c.delete(f"/api/messaging/weixin/onboarding/{pairing_id}")
    assert r.status_code == 200
    assert fake.closed is True
    # Status now 404 — the session is gone.
    r = c.get(f"/api/messaging/weixin/onboarding/{pairing_id}")
    assert r.status_code == 404


def test_weixin_onboarding_expired_session_is_closed_not_leaked(client):
    """Regression (2026-11-17 review): the expired branch used to pop the
    session without close() — leaking the aiohttp connector. Now the popped
    session must be closed (same guarantee the timeout branch gives)."""
    c, web_server, monkeypatch, _ = client
    fake = FakeQrSession()
    fake.expired = lambda: True  # hard-expire immediately after start
    monkeypatch.setattr("gateway.platforms.weixin.WeixinQrSession", lambda: fake)
    monkeypatch.setattr(
        "gateway.platforms.weixin.check_weixin_requirements", lambda: True
    )
    r = c.post("/api/messaging/weixin/onboarding/start")
    pairing_id = r.json()["pairing_id"]
    assert fake.closed is False          # start does not close
    r = c.get(f"/api/messaging/weixin/onboarding/{pairing_id}")
    assert r.status_code == 404
    assert fake.closed is True           # expired branch closed before 404


def test_weixin_onboarding_missing_deps_is_503(client):
    c, web_server, monkeypatch, _ = client
    monkeypatch.setattr(
        "gateway.platforms.weixin.check_weixin_requirements", lambda: False
    )
    r = c.post("/api/messaging/weixin/onboarding/start")
    assert r.status_code == 503
