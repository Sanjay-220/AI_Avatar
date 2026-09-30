from app.lipsync.words import word_timings
from app.models import PhonemeTiming


def _t(p, s, e):
    return PhonemeTiming(p, s, e)


def test_words_align_to_phoneme_groups_when_counts_match():
    timings = (
        _t("h", 0.1, 0.2), _t("aɪ", 0.2, 0.4), _t(" ", 0.4, 0.5),
        _t("ð", 0.5, 0.6), _t("ɛ", 0.6, 0.7), _t("ɹ", 0.7, 0.9),
    )

    words = word_timings("Hi there", timings, audio_seconds=1.0)

    assert words.words == ("Hi", "there")
    assert words.wtimes == (100, 500)
    assert words.wdurations == (300, 400)


def test_falls_back_to_even_spread_when_counts_differ():
    timings = (_t("t", 0.0, 0.5), _t("u", 0.5, 1.0))

    words = word_timings("It costs 25 dollars", timings, audio_seconds=1.0)

    assert words.words == ("It", "costs", "25", "dollars")
    assert words.wtimes == (0, 250, 500, 750)
    assert all(d == 250 for d in words.wdurations)


def test_empty_text_gives_no_words():
    assert word_timings("   ", (), audio_seconds=0.5).words == ()
