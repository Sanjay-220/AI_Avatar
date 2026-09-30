"""Immutable value types shared by the TTS, lip-sync and pipeline layers."""

from dataclasses import dataclass


@dataclass(frozen=True)
class PhonemeTiming:
    """One phoneme and the span of audio it occupies, in seconds."""

    phoneme: str
    start: float
    end: float


@dataclass(frozen=True)
class MouthCue:
    """One Rhubarb mouth shape (A-H, X) and its span, in seconds."""

    start: float
    end: float
    shape: str


@dataclass(frozen=True)
class Visemes:
    """Oculus viseme track in the shape TalkingHead.speakAudio() expects (ms)."""

    visemes: tuple[str, ...] = ()
    vtimes: tuple[int, ...] = ()
    vdurations: tuple[int, ...] = ()


@dataclass(frozen=True)
class Words:
    """Word track for subtitles and TalkingHead's own lip-sync (ms)."""

    words: tuple[str, ...] = ()
    wtimes: tuple[int, ...] = ()
    wdurations: tuple[int, ...] = ()


@dataclass(frozen=True)
class Speech:
    """Synthesized audio as 16-bit little-endian mono PCM."""

    pcm16: bytes
    sample_rate: int
    timings: tuple[PhonemeTiming, ...]

    @property
    def seconds(self) -> float:
        return len(self.pcm16) / 2 / self.sample_rate
