"""Feishu / Lark QR onboarding endpoint tests.

Device-code flow: start mints a QR, poll walks wait → confirmed, apply saves
app_id/app_secret (+ domain + scanner open_id in the allowlist) and enables
the platform. Mirrors the Weixin/QQ suites.
"""
import pytest


class FakeFeishuSession:
    def __init__(self, script=("wait", "confirmed"), domain="feishu"):
        self.script = list(script)
        self.domain = domain
        self.status = "wait"
        self.last_error = ""
        self.credentials = None
        self.created_at = 0.0
        self.qr_url_value = "https://accounts.feishu.cn/device/fake"

    def start(self):
        return True

    def expired(self):
        return False

    async def poll(self):
        if self.script:
            nxt = self.script.pop(0)
            self.status = nxt
            if nxt == "confirmed":
                self.credentials = {
                    "app_id": "cli_fake_1",
                    "app_secret": "fs_secret_2",
                    "domain": self.domain,
                    "open_id": "ou_owner_1",
                }
        return self.snapshot()

    def snapshot(self):
        return {
            "status": self.status,
            "qr_url": self.qr_url_value,
            "error": self.last_error,
            "domain": self.domain,
            "open_id": (self.credentials or {}).get("open_id") or "",
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


def test_feishu_onboarding_routes_registered(client):
    _, web_server, _ = client
    paths = {getattr(r, "path", "") for r in web_server.app.routes}
    assert "/api/messaging/feishu/onboarding/start" in paths
    assert "/api/messaging/feishu/onboarding/{pairing_id}/apply" in paths


def test_feishu_onboarding_full_flow(client):
    c, _, monkeypatch = client
    fake = FakeFeishuSession()
    monkeypatch.setattr(
        "plugins.platforms.feishu.adapter.FeishuQrSession", lambda domain="feishu": fake
    )

    r = c.post("/api/messaging/feishu/onboarding/start", json={})
    assert r.status_code == 200, r.text
    pairing_id = r.json()["pairing_id"]
    assert r.json()["qr_url"].startswith("https://")

    r = c.get(f"/api/messaging/feishu/onboarding/{pairing_id}")
    assert r.json()["status"] == "wait"

    r = c.get(f"/api/messaging/feishu/onboarding/{pairing_id}")
    assert r.json()["status"] == "confirmed"
    assert r.json()["open_id"] == "ou_owner_1"

    r = c.post(f"/api/messaging/feishu/onboarding/{pairing_id}/apply", json={})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["platform"] == "feishu"
    assert body["app_id"] == "cli_fake_1"

    from hermes_cli.config import get_env_value
    assert get_env_value("FEISHU_APP_ID") == "cli_fake_1"
    assert get_env_value("FEISHU_APP_SECRET") == "fs_secret_2"
    assert get_env_value("FEISHU_DOMAIN") == "feishu"
    assert get_env_value("FEISHU_ALLOWED_USERS") == "ou_owner_1"

    r = c.post(f"/api/messaging/feishu/onboarding/{pairing_id}/apply", json={})
    assert r.status_code == 404


def test_feishu_onboarding_lark_domain(client):
    c, _, monkeypatch = client
    fake = FakeFeishuSession(domain="lark")
    monkeypatch.setattr(
        "plugins.platforms.feishu.adapter.FeishuQrSession", lambda domain="feishu": fake
    )
    r = c.post("/api/messaging/feishu/onboarding/start", json={"domain": "lark"})
    pairing_id = r.json()["pairing_id"]
    c.get(f"/api/messaging/feishu/onboarding/{pairing_id}")  # wait
    c.get(f"/api/messaging/feishu/onboarding/{pairing_id}")  # confirmed
    r = c.post(f"/api/messaging/feishu/onboarding/{pairing_id}/apply", json={})
    assert r.status_code == 200, r.text

    from hermes_cli.config import get_env_value
    assert get_env_value("FEISHU_DOMAIN") == "lark"


def test_feishu_onboarding_apply_before_confirm_is_409(client):
    c, _, monkeypatch = client
    fake = FakeFeishuSession(script=["wait"])
    monkeypatch.setattr(
        "plugins.platforms.feishu.adapter.FeishuQrSession", lambda domain="feishu": fake
    )
    r = c.post("/api/messaging/feishu/onboarding/start", json={})
    pairing_id = r.json()["pairing_id"]
    r = c.post(f"/api/messaging/feishu/onboarding/{pairing_id}/apply", json={})
    assert r.status_code == 409


def test_feishu_onboarding_cancel(client):
    c, _, monkeypatch = client
    fake = FakeFeishuSession()
    monkeypatch.setattr(
        "plugins.platforms.feishu.adapter.FeishuQrSession", lambda domain="feishu": fake
    )
    r = c.post("/api/messaging/feishu/onboarding/start", json={})
    pairing_id = r.json()["pairing_id"]
    r = c.delete(f"/api/messaging/feishu/onboarding/{pairing_id}")
    assert r.status_code == 200
    r = c.get(f"/api/messaging/feishu/onboarding/{pairing_id}")
    assert r.status_code == 404
