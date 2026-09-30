"""Derive word timings (for subtitles and TalkingHead) from phoneme timings."""

from app.lipsync.phoneme_map import phoneme_to_viseme
from app.models import PhonemeTiming, Words


def _phoneme_words(timings: tuple[PhonemeTiming, ...]) -> list[tuple[float, float]]:
    """Group timings into (start, end) spans separated by spaces, ignoring punctuation."""
    spans: list[tuple[float, float]] = []
    current: list[PhonemeTiming] = []
    for t in (*timings, PhonemeTiming(" ", 0.0, 0.0)):
        if t.phoneme.isspace():
            spoken = [p for p in current if phoneme_to_viseme(p.phoneme) or p.phoneme == "h"]
            if spoken:
                spans.append((spoken[0].start, spoken[-1].end))
            current = []
        else:
            current.append(t)
    return spans


def _even_spread(words: list[str], audio_seconds: float) -> list[tuple[float, float]]:
    step = audio_seconds / len(words)
    return [(i * step, (i + 1) * step) for i in range(len(words))]


def word_timings(
    text: str, timings: tuple[PhonemeTiming, ...], audio_seconds: float
) -> Words:
    """Pair each word of `text` with a time span; spread evenly if phoneme groups don't line up."""
    words = text.split()
    if not words:
        return Words()
    spans = _phoneme_words(timings)
    if len(spans) != len(words):
        spans = _even_spread(words, audio_seconds)
    return Words(
        words=tuple(words),
        wtimes=tuple(round(s * 1000) for s, _ in spans),
        wdurations=tuple(round((e - s) * 1000) for s, e in spans),
    )
