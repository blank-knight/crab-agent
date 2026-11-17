"""QQ onboarding poll-serialization regression (clean-PR baseline 2026-11-17).

The clean-PR baseline review of 46e8590206 found QQBotQrSession.poll() had
the SAME race WeixinQrSession was fixed for earlier that day: two tabs
polling one pairing_id both digested one EXPIRED event (refresh budget
burned at double speed) and a concurrent refresh could swap _task_id/_aes_key
mid-decrypt. Mirror-class commits must track the source class's later fixes
(REVIEW.md red line #11).
"""
import asyncio
from unittest.mock import patch

from gateway.platforms.qqbot.onboard import BindStatus, QQBotQrSession


def test_poll_concurrent_expired_counts_single_refresh():
    """Two overlapping polls; one EXPIRED event must burn exactly one refresh.

    Server-side truth: the task's bind status stays EXPIRED until the client
    calls start() to create a NEW bind task (which rotates _task_id/_aes_key).
    Serialization makes poll #2 observe the NEW task (PENDING), not re-digest
    the old EXPIRED — unlocked, both polled the dead task and each burned a
    refresh.
    """
    loop = asyncio.get_event_loop()
    starts = {"n": 0}

    def fake_create_bind_task():
        starts["n"] += 1
        # fetch #1 (start): an ALREADY-EXPIRED task; #2 (refresh): live one
        if starts["n"] == 1:
            return "task_dead", b"k" * 32
        return "task_fresh", b"k" * 32

    dead = {"polled": 0}

    def fake_poll_bind_result(task_id):
        if task_id == "task_dead":
            dead["polled"] += 1
            return (BindStatus.EXPIRED, "", "", "")  # stays expired for anyone
        return (BindStatus.PENDING, "", "", "")      # fresh task: wait

    s = QQBotQrSession()
    import gateway.platforms.qqbot.onboard as ob
    with patch.object(ob, "_create_bind_task", fake_create_bind_task), \
         patch.object(ob, "_poll_bind_result", fake_poll_bind_result):
        assert s.start() is True
        assert s._task_id == "task_dead"
        loop.run_until_complete(asyncio.gather(s.poll(), s.poll()))

    assert s.refresh_count == 1, (
        f"concurrent polls double-digested one EXPIRED event "
        f"(refresh_count={s.refresh_count}) — poll() lacks serialization"
    )
