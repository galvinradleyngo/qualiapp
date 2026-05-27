#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-8080}"
DIR="$(cd "$(dirname "$0")" && pwd)"
VENDOR="$DIR/vendor"

# Download vendor files on first run so the app works fully offline afterwards
_dl() {
  local name="$1" url="$2" dest="$3"
  [ -f "$dest" ] && return 0
  echo "Downloading $name for offline use..."
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$dest" || { echo "Warning: could not download $name (will use CDN fallback)" >&2; rm -f "$dest"; }
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$dest" "$url" || { echo "Warning: could not download $name (will use CDN fallback)" >&2; rm -f "$dest"; }
  else
    echo "Warning: curl/wget not found — $name will be loaded from CDN" >&2
  fi
}

mkdir -p "$VENDOR"
_dl "react-dom" "https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" "$VENDOR/react-dom.production.min.js"
_dl "babel"     "https://unpkg.com/@babel/standalone/babel.min.js"              "$VENDOR/babel.min.js"

if command -v python3 >/dev/null 2>&1; then
  echo "Serving QualiApp at http://localhost:${PORT}"
  echo "Press Ctrl+C to stop"
  cd "$DIR" && python3 -m http.server "${PORT}"
  exit 0
fi

if command -v python >/dev/null 2>&1; then
  echo "Serving QualiApp at http://localhost:${PORT}"
  echo "Press Ctrl+C to stop"
  cd "$DIR" && python -m SimpleHTTPServer "${PORT}"
  exit 0
fi

echo "Python is required to run a local server." >&2
echo "Install Python 3, then run: ./serve-local.sh" >&2
exit 1
