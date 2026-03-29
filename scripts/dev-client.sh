#!/usr/bin/env bash
# Start the Vite dev server on an available port.
# If FamilyDash client is already running, kill it and reuse that port.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/../client" && pwd)"
MARKER="vite.*--host"  # pattern that matches our Vite process

# Detect which port the API server is on so the proxy works
PORT_FILE="$(dirname "$0")/../.server-port"

if [ -n "${VITE_API_PORT:-}" ]; then
  : # already set
else
  # Wait for server to write its port file (up to 5s when launched concurrently)
  for i in 1 2 3 4 5; do
    if [ -f "$PORT_FILE" ]; then
      VITE_API_PORT=$(cat "$PORT_FILE")
      break
    fi
    sleep 1
  done
  VITE_API_PORT=${VITE_API_PORT:-3001}
fi
export VITE_API_PORT

# Check if this project's Vite is already running
EXISTING_PID=$(pgrep -f "$MARKER" 2>/dev/null | head -1 || true)

if [ -n "$EXISTING_PID" ]; then
  # Find the port it was using
  EXISTING_PORT=$(lsof -Pan -p "$EXISTING_PID" -iTCP -sTCP:LISTEN 2>/dev/null \
    | awk '/LISTEN/ {split($9, a, ":"); print a[length(a)]}' | head -1 || true)

  echo "FamilyDash client already running (PID $EXISTING_PID, port ${EXISTING_PORT:-?}). Restarting..."
  kill "$EXISTING_PID" 2>/dev/null || true
  sleep 1

  if [ -n "$EXISTING_PORT" ]; then
    cd "$PROJECT_DIR"
    exec npx vite --host --port "$EXISTING_PORT"
  fi
fi

# Find a free port starting from 5173, skipping occupied ones
find_free_port() {
  local port=${1:-5173}
  local max=$((port + 100))
  while [ "$port" -lt "$max" ]; do
    if ! lsof -iTCP:"$port" -sTCP:LISTEN -t >/dev/null 2>&1; then
      echo "$port"
      return
    fi
    port=$((port + 1))
  done
  echo "0"  # fallback: let Vite pick
}

PORT=$(find_free_port 5173)
echo "Starting FamilyDash client on port $PORT (API proxy → localhost:$VITE_API_PORT)"
cd "$PROJECT_DIR"
exec npx vite --host --port "$PORT"
