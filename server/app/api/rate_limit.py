"""Small in-memory per-client limiter; swap for Redis when running more than one instance."""

import threading
import time
from collections import defaultdict, deque

WINDOW_S = 60.0


class RateLimiter:
    def __init__(self, per_minute: int) -> None:
        self._limit = per_minute
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()
        self._last_sweep = time.monotonic()

    @property
    def tracked_clients(self) -> int:
        return len(self._hits)

    def _forget_idle(self, now: float) -> None:
        idle = [k for k, hits in self._hits.items() if not hits or now - hits[-1] > WINDOW_S]
        for key in idle:
            del self._hits[key]

    def allow(self, client_id: str) -> bool:
        now = time.monotonic()
        with self._lock:
            if now - self._last_sweep > WINDOW_S:
                self._forget_idle(now)
                self._last_sweep = now
            hits = self._hits[client_id]
            while hits and now - hits[0] > WINDOW_S:
                hits.popleft()
            if len(hits) >= self._limit:
                return False
            hits.append(now)
            return True
