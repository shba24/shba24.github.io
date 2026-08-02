#!/usr/bin/env bash
# setup-audio.sh — provision the audio toolchain used by scripts/generate-audio.mjs
# so per-post narration can be produced on ANY machine (local dev + CI).
#
# Installs, idempotently and best-effort:
#   1. ffmpeg   (macOS: Homebrew · Debian/Ubuntu: apt)
#   2. piper    (piper-tts CLI via pipx, pip --user fallback)
#   3. the pinned voice model into ~/.cache/piper-voices/
#
# Prints PIPER_MODEL. In GitHub Actions (GITHUB_ENV/GITHUB_PATH set) it also wires
# PATH + PIPER_MODEL for later steps. Never hard-fails: if a piece can't be
# installed, generate-audio.mjs skips TTS gracefully and the build still ships.
set -uo pipefail

VOICE="en_US-lessac-medium"
VOICE_URL_DIR="https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium"
CACHE_DIR="${PIPER_CACHE_DIR:-$HOME/.cache/piper-voices}"
MODEL="$CACHE_DIR/$VOICE.onnx"
LOCAL_BIN="$HOME/.local/bin"

log() { echo "[setup-audio] $*"; }

# 1. ffmpeg -------------------------------------------------------------------
if command -v ffmpeg >/dev/null 2>&1; then
  log "ffmpeg present ($(command -v ffmpeg))"
elif command -v brew >/dev/null 2>&1; then
  log "installing ffmpeg via Homebrew"; brew install ffmpeg || log "WARN: brew ffmpeg failed"
elif command -v apt-get >/dev/null 2>&1; then
  log "installing ffmpeg via apt"
  sudo apt-get update -y && sudo apt-get install -y ffmpeg || log "WARN: apt ffmpeg failed"
else
  log "WARN: no brew/apt — install ffmpeg manually"
fi

# 2. piper (piper-tts) --------------------------------------------------------
export PATH="$LOCAL_BIN:$PATH"
if command -v piper >/dev/null 2>&1; then
  log "piper present ($(command -v piper))"
else
  if ! command -v pipx >/dev/null 2>&1; then
    log "installing pipx"
    python3 -m pip install --user -q pipx 2>/dev/null || pip3 install --user -q pipx 2>/dev/null || log "WARN: pipx install failed"
    python3 -m pipx ensurepath >/dev/null 2>&1 || true
  fi
  if command -v pipx >/dev/null 2>&1; then
    log "installing piper-tts via pipx"; pipx install piper-tts || log "WARN: pipx piper-tts failed"
  else
    log "installing piper-tts via pip --user"; python3 -m pip install --user -q piper-tts || log "WARN: pip piper-tts failed"
  fi
fi

# 3. voice model --------------------------------------------------------------
mkdir -p "$CACHE_DIR"
if [ -f "$MODEL" ] && [ -f "$MODEL.json" ]; then
  log "voice model present ($MODEL)"
else
  log "downloading voice model '$VOICE'"
  curl -fsSL "$VOICE_URL_DIR/$VOICE.onnx"      -o "$MODEL"      || log "WARN: model .onnx download failed"
  curl -fsSL "$VOICE_URL_DIR/$VOICE.onnx.json" -o "$MODEL.json" || log "WARN: model .onnx.json download failed"
fi

# 4. report + wire CI env -----------------------------------------------------
log "PIPER_MODEL=$MODEL"
[ -n "${GITHUB_ENV:-}" ]  && echo "PIPER_MODEL=$MODEL" >> "$GITHUB_ENV"
[ -n "${GITHUB_PATH:-}" ] && echo "$LOCAL_BIN"          >> "$GITHUB_PATH"

if command -v piper >/dev/null 2>&1 && command -v ffmpeg >/dev/null 2>&1 && [ -f "$MODEL" ]; then
  log "audio toolchain READY"
else
  log "audio toolchain INCOMPLETE — generate-audio.mjs will skip TTS gracefully"
fi
exit 0
