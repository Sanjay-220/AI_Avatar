import base64

import pytest

from app.lipsync.rhubarb import RhubarbError
from app.models import MouthCue
from app.pipeline.cache import DiskCache
from app.pipeline.orchestrator import LipSyncMode, Orchestrator


def _orch(engine, tmp_path, rhubarb=None):
    return Orchestrator(engine=engine, cache=DiskCache(tmp_path), rhubarb=rhubarb)


def test_phoneme_mode_returns_audio_words_and_visemes(fake_engine, tmp_path):
    chunk = _orch(fake_engine, tmp_path).speak_sentence("Hi there", "af_heart", LipSyncMode.PHONEME)

    assert base64.b64decode(chunk["audio"]) == b"\x01\x00" * 24000
    assert chunk["sample_rate"] == 24000
    assert chunk["words"] == ["Hi", "there"]
    assert chunk["visemes"] == ["aa", "TH", "E", "RR"]
    assert chunk["timing"]["cached"] is False


def test_words_mode_leaves_visemes_to_talkinghead(fake_engine, tmp_path):
    chunk = _orch(fake_engine, tmp_path).speak_sentence("Hi there", "af_heart", LipSyncMode.WORDS)

    assert "visemes" not in chunk
    assert chunk["words"] == ["Hi", "there"]


def test_rhubarb_mode_uses_rhubarb_cues(fake_engine, tmp_path):
    def fake_rhubarb(pcm16, sample_rate, text):
        assert text == "Hi there"
        return (MouthCue(0.1, 0.3, "D"), MouthCue(0.3, 0.4, "X"), MouthCue(0.5, 0.6, "A"))

    chunk = _orch(fake_engine, tmp_path, fake_rhubarb).speak_sentence(
        "Hi there", "af_heart", LipSyncMode.RHUBARB
    )

    assert chunk["visemes"] == ["aa", "PP"]
    assert chunk["vtimes"] == [100, 500]


def test_rhubarb_mode_without_rhubarb_configured_fails_clearly(fake_engine, tmp_path):
    with pytest.raises(RhubarbError, match="not configured"):
        _orch(fake_engine, tmp_path).speak_sentence("Hi", "af_heart", LipSyncMode.RHUBARB)


def test_second_request_is_served_from_cache(fake_engine, tmp_path):
    orch = _orch(fake_engine, tmp_path)
    orch.speak_sentence("Hi there", "af_heart", LipSyncMode.PHONEME)

    chunk = orch.speak_sentence("Hi there", "af_heart", LipSyncMode.PHONEME)

    assert fake_engine.calls == ["Hi there"]
    assert chunk["timing"]["cached"] is True
