import pytest

from app.pipeline.sentences import split_sentences


def test_splits_on_sentence_punctuation():
    assert split_sentences("Hello there. How are you? Great!") == (
        "Hello there.", "How are you?", "Great!",
    )


def test_keeps_abbreviations_and_decimals_together():
    assert split_sentences("Dr. Smith paid $3.50 today.") == ("Dr. Smith paid $3.50 today.",)


def test_long_sentence_is_split_on_commas():
    long = ", ".join(["word " * 10] * 6).strip() + "."
    parts = split_sentences(long, max_chars=120)
    assert all(len(p) <= 120 for p in parts)
    assert " ".join(parts).replace("  ", " ") .count("word") == 60


def test_blank_text_is_rejected():
    with pytest.raises(ValueError):
        split_sentences("   ")
