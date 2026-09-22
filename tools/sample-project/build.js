#!/usr/bin/env node
// Regenerates ../../sample-project.qbk2 by driving the real app.html in a
// headless browser: creates a project, types 3 transcripts, codes them,
// clusters the codes into themes in Reflexive TA, and exports a backup.
//
// Why automate this instead of hand-writing the .qbk2 file: the backup
// format is encrypted and versioned by the app itself, so a file this
// script produces is guaranteed to import cleanly into the exact app.html
// it was run against. Re-run this whenever app.html changes in a way that
// might affect the transcript editor, coding, Reflexive TA, or the backup
// format — the sample-project.qbk2 in the repo is a separate, static file
// and will NOT regenerate itself.
//
// Usage:
//   npm install playwright   (if not already available)
//   node tools/sample-project/build.js [path-to-app.html]
//
// Requires a Chromium binary Playwright can launch. Set PW_CHROMIUM_PATH
// to point at one (e.g. /opt/pw-browsers/chromium) if Playwright's own
// bundled browser isn't installed.

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const APP_HTML = path.resolve(process.argv[2] || path.join(REPO_ROOT, 'app.html'));
const OUTPUT_PATH = path.join(REPO_ROOT, 'sample-project.qbk2');
const BACKUP_PASSWORD = 'sample123';

const CHROMIUM_PATH = process.env.PW_CHROMIUM_PATH || '/opt/pw-browsers/chromium';

async function launch() {
  const launchOpts = { headless: true };
  if (fs.existsSync(CHROMIUM_PATH)) launchOpts.executablePath = CHROMIUM_PATH;
  const browser = await chromium.launch(launchOpts);
  // Tall viewport: the Reflexive TA canvas can grow past 1100px after
  // "Arrange", and Playwright's mouse coordinates are viewport-relative —
  // anything below the fold is simply unreachable by mouse actions.
  const page = await browser.newPage({ viewport: { width: 1600, height: 2600 } });
  page.on('pageerror', (err) => console.error('PAGE ERROR:', err.message));
  return { browser, page };
}

async function createProject(page, title) {
  await page.goto('file://' + APP_HTML);
  await page.waitForTimeout(500);
  await page.fill('input[placeholder="e.g. Fall 2025 Interviews"]', title);
  await page.click('button:has-text("Create")');
  await page.waitForTimeout(600);
}

async function newTranscript(page, title) {
  await page.click('button:has-text("New transcript")');
  await page.waitForTimeout(400);
  await page.fill('input[placeholder="e.g. Interview 01"]', title);
  const buttons = await page.$$('button:has-text("Create")');
  await buttons[buttons.length - 1].click();
  await page.waitForTimeout(700);
}

async function typeTranscriptText(page, text) {
  const editor = page.locator('[contenteditable="true"]').first();
  await editor.click();
  const lines = text.trim().split('\n').filter((l) => l.trim().length > 0);
  for (let i = 0; i < lines.length; i++) {
    await page.keyboard.insertText(lines[i]);
    if (i < lines.length - 1) {
      // Shift+Enter, not Enter: a plain Enter creates a new <div> block
      // whose boundary is lost when the app reads the editor's plain text
      // back out (it flattens child divs with no separator). Shift+Enter
      // embeds a literal newline character in the text node itself, which
      // survives that round trip and renders correctly in the read-only
      // Code tab (which has white-space: pre-wrap).
      await page.keyboard.down('Shift');
      await page.keyboard.press('Enter');
      await page.keyboard.up('Shift');
    }
  }
  await page.waitForTimeout(300);
}

async function createCodeForPhrase(page, phrase, codeName, nature) {
  const ok = await page.evaluate((phrase) => {
    const editorDivs = Array.from(document.querySelectorAll('div.whitespace-pre-wrap'));
    const root = editorDivs.find((d) => d.textContent.includes(phrase));
    if (!root) return 'NO_ROOT';
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    let range = null;
    while ((node = walker.nextNode())) {
      const idx = node.textContent.indexOf(phrase);
      if (idx !== -1) {
        range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + phrase.length);
        break;
      }
    }
    if (!range) return 'NO_RANGE';
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const rect = range.getBoundingClientRect();
    root.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: rect.left, clientY: rect.top }));
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
    return 'OK';
  }, phrase);
  if (ok !== 'OK') throw new Error(`createCodeForPhrase("${phrase}") failed: ${ok}`);
  await page.waitForTimeout(250);
  await page.fill('input[placeholder="e.g. time constraints"]', codeName);
  if (nature) await page.click(`button:has-text("${nature}")`);
  await page.click('button:has-text("Save code")');
  await page.waitForTimeout(400);
}

async function rubberBandSelect(page, x1, y1, x2, y2) {
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps);
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
  await page.waitForTimeout(300);
}

async function selectPairAndCreateTheme(page, titleA, titleB, themeName) {
  const boxOf = async (t) => page.locator(`p:text-is("${t}")`).first().boundingBox();
  const a = await boxOf(titleA);
  const b = await boxOf(titleB);
  const x1 = Math.min(a.x, b.x) - 15;
  // -12, not the toolbar row above the cards: starting the drag on the
  // toolbar performs a native text selection instead of a canvas
  // rubber-band select.
  const y1 = Math.min(a.y, b.y) - 12;
  const x2 = Math.max(a.x + a.width, b.x + b.width) + 15;
  const y2 = Math.max(a.y + a.height, b.y + b.height) + 15;
  await rubberBandSelect(page, x1, y1, x2, y2);
  // The rubber-band select itself opens the "Name this initial theme"
  // modal directly — no separate click on the toolbar's "Theme" button
  // is needed (and that button's text is ambiguous: it also matches
  // unrelated accordion headers via :has-text).
  await page.waitForTimeout(300);
  await page.fill('input[placeholder="e.g. Time pressure"]', themeName);
  await page.click('button:has-text("Create initial theme")');
  await page.waitForTimeout(500);
}

async function buildSampleProject(page) {
  const read = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');

  await createProject(page, 'Sample Project');

  await newTranscript(page, 'Interview 1 — Ana (first-year student)');
  await typeTranscriptText(page, read('transcript1.txt'));
  await page.click('button:has-text("Code"), a:has-text("Code")');
  await page.waitForTimeout(400);
  await createCodeForPhrase(page, "didn't check the syllabus closely enough", 'Time management struggles', 'Semantic');
  await createCodeForPhrase(page, 'I still get overwhelmed sometimes', 'Overwhelmed by workload', 'Semantic');
  await createCodeForPhrase(page, 'missed home a lot in the beginning', 'Homesickness', 'Semantic');
  await createCodeForPhrase(page, "scared they'd think I was slow for asking basic questions", 'Hesitant to ask for help', 'Latent');
  await createCodeForPhrase(page, 'study group for our math class', 'Peer support networks', 'Semantic');
  await createCodeForPhrase(page, 'I think I trust myself more now', 'Growing academic confidence', 'Semantic');

  await page.waitForTimeout(300);
  await page.click('text=Transcripts');
  await page.waitForTimeout(500);
  await newTranscript(page, 'Interview 2 — Marco (first-year student)');
  await typeTranscriptText(page, read('transcript2.txt'));
  await page.click('button:has-text("Code"), a:has-text("Code")');
  await page.waitForTimeout(400);
  await createCodeForPhrase(page, 'this informal support system', 'Peer support networks', 'Semantic');
  await createCodeForPhrase(page, 'trying to look like I had it together', 'Hesitant to ask for help', 'Latent');
  await createCodeForPhrase(page, 'three hundred pages assigned for a single week', 'Overwhelmed by workload', 'Semantic');
  await createCodeForPhrase(page, 'pulled a few all-nighters trying to catch up', 'Overwhelmed by workload', 'Semantic');

  await page.waitForTimeout(300);
  await page.click('text=Transcripts');
  await page.waitForTimeout(500);
  await newTranscript(page, 'Interview 3 — Bea (first-year student)');
  await typeTranscriptText(page, read('transcript3.txt'));
  await page.click('button:has-text("Code"), a:has-text("Code")');
  await page.waitForTimeout(400);
  await createCodeForPhrase(page, 'completely lost track of the date', 'Time management struggles', 'Semantic');
  await createCodeForPhrase(page, 'The homesickness hit harder than I expected', 'Homesickness', 'Semantic');
  await createCodeForPhrase(page, 'invited me to eat with her group', 'Peer support networks', 'Semantic');
  await createCodeForPhrase(page, 'avoided office hours the entire first month', 'Hesitant to ask for help', 'Latent');
  await createCodeForPhrase(page, 'trust my own methods more', 'Growing academic confidence', 'Semantic');

  await page.click('text=Reflexive TA');
  await page.waitForTimeout(500);
  page.once('dialog', (d) => d.accept('Initial Themes'));
  await page.click('button:has-text("New workspace")');
  await page.waitForTimeout(1000);

  await selectPairAndCreateTheme(page, 'Time management struggles', 'Overwhelmed by workload', 'Struggling with the unstructured transition');
  await page.waitForTimeout(500);
  await page.click('button:has-text("Arrange")');
  await page.waitForTimeout(600);

  await selectPairAndCreateTheme(page, 'Homesickness', 'Hesitant to ask for help', 'Navigating who to turn to for help');
  await page.waitForTimeout(500);
  await page.click('button:has-text("Arrange")');
  await page.waitForTimeout(600);

  await selectPairAndCreateTheme(page, 'Peer support networks', 'Growing academic confidence', 'Building competence and confidence');
  await page.waitForTimeout(500);
  await page.click('button:has-text("Arrange")');
  await page.waitForTimeout(600);

  await page.click('button:has-text("Add overarching theme")');
  await page.waitForTimeout(400);
  await page.fill('input[placeholder="e.g. Time-driven strain"]', 'Becoming an independent learner');
  await page.fill(
    'textarea[placeholder*="brief description"]',
    'How first-year students move from relying on external structure to trusting their own systems, relationships, and judgment.'
  );
  const checkboxes = await page.$$('input[type="checkbox"]');
  for (const cb of checkboxes) await cb.check().catch(() => {});
  await page.click('button:has-text("Create overarching theme")');
  await page.waitForTimeout(600);

  await page.fill('input[placeholder="Name to save current as…"]', 'Sample layout');
  await page.click('button:has-text("Save current as new")');
  await page.waitForTimeout(600);
}

async function exportBackup(page) {
  await page.click('text=Backup & Restore');
  await page.waitForTimeout(600);
  await page.fill('#export-password', BACKUP_PASSWORD);
  await page.waitForTimeout(200);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    page.click('button:has-text("Download backup")'),
  ]);
  await download.saveAs(OUTPUT_PATH);
}

async function verifyRoundTrip(page) {
  await page.goto('file://' + APP_HTML);
  await page.waitForTimeout(500);
  // A fresh load can still land back on the last-open project (the app
  // remembers it), not the projects list — go there explicitly.
  const allProjectsLink = page.locator('text=All projects').first();
  if (await allProjectsLink.isVisible().catch(() => false)) {
    await allProjectsLink.click();
    await page.waitForTimeout(400);
  }
  await page.click('button:has-text("Import a backup")');
  await page.waitForTimeout(400);
  await page.setInputFiles('#qbk-file', OUTPUT_PATH);
  await page.fill('input[placeholder="Password used when the backup was created"]', BACKUP_PASSWORD);
  await page.fill('input[placeholder="e.g. Fall 2025 Interviews"]', 'Sample Project (verify)');
  const buttons = await page.$$('button:has-text("Import")');
  await buttons[buttons.length - 1].click();
  await page.waitForTimeout(2000);
  const bodyText = await page.innerText('body');
  if (!bodyText.includes('Interview 1') || !bodyText.includes('Interview 2') || !bodyText.includes('Interview 3')) {
    throw new Error('Round-trip check failed: not all 3 transcripts were found after import.');
  }
}

(async () => {
  if (!fs.existsSync(APP_HTML)) {
    console.error(`app.html not found at ${APP_HTML}`);
    process.exit(1);
  }
  console.log('Building sample project against', APP_HTML);
  const { browser, page } = await launch();
  try {
    await buildSampleProject(page);
    await exportBackup(page);
    console.log('Exported', OUTPUT_PATH);
    await verifyRoundTrip(page);
    console.log('Round-trip import verified OK.');
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
