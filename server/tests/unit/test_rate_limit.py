from app.api import rate_limit
from app.api.rate_limit import RateLimiter


def test_blocks_after_limit_per_client():
    limiter = RateLimiter(per_minute=2)
    assert limiter.allow("a") and limiter.allow("a")
    assert not limiter.allow("a")
    assert limiter.allow("b")


def test_idle_clients_are_forgotten(monkeypatch):
    now = [0.0]
    monkeypatch.setattr(rate_limit.time, "monotonic", lambda: now[0])
    limiter = RateLimiter(per_minute=5)
    limiter.allow("a")

    now[0] = rate_limit.WINDOW_S + 1
    limiter.allow("b")

    assert limiter.tracked_clients == 1
