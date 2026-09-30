from app.lipsync.phoneme_map import phoneme_to_viseme, timings_to_visemes
from app.models import PhonemeTiming


def test_bilabials_and_labiodentals():
    assert phoneme_to_viseme("p") == "PP"
    assert phoneme_to_viseme("m") == "PP"
    assert phoneme_to_viseme("f") == "FF"
    assert phoneme_to_viseme("v") == "FF"


def test_vowels_and_consonant_classes():
    assert phoneme_to_viseme("ɑ") == "aa"
    assert phoneme_to_viseme("ɛ") == "E"
    assert phoneme_to_viseme("i") == "I"
    assert phoneme_to_viseme("o") == "O"
    assert phoneme_to_viseme("ʊ") == "U"
    assert phoneme_to_viseme("ð") == "TH"
    assert phoneme_to_viseme("ʃ") == "CH"
    assert phoneme_to_viseme("s") == "SS"
    assert phoneme_to_viseme("k") == "kk"
    assert phoneme_to_viseme("ɹ") == "RR"


def test_stress_marks_spaces_and_punctuation_have_no_viseme():
    for p in ("ˈ", "ˌ", "ː", " ", ",", ".", "?"):
        assert phoneme_to_viseme(p) is None


def test_timings_become_millisecond_visemes_skipping_non_speech():
    timings = (
        PhonemeTiming("h", 0.10, 0.15),
        PhonemeTiming("ˈ", 0.15, 0.20),
        PhonemeTiming("ɛ", 0.20, 0.30),
        PhonemeTiming(" ", 0.30, 0.35),
        PhonemeTiming("m", 0.35, 0.40),
    )

    visemes = timings_to_visemes(timings)

    assert visemes.visemes == ("E", "PP")
    assert visemes.vtimes == (200, 350)
    assert visemes.vdurations == (100, 50)


def test_identical_neighbours_merge_into_one_longer_viseme():
    timings = (PhonemeTiming("o", 0.0, 0.1), PhonemeTiming("ɔ", 0.1, 0.2))

    visemes = timings_to_visemes(timings)

    assert visemes.visemes == ("O",)
    assert visemes.vdurations == (200,)
