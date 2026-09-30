"""Run the Rhubarb Lip Sync CLI on synthesized audio (the PDF's Model 2 path)."""

import subprocess
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

from app.lipsync.rhubarb_map import parse_rhubarb_json
from app.models import MouthCue

RECOGNIZERS = ("phonetic", "pocketSphinx")
_STDERR_TAIL = 300


class RhubarbError(RuntimeError):
    pass


def _write_inputs(workdir: Path, pcm16: bytes, sample_rate: int, text: str) -> tuple[Path, Path]:
    wav, dialog = workdir / "speech.wav", workdir / "dialog.txt"
    sf.write(wav, np.frombuffer(pcm16, dtype="<i2"), sample_rate, subtype="PCM_16")
    dialog.write_text(text, encoding="utf-8")
    return wav, dialog


def run_rhubarb(
    pcm16: bytes,
    sample_rate: int,
    text: str,
    binary: Path,
    recognizer: str = "phonetic",
    timeout_s: float = 20.0,
) -> tuple[MouthCue, ...]:
    """Return Rhubarb's mouth cues; `text` is passed as the dialog hint for accuracy."""
    if recognizer not in RECOGNIZERS:
        raise RhubarbError(f"Unknown recognizer {recognizer!r}")
    if not Path(binary).is_file():
        raise RhubarbError(f"Rhubarb binary not found at {binary}")
    with tempfile.TemporaryDirectory(prefix="rhubarb-") as tmp:
        wav, dialog = _write_inputs(Path(tmp), pcm16, sample_rate, text)
        cmd = [str(binary), "-q", "-f", "json", "-r", recognizer, "-d", str(dialog), str(wav)]
        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=timeout_s, check=False
            )
        except subprocess.TimeoutExpired as exc:
            raise RhubarbError(f"Rhubarb timed out after {timeout_s}s") from exc
    if result.returncode != 0:
        raise RhubarbError(f"Rhubarb exited {result.returncode}: {result.stderr[-_STDERR_TAIL:]}")
    try:
        return parse_rhubarb_json(result.stdout)
    except ValueError as exc:
        raise RhubarbError(str(exc)) from exc
