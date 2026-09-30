"""Kokoro-82M (ONNX) on CPU, returning audio plus per-phoneme timings."""

import logging
import threading
from pathlib import Path

import numpy as np
from kokoro_onnx import Kokoro

from app.models import PhonemeTiming, Speech

_INT16_MAX = 32767

# phonemizer warns on every sentence ending in punctuation; the timings are still correct
logging.getLogger("phonemizer").setLevel(logging.ERROR)


def float_to_pcm16(samples: np.ndarray) -> bytes:
    clipped = np.clip(samples, -1.0, 1.0)
    return (clipped * _INT16_MAX).astype("<i2").tobytes()


class KokoroEngine:
    """Loads the model once on first use; safe to share across worker threads."""

    def __init__(self, model_path: Path, voices_path: Path) -> None:
        for path in (model_path, voices_path):
            if not path.is_file():
                raise FileNotFoundError(f"Kokoro file missing: {path}")
        self._model_path = model_path
        self._voices_path = voices_path
        self._kokoro: Kokoro | None = None
        self._lock = threading.Lock()
        self.version = f"kokoro-onnx:{model_path.name}"

    def _model(self) -> Kokoro:
        with self._lock:
            if self._kokoro is None:
                self._kokoro = Kokoro(str(self._model_path), str(self._voices_path))
            return self._kokoro

    @property
    def voices(self) -> tuple[str, ...]:
        return tuple(self._model().get_voices())

    def synthesize(self, text: str, voice: str, speed: float = 1.0) -> Speech:
        samples, sample_rate, timings = self._model().create_timed(text, voice, speed=speed)
        return Speech(
            pcm16=float_to_pcm16(samples),
            sample_rate=sample_rate,
            timings=tuple(PhonemeTiming(t.phoneme, t.start, t.end) for t in timings),
        )
