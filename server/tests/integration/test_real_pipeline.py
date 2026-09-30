"""End-to-end with the real Kokoro model and Rhubarb binary. Run with: pytest -m slow"""

import pytest

from app.config import get_settings
from app.main import build_orchestrator
from app.pipeline.cache import DiskCache
from app.pipeline.orchestrator import LipSyncMode

pytestmark = pytest.mark.slow
settings = get_settings()


@pytest.fixture(scope="module")
def orch(tmp_path_factory):
    if not settings.kokoro_model.is_file() or not settings.rhubarb_binary.is_file():
        pytest.skip("Kokoro model or Rhubarb binary not downloaded")
    o = build_orchestrator(settings)
    o._cache = DiskCache(tmp_path_factory.mktemp("cache"))
    return o


@pytest.mark.parametrize("mode", list(LipSyncMode))
def test_every_mode_produces_playable_chunk(orch, mode):
    chunk = orch.speak_sentence("Please verify your phone number.", "af_heart", mode)

    assert chunk["sample_rate"] == 24000
    assert chunk["words"] == ["Please", "verify", "your", "phone", "number."]
    assert chunk["wtimes"] == sorted(chunk["wtimes"])
    if mode is not LipSyncMode.WORDS:
        assert "PP" in chunk["visemes"] and "FF" in chunk["visemes"]
        assert max(chunk["vtimes"]) < chunk["timing"]["audio_ms"]
