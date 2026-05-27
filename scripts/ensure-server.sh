#!/usr/bin/env bash
# Idempotent health check + auto-start for the FamilyDash API server.
# Exits 0 if the server is responding on port 3010, or after successfully
# starting it via Monitor-friendly `node --watch` in the background.
#
# Usage:
#   ./scripts/ensure-server.sh
#
# Designed to be safe to run at the top of any task that touches the API.

set -euo pipefail

PORT="${PORT:-3010}"
HEALTH_URL="http://localhost:${PORT}/api/health"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Already up?
if curl -sf -m 2 -o /dev/null "$HEALTH_URL" 2>/dev/null; then
  echo "API already healthy on port $PORT"
  exit 0
fi

echo "API not responding — starting via node --watch (background, logs at /tmp/familydash-server.log)..."
cd "$PROJECT_ROOT/server"

# Detached background process. Logs go to a known path so the user
# (or Claude) can `tail -f` if something looks wrong.
nohup node --watch --env-file=../.env index.js \
  > /tmp/familydash-server.log 2>&1 &
SERVER_PID=$!
disown "$SERVER_PID" 2>/dev/null || true

# Wait up to 15s for it to come up
for i in $(seq 1 15); do
  if curl -sf -m 2 -o /dev/null "$HEALTH_URL" 2>/dev/null; then
    echo "API up on port $PORT (pid $SERVER_PID)"
    exit 0
  fi
  sleep 1
done

echo "API failed to come up within 15s — check /tmp/familydash-server.log" >&2
exit 1
