# CPU-only speech server: Kokoro TTS + Rhubarb + the TalkingHead web client.
FROM python:3.12-slim AS assets
RUN apt-get update && apt-get install -y --no-install-recommends curl unzip ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY fetch-assets.sh .
RUN ./fetch-assets.sh

FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.8 /uv /usr/local/bin/uv
RUN useradd --create-home --uid 10001 avatar
WORKDIR /app
COPY server/pyproject.toml server/uv.lock server/.python-version server/
RUN cd server && uv sync --frozen --no-dev --no-install-project
COPY server/app server/app
COPY web web
COPY --from=assets /app/models models
COPY --from=assets /app/bin bin
ENV AVATAR_RHUBARB_BINARY=/app/bin/Rhubarb-Lip-Sync-1.14.0-Linux/rhubarb \
    AVATAR_CACHE_DIR=/tmp/speech-cache
USER avatar
EXPOSE 8000
HEALTHCHECK CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/healthz')"
CMD ["server/.venv/bin/uvicorn", "--app-dir", "server", "--factory", "app.main:create_app", "--host", "0.0.0.0", "--port", "8000"]
