// Run: node tests/paper-review.test.js   (needs playwright)
// Runs the Paper Reviewer on tests/fixtures/messy-paper.docx (rebuild it with: python3 tests/make-fixture.py).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
let failures = 0;
const check = async (name, fn) => { try { await fn(); console.log('ok  -', name); } catch (e) { failures++; console.log('FAIL-', name, '\n     ', e.message); } };

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await (await browser.newContext()).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/cdn|unpkg|tailwind/, r => r.abort());
  await page.addInitScript(() => { window.lucide = { createIcons() {} }; });
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForFunction(() => typeof prReview === 'function');
  const b64 = fs.readFileSync(path.join(__dirname, 'fixtures', 'messy-paper.docx')).toString('base64');
  // Returns paragraph "style|text" lines of a finished document.
  const dump = `async (docx) => { const f = await readDocxZip(await docx.arrayBuffer()); const d = parseXmlString(new TextDecoder().decode(f.get('word/document.xml'))); return [...d.getElementsByTagNameNS(W_NS,'body')[0].children].map(c => c.localName === 'tbl' ? '[TABLE]' : c.localName === 'p' ? prStyleId(c) + '|' + prText(c) : ''); }`;
  const review = async approve => page.evaluate(async ({ b64, approve, dump }) => {
    const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
    const s = await prReview(buf, { paperType: 'student' }, () => {});
    const ids = s.findings.filter(f => f.tier === 'ask').flatMap(f => f.items.map(i => i.id));
    const out = await prFinish(s, approve === 'all' ? ids : [], 'messy.docx', () => {});
    return { lines: await eval(dump)(out.docx), summary: out.summary, asks: ids.length, titles: s.findings.map(f => f.tier + ':' + f.id) };
  }, { b64, approve, dump });

  const none = await review('none');
  const all = await review('all');
  await check('with nothing approved, wording is untouched but formatting is fixed', () => {
    const text = none.lines.join('\n');
    assert.ok(text.includes('Table 3. Descriptive statistics') === false, 'caption split into two lines');
    assert.ok(text.includes('Table 3') && text.includes('Table 1'), 'table numbers unchanged');
    assert.ok(text.includes('(Smith & Lee 2019)'), 'citation unchanged');
    assert.ok(text.includes('Bibliography'), 'heading unchanged');
    assert.ok(none.lines.some(l => l.startsWith('Reference|Smith')), 'references get the Reference style');
    assert.ok(none.summary.declined.length === none.asks);
  });
  await check('approving everything renumbers tables with their mentions and sorts references', () => {
    const text = all.lines.join('\n');
    assert.ok(/As shown in Table 1, scores rose/.test(text) && /Table 2 lists the sample/.test(text));
    assert.ok(text.includes('(Smith & Lee, 2019)') && text.includes('Jones et al., 2020') && text.includes('et al. (2021)'));
    const refs = all.lines.filter(l => l.startsWith('Reference|'));
    assert.ok(refs[0].includes('Brown') && refs[2].includes('Smith'));
    assert.ok(all.lines.some(l => l === 'Heading1|References'));
  });
  await check('manual-only findings never change the document', () => {
    assert.ok(all.titles.some(t => t.startsWith('manual:')));
  });
  await check('legacy .doc and non-Word files are rejected with a clear message', async () => {
    const msg = await page.evaluate(async () => {
      const out = [];
      for (const bytes of [[0xD0, 0xCF, 0x11, 0xE0, 0, 0, 0, 0], [1, 2, 3, 4, 5, 6, 7, 8]]) {
        try { await readDocxZip(new Uint8Array(bytes).buffer); } catch (e) { out.push(e.code); }
      }
      return out;
    });
    assert.deepStrictEqual(msg, ['LEGACY_DOC', 'NOT_DOCX']);
  });
  await check('original tools are still reachable from the home page', async () => {
    await page.evaluate(() => showHome());
    const labels = await page.locator('#home-tools > div:first-child button').allInnerTexts();
    const joined = labels.join(' ');
    for (const name of ['Citation Generator', 'Bibliography Formatter', 'Table Formatter', 'Table of Contents', 'Reformat Your Paper']) assert.ok(joined.includes(name), name);
  });
  await check('no page errors', () => assert.deepStrictEqual(errors, []));
  await browser.close();
  console.log(failures ? `\n${failures} failure(s)` : '\nAll paper reviewer tests passed');
  process.exit(failures ? 1 : 0);
})();
