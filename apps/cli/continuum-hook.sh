#!/usr/bin/env bash
# Continuum — Claude Code SessionEnd hook.
#
# Reads the Claude Code session transcript and POSTs it to a running Continuum
# server. The server resolves which project this session belongs to by matching
# the current working directory against registered projects.
#
# Install:
#   1. cp this file to ~/.claude/continuum-hook.sh && chmod +x ~/.claude/continuum-hook.sh
#   2. Register your project in Continuum and set its "cwd" to the repo path.
#   3. Add a SessionEnd hook in ~/.claude/settings.json (see README).
#
# Required env (set in your shell or in the Claude Code "env" block):
#   CONTINUUM_URL    e.g. http://localhost:3000
#   CONTINUUM_TOKEN  must match CONTINUUM_TOKEN on the server
#
# Claude Code provides:
#   - $CLAUDE_PROJECT_DIR or cwd of session
#   - transcript via stdin (JSON envelope) or $CLAUDE_TRANSCRIPT_PATH

set -euo pipefail

URL="${CONTINUUM_URL:-http://localhost:3000}"
TOKEN="${CONTINUUM_TOKEN:-}"
CWD="${CLAUDE_PROJECT_DIR:-${PWD}}"

# Try to read the transcript from the file path Claude Code passes via stdin,
# falling back to stdin content directly.
TRANSCRIPT=""
if [ ! -t 0 ]; then
  STDIN_PAYLOAD="$(cat || true)"
  # Claude Code sends a JSON envelope on stdin with a transcript_path field.
  # If jq is available and stdin parses as JSON, extract it; otherwise treat stdin as raw transcript.
  if command -v jq >/dev/null 2>&1 && echo "$STDIN_PAYLOAD" | jq -e . >/dev/null 2>&1; then
    TPATH="$(echo "$STDIN_PAYLOAD" | jq -r '.transcript_path // empty')"
    if [ -n "$TPATH" ] && [ -f "$TPATH" ]; then
      TRANSCRIPT="$(cat "$TPATH")"
    fi
    CWD_FROM_PAYLOAD="$(echo "$STDIN_PAYLOAD" | jq -r '.cwd // empty')"
    if [ -n "$CWD_FROM_PAYLOAD" ]; then
      CWD="$CWD_FROM_PAYLOAD"
    fi
  else
    TRANSCRIPT="$STDIN_PAYLOAD"
  fi
fi

if [ -z "$TRANSCRIPT" ] && [ -n "${CLAUDE_TRANSCRIPT_PATH:-}" ] && [ -f "${CLAUDE_TRANSCRIPT_PATH}" ]; then
  TRANSCRIPT="$(cat "$CLAUDE_TRANSCRIPT_PATH")"
fi

if [ -z "$TRANSCRIPT" ]; then
  echo "continuum-hook: no transcript to ingest (cwd=$CWD)" >&2
  exit 0
fi

# Build the JSON payload safely. Use python if available for proper escaping,
# otherwise jq, otherwise a best-effort shell escape.
if command -v python3 >/dev/null 2>&1; then
  PAYLOAD="$(python3 -c '
import json, sys, os
data = sys.stdin.read()
print(json.dumps({
  "cwd": os.environ.get("CWD"),
  "source": "claude_code",
  "transcript": data
}))
' <<<"$TRANSCRIPT")"
elif command -v jq >/dev/null 2>&1; then
  PAYLOAD="$(jq -n --arg cwd "$CWD" --arg t "$TRANSCRIPT" '{cwd:$cwd, source:"claude_code", transcript:$t}')"
else
  echo "continuum-hook: needs python3 or jq for JSON encoding" >&2
  exit 0
fi

curl --silent --show-error --fail-with-body \
  --max-time 120 \
  -X POST "$URL/api/ingest" \
  -H "Content-Type: application/json" \
  -H "X-Continuum-Token: $TOKEN" \
  --data-binary "$PAYLOAD" \
  > /dev/null 2>&1 || echo "continuum-hook: ingest call failed (server at $URL reachable?)" >&2

exit 0
