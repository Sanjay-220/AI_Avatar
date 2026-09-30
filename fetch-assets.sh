#!/bin/sh
# Download the Kokoro model and the Rhubarb binary (not committed: ~350 MB).
set -eu
ROOT="$(cd "$(dirname "$0")" && pwd)"
KOKORO=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1
RHUBARB=https://github.com/DanielSWolf/rhubarb-lip-sync/releases/download/v1.14.0
case "$(uname -s)" in Darwin) OS=macOS ;; *) OS=Linux ;; esac

mkdir -p "$ROOT/models" "$ROOT/bin"
[ -f "$ROOT/models/kokoro-v1.0.onnx" ] || curl -fL -o "$ROOT/models/kokoro-v1.0.onnx" "$KOKORO/kokoro-v1.0.onnx"
[ -f "$ROOT/models/voices-v1.0.bin" ] || curl -fL -o "$ROOT/models/voices-v1.0.bin" "$KOKORO/voices-v1.0.bin"
if [ ! -d "$ROOT/bin/Rhubarb-Lip-Sync-1.14.0-$OS" ]; then
  curl -fL -o "$ROOT/bin/rhubarb.zip" "$RHUBARB/Rhubarb-Lip-Sync-1.14.0-$OS.zip"
  unzip -q "$ROOT/bin/rhubarb.zip" -d "$ROOT/bin" && rm "$ROOT/bin/rhubarb.zip"
fi
