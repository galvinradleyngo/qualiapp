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
loaded: 3 interview transcripts, 6 codes across 15 excerpts, and a Reflexive
TA workspace with 3 initial themes grouped under one overarching theme. No
import steps — `app.html` fetches `sample-project.qbk2` itself, imports it
on first visit, and reopens the same project (never a duplicate) on later
visits, tracked via a `qualiapp_sample_project_id` key in `localStorage`.
This only works when `app.html` is served over http(s) (e.g. on GitHub
Pages) alongside `sample-project.qbk2` — fetching a local file doesn't work
under `file://`, so it has no effect on a downloaded copy of `app.html`
opened on its own. Once it opens, go to **Reflexive TA** and pick
**Initial Themes** from the workspace dropdown to see the finished analysis
(it isn't auto-selected on first import).

You can still import `sample-project.qbk2` by hand — download it and use
**Import a backup…** on the projects screen with the password `sample123`.

`sample-project.qbk2` is a static file, independent of `app.html` — updating
the app doesn't touch it. If a future change to `app.html` breaks it (e.g. a
change to the transcript editor, Reflexive TA, or the backup format), rebuild
it with `tools/sample-project/build.js`; see `tools/sample-project/README.md`.

The `?sample=1` auto-load behavior itself, unlike the `.qbk2` file, lives
*inside* `app.html` as a small patch spliced into its minified source — so
it does **not** survive a direct upload that replaces `app.html` wholesale.
**After any update to `app.html`, always re-run
`node tools/sample-project/patch-app-html.js`** to put it back; see
"The 'open sample project' feature" in `tools/sample-project/README.md`.

## Notes

- Data is stored locally in your browser on this device.
- Use the in-app backup feature to export and transfer projects between devices.
- QualiApp is designed for laptop/desktop browsers; it is not optimized for
  phones or tablets.

## License

QualiApp is released under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
(Attribution-NonCommercial-ShareAlike). See `LICENSE` for details.
