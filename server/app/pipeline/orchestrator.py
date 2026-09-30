"""One sentence in, one speakAudio()-ready chunk out: TTS -> lip-sync -> cache."""

import base64
import logging
import time
from collections.abc import Callable
from dataclasses import asdict
from enum import StrEnum
from typing import Any, Protocol

from app.lipsync.phoneme_map import timings_to_visemes
from app.lipsync.rhubarb import RhubarbError
from app.lipsync.rhubarb_map import cues_to_visemes
from app.lipsync.words import word_timings
from app.models import MouthCue, Speech, Visemes
from app.pipeline.cache import DiskCache, cache_key

log = logging.getLogger(__name__)

RhubarbRunner = Callable[[bytes, int, str], tuple[MouthCue, ...]]


class LipSyncMode(StrEnum):
    RHUBARB = "rhubarb"  # PDF Model 2: Kokoro audio -> Rhubarb CLI -> visemes
    PHONEME = "phoneme"  # Improved: Kokoro's own phoneme timings -> visemes
    WORDS = "words"      # Baseline: word timings only, TalkingHead derives visemes


class TTSEngine(Protocol):
    version: str

    @property
    def voices(self) -> tuple[str, ...]: ...

    def synthesize(self, text: str, voice: str, speed: float = 1.0) -> Speech: ...


def _ms_since(start: float) -> int:
    return round((time.perf_counter() - start) * 1000)


class Orchestrator:
    def __init__(self, engine: TTSEngine, cache: DiskCache, rhubarb: RhubarbRunner | None) -> None:
        self.engine = engine
        self._cache = cache
        self._rhubarb = rhubarb

    def _visemes(self, speech: Speech, text: str, mode: LipSyncMode) -> Visemes | None:
        if mode is LipSyncMode.PHONEME:
            return timings_to_visemes(speech.timings)
        if mode is LipSyncMode.RHUBARB:
            if self._rhubarb is None:
                raise RhubarbError("Rhubarb is not configured on this server")
            return cues_to_visemes(self._rhubarb(speech.pcm16, speech.sample_rate, text))
        return None

    def speak_sentence(
        self, text: str, voice: str, mode: LipSyncMode, speed: float = 1.0
    ) -> dict[str, Any]:
        key = cache_key(f"{text}|{speed}", voice, mode.value, self.engine.version)
        cached = self._cache.get(key)
        if cached is not None:
            return {**cached, "timing": {**cached["timing"], "cached": True}}

        start = time.perf_counter()
        speech = self.engine.synthesize(text, voice, speed)
        tts_ms = _ms_since(start)

        start = time.perf_counter()
        visemes = self._visemes(speech, text, mode)
        lipsync_ms = _ms_since(start)

        words = word_timings(text, speech.timings, speech.seconds)
        chunk = {
            "text": text,
            "audio": base64.b64encode(speech.pcm16).decode("ascii"),
            "sample_rate": speech.sample_rate,
            **{k: list(v) for k, v in asdict(words).items()},
            **({k: list(v) for k, v in asdict(visemes).items()} if visemes else {}),
            "timing": {
                "tts_ms": tts_ms,
                "lipsync_ms": lipsync_ms,
                "audio_ms": round(speech.seconds * 1000),
                "cached": False,
            },
        }
        log.info("sentence mode=%s chars=%d timing=%s", mode, len(text), chunk["timing"])
        self._cache.put(key, chunk)
        return chunk
