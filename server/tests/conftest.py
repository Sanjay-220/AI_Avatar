import pytest

from app.models import PhonemeTiming, Speech

# "Hi there" at 24 kHz: 0.1-0.4 s "Hi", 0.5-0.9 s "there"
FAKE_TIMINGS = (
    PhonemeTiming("h", 0.1, 0.2), PhonemeTiming("aɪ", 0.2, 0.4), PhonemeTiming(" ", 0.4, 0.5),
    PhonemeTiming("ð", 0.5, 0.6), PhonemeTiming("ɛ", 0.6, 0.7), PhonemeTiming("ɹ", 0.7, 0.9),
)


class FakeEngine:
    version = "fake-1"
    voices = ("af_heart", "am_adam")

    def __init__(self):
        self.calls: list[str] = []

    def synthesize(self, text: str, voice: str, speed: float = 1.0) -> Speech:
        self.calls.append(text)
        return Speech(pcm16=b"\x01\x00" * 24000, sample_rate=24000, timings=FAKE_TIMINGS)


@pytest.fixture
def fake_engine():
    return FakeEngine()
