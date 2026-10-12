// Run: node tests/home-and-draft.test.js   (needs playwright)
const assert = require('assert');
const path = require('path');
const { chromium } = require('playwright');
let failures = 0;
const check = async (name, fn) => { try { await fn(); console.log('ok  -', name); } catch (e) { failures++; console.log('FAIL-', name, '\n     ', e.message); } };

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/cdn|unpkg|tailwind/, r => r.abort());
  await page.addInitScript(() => { window.lucide = { createIcons() {} }; });
  const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
  await page.goto(url);
  await page.waitForFunction(() => typeof showHome === 'function');
  const hidden = id => page.evaluate(i => document.getElementById(i).classList.contains('hidden'), id);

  await check('home: tools visible, templates and resume strip hidden on first visit', async () => {
    assert.strictEqual(await hidden('home-tools'), false);
    assert.strictEqual(await hidden('table-templates-section'), true);
    assert.strictEqual(await hidden('home-continue'), true);
  });
  await check('home: five tool cards are real buttons', async () => {
    assert.strictEqual(await page.locator('#home-tools button').count(), 5);
  });
  await check('table card opens templates; All tools returns', async () => {
    await page.evaluate(() => openTableTemplates());
    assert.strictEqual(await hidden('home-tools'), true);
    assert.strictEqual(await hidden('table-templates-section'), false);
    assert.strictEqual(await page.locator('#table-templates-section button[onclick^="loadTemplate"]').count(), 5);
    await page.evaluate(() => showHome());
    assert.strictEqual(await hidden('home-tools'), false);
    assert.strictEqual(await hidden('table-templates-section'), true);
  });
  await check('template card loads the table editor', async () => {
    await page.evaluate(() => loadTemplate('correlation'));
    assert.strictEqual(await page.evaluate(() => currentMode), 'table');
    await page.evaluate(() => showHome());
  });
  await check('sample bibliography is not saved as a draft', async () => {
    await page.evaluate(() => { loadBibliographyWorkspace(); showHome(); });
    assert.strictEqual(await page.evaluate(() => localStorage.getItem(BIB_DRAFT_KEY)), null);
    assert.strictEqual(await hidden('home-continue'), true);
  });
  await check('typed bibliography is saved and offered on the home page', async () => {
    await page.evaluate(() => {
      bibInputIsSample = false; document.getElementById('bibliography-input').value = 'Doe, J. (2020). My real source. Publisher.\n\nRoe, R. (2019). Another one. Press.';
      saveBibliographyDraft(); showHome();
    });
    assert.strictEqual(await hidden('home-continue'), false);
    assert.ok(/2 references/.test(await page.locator('#home-continue-text').innerText()));
  });
  await check('draft survives a reload and resume restores it', async () => {
    await page.reload();
    await page.waitForFunction(() => typeof showHome === 'function');
    assert.strictEqual(await hidden('home-continue'), false);
    assert.ok((await page.evaluate(() => document.getElementById('bibliography-input').value)).includes('My real source'));
  });
  await check('adding a generated citation saves the draft', async () => {
    await page.evaluate(() => {
      document.getElementById('cite-type').value = 'book'; document.getElementById('cite-title').value = 'Added book';
      document.getElementById('cite-authors').value = 'Poe, E.'; document.getElementById('cite-year').value = '2001';
      updateCitationPreview(); addCitationToBibliography();
    });
    assert.ok((await page.evaluate(() => localStorage.getItem(BIB_DRAFT_KEY))).includes('Added book'));
  });
  await check('discard clears draft and hides the strip', async () => {
    await page.evaluate(() => { discardBibliographyDraft(); });
    assert.strictEqual(await page.evaluate(() => localStorage.getItem(BIB_DRAFT_KEY)), null);
    assert.strictEqual(await hidden('home-continue'), true);
  });
  await check('works when storage is blocked', async () => {
    const p2 = await (await browser.newContext()).newPage();
    await p2.route(/cdn|unpkg|tailwind/, r => r.abort());
    await p2.addInitScript(() => { window.lucide = { createIcons() {} }; Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    await p2.goto(url);
    await p2.waitForFunction(() => typeof showHome === 'function');
    await p2.evaluate(() => { document.getElementById('bibliography-input').value = 'x'; saveBibliographyDraft(); showHome(); });
  });
  await check('no page errors', async () => assert.deepStrictEqual(errors, []));

  await browser.close();
  if (failures) { console.log(`\n${failures} failure(s)`); process.exit(1); }
  console.log('\nall passed');
})().catch(e => { console.error(e); process.exit(1); });
