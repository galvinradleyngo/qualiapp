# APA Formatting Studio (7th Edition)

A modern, browser-based academic formatting workspace for researchers, educators, and students.

## Features

1. **Table Formatter**:
   - APA 7th Edition compliant tables (no vertical borders, double-spaced headers, left-aligned stub columns).
   - Pre-configured blueprints: Descriptive Statistics, Correlation Matrix, Themes & Quotes Matrix, and Participant Demographics.
   - Import tables directly from Word, Excel, Google Docs, or Google Sheets.
   - Export to Word (`.doc`) with native table styling.

2. **Bibliography Formatter**:
   - Paste existing references in any format.
   - Automatic alphabetization by first author surname and publication year.
   - Hanging-indent formatting (0.5 inch).
   - APA 7 metadata validation checks (author formats, dates, title casing, DOIs).

3. **Citation Generator (from PDF or Web Link / DOI)**:
   - **Upload PDF File**: Drag & drop or browse academic PDFs; extracts embedded metadata and searches for DOIs within the paper using PDF.js.
   - **Web Link / DOI**: Paste DOIs (`10.xxxx/...`), arXiv preprints, or webpage URLs. Resolves against official Crossref and DataCite registries.
   - Generates both full APA 7 reference entries and in-text citations (parenthetical and narrative).
   - Interactive metadata review and 1-click addition directly into the Bibliography Formatter.
   - 1-click rich-text copy and Word export.


4. **Table of Contents Formatter**:
   - Build entries in a form (levels 1 to 5, page numbers, move/delete), **paste** a rough draft (dot leaders, tabs, indentation or 1.1.1 numbering are understood), or **upload a Word draft**: it uses the file's existing contents page, otherwise builds one from its Heading styles, and reads tables and figures from their captions.
   - Optional List of Tables and List of Figures, each on its own page. Layout options: dot leaders, spacing, indent per level, page number header, and an advanced live Word TOC field.
   - Checks for missing or backwards page numbers and skipped levels. Exports a real `.docx` using Word's TOC 1 to 5 styles.

5. **Reformat Your Paper** (full APA 7 review of a `.docx`):
   - Upload a Word file; a progress bar walks through nine review stages, then a second bar covers the build.
   - **Fixed automatically (formatting only):** US Letter and 1-inch margins, font, double spacing, left alignment, first-line and hanging indents, real Word styles for headings, body, block quote, references, captions and table notes, title page and abstract layout, page breaks, page-number header (running head for professional papers), APA table rules, caption layout (number above title, caption above the object), italic statistical symbols, stray spaces and empty paragraphs.
   - **Asked first (anything that could change wording or order):** table and figure renumbering with their in-text mentions, citation fixes (`&` vs `and`, comma before the year, `et al.`, page numbers), reference rebuilds and alphabetizing, heading and caption title case, headings detected from plain paragraphs, block quotes, adding a title page or a title on the first page of text. Every item shows before and after and nothing is ticked by default.
   - **Flagged only:** abstract over 250 words, missing title page elements, citations without references and references never cited, tables or figures never mentioned, missing alt text, heading level problems, quotes without page numbers.
   - Download the reformatted paper and a review report. Limits: `.docx` only (older `.doc` must be re-saved as `.docx` in Word); paragraphs with tracked changes or Zotero/EndNote/Mendeley fields are not text-edited; level 4 and 5 run-in headings stay on their own line; language, bias-free wording and source accuracy are not judged.

## Credits
This app was co-developed with Claude (Anthropic) and tested by humans. The footer on every screen says so.

## Citation Generator updates
- **Several PDFs at once:** select or drop multiple files; each becomes an entry in a list where you can edit, remove or add it to the bibliography, or add them all.
- **Several links at once:** paste multiple links or DOIs separated by spaces or new lines.
- **Links to PDFs:** the PDF is downloaded (through your Worker) and read like an uploaded file: DOI lookup first, then the document's own title, author and date. Redeploy `worker/metadata-proxy.js` for this; without it the citation falls back to the address alone and says so.
- **Add to bibliography** now updates the bibliography immediately, replaces the built-in sample, skips duplicates and tells you the total.

## Privacy
Everything runs in the browser. Uploaded papers, tables, bibliographies and contents pages are never sent to a server. The one exception is the Citation Generator, which sends the DOI or link you enter to public services (Crossref, DataCite, and the optional metadata Worker) to look it up. The saved bibliography draft lives in this browser's localStorage only.

## URL handling notes
- Web links resolve in this order: DOI in the link, arXiv, YouTube (oEmbed), Wikipedia, then page metadata (JSON-LD, Dublin Core, `citation_*`, Open Graph). If the page title matches a published work in Crossref, that record is used. If the live page is blocked, the Wayback Machine copy is tried.
- Fields are marked green (found in source), amber (guessed from the link) or red (missing) so you know what to verify. Editing a field clears its marker.
- Optional: deploy `worker/metadata-proxy.js` (see `worker/README.md`) for more reliable page fetching.
- Tests: `node tests/url-metadata.test.js` (requires Playwright).

## Homepage and saved drafts
- The homepage lists every tool: the three standalone tools (Citation Generator, Bibliography Formatter, Table Formatter) plus Table of Contents and Reformat Your Paper. Each works on its own. Table templates open from the Table Formatter card.
- Your bibliography text is saved automatically in this browser (localStorage); the homepage offers to resume or discard it. The built-in sample bibliography is never saved.
- Tests: `node tests/home-and-draft.test.js`.

## More features
- **Social media links:** paste a post link from X, Instagram, Facebook, TikTok, Reddit, LinkedIn, Threads or Bluesky. The generator reads the author, date and post text where the platform allows it (X, Bluesky, Reddit and TikTok via public endpoints, others from page metadata), uses the first 20 words as the title, formats the author as `Doe, J. [@handle]`, and keeps the post's own capitalization. If a post can't be read, it still fills in the platform and handle from the link, works out an approximate date from the post ID on X, TikTok and Instagram, and lists what to complete.
- **YouTube links:** watch, youtu.be, Shorts, embed and live links are recognized. The title and uploader come from YouTube's oEmbed service and the upload date from the watch page (through your Worker if needed). The reference is `Uploader. (Year, Month Day). *Title* [Video]. YouTube. URL`; a person-like channel name becomes `Rober, M.`, a channel or organization stays as written. To force a channel name, type it in braces, e.g. `{Crash Course}`.
- **APA 7 details for social posts:** the title is the first 20 words exactly as written (capitalization, hashtags, emoji, final period kept); the author is `Doe, J. [@handle]`; an optional "Attached media" field adds the first bracket, then the kind of post follows (`[Image attached] [Status update]`, `[Photograph]` or `[Video]` for Instagram, `[Post]` for X, `[Video]` for TikTok, `[Online forum post]` for Reddit). Podcast authors are labelled `(Host)` / `(Hosts)`.
- **Source types:** journal article, book (edition, translator), book chapter (editors, pages), webpage (optional retrieval date), news/blog article, video, podcast episode, social post, thesis, dataset, software, report, religious/foundational document.
- **Bibliography tools:** en-dash page ranges, automatic a/b year suffixes for same-author same-year works, one-click sentence-case fixes for flagged titles, BibTeX/RIS import, and an in-text citation vs reference-list check.
- **Export:** the bibliography, single citations and tables all download as real `.docx` files (Times New Roman; references use real Word styles (Heading 1 for "References" and a "Reference" paragraph style with the hanging indent) so you can restyle the whole list in Word, plus italics; APA rules-only borders and notes for tables).
- **Accessibility:** labelled form fields, live regions for status messages, visible keyboard focus.
- Tests: `node tests/features.test.js`.

## Rebuild from parsed parts
Format Bibliography can rebuild each pasted reference from its parsed fields (authors, date, title, source, volume/issue/pages, DOI/URL), so punctuation, initials, en dashes and italics all come from one generator. It is on by default (checkbox in the Bibliography Formatter).
- Italics are written as `*asterisks*` in the text box and shown as real italics in the preview, copy and export. You can type your own to mark italics.
- Capitalization you typed is never rewritten by the rebuild (use the "Fix it" button for sentence case).
- If an entry can't be read with confidence, or rebuilding would add, drop or change any word, it is left exactly as typed and the corrections list says why.
- Handled: name suffixes (Jr., Sr., III), hyphenated initials (J.-P.), long author lists with an ellipsis, and news/blog articles recognized from the URL (plain title, italic publication). For other sites, mark the publication with `*asterisks*`.

## Project layout
No build step; `index.html` loads classic scripts in this order:
- `js/reference-engine.js`: pure text logic (formatting, italics, citation generator, BibTeX/RIS). No DOM.
- `js/reference-parser.js`: reference parser and rebuild. No DOM.
- `js/web-metadata.js`: URL and page-metadata helpers.
- `js/docx-io.js`: `.docx` ZIP reader/writer and OOXML helpers. `js/paper-ooxml.js`, `js/paper-review.js`, `js/paper-findings.js`, `js/paper-finish.js`: Paper Reviewer engine (needs DOMParser). `js/toc-formatter.js`: contents logic and UI. `js/paper-review-ui.js`: reviewer wizard.
- `js/app.js`, `js/table-formatter.js`, `js/bibliography-ui.js`, `js/citation-ui.js`, `js/export.js`, `js/main.js`: UI for each tool, exports, and startup.
- `worker/`: optional Cloudflare Worker for fetching pages. `tests/`: see below.

## Tests
`npm test` runs everything (`tests/toc.test.js` is pure Node; `tests/paper-review.test.js` uses `tests/fixtures/messy-paper.docx`, rebuilt by `python3 tests/make-fixture.py`; `node tests/serve.js` serves the site for manual checks): `tests/engine.test.js` needs only Node; the browser tests need Playwright (`npm install`, then a Chromium build).
