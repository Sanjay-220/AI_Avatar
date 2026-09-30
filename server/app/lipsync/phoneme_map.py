"""Map Kokoro's IPA phonemes straight to Oculus visemes, with no audio analysis."""

from app.models import PhonemeTiming, Visemes

_GROUPS: dict[str, str] = {
    "PP": "pbm",
    "FF": "fv",
    "TH": "θð",
    "DD": "tdɾ",
    "kk": "kɡgŋx",
    "SS": "sz",
    "CH": "ʃʒʧʤ",
    "nn": "nlɫ",
    "RR": "ɹrɚɝ",
    "aa": "ɑaæʌɐ",
    "E": "ɛeəɜ",
    "I": "ɪiᵻjy",
    "O": "ɔoɒ",
    "U": "uʊw",
}
PHONEME_TO_VISEME: dict[str, str] = {p: v for v, chars in _GROUPS.items() for p in chars}

_MERGE_GAP_S = 0.001


def phoneme_to_viseme(phoneme: str) -> str | None:
    """Return the viseme for a phoneme, or None for stress marks, pauses and 'h'."""
    stripped = phoneme.strip()
    if not stripped:
        return None
    return PHONEME_TO_VISEME.get(stripped[0])


def timings_to_visemes(timings: tuple[PhonemeTiming, ...]) -> Visemes:
    """Build a viseme track in ms, merging back-to-back repeats of the same viseme."""
    track: list[tuple[str, float, float]] = []
    for t in timings:
        viseme = phoneme_to_viseme(t.phoneme)
        if viseme is None:
            continue
        if track and track[-1][0] == viseme and t.start - track[-1][2] <= _MERGE_GAP_S:
            track[-1] = (viseme, track[-1][1], t.end)
        else:
            track.append((viseme, t.start, t.end))
    return Visemes(
        visemes=tuple(v for v, _, _ in track),
        vtimes=tuple(round(s * 1000) for _, s, _ in track),
        vdurations=tuple(round((e - s) * 1000) for _, s, e in track),
    )
