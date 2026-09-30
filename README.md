# AI Avatar: CPU speech + lip-sync server

A CPU-only implementation of "Model 2: Lightweight Server CPU" from the *Avatar Speech & Lip-Sync Architecture Options* PDF. It uses [TalkingHead](https://github.com/met4citizen/TalkingHead) v1.7.0 (a git submodule, unmodified) for the 3D avatar in the browser.

```
answer text ─► split into sentences ─► Kokoro-82M (ONNX, CPU) ─► audio + phoneme timings
                                                        │
                   ┌────────────────────────────────────┼──────────────────────┐
             mode=rhubarb (PDF)               mode=phoneme (default)     mode=words
             Rhubarb CLI on the WAV           phonemes ─► visemes        TalkingHead
             A–H ─► Oculus visemes            (no extra work)            guesses visemes
                   └────────────────────────────────────┼──────────────────────┘
                                                        ▼
                       NDJSON, one line per sentence ─► TalkingHead.speakAudio()
```

## Run

```sh
git submodule update --init
./fetch-assets.sh                 # Kokoro model (~350 MB) + Rhubarb binary
cd server && uv sync
uv run python run.py              # http://127.0.0.1:8000
```

Use the dropdown on the page to switch between the three lip-sync modes.

## Test and benchmark

```sh
cd server
uv run pytest -m "not slow"       # fast, uses a fake TTS engine
uv run pytest -m slow             # real Kokoro + Rhubarb
PYTHONPATH=. uv run python scripts/benchmark.py
```

## API

`POST /api/speak` with `{"text": "...", "voice": "af_heart", "mode": "phoneme|rhubarb|words", "speed": 1.0}`
streams `application/x-ndjson`. Each line contains `index`, `last`, `audio` (base64 PCM16 at 24 kHz), `sample_rate`,
`words/wtimes/wdurations`, `visemes/vtimes/vdurations` (not present in `words` mode), and `timing`. If a sentence fails,
the stream ends with a line containing `error`.

`GET /api/voices` · `GET /healthz`

## Configuration

Settings are read from `AVATAR_*` environment variables. See `server/app/config.py`, for example
`AVATAR_RHUBARB_RECOGNIZER=pocketSphinx` and `AVATAR_MAX_CONCURRENT_JOBS=4`.

## Operational notes

- **Cache** (`AVATAR_CACHE_DIR`): each distinct sentence is written as one JSON file, and nothing is ever evicted. Clear or rotate the directory on a schedule, or move it to object storage with a lifecycle rule.
- **Rate limiting** is kept in memory per process. With more than one instance, move it to Redis or the load balancer.
- **Request bodies** larger than 64 KB are rejected with a 413 before they are parsed.
