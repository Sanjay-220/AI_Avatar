"""Compare lip-sync approaches on the same sentences: uv run python scripts/benchmark.py"""

import statistics
import tempfile
from pathlib import Path

from app.config import get_settings
from app.main import build_orchestrator
from app.pipeline.cache import DiskCache
from app.pipeline.orchestrator import LipSyncMode

SENTENCES = (
    "Hello, and welcome to your account assistant.",
    "Your balance is available in the mobile app.",
    "Would you like me to walk you through it?",
    "First, open the app and sign in with your fingerprint.",
    "Then tap the accounts tab at the bottom of the screen.",
    "Your available balance appears right below your name.",
    "If anything looks wrong, please call us right away.",
    "Is there anything else I can help you with today?",
)
VARIANTS = (
    ("PDF: Rhubarb pocketSphinx", LipSyncMode.RHUBARB, "pocketSphinx"),
    ("PDF: Rhubarb phonetic", LipSyncMode.RHUBARB, "phonetic"),
    ("Improved: Kokoro phonemes", LipSyncMode.PHONEME, None),
    ("Baseline: words only", LipSyncMode.WORDS, None),
)


def run_variant(mode: LipSyncMode, recognizer: str | None) -> list[dict]:
    settings = get_settings()
    if recognizer:
        settings = replace_recognizer(settings, recognizer)
    orch = build_orchestrator(settings)
    with tempfile.TemporaryDirectory() as tmp:
        orch._cache = DiskCache(Path(tmp))
        orch.speak_sentence("Warm up.", "af_heart", mode)
        return [orch.speak_sentence(s, "af_heart", mode)["timing"] for s in SENTENCES]


def replace_recognizer(settings, recognizer):
    return settings.model_copy(update={"rhubarb_recognizer": recognizer})


def main() -> None:
    print(f"{'variant':30} {'tts ms':>8} {'lipsync ms':>11} {'lipsync/audio':>14} {'1st sentence ready':>19}")
    for name, mode, recognizer in VARIANTS:
        t = run_variant(mode, recognizer)
        tts = statistics.mean(x["tts_ms"] for x in t)
        lip = statistics.mean(x["lipsync_ms"] for x in t)
        ratio = sum(x["lipsync_ms"] for x in t) / sum(x["audio_ms"] for x in t)
        first = t[0]["tts_ms"] + t[0]["lipsync_ms"]
        print(f"{name:30} {tts:8.0f} {lip:11.0f} {ratio:13.0%} {first:17d} ms")


if __name__ == "__main__":
    main()
