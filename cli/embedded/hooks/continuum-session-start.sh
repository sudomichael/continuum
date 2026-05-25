#!/usr/bin/env bash
# Continuum — Claude Code SessionStart hook.
#
# Fires when a Claude Code session begins. POSTs the session's cwd to
# /api/projects/auto-register so a project is created automatically the first
# time you work in a given git repo. Subsequent sessions in the same cwd are
# no-ops on the server side.
#
# Required env:
#   CONTINUUM_URL    e.g. http://localhost:3000
#   CONTINUUM_TOKEN  must match CONTINUUM_TOKEN on the server

set -euo pipefail

URL="${CONTINUUM_URL:-http://localhost:3000}"
TOKEN="${CONTINUUM_TOKEN:-}"
CWD="${CLAUDE_PROJECT_DIR:-${PWD}}"

# Claude Code passes a JSON envelope on stdin with cwd; prefer it.
if [ ! -t 0 ] && command -v jq >/dev/null 2>&1; then
  PAYLOAD_IN="$(cat || true)"
  if [ -n "$PAYLOAD_IN" ] && echo "$PAYLOAD_IN" | jq -e . >/dev/null 2>&1; then
    CWD_FROM_PAYLOAD="$(echo "$PAYLOAD_IN" | jq -r '.cwd // empty')"
    if [ -n "$CWD_FROM_PAYLOAD" ]; then
      CWD="$CWD_FROM_PAYLOAD"
    fi
  fi
fi

if command -v python3 >/dev/null 2>&1; then
  PAYLOAD="$(CWD="$CWD" python3 -c '
import json, os
print(json.dumps({"cwd": os.environ["CWD"]}))
')"
elif command -v jq >/dev/null 2>&1; then
  PAYLOAD="$(jq -n --arg cwd "$CWD" '{cwd:$cwd}')"
else
  PAYLOAD="{\"cwd\":\"${CWD//\"/\\\"}\"}"
fi

curl --silent --show-error --fail-with-body \
  --max-time 15 \
  -X POST "$URL/api/projects/auto-register" \
  -H "Content-Type: application/json" \
  -H "X-Continuum-Token: $TOKEN" \
  --data-binary "$PAYLOAD" \
  > /dev/null 2>&1 || true

# Always succeed — never block a Claude Code session because Continuum is down.
exit 0
