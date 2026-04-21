# QualiApp — Offline Qualitative Studio

## Quick Start

### macOS / Linux

```bash
./serve-local.sh
```

### Windows

Double-click **`install.bat`** — or if you have Python:

```cmd
python -m http.server 8080
```

Then open **http://localhost:8080** in your browser.

---

## Offline use

Open the app **once while online**. The browser caches all scripts automatically. After that, the app works fully offline — just keep using `./serve-local.sh` as normal.

---

## Why a local server?

Opening `index.html` directly as `file://` breaks browser security restrictions. The local server is a tiny built-in Python server — no extra software needed.


