# QualiApp macOS Track

This folder contains the isolated macOS-first implementation track for QualiApp. It is intentionally separate from the legacy root app so desktop work can progress without modifying the current production files.

## Current scope

- Build a macOS-native shell and component system.
- Preserve local-first behavior and legacy backup compatibility.
- Prepare for signed patch updates and rollback-safe releases.
- Keep Windows support at readiness-planning level only.

## Folder structure

- `src/design` holds macOS-oriented visual tokens.
- `src/features/editor` holds the transcript and coding migration surface.
- `src/features/pomodoro` holds the floating timer migration surface.
- `src/services/storage` holds legacy compatibility and storage migration helpers.

## Commands

```bash
npm install
npm run dev
npm run build
npm run check
npm run tauri:dev
npm run tauri:build
```

## CI installer build

- Workflow: `.github/workflows/macos-dmg.yml`
- Trigger manually from GitHub Actions (`Build macOS DMG`) or push macOS-track changes to `main`.
- Output artifacts:
	- `qualiapp-macos-dmg` (DMG installer)
	- `qualiapp-macos-app` (raw `.app` bundle)

Download the DMG artifact from the completed Actions run page when you are ready to test install on your Mac.

## Desktop prerequisites

- Rust toolchain is required for Tauri desktop builds (`cargo`, `rustc`).
- On macOS build machines, install Xcode command line tools before running `npm run tauri:build`.
- In this Linux container, Tauri commands are wired but native build is blocked until Rust is installed.

## Desktop config location

- Tauri Rust project: `src-tauri`
- App config: `src-tauri/tauri.conf.json`
- Capability file: `src-tauri/capabilities/default.json`

## Guardrails

- Do not edit root `index.html` as part of this track.
- Keep data portability ahead of native-only enhancements.
- Validate changes here with isolated builds before moving deeper into feature migration.
