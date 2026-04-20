#!/usr/bin/env python3
"""
Download all QualiApp external dependencies for fully offline use.

Run this script ONCE while you have internet access:
    python3 setup-offline.py

After it completes, the app works completely offline via ./serve-local.sh
"""

import os
import re
import sys
import urllib.request

BASE = os.path.dirname(os.path.abspath(__file__))
VENDOR = os.path.join(BASE, "vendor")
FONTS_DIR = os.path.join(VENDOR, "fonts")

os.makedirs(VENDOR, exist_ok=True)
os.makedirs(FONTS_DIR, exist_ok=True)

def download(url, dest, label=None):
    label = label or os.path.basename(dest)
    if os.path.exists(dest):
        print(f"  [skip] {label} (already downloaded)")
        return
    print(f"  Downloading {label} ...", end="", flush=True)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
    except Exception as e:
        print(f" FAILED: {e}")
        sys.exit(1)
    with open(dest, "wb") as f:
        f.write(data)
    print(f" OK ({len(data):,} bytes)")

print("=== QualiApp offline setup ===\n")

# ── JavaScript dependencies ──────────────────────────────────────────────────
JS_DEPS = [
    ("react.production.min.js",     "https://unpkg.com/react@18/umd/react.production.min.js"),
    ("react-dom.production.min.js", "https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"),
    ("babel.min.js",                "https://unpkg.com/@babel/standalone/babel.min.js"),
    ("tailwind.min.js",             "https://cdn.tailwindcss.com"),
]

print("Downloading JavaScript libraries:")
for filename, url in JS_DEPS:
    download(url, os.path.join(VENDOR, filename), filename)

# ── Google Fonts ─────────────────────────────────────────────────────────────
FONT_URL = (
    "https://fonts.googleapis.com/css2?"
    "family=Fraunces:opsz,wght@9..144,600;9..144,700"
    "&family=Space+Grotesk:wght@400;500;600;700"
    "&display=swap"
)

print("\nDownloading fonts:")

# Fetch the font CSS (request WOFF2 format via modern UA)
req = urllib.request.Request(
    FONT_URL,
    headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36"},
)
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        font_css = r.read().decode("utf-8")
except Exception as e:
    print(f"  WARNING: Could not download font CSS ({e}). System fonts will be used.")
    font_css = None

if font_css:
    # Download every font file referenced in the CSS
    font_urls = re.findall(r"url\((https://fonts\.gstatic\.com[^)]+)\)", font_css)
    font_map = {}
    for i, furl in enumerate(font_urls):
        fname = f"font_{i:03d}.woff2"
        fpath = os.path.join(FONTS_DIR, fname)
        download(furl, fpath, fname)
        font_map[furl] = f"fonts/{fname}"

    # Rewrite the CSS to point to local font files
    for furl, local_path in font_map.items():
        font_css = font_css.replace(furl, local_path)

    fonts_css_path = os.path.join(VENDOR, "fonts.css")
    with open(fonts_css_path, "w") as f:
        f.write(font_css)
    print(f"  fonts.css written ({len(font_map)} font files)")
else:
    # Write a minimal fallback fonts.css using system fonts
    fallback_css = """/* System font fallback (fonts could not be downloaded) */
body { font-family: 'Segoe UI', system-ui, sans-serif; }
"""
    with open(os.path.join(VENDOR, "fonts.css"), "w") as f:
        f.write(fallback_css)
    print("  Wrote system-font fallback to vendor/fonts.css")

print("\nAll done! QualiApp will now work fully offline.")
print("Start the app with:  ./serve-local.sh")
