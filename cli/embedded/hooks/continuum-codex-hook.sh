#!/usr/bin/env bash
# Continuum — Codex CLI hook.
#
# Codex doesn't ship a SessionEnd hook yet (see openai/codex#20603), so this
# script is registered against `Stop` (fires per-turn). Continuum's /api/ingest
# is idempotent on (source, sessionId): on every re-ingest with the same
# session_id, the prior fanout is deleted and the latest snapshot reinserted.
# That means the project brain stays current as the session progresses
# instead of stacking duplicate session rows.
#
# When openai/codex finally ships SessionEnd, swap the event in
# ~/.codex/hooks.json from `Stop` to `SessionEnd`; no script change needed.
#
# Install: `npm run connect-codex` (in the Continuum repo).
#
# Required env (set in your shell or in the Codex hooks env block):
#   CONTINUUM_URL    e.g. http://localhost:3000
#   CONTINUUM_TOKEN  must match CONTINUUM_TOKEN on the server
#
# Codex provides on stdin a JSON envelope including:
#   session_id, transcript_path, cwd, hook_event_name, model

set -euo pipefail

URL="${CONTINUUM_URL:-http://localhost:3000}"
TOKEN="${CONTINUUM_TOKEN:-}"
CWD="${PWD}"
SESSION_ID=""
TRANSCRIPT=""

if [ ! -t 0 ]; then
  STDIN_PAYLOAD="$(cat || true)"
  if command -v jq >/dev/null 2>&1 && echo "$STDIN_PAYLOAD" | jq -e . >/dev/null 2>&1; then
    TPATH="$(echo "$STDIN_PAYLOAD" | jq -r '.transcript_path // empty')"
    SID_FROM_PAYLOAD="$(echo "$STDIN_PAYLOAD" | jq -r '.session_id // empty')"
    CWD_FROM_PAYLOAD="$(echo "$STDIN_PAYLOAD" | jq -r '.cwd // empty')"
    [ -n "$TPATH" ] && [ -f "$TPATH" ] && TRANSCRIPT="$(cat "$TPATH")"
    [ -n "$SID_FROM_PAYLOAD" ] && SESSION_ID="$SID_FROM_PAYLOAD"
    [ -n "$CWD_FROM_PAYLOAD" ] && CWD="$CWD_FROM_PAYLOAD"
  fi
fi

if [ -z "$TRANSCRIPT" ]; then
  echo "continuum-codex-hook: no transcript to ingest (cwd=$CWD)" >&2
  exit 0
fi

if [ -z "$SESSION_ID" ]; then
  echo "continuum-codex-hook: no session_id in stdin envelope — re-ingests will duplicate" >&2
fi

if command -v python3 >/dev/null 2>&1; then
  PAYLOAD="$(python3 -c '
import json, sys, os
data = sys.stdin.read()
print(json.dumps({
  "cwd": os.environ.get("CWD"),
  "source": "codex",
  "sessionId": os.environ.get("SESSION_ID") or None,
  "transcript": data
}))
' <<<"$TRANSCRIPT")"
elif command -v jq >/dev/null 2>&1; then
  PAYLOAD="$(jq -n --arg cwd "$CWD" --arg sid "$SESSION_ID" --arg t "$TRANSCRIPT" \
    '{cwd:$cwd, source:"codex", sessionId: (if $sid == "" then null else $sid end), transcript:$t}')"
else
  echo "continuum-codex-hook: needs python3 or jq for JSON encoding" >&2
  exit 0
fi

curl --silent --show-error --fail-with-body \
  --max-time 120 \
  -X POST "$URL/api/ingest" \
  -H "Content-Type: application/json" \
  -H "X-Continuum-Token: $TOKEN" \
  --data-binary "$PAYLOAD" \
  > /dev/null 2>&1 || echo "continuum-codex-hook: ingest call failed (server at $URL reachable?)" >&2

exit 0
