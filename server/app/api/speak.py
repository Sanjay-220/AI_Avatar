"""POST /api/speak: stream one NDJSON line per sentence, ready for TalkingHead.speakAudio()."""

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.lipsync.rhubarb import RhubarbError
from app.pipeline.orchestrator import LipSyncMode, Orchestrator
from app.pipeline.sentences import split_sentences

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api")

class SpeakRequest(BaseModel):
    text: str = Field(min_length=1)
    voice: str = Field(default="af_heart", pattern=r"^[a-z]{2}_[a-z]+$")
    mode: LipSyncMode = LipSyncMode.PHONEME
    speed: float = Field(default=1.0, ge=0.5, le=2.0)


def _line(obj: dict[str, Any]) -> bytes:
    return (json.dumps(obj, ensure_ascii=False) + "\n").encode()


async def _stream(
    orch: Orchestrator, jobs: asyncio.Semaphore, req: SpeakRequest, sentences: tuple[str, ...]
) -> AsyncIterator[bytes]:
    for i, sentence in enumerate(sentences):
        try:
            async with jobs:
                chunk = await run_in_threadpool(
                    orch.speak_sentence, sentence, req.voice, req.mode, req.speed
                )
        except RhubarbError:
            log.exception("Rhubarb failed on sentence %d", i)
            yield _line({"index": i, "last": True, "error": "Lip-sync failed for this sentence"})
            return
        except Exception:
            log.exception("Speech failed on sentence %d", i)
            yield _line({"index": i, "last": True, "error": "Speech generation failed"})
            return
        yield _line({"index": i, "last": i == len(sentences) - 1, **chunk})


@router.post("/speak")
async def speak(req: SpeakRequest, request: Request) -> StreamingResponse:
    state = request.app.state
    client_id = request.client.host if request.client else "unknown"
    if not state.rate_limiter.allow(client_id):
        raise HTTPException(status_code=429, detail="Too many requests, slow down")
    if len(req.text) > state.max_text_chars:
        raise HTTPException(status_code=422, detail=f"Text exceeds {state.max_text_chars} characters")
    orch: Orchestrator = state.orchestrator
    if req.voice not in orch.engine.voices:
        raise HTTPException(status_code=422, detail=f"Unknown voice {req.voice!r}")
    try:
        sentences = split_sentences(req.text)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return StreamingResponse(
        _stream(orch, state.jobs, req, sentences), media_type="application/x-ndjson"
    )


@router.get("/voices")
async def voices(request: Request) -> dict[str, list[str]]:
    return {"voices": list(request.app.state.orchestrator.engine.voices)}
