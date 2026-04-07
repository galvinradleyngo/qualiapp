#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-8080}"

if command -v python3 >/dev/null 2>&1; then
  echo "Serving QualiApp at http://localhost:${PORT}"
  echo "Press Ctrl+C to stop"
  python3 -m http.server "${PORT}"
  exit 0
fi

if command -v python >/dev/null 2>&1; then
  echo "Serving QualiApp at http://localhost:${PORT}"
  echo "Press Ctrl+C to stop"
  python -m SimpleHTTPServer "${PORT}"
  exit 0
fi

echo "Python is required to run a local server." >&2
echo "Install Python 3, then run: ./serve-local.sh" >&2
exit 1
