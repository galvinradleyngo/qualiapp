#!/usr/bin/env bash
# Downloads all QualiApp external dependencies for fully offline use.
# Run ONCE while online:   bash setup-offline.sh
# Then start the app with: ./serve-local.sh
set -euo pipefail

VENDOR="$(cd "$(dirname "$0")" && pwd)/vendor"
FONTS="$VENDOR/fonts"
mkdir -p "$VENDOR" "$FONTS"

download() {
  local name="$1" url="$2" dest="$3"
  if [[ -f "$dest" ]]; then
    echo "  [skip] $name (already downloaded)"
    return
  fi
  echo -n "  Downloading $name ... "
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL -A "Mozilla/5.0" "$url" -o "$dest"
  elif command -v wget >/dev/null 2>&1; then
    wget -q --user-agent="Mozilla/5.0" "$url" -O "$dest"
  else
    echo "FAILED"
    echo "ERROR: Neither curl nor wget is available. Install one and retry." >&2
    exit 1
  fi
  echo "OK"
}

echo "=== QualiApp offline setup ==="
echo ""
echo "Downloading JavaScript libraries:"

download "react.production.min.js"     "https://unpkg.com/react@18/umd/react.production.min.js"     "$VENDOR/react.production.min.js"
download "react-dom.production.min.js" "https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" "$VENDOR/react-dom.production.min.js"
download "babel.min.js"                "https://unpkg.com/@babel/standalone/babel.min.js"            "$VENDOR/babel.min.js"
download "tailwind.min.js"             "https://cdn.tailwindcss.com"                                 "$VENDOR/tailwind.min.js"

echo ""
echo "Downloading fonts:"

FONT_CSS_URL="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Space+Grotesk:wght@400;500;600;700&display=swap"
FONTS_CSS="$VENDOR/fonts.css"

if [[ -f "$FONTS_CSS" ]]; then
  echo "  [skip] fonts.css (already downloaded)"
else
  echo -n "  Downloading fonts.css ... "
  if command -v curl >/dev/null 2>&1; then
    RAW_CSS=$(curl -fsSL -A "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36" "$FONT_CSS_URL")
  else
    RAW_CSS=$(wget -q -O - --user-agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36" "$FONT_CSS_URL")
  fi
  echo "OK"

  # Extract font file URLs and download each one
  i=0
  REWRITTEN_CSS="$RAW_CSS"
  while IFS= read -r furl; do
    fname="font_$(printf '%03d' $i).woff2"
    fpath="$FONTS/$fname"
    download "$fname" "$furl" "$fpath"
    REWRITTEN_CSS="${REWRITTEN_CSS//$furl/fonts\/$fname}"
    ((i++)) || true
  done < <(echo "$RAW_CSS" | grep -oP 'url\(https://fonts\.gstatic\.com[^)]+\)' | grep -oP 'https://[^)]+')

  printf '%s' "$REWRITTEN_CSS" > "$FONTS_CSS"
  echo "  fonts.css written ($i font files)"
fi

echo ""
echo "All done! QualiApp will now work fully offline."
echo "Start the app with:  ./serve-local.sh"
