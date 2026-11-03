"""User-facing copy for gateway refusals and session-level failures.

One place for the sentences the TUI, Desktop and dashboard print verbatim, so the
"what happened / what to do" shape stays consistent and the slash commands cited
(`/model`, `/new`, `/sessions`, `/retry`) exist on EVERY client this gateway serves (TUI,
Desktop, dashboard) — no client-only forms (`/sessions new`, `/setup`) and no single-surface
gestures stated as fact (Ctrl+C is copy on Desktop). Lead phrases that clients pattern-match
on (``Session busy``) are part of the wire contract — keep them.
"""

from __future__ import annotations

import re
from typing import Any

# Provider-layer failure codes → (title, hint). Codes are ``agent.error_classifier.FailoverReason``
# values carried in ``error_surface.code``; anything unlisted falls back on the layer table.
_TURN_ERROR_CODE_COPY: dict[str, tuple[str, str]] = {
    # qiji 0.20.5v: 全表中文化（原英文见 git 历史）。code/layer 键是 wire contract 不动。
    "auth": ("模型供应商拒绝了 API 密钥", "请修正密钥后重试。"),
    "auth_permanent": ("模型供应商拒绝了 API 密钥", "请修正密钥后重试。"),
    "billing": ("模型供应商报告余额不足", "请充值或更换模型。"),
    "billing_unverified": ("模型供应商报告余额不足", "请充值或更换模型。"),
    "rate_limit": ("模型供应商正在限流", "请稍候再重试。"),
    "upstream_rate_limit": ("模型供应商正在限流", "请稍候再重试。"),
    "upstream_blocked": ("模型供应商前的防火墙/CDN 拦截了请求", "请在供应商的 extra_headers 配置 User-Agent，或更换模型。"),
    "overloaded": ("模型供应商过载", "请稍候再重试。"),
    "server_error": ("模型供应商内部错误", "请稍候再重试。"),
    "timeout": ("模型供应商响应超时", "请重试；若持续出现请更换模型。"),
    "context_overflow": ("对话过长，超出该模型容量", "请压缩上下文后重试。"),
    "payload_too_large": ("请求体过大，超出该模型限制", "请压缩上下文后重试。"),
    "model_not_found": ("模型供应商没有这个模型", "请选择其他模型。"),
    "content_policy_blocked": ("模型供应商拒绝了该请求（内容政策）", "请调整措辞后重发。"),
    "provider_policy_blocked": ("模型供应商拒绝了该请求（账号政策）", "请更换模型。"),
    "format_error": ("模型供应商拒绝了请求格式", "请重试；若持续出现请更换模型。"),
    "ssl_cert_verification": ("到模型供应商的连接证书校验失败（TLS）", "请检查端点证书后重试。"),
}

_TURN_ERROR_LAYER_COPY: dict[str, tuple[str, str]] = {
    "auth": ("模型供应商拒绝了凭据", "请修正后重试。"),
    "billing": ("模型供应商报告余额不足", "请充值或更换模型。"),
    "endpoint": ("自定义模型端点未响应", "请检查端点运行状态后重试。"),
    "streaming": ("到模型供应商的连接在回复中途断开", "请重试。"),
    "disk": ("磁盘已满，螃蟹OPC 无法保存本轮对话", "请清理磁盘空间后重试。"),
    "gateway": ("螃蟹OPC 运行本轮时发生内部错误", "请重试；可查看日志了解详情。"),
    "provider": ("模型供应商返回错误", "请重试或更换模型。"),
}

_TURN_ERROR_DEFAULT = ("请求失败", "请重试或更换模型。")

# Pre-turn AuthError bodies whose remediation names CLI-only surface flows
# (`hermes model`, `/login`, `hermes auth add`) —Desktop renders `payload.error`
# verbatim in the card's dimmed details block, so the raw sentence must not ship.
# Classified as layer=runtime by build_error_surface_from_exception; the card's
# localized runtime title/body is the whole story the user needs.
_CLI_ONLY_AUTH_ERROR_RE = re.compile(r"hermes (model|auth add)|is not connected to any AI provider")


def sanitize_terminal_error_detail(message: str) -> str:
    """Replace CLI-only AuthError remediation text with a neutral, surface-agnostic phrase."""
    text = " ".join(str(message or "").split())
    if text and _CLI_ONLY_AUTH_ERROR_RE.search(text):
        return "No AI provider is configured for this session yet."
    return text

_DETAIL_LIMIT = 400


def _identity(surface: dict | None) -> str:
    provider = str((surface or {}).get("provider") or "").strip()
    return f" ({provider})" if provider else ""


def turn_error_title(surface: dict | None) -> str:
    """Plain title for a failed turn, picked from ``error_surface`` code then layer."""
    surface = surface if isinstance(surface, dict) else {}
    title, _ = _TURN_ERROR_CODE_COPY.get(str(surface.get("code") or "")) \
        or _TURN_ERROR_LAYER_COPY.get(str(surface.get("layer") or "")) or _TURN_ERROR_DEFAULT
    return f"{title}{_identity(surface)}"


def turn_error_hint(surface: dict | None, recoverable: bool = True) -> str:
    surface = surface if isinstance(surface, dict) else {}
    _, hint = _TURN_ERROR_CODE_COPY.get(str(surface.get("code") or "")) \
        or _TURN_ERROR_LAYER_COPY.get(str(surface.get("layer") or "")) or _TURN_ERROR_DEFAULT
    return hint if recoverable else hint.replace("Send /retry", "Pick another model with /model")


def turn_error_text(error: Any, surface: dict | None = None, *, recoverable: bool = True) -> str:
    """The assistant-slot text for a turn that produced no reply: title, what it means for the
    user, the raw provider detail on its own dimmed-able line, and the next step."""
    detail = " ".join(str(error or "").splitlines())
    if _CLI_ONLY_AUTH_ERROR_RE.search(detail):
        detail = "No AI provider is configured for this session yet."
    if len(detail) > _DETAIL_LIMIT:
        detail = detail[:_DETAIL_LIMIT - 1] + "…"
    # qiji 0.20.5v: 中文正文。⚠️ "Details: " 行前缀是 Desktop splitFailureDetails
    # (desktop-install-overlay.tsx /\n?\s*Details:\s*/) 的解析标记，必须保留英文原词。
    lines = [f"{turn_error_title(surface)}。你的消息未得到回复。"]
    if detail:
        lines.append(f"Details: {detail}")
    lines.append(turn_error_hint(surface, recoverable))
    return "\n".join(lines)


def busy_message(command: str) -> str:
    """4009 refusal for a history-mutating command while a reply is streaming.
    qiji 0.20.5v: 中文文案。⚠️ "session busy" 引导词是前端 isSessionBusyError
    (/session busy/i) 的 wire contract——必须保留在句首，其余措辞可自由。"""
    return (f"session busy — 螃蟹OPC 正在回复中。请先停止当前回复（停止按钮，"
            f"或终端中按 Ctrl+C），再执行 /{command.lstrip('/')}。")


def agent_init_failed_message(exc: Any) -> str:
    # qiji 0.20.5v: 中文文案 + 去品牌化。Desktop 把 payload.message 原文渲染进
    # 错误卡正文，这里 emit 什么用户就看到什么（2026-11-03 用户实锤报障）。
    # 不含 "session busy" 引导词，前端 isSessionBusyError 不匹配本句——措辞可自由。
    return (f"螃蟹OPC 未能为该会话启动助手。错误详情：{exc}。 "
            "请检查模型与供应商配置，或重启螃蟹OPC 后重试。")


AGENT_STILL_STARTING = (
    "螃蟹OPC 正在启动该会话（加载工具中），命令暂时无法执行。 "
    "请等待状态栏显示就绪后重试。")

# A deferred build that finished WITHOUT attaching an agent (its session record was replaced or
# closed while it ran) leaves ``agent_ready`` set and ``agent`` None; this is the recorded cause.
AGENT_BUILD_ABANDONED = "agent build aborted: the session record was replaced before the build finished"
# Turn refusal when the record still has no agent at admission time (reason unknown).
AGENT_MISSING_FOR_TURN = (
    "螃蟹OPC 未能为该会话启动助手，消息未被处理。 "
    "请重新打开会话（或新建会话）后再次发送。")


def resume_failed_message(exc: Any) -> str:
    return (f"无法重新打开该会话（对话记录读取失败）。错误详情：{exc}。 "
            "请新建会话，或从会话列表选择其他会话。")
