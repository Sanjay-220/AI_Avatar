"""Pass Kokoro's phoneme timings through unchanged, in ms, for client-side lip-sync."""

from app.models import Phonemes, PhonemeTiming


def timings_to_phonemes(timings: tuple[PhonemeTiming, ...]) -> Phonemes:
    """Keep spaces and punctuation: the client reads them as word boundaries and pauses."""
    return Phonemes(
        phonemes=tuple(t.phoneme for t in timings),
        ptimes=tuple(round(t.start * 1000) for t in timings),
        pdurations=tuple(round((t.end - t.start) * 1000) for t in timings),
    )
