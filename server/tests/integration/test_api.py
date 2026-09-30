import json

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.pipeline.cache import DiskCache
from app.pipeline.orchestrator import Orchestrator


@pytest.fixture
def client(fake_engine, tmp_path):
    orch = Orchestrator(engine=fake_engine, cache=DiskCache(tmp_path), rhubarb=None)
    return TestClient(create_app(orchestrator=orch))


def _lines(resp):
    return [json.loads(line) for line in resp.text.splitlines() if line]


def test_speak_streams_one_chunk_per_sentence(client):
    resp = client.post("/api/speak", json={"text": "Hi there. Hi there!", "mode": "phoneme"})

    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("application/x-ndjson")
    lines = _lines(resp)
    assert [line["index"] for line in lines] == [0, 1]
    assert lines[-1]["last"] is True


def test_rhubarb_failure_is_reported_in_stream_not_crash(client):
    resp = client.post("/api/speak", json={"text": "Hi there.", "mode": "rhubarb"})

    assert resp.status_code == 200
    assert _lines(resp)[-1]["error"] == "Lip-sync failed for this sentence"


@pytest.mark.parametrize("body", [
    {"text": ""},
    {"text": "x" * 5000},
    {"text": "hi", "voice": "../../etc/passwd"},
    {"text": "hi", "mode": "magic"},
    {"text": "hi", "speed": 9},
])
def test_invalid_input_is_rejected(client, body):
    assert client.post("/api/speak", json=body).status_code == 422


def test_voices_and_health(client):
    assert client.get("/api/voices").json()["voices"] == ["af_heart", "am_adam"]
    assert client.get("/healthz").json()["status"] == "ok"


def test_oversized_body_is_rejected_before_parsing(client):
    resp = client.post(
        "/api/speak", content=b'{"text": "' + b"x" * 200_000 + b'"}',
        headers={"content-type": "application/json"},
    )
    assert resp.status_code == 413


def test_text_limit_comes_from_settings(fake_engine, tmp_path):
    from app.config import Settings

    orch = Orchestrator(engine=fake_engine, cache=DiskCache(tmp_path), rhubarb=None)
    small = TestClient(create_app(orchestrator=orch, settings=Settings(max_text_chars=10)))

    assert small.post("/api/speak", json={"text": "short"}).status_code == 200
    assert small.post("/api/speak", json={"text": "much too long text"}).status_code == 422
