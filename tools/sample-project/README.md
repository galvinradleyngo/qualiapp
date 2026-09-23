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
