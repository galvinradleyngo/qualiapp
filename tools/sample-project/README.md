# Sample project tools

`sample-project.qbk2` (at the repo root) is a completely separate file from
`app.html` — updating the app never touches it, and it isn't embedded in the
app in any way. It's an unencrypted (no password) `.qbk2` backup exported by
hand from the app, and it ships alongside the app. `app.html?sample=1` fetches
and imports it automatically, and people can also download it and use the
app's own "Import a backup" screen.

To change the sample, open it in the app, edit it, export a new backup with
**no password**, and replace `sample-project.qbk2` with the export. (If you
ever give it a password, also change the `password:""` argument in the loader
patch in `patch-app-html.js`.) A future change to `app.html` that alters the
project data shapes or the `.qbk2` format may require re-exporting it.

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
   the remote version is newer, it shows a small dismissible bar with an
   **Update Now** button. Clicking it fetches the latest `app.html` and:
   - On Chrome/Edge (File System Access API available), offers a native
     save dialog pre-filled with the *current* file's own name, so picking
     the same file overwrites it in place. If the current file lives in a
     well-known folder (Desktop, Downloads, Documents, etc. — detected from
     `location.pathname`, which is only meaningful under `file://`), the
     dialog opens there directly. The bar also shows the full existing path
     as a hint so the user knows what to pick even when we can't
     pre-navigate there.
   - Otherwise (Firefox/Safari, or the picker is declined/unsupported for
     any reason), falls back to a plain browser download using that same
     filename, and tells the user to replace the old file with it by hand.
   - A network failure re-enables the button with an inline error instead
     of failing silently, since this is a user-initiated action (unlike the
     background version check itself, which stays silent on failure).

   Dismissing, or a successful update, is remembered in `localStorage`
   (`qualiapp_update_dismissed_version`) so it won't nag again for that
   same version. There's no web API that lets a page silently overwrite an
   arbitrary local file without the user's confirmation — this is the
   closest to one-click "auto-update" that's possible within that
   constraint.

Because `app.html` gets replaced wholesale by direct uploads from outside
this repo, both features are silently erased every time — the uploaded
build never had them in the first place. **This is now handled
automatically**: `.github/workflows/sync-app-html.yml` runs on every push
to `main` touching `app.html` and re-applies both patches (plus syncs
`index.html`, see below), committing the result back to `main` — no manual
step needed after a direct upload.

When working from a branch/PR instead, re-run it by hand before pushing:

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

## Keeping index.html in sync (`sync-index-meta.js`)

`index.html`'s hero file-size note and footer "Page last updated" date are
both derived from `app.html` and need to move in lockstep with it. Run:

```sh
node tools/sample-project/sync-index-meta.js [path-to-app.html] [path-to-index.html]
```

It computes `app.html`'s actual on-disk size for the file-size note and
bumps the footer date to today, only rewriting `index.html` if something
actually changed. Like the patch script, it locates its two splice points
by stable surrounding copy and throws a clear error if that copy has
changed shape.

Both this and `patch-app-html.js` now run automatically on every push to
`main` that touches `app.html`, via
[`.github/workflows/sync-app-html.yml`](../../.github/workflows/sync-app-html.yml) —
see the root `README.md`'s "Keeping app.html and index.html in sync"
section. Run them by hand only when working from a branch/PR.
