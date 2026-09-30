import stat
from pathlib import Path

import pytest

from app.lipsync.rhubarb import RhubarbError, run_rhubarb

FIXTURE = Path(__file__).parent.parent / "fixtures" / "rhubarb-sample.json"
SILENCE = b"\x00\x00" * 2400


def _fake_binary(tmp_path: Path, body: str) -> Path:
    script = tmp_path / "rhubarb"
    script.write_text(f"#!/bin/sh\n{body}\n")
    script.chmod(script.stat().st_mode | stat.S_IEXEC)
    return script


def test_returns_cues_and_passes_dialog_and_recognizer(tmp_path):
    args_file = tmp_path / "args.txt"
    binary = _fake_binary(tmp_path, f'echo "$@" > {args_file}\ncat {FIXTURE}')

    cues = run_rhubarb(SILENCE, 24000, "hello there", binary, recognizer="phonetic")

    assert len(cues) > 10
    args = args_file.read_text()
    assert "-r phonetic" in args and "-d " in args and "-f json" in args


def test_nonzero_exit_raises_with_stderr(tmp_path):
    binary = _fake_binary(tmp_path, 'echo "bad wav" >&2\nexit 3')

    with pytest.raises(RhubarbError, match="bad wav"):
        run_rhubarb(SILENCE, 24000, "hi", binary)


def test_timeout_raises(tmp_path):
    binary = _fake_binary(tmp_path, "sleep 5")

    with pytest.raises(RhubarbError, match="timed out"):
        run_rhubarb(SILENCE, 24000, "hi", binary, timeout_s=0.2)


def test_missing_binary_raises(tmp_path):
    with pytest.raises(RhubarbError, match="not found"):
        run_rhubarb(SILENCE, 24000, "hi", tmp_path / "nope")
