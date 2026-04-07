# QualiApp Local Run

Open this app through a local HTTP server (not `file://`) to avoid browser security issues.

## Quick Start (macOS/Linux)

1. Open a terminal in this folder.
2. Run:

```bash
chmod +x ./serve-local.sh
./serve-local.sh
```

3. Open:

```text
http://localhost:8080
```

## Custom Port

```bash
./serve-local.sh 5173
```

Then open `http://localhost:5173`.

## Why this is needed

Opening `index.html` directly as `file://...` can break app behavior due to browser origin/security restrictions.
