"""QQ Bot QR onboarding endpoint tests.

Same contract as the Weixin onboarding suite: routes register, a fake session
drives wait → confirmed, apply persists app_id/client_secret to the scoped
.env, appends the scanner's openid to QQ_ALLOWED_USERS, and enables the
platform. Cancel drops the session.
"""
import pytest


class FakeQqSession:
    def __init__(self, script=("wait", "confirmed")):
        self.script = list(script)
        self.status = "wait"
        self.last_error = ""
        self.credentials = None
        self.created_at = 0.0

    def start(self):
        return True

    def qr_url(self):
        return "https://q.qq.com/qq/bindtask/fake"

    def expired(self):
        return False

    async def poll(self):
        if self.script:
            nxt = self.script.pop(0)
            self.status = nxt
            if nxt == "confirmed":
                self.credentials = {
                    "app_id": "qq_app_1",
                    "client_secret": "qq_sec_2",
                    "user_openid": "openid_owner",
                }
        return self.snapshot()

    def snapshot(self):
        return {
            "status": self.status,
            "qr_url": self.qr_url(),
            "refresh_count": 0,
            "error": self.last_error,
            "user_openid": (self.credentials or {}).get("user_openid", ""),
        }


@pytest.fixture
def client(monkeypatch, tmp_path, _isolate_hermes_home):
    try:
        from starlette.testclient import TestClient
    except ImportError:
        pytest.skip("fastapi/starlette not installed")

    from hermes_cli import web_server
    from hermes_cli.web_server import app, _SESSION_HEADER_NAME, _SESSION_TOKEN

    monkeypatch.setattr(web_server, "_restart_gateway_after_telegram_onboarding",
                        lambda profile=None: {"restart_started": False})
    c = TestClient(app)
    c.headers[_SESSION_HEADER_NAME] = _SESSION_TOKEN
    yield c, web_server, monkeypatch


def test_qq_onboarding_routes_registered(client):
    _, web_server, _ = client
    paths = {getattr(r, "path", "") for r in web_server.app.routes}
    assert "/api/messaging/qqbot/onboarding/start" in paths
    assert "/api/messaging/qqbot/onboarding/{pairing_id}" in paths
    assert "/api/messaging/qqbot/onboarding/{pairing_id}/apply" in paths


def test_qq_onboarding_full_flow(client):
    c, _, monkeypatch = client
    fake = FakeQqSession()
    monkeypatch.setattr(
        "gateway.platforms.qqbot.onboard.QQBotQrSession", lambda: fake
    )

    r = c.post("/api/messaging/qqbot/onboarding/start")
    assert r.status_code == 200, r.text
    pairing_id = r.json()["pairing_id"]
    assert r.json()["qr_url"].startswith("https://")

    r = c.get(f"/api/messaging/qqbot/onboarding/{pairing_id}")
    assert r.json()["status"] == "wait"

    r = c.get(f"/api/messaging/qqbot/onboarding/{pairing_id}")
    assert r.json()["status"] == "confirmed"
    assert r.json()["user_openid"] == "openid_owner"

    r = c.post(f"/api/messaging/qqbot/onboarding/{pairing_id}/apply", json={})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["platform"] == "qqbot"
    assert body["app_id"] == "qq_app_1"

    from hermes_cli.config import get_env_value
    assert get_env_value("QQ_APP_ID") == "qq_app_1"
    assert get_env_value("QQ_CLIENT_SECRET") == "qq_sec_2"
    # Scanner openid auto-allowed
    assert get_env_value("QQ_ALLOWED_USERS") == "openid_owner"

    # Session consumed
    r = c.post(f"/api/messaging/qqbot/onboarding/{pairing_id}/apply", json={})
    assert r.status_code == 404


def test_qq_onboarding_apply_before_confirm_is_409(client):
    c, _, monkeypatch = client
    fake = FakeQqSession(script=["wait", "wait"])
    monkeypatch.setattr("gateway.platforms.qqbot.onboard.QQBotQrSession", lambda: fake)
    r = c.post("/api/messaging/qqbot/onboarding/start")
    pairing_id = r.json()["pairing_id"]
    r = c.post(f"/api/messaging/qqbot/onboarding/{pairing_id}/apply", json={})
    assert r.status_code == 409


def test_qq_onboarding_cancel(client):
    c, _, monkeypatch = client
    fake = FakeQqSession()
    monkeypatch.setattr("gateway.platforms.qqbot.onboard.QQBotQrSession", lambda: fake)
    r = c.post("/api/messaging/qqbot/onboarding/start")
    pairing_id = r.json()["pairing_id"]
    r = c.delete(f"/api/messaging/qqbot/onboarding/{pairing_id}")
    assert r.status_code == 200
    r = c.get(f"/api/messaging/qqbot/onboarding/{pairing_id}")
    assert r.status_code == 404
