"""FastAPI app: the speech API plus the static TalkingHead web client."""

import asyncio
import logging
from functools import partial

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.body_limit import BodySizeLimit
from app.api.rate_limit import RateLimiter
from app.api.speak import router as speak_router
from app.config import Settings, get_settings
from app.lipsync.rhubarb import run_rhubarb
from app.pipeline.cache import DiskCache
from app.pipeline.orchestrator import Orchestrator
from app.tts.kokoro_engine import KokoroEngine

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


def build_orchestrator(settings: Settings) -> Orchestrator:
    rhubarb = partial(
        run_rhubarb,
        binary=settings.rhubarb_binary,
        recognizer=settings.rhubarb_recognizer,
        timeout_s=settings.rhubarb_timeout_s,
    )
    return Orchestrator(
        engine=KokoroEngine(settings.kokoro_model, settings.kokoro_voices),
        cache=DiskCache(settings.cache_dir),
        rhubarb=rhubarb,
    )


def create_app(orchestrator: Orchestrator | None = None, settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(title="Avatar speech server")
    app.state.orchestrator = orchestrator or build_orchestrator(settings)
    app.state.jobs = asyncio.Semaphore(settings.max_concurrent_jobs)
    app.state.rate_limiter = RateLimiter(settings.rate_limit_per_minute)
    app.state.max_text_chars = settings.max_text_chars
    app.add_middleware(BodySizeLimit)
    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["GET", "POST"]
        )
    app.include_router(speak_router)

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    if settings.web_dir.is_dir():
        app.mount("/", StaticFiles(directory=settings.web_dir, html=True), name="web")
    return app
