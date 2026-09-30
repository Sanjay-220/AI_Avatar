"""Content-addressed disk cache: a repeated sentence skips TTS and lip-sync entirely."""

import hashlib
import json
import logging
import os
import tempfile
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)


def cache_key(text: str, voice: str, mode: str, engine_version: str) -> str:
    payload = json.dumps([text, voice, mode, engine_version], ensure_ascii=False)
    return hashlib.sha256(payload.encode()).hexdigest()


class DiskCache:
    def __init__(self, root: Path) -> None:
        self._root = root
        self._root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        return self._root / f"{key}.json"

    def get(self, key: str) -> dict[str, Any] | None:
        path = self._path(key)
        if not path.exists():
            return None
        try:
            return json.loads(path.read_text())
        except (OSError, json.JSONDecodeError) as exc:
            log.warning("Ignoring unreadable cache entry %s: %s", key, exc)
            return None

    def put(self, key: str, value: dict[str, Any]) -> None:
        """Write atomically so a reader never sees a half-written entry."""
        fd, tmp = tempfile.mkstemp(dir=self._root, suffix=".tmp")
        try:
            with os.fdopen(fd, "w") as f:
                json.dump(value, f)
            os.replace(tmp, self._path(key))
        except OSError:
            Path(tmp).unlink(missing_ok=True)
            raise
