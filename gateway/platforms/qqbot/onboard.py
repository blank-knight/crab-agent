"""
QQBot scan-to-configure (QR code onboard) module.

Mirrors the Feishu onboarding pattern: synchronous HTTP + a single public
entry-point ``qr_register()`` that handles the full flow (create task →
display QR code → poll → decrypt credentials).

Calls the ``q.qq.com`` ``create_bind_task`` / ``poll_bind_result`` APIs to
generate a QR-code URL and poll for scan completion.  On success the caller
receives the bot's *app_id*, *client_secret* (decrypted locally), and the
scanner's *user_openid* — enough to fully configure the QQBot gateway.

Reference: https://bot.q.qq.com/wiki/develop/api-v2/
"""

from __future__ import annotations

import logging
import time
from enum import IntEnum
from typing import Optional, Tuple
from urllib.parse import quote

from .constants import (
    ONBOARD_API_TIMEOUT,
    ONBOARD_CREATE_PATH,
    ONBOARD_POLL_INTERVAL,
    ONBOARD_POLL_PATH,
    PORTAL_HOST,
    QR_URL_TEMPLATE,
)
from .crypto import decrypt_secret, generate_bind_key
from .utils import get_api_headers

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Bind status
# ---------------------------------------------------------------------------


class BindStatus(IntEnum):
    """Status codes returned by ``_poll_bind_result``."""

    NONE = 0
    PENDING = 1
    COMPLETED = 2
    EXPIRED = 3


# ---------------------------------------------------------------------------
# QR rendering
# ---------------------------------------------------------------------------

try:
    import qrcode as _qrcode_mod
except (ImportError, TypeError):
    _qrcode_mod = None  # type: ignore[assignment]


def _render_qr(url: str) -> bool:
    """Try to render a QR code in the terminal. Returns True if successful."""
    if _qrcode_mod is None:
        return False
    try:
        qr = _qrcode_mod.QRCode(
            error_correction=_qrcode_mod.constants.ERROR_CORRECT_M,
            border=2,
        )
        qr.add_data(url)
        qr.make(fit=True)
        qr.print_ascii(invert=True)
        return True
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Synchronous HTTP helpers (mirrors Feishu _post_registration pattern)
# ---------------------------------------------------------------------------


def _create_bind_task(timeout: float = ONBOARD_API_TIMEOUT) -> Tuple[str, str]:
    """Create a bind task and return *(task_id, aes_key_base64)*.

    Raises:
        RuntimeError: If the API returns a non-zero ``retcode``.
    """
    import httpx

    url = f"https://{PORTAL_HOST}{ONBOARD_CREATE_PATH}"
    key = generate_bind_key()

    with httpx.Client(timeout=timeout, follow_redirects=True) as client:
        resp = client.post(url, json={"key": key}, headers=get_api_headers())
        resp.raise_for_status()
        data = resp.json()

    if data.get("retcode") != 0:
        raise RuntimeError(data.get("msg", "create_bind_task failed"))

    task_id = data.get("data", {}).get("task_id")
    if not task_id:
        raise RuntimeError("create_bind_task: missing task_id in response")

    logger.debug("create_bind_task ok: task_id=%s", task_id)
    return task_id, key


def _poll_bind_result(
    task_id: str,
    timeout: float = ONBOARD_API_TIMEOUT,
) -> Tuple[BindStatus, str, str, str]:
    """Poll the bind result for *task_id*.

    Returns:
        A 4-tuple of ``(status, bot_appid, bot_encrypt_secret, user_openid)``.

    Raises:
        RuntimeError: If the API returns a non-zero ``retcode``.
    """
    import httpx

    url = f"https://{PORTAL_HOST}{ONBOARD_POLL_PATH}"

    with httpx.Client(timeout=timeout, follow_redirects=True) as client:
        resp = client.post(url, json={"task_id": task_id}, headers=get_api_headers())
        resp.raise_for_status()
        data = resp.json()

    if data.get("retcode") != 0:
        raise RuntimeError(data.get("msg", "poll_bind_result failed"))

    d = data.get("data", {})
    return (
        BindStatus(d.get("status", 0)),
        str(d.get("bot_appid", "")),
        d.get("bot_encrypt_secret", ""),
        d.get("user_openid", ""),
    )


def build_connect_url(task_id: str) -> str:
    """Build the QR-code target URL for a given *task_id*."""
    return QR_URL_TEMPLATE.format(task_id=quote(task_id))


# ---------------------------------------------------------------------------
# Public entry-point
# ---------------------------------------------------------------------------

_MAX_REFRESHES = 3


def qr_register(timeout_seconds: int = 600) -> Optional[dict]:
    """Run the QQBot scan-to-configure QR registration flow.

    Mirrors ``feishu.qr_register()``: handles create → display → poll →
    decrypt in one call.  Unexpected errors propagate to the caller.

    :returns:
        ``{"app_id": ..., "client_secret": ..., "user_openid": ...}`` on
        success, or ``None`` on failure / expiry / cancellation.
    """
    deadline = time.monotonic() + timeout_seconds

    for refresh_count in range(_MAX_REFRESHES + 1):
        # ── Create bind task ──
        try:
            task_id, aes_key = _create_bind_task()
        except Exception as exc:
            logger.warning("[QQBot onboard] Failed to create bind task: %s", exc)
            return None

        url = build_connect_url(task_id)

        # ── Display QR code + URL ──
        print()
        if _render_qr(url):
            print(f"  Scan the QR code above, or open this URL directly:\n  {url}")
        else:
            print(f"  Open this URL in QQ on your phone:\n  {url}")
            print("  Tip: pip install qrcode  to display a scannable QR code here")
        print()

        # ── Poll loop ──
        while time.monotonic() < deadline:
            try:
                status, app_id, encrypted_secret, user_openid = _poll_bind_result(task_id)
            except Exception:
                time.sleep(ONBOARD_POLL_INTERVAL)
                continue

            if status == BindStatus.COMPLETED:
                client_secret = decrypt_secret(encrypted_secret, aes_key)
                print()
                print(f"  QR scan complete! (App ID: {app_id})")
                if user_openid:
                    print(f"  Scanner's OpenID: {user_openid}")
                return {
                    "app_id": app_id,
                    "client_secret": client_secret,
                    "user_openid": user_openid,
                }

            if status == BindStatus.EXPIRED:
                if refresh_count >= _MAX_REFRESHES:
                    logger.warning("[QQBot onboard] QR code expired %d times — giving up", _MAX_REFRESHES)
                    return None
                print(f"\n  QR code expired, refreshing... ({refresh_count + 1}/{_MAX_REFRESHES})")
                break  # next for-loop iteration creates a new task

            time.sleep(ONBOARD_POLL_INTERVAL)
        else:
            # deadline reached without completing
            logger.warning("[QQBot onboard] Poll timed out after %ds", timeout_seconds)
            return None

    return None


# ---------------------------------------------------------------------------
# Non-interactive session (desktop/web onboarding UI)
# ---------------------------------------------------------------------------


class QQBotQrSession:
    """Pull-based QR bind session for the desktop/web onboarding UI.

    Same lifecycle as ``qr_register()`` (create → poll → refresh ×3 → decrypt)
    but each step is one call and nothing prints. Mirrors
    ``gateway.platforms.weixin.WeixinQrSession``.
    """

    MAX_REFRESHES = 3

    def __init__(self) -> None:
        self.created_at = time.monotonic()
        self.refresh_count = 0
        self.status = "wait"  # wait|scaned|confirmed|timeout
        self.last_error = ""
        self.credentials: Optional[dict] = None
        self._task_id: str = ""
        self._aes_key: str = ""

    def start(self) -> bool:
        """Create the first bind task. False (with last_error) on failure."""
        try:
            self._task_id, self._aes_key = _create_bind_task()
        except Exception as exc:
            self.last_error = f"创建绑定任务失败: {exc}"
            return False
        return True

    def qr_url(self) -> str:
        return build_connect_url(self._task_id) if self._task_id else ""

    async def poll(self) -> dict:
        """One bind-status tick. Runs the sync HTTP call in a thread."""
        import asyncio

        if self.status in ("confirmed", "timeout") or not self._task_id:
            return self.snapshot()

        try:
            status, app_id, encrypted_secret, user_openid = await asyncio.to_thread(
                _poll_bind_result, self._task_id
            )
        except Exception as exc:
            logger.debug("[QQBot onboard] poll error: %s", exc)
            return self.snapshot()

        if status == BindStatus.PENDING:
            self.status = "wait"
        elif status == BindStatus.COMPLETED:
            try:
                client_secret = decrypt_secret(encrypted_secret, self._aes_key)
            except Exception as exc:
                self.status = "timeout"
                self.last_error = f"解密凭证失败: {exc}"
                return self.snapshot()
            if app_id and client_secret:
                self.credentials = {
                    "app_id": app_id,
                    "client_secret": client_secret,
                    "user_openid": user_openid,
                }
                self.status = "confirmed"
            else:
                self.status = "timeout"
                self.last_error = "绑定响应缺少凭证字段"
        elif status == BindStatus.EXPIRED:
            self.refresh_count += 1
            if self.refresh_count > self.MAX_REFRESHES:
                self.status = "timeout"
                self.last_error = "二维码多次过期"
            elif not self.start():
                self.status = "timeout"
        # BindStatus.NONE → keep waiting
        return self.snapshot()

    def snapshot(self) -> dict:
        return {
            "status": self.status,
            "qr_url": self.qr_url(),
            "refresh_count": self.refresh_count,
            "error": self.last_error,
            "user_openid": (self.credentials or {}).get("user_openid", ""),
        }

    def expired(self) -> bool:
        return time.monotonic() - self.created_at > 900  # 15 min hard cap
