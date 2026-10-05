# QualiApp -- Offline Qualitative Studio

## Quick Start

1. Download `app.html` (or open it directly).
2. Open it in a desktop/laptop browser.

That is all. The app is self-contained in one file and works fully offline.

`index.html` is the project's landing page, published at
https://galvinradleyngo.github.io/qualiapp/, introducing the app and linking
to `app.html` for download.

## Sample project

Visit `app.html?sample=1` (the landing page's "Open the sample project"
button does this) to launch QualiApp with a ready-made project already
loaded: the "QualiApp Sample Project" (transcripts, a codebook, and finished
Reflexive TA and 4 Cs Model workspaces). No
import steps — `app.html` fetches `sample-project.qbk2` itself on every visit
(bypassing the browser cache) and fingerprints it. If that exact file was
already imported, the same project is reopened (never a duplicate); if you
replace `sample-project.qbk2` in the repo, the next visit imports the new
file automatically. The imported project's id and the file's fingerprint are
tracked in `localStorage` (`qualiapp_sample_project_id` and
`qualiapp_sample_project_hash`); an earlier imported sample is left in place
in the visitor's project list. The project takes its title from the file and
the file must have no password.
This only works when `app.html` is served over http(s) (e.g. on GitHub
Pages) alongside `sample-project.qbk2` — fetching a local file doesn't work
under `file://`, so it has no effect on a downloaded copy of `app.html`
opened on its own. Once it opens, go to **Reflexive TA** or **4 Cs Model** and pick the
"Sample —" workspace from the dropdown to see the finished analysis (it isn't
auto-selected on first import).

You can still import `sample-project.qbk2` by hand — download it and use
**Import a backup…** on the projects screen. It has no password, so leave
the password field empty.

`sample-project.qbk2` is a static file, independent of `app.html` — updating
the app doesn't touch it. If a future change to `app.html` breaks it (e.g. a
change to the transcript editor, Reflexive TA, or the backup format),
re-export it from the app with no password and replace the file; see
`tools/sample-project/README.md`.

The `?sample=1` auto-load behavior itself, unlike the `.qbk2` file, lives
*inside* `app.html` as a small patch spliced into its minified source — so
it does **not** survive a direct upload that replaces `app.html` wholesale.
**After any update to `app.html`, always re-run
`node tools/sample-project/patch-app-html.js`** to put it back; see
"Features that live inside app.html" in `tools/sample-project/README.md`.

## Update check

`app.html` also checks, on every load, whether a newer build is published
here on GitHub (comparing its own embedded build date against
[`version.json`](version.json) at the repo root, fetched live from
`raw.githubusercontent.com`) and shows a small dismissible bar prompting an
update if so. Clicking **Update Now** downloads the latest `app.html` and,
on Chrome/Edge, offers to save it directly over the file the user has open
(same filename, and it'll even open the save dialog in that file's folder
if it's a well-known one like Desktop or Downloads); on other browsers, or
if that's declined, it falls back to a plain download the user finishes by
hand. Like the sample-project loader above, this lives inside `app.html`'s
own source and is re-applied by the same `patch-app-html.js` script, which
also keeps `version.json` in sync — see `tools/sample-project/README.md`.

## Keeping app.html and index.html in sync (automatic)

A GitHub Action (`.github/workflows/sync-app-html.yml`) runs on every push
to `main` that touches `app.html` — including a direct "Add files via
upload" replacement — and automatically:

1. Re-runs `node tools/sample-project/patch-app-html.js` to re-apply the
   sample-loader and update-checker patches (idempotent) and regenerate
   `version.json`.
2. Re-runs `node tools/sample-project/sync-index-meta.js` to update
   `index.html`'s file-size note and "Page last updated" footer date to
   match.
3. Commits and pushes the result back to `main` if anything changed.

No manual maintenance PR is needed after a direct upload anymore. When
working from a branch/PR instead (like this repo's own Claude-assisted
changes), run both scripts by hand before pushing, same as before.

## Notes

- Data is stored locally in your browser on this device.
- Use the in-app backup feature to export and transfer projects between devices.
- QualiApp is designed for laptop/desktop browsers; it is not optimized for
  phones or tablets.

## License

QualiApp is released under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
(Attribution-NonCommercial-ShareAlike). See `LICENSE` for details.
