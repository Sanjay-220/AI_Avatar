from app.lipsync.phoneme_track import timings_to_phonemes
from app.models import PhonemeTiming


def test_converts_seconds_to_ms_and_keeps_spaces():
    track = timings_to_phonemes(
        (PhonemeTiming("h", 0.1, 0.25), PhonemeTiming(" ", 0.25, 0.3), PhonemeTiming("aɪ", 0.3, 0.5))
    )

    assert track.phonemes == ("h", " ", "aɪ")
    assert track.ptimes == (100, 250, 300)
    assert track.pdurations == (150, 50, 200)


def test_empty_timings_give_empty_track():
    assert timings_to_phonemes(()).phonemes == ()
