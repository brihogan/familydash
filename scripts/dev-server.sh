#!/usr/bin/env bash
# Start the Node dev server on an available port.
# If FamilyDash server is already running, kill it and reuse that port.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/../server" && pwd)"
MARKER="node.*--watch.*index\.js"

# Check if this project's server is already running
EXISTING_PID=$(pgrep -f "$MARKER" 2>/dev/null | head -1 || true)

if [ -n "$EXISTING_PID" ]; then
  EXISTING_PORT=$(lsof -Pan -p "$EXISTING_PID" -iTCP -sTCP:LISTEN 2>/dev/null \
    | awk '/LISTEN/ {split($9, a, ":"); print a[length(a)]}' | head -1 || true)

  echo "FamilyDash server already running (PID $EXISTING_PID, port ${EXISTING_PORT:-?}). Restarting..."
  kill "$EXISTING_PID" 2>/dev/null || true
  sleep 1

  if [ -n "$EXISTING_PORT" ]; then
    echo "$EXISTING_PORT" > "$(dirname "$0")/../.server-port"
    cd "$PROJECT_DIR"
    exec env PORT="$EXISTING_PORT" node --watch index.js --env-file=../.env
  fi
fi

# Find a free port starting from 3001, skipping occupied ones
find_free_port() {
  local port=${1:-3001}
  local max=$((port + 100))
  while [ "$port" -lt "$max" ]; do
    if ! lsof -iTCP:"$port" -sTCP:LISTEN -t >/dev/null 2>&1; then
      echo "$port"
      return
    fi
    port=$((port + 1))
  done
  echo "0"
}

PORT=$(find_free_port 3001)
echo "Starting FamilyDash server on port $PORT"

# Write port file so the client script can find us
echo "$PORT" > "$(dirname "$0")/../.server-port"

cd "$PROJECT_DIR"
exec env PORT="$PORT" node --watch index.js --env-file=../.env
