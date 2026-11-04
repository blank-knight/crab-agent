"""DELETE /api/profiles must survive a broken stdout in the serve backend.

User-machine incident (2026-10-16 19:23): DELETE /api/profiles/pmvavq094 returned
500 ``[Errno 22] Invalid argument`` — the Desktop-spawned serve process's stdout
pipe had gone invalid, so the FIRST decorative print in ``_print_delete_summary``
raised, run_in_threadpool propagated it, and the delete chain aborted before any
deletion work ran. The expert was undeletable from the UI.

Contract under test: decorative output is never load-bearing. With a stdout whose
write() raises OSError(EINVAL), ``delete_profile(name, yes=True)`` still removes
the profile directory and returns the path. The interactive path (yes=False)
treats an unusable stdin as a cancel, not a crash.
"""

import errno
import os
from pathlib import Path
from unittest.mock import patch

import pytest

from hermes_cli.profiles import create_profile, delete_profile, _safe_print


class _BrokenStdout:
    """A stdout whose buffer raises the Windows dead-pipe EINVAL on write/flush."""

    closed = False

    def write(self, _s):
        raise OSError(errno.EINVAL, "Invalid argument")

    def flush(self):
        raise OSError(errno.EINVAL, "Invalid argument")

    def isatty(self):
        return False

    def fileno(self):
        raise OSError(errno.EINVAL, "Invalid argument")


@pytest.fixture()
def broken_stdout(capsys, monkeypatch):
    import hermes_cli.profiles as profiles_mod
    monkeypatch.setattr(profiles_mod.sys, "stdout", _BrokenStdout())


@pytest.fixture()
def profile_env(tmp_path, monkeypatch):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    default_home = tmp_path / ".hermes"
    default_home.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(default_home))
    return tmp_path


def _delete(name: str) -> None:
    with patch("hermes_cli.profiles._cleanup_gateway_service"), patch(
        "hermes_cli.profiles._stop_profile_backends"
    ):
        delete_profile(name, yes=True)


class TestDeleteWithBrokenStdio:
    def test_delete_completes_when_stdout_write_raises_einval(self, profile_env, broken_stdout):
        profile_dir = create_profile("worker", no_alias=True, no_skills=True)
        assert profile_dir.exists()
        _delete("worker")
        assert not profile_dir.exists(), "delete must complete even when prints raise"

    def test_interactive_confirm_with_broken_stdin_cancels_not_crashes(self, profile_env, broken_stdout):
        profile_dir = create_profile("worker", no_alias=True, no_skills=True)
        with patch("hermes_cli.profiles._cleanup_gateway_service"), patch(
            "hermes_cli.profiles._stop_profile_backends"
        ), patch("builtins.input", side_effect=OSError(errno.EINVAL, "Invalid argument")):
            returned = delete_profile("worker", yes=False)
        assert returned == profile_dir, "cancel path returns the dir without deleting"
        assert profile_dir.exists()

    def test_safe_print_swallows_oserror(self, capsys):
        # sanity: _safe_print itself never raises on OSError
        import builtins
        real_print = builtins.print
        def raising_print(*a, **k):
            raise OSError(errno.EINVAL, "Invalid argument")
        with patch("builtins.print", raising_print):
            _safe_print("anything")  # must not raise
        real_print("safe_print contract ok")

    def test_stop_gateway_process_prints_are_guarded(self, profile_env, broken_stdout, tmp_path):
        # _stop_gateway_process prints "✓ Gateway stopped" mid-chain; with a poisoned
        # pid file pointing at a foreign home it prints the refusal and returns.
        from hermes_cli import profiles as profiles_mod
        profile_dir = create_profile("worker", no_alias=True, no_skills=True)
        pid_file = profile_dir / "gateway.pid"
        pid_file.write_text('{"pid": 999999, "hermes_home": "C:\\\\other\\\\profile"}', encoding="utf-8")
        profiles_mod._stop_gateway_process(profile_dir)  # must not raise on print
