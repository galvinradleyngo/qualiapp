#!/usr/bin/env bash
# QualiApp installer for macOS and Linux
# Run this once:  bash install.sh
# It will download offline dependencies and launch the app.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
VENDOR="$DIR/vendor"
FONTS="$VENDOR/fonts"

# ── colours ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RESET='\033[0m'
info()    { echo -e "${CYAN}  →  $*${RESET}"; }
success() { echo -e "${GREEN}  ✓  $*${RESET}"; }
warn()    { echo -e "${YELLOW}  !  $*${RESET}"; }

echo ""
echo -e "${GREEN}╔════════════════════════════════╗${RESET}"
echo -e "${GREEN}║  QualiApp — offline installer  ║${RESET}"
echo -e "${GREEN}╚════════════════════════════════╝${RESET}"
echo ""

# ── helpers ───────────────────────────────────────────────────────────────────
fetch() {
  local url="$1" dest="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL -A "Mozilla/5.0" "$url" -o "$dest"
  elif command -v wget >/dev/null 2>&1; then
    wget -q --user-agent="Mozilla/5.0" "$url" -O "$dest"
  else
    echo "ERROR: curl or wget is required. Install one and re-run." >&2; exit 1
  fi
}

fetch_text() {
  local url="$1"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL -A "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36" "$url"
  else
    wget -q -O - --user-agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36" "$url"
  fi
}

download() {
  local label="$1" url="$2" dest="$3"
  if [[ -f "$dest" ]]; then
    info "$label — already downloaded, skipping"
    return
  fi
  info "Downloading $label ..."
  fetch "$url" "$dest"
  success "$label"
}

# ── check dependencies ────────────────────────────────────────────────────────
echo "Checking prerequisites..."

HAS_SERVER=0
SERVER_CMD=""
if command -v python3 >/dev/null 2>&1; then
  HAS_SERVER=1; SERVER_CMD="python3 -m http.server"
elif command -v python >/dev/null 2>&1; then
  HAS_SERVER=1; SERVER_CMD="python -m SimpleHTTPServer"
fi

if [[ $HAS_SERVER -eq 0 ]]; then
  warn "Python not found — you'll need to open index.html via a local server."
  warn "Install Python 3 or use VS Code Live Server extension."
fi
success "Prerequisites OK"
echo ""

# ── download JS libraries ─────────────────────────────────────────────────────
mkdir -p "$VENDOR" "$FONTS"
echo "Downloading JavaScript libraries:"
download "react.production.min.js"     "https://unpkg.com/react@18/umd/react.production.min.js"              "$VENDOR/react.production.min.js"
download "react-dom.production.min.js" "https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"       "$VENDOR/react-dom.production.min.js"
download "babel.min.js"                "https://unpkg.com/@babel/standalone/babel.min.js"                    "$VENDOR/babel.min.js"
download "tailwind.min.js"             "https://cdn.tailwindcss.com"                                         "$VENDOR/tailwind.min.js"
echo ""

# ── download fonts ────────────────────────────────────────────────────────────
echo "Downloading fonts:"
FONTS_CSS="$VENDOR/fonts.css"

if [[ -f "$FONTS_CSS" ]]; then
  info "fonts.css — already downloaded, skipping"
else
  info "Fetching font CSS ..."
  RAW_CSS=$(fetch_text "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Space+Grotesk:wght@400;500;600;700&display=swap")
  REWRITTEN_CSS="$RAW_CSS"
  i=0
  while IFS= read -r furl; do
    fname="font_$(printf '%03d' $i).woff2"
    fpath="$FONTS/$fname"
    download "$fname" "$furl" "$fpath"
    REWRITTEN_CSS="${REWRITTEN_CSS//$furl/fonts\/$fname}"
    ((i++)) || true
  done < <(echo "$RAW_CSS" | grep -oP 'url\(https://fonts\.gstatic\.com[^)]+\)' | grep -oP 'https://[^)]+')
  printf '%s' "$REWRITTEN_CSS" > "$FONTS_CSS"
  success "fonts.css written ($i font files)"
fi
echo ""

# ── make scripts executable ───────────────────────────────────────────────────
chmod +x "$DIR/serve-local.sh" 2>/dev/null || true
echo ""
success "Installation complete!"
echo ""

# ── launch ────────────────────────────────────────────────────────────────────
if [[ $HAS_SERVER -eq 1 ]]; then
  PORT="${1:-8080}"
  echo -e "${GREEN}  Launching QualiApp at http://localhost:${PORT}${RESET}"
  echo "  Press Ctrl+C to stop the server."
  echo ""
  # Try to open browser automatically
  URL="http://localhost:${PORT}"
  if command -v open >/dev/null 2>&1; then          # macOS
    open "$URL" 2>/dev/null &
  elif command -v xdg-open >/dev/null 2>&1; then    # Linux
    xdg-open "$URL" 2>/dev/null &
  fi
  cd "$DIR"
  $SERVER_CMD "$PORT"
else
  echo "  To start the app, serve this folder with any local HTTP server,"
  echo "  then open http://localhost:8080 in your browser."
fi
