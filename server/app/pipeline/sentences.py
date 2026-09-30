"""Split answer text into sentences so the avatar can start speaking early."""

import re

DEFAULT_MAX_CHARS = 300
_ABBREVIATIONS = ("Mr.", "Mrs.", "Ms.", "Dr.", "Prof.", "Sr.", "Jr.", "St.", "vs.", "etc.", "e.g.", "i.e.")
_BOUNDARY = re.compile(r"(?<=[.!?])\s+")


def _join_abbreviations(parts: list[str]) -> list[str]:
    merged: list[str] = []
    for part in parts:
        if merged and merged[-1].endswith(_ABBREVIATIONS):
            merged[-1] = f"{merged[-1]} {part}"
        else:
            merged.append(part)
    return merged


def _split_long(sentence: str, max_chars: int) -> list[str]:
    if len(sentence) <= max_chars:
        return [sentence]
    chunks: list[str] = []
    current = ""
    for clause in re.split(r"(?<=,)\s+", sentence):
        candidate = f"{current} {clause}".strip()
        if current and len(candidate) > max_chars:
            chunks.append(current)
            current = clause
        else:
            current = candidate
    return [*chunks, current] if current else chunks


def split_sentences(text: str, max_chars: int = DEFAULT_MAX_CHARS) -> tuple[str, ...]:
    """Return sentences in order; overly long ones are split on commas."""
    cleaned = " ".join(text.split())
    if not cleaned:
        raise ValueError("Text is empty")
    sentences = _join_abbreviations(_BOUNDARY.split(cleaned))
    return tuple(chunk for s in sentences for chunk in _split_long(s, max_chars))
