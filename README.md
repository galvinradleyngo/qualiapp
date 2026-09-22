# QualiApp -- Offline Qualitative Studio

## Quick Start

1. Download `app.html` (or open it directly).
2. Open it in a desktop/laptop browser.

That is all. The app is self-contained in one file and works fully offline.

`index.html` is the project's landing page, published at
https://galvinradleyngo.github.io/qualiapp/, introducing the app and linking
to `app.html` for download.

## Sample project

`sample-project.qbk2` is a ready-made project you can import to see what a
finished analysis looks like: 3 interview transcripts, 6 codes across 15
excerpts, and a Reflexive TA workspace with 3 initial themes grouped under
one overarching theme. In QualiApp, choose **Import a backup…**, select the
file, and use the password `sample123`. After it opens, go to **Reflexive TA**
and pick **Initial Themes** from the workspace dropdown to see the finished
analysis (it isn't auto-selected on first import).

`sample-project.qbk2` is a static file, independent of `app.html` — updating
the app doesn't touch it. If a future change to `app.html` breaks it (e.g. a
change to the transcript editor, Reflexive TA, or the backup format), rebuild
it with `tools/sample-project/build.js`; see `tools/sample-project/README.md`.

## Notes

- Data is stored locally in your browser on this device.
- Use the in-app backup feature to export and transfer projects between devices.
- QualiApp is designed for laptop/desktop browsers; it is not optimized for
  phones or tablets.

## License

QualiApp is released under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
(Attribution-NonCommercial-ShareAlike). See `LICENSE` for details.
