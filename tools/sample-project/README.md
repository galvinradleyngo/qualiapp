# Sample project builder

`sample-project.qbk2` (at the repo root) is a completely separate file from
`app.html` — updating the app never touches it, and it isn't embedded in the
app in any way. It's just a `.qbk2` backup that ships alongside the app and
gets imported through the app's own "Import a backup" screen.

The one thing that *can* break it is a future change to `app.html` that
alters the project data shapes, the transcript/coding UI, the Reflexive TA
workspace UI, or the `.qbk2` backup format itself. If that happens, the old
sample stops importing cleanly (or imports with something missing).

`build.js` regenerates it from scratch by driving the real `app.html` in a
headless browser — creating the project, typing the transcripts, coding them,
building the Reflexive TA workspace, and exporting a fresh backup — so the
result is guaranteed to match whatever version of `app.html` it was run
against.

## When to re-run it

Whenever a change to `app.html` touches: the transcript editor, in-text
coding, the Reflexive TA workspace/canvas, or the backup export/import
format. If none of those changed, the existing `sample-project.qbk2` is still
fine.

## Running it

```sh
npm install playwright   # if not already available
node tools/sample-project/build.js [path-to-app.html]
```

Defaults to `../../app.html` (the repo's own copy) if no path is given.
Needs a Chromium binary Playwright can launch; set `PW_CHROMIUM_PATH` if it
isn't at the default Playwright install location.

The script overwrites `sample-project.qbk2` at the repo root and then
re-imports it into a fresh instance of `app.html` to confirm the 3
transcripts round-trip correctly before finishing.

## What it builds

- 3 interview transcripts (`transcript1.txt`–`transcript3.txt` in this
  folder) about first-year students adjusting to college.
- 6 codes applied across 15 excerpts.
- A Reflexive TA workspace ("Initial Themes") with the 6 codes clustered
  into 3 initial themes, grouped under one overarching theme.
- The backup password is `sample123` (see `BACKUP_PASSWORD` in `build.js`)
  — it's a public sample, not sensitive data, so this is intentionally
  fixed and documented on the landing page.

To change the sample's content, edit the transcript `.txt` files and/or the
code/theme names in `build.js`, then re-run it.

## Features that live inside app.html (`patch-app-html.js`)

Two small features are spliced directly into `app.html`'s own minified
source, rather than being part of this repo's build of `app.html`:

1. **Open the sample project** — visiting `app.html?sample=1` fetches
   `sample-project.qbk2` and opens it automatically, no manual import.
2. **Update check** — on every load, if online, `app.html` fetches
   [`version.json`](../../version.json) from this repo's `main` branch
   (via `raw.githubusercontent.com`, which serves permissive CORS so this
   works even from a downloaded copy of `app.html` opened via `file://`)
   and compares it to its own embedded `window.QUALIAPP_BUILD_VERSION`. If
   the remote version is newer, it shows a small dismissible bar at the
   bottom of the screen linking to the landing page to download the
   update. Dismissing a given version is remembered in `localStorage`
   (`qualiapp_update_dismissed_version`) so it won't nag again for that
   same version.

Because `app.html` gets replaced wholesale by direct uploads from outside
this repo, both features are silently erased every time — the uploaded
build never had them in the first place.

**Always re-run this after any change to `app.html`, direct upload or
otherwise:**

```sh
node tools/sample-project/patch-app-html.js [path-to-app.html]
```

It's idempotent per-feature and safe to run unconditionally: it checks for
each feature's own marker (`qualiapp_sample_project_id` for the sample
loader, `QUALIAPP_BUILD_VERSION` for the update checker) and only applies
whichever one is missing. `version.json` at the repo root is always
rewritten to match whatever version ends up embedded in `app.html` — either
today's date, if the update-checker patch was freshly applied, or the
already-embedded version, if it was already present — so the two files
never drift out of sync.

It re-locates its splice points by their STABLE surroundings (literal UI
copy, the shape of the router's `{kind:"switcher"}` mount effect, and the
fact that `app.html` has exactly one real `</script>` closing tag) rather
than by variable names, since every rebuild mints fresh minified
identifiers. If `app.html`'s actual structure changes (not just renamed
variables — e.g. the mount effect's shape, that UI copy, or a second real
`<script>` element, change), the script will throw a clear error naming
which anchor it couldn't find; update the regexes in `patch-app-html.js`
to match the new shape and re-run.

After patching, verify it with a quick smoke test: serve the repo
(`python3 -m http.server`, since `fetch()` doesn't work under `file://`
for *local* files — the update checker's *remote* `raw.githubusercontent.com`
fetch is unaffected by that), visit `app.html?sample=1`, and confirm it
opens the sample project with no console errors and the URL's `?sample=1`
gets stripped.
