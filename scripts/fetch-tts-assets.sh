#!/bin/bash
# Fetches TTS voice model weights into docs/assets/tts/ (gitignored).
# Idempotent: skips anything already present. Run locally before `mkdocs
# build`/`mkdocs serve`, and from the VPS deploy hook before each build.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$REPO_ROOT/docs/assets/tts"
mkdir -p "$DEST"

fetch_voice() {
  local name="$1" url="$2"
  if [ -d "$DEST/$name" ]; then
    echo "skip $name (already present)"
    return
  fi
  echo "fetching $name ..."
  local tmp
  tmp="$(mktemp)"
  curl -fL -o "$tmp" "$url"
  tar xjf "$tmp" -C "$DEST"
  rm -f "$tmp"
}

fetch_voice "vits-piper-en_US-amy-low-int8" \
  "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-amy-low-int8.tar.bz2"

echo "done."
