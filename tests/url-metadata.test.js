// Run: node tests/url-metadata.test.js   (needs playwright; uses the page's real functions)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const fixture = n => fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8');
let failures = 0;
const check = (name, fn) => { try { fn(); console.log('ok  -', name); } catch (e) { failures++; console.log('FAIL-', name, '\n     ', e.message); } };

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.route(/cdn|unpkg|tailwind/, r => r.abort());
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForFunction(() => typeof parseHtmlMetadata === 'function');
  const meta = (file, host) => page.evaluate(([h, ho]) => parseHtmlMetadata(h, ho), [fixture(file), host]);
  const ref = item => page.evaluate(i => generateApaReference(i).marked, item);

  let m = await meta('news.html', 'www.theguardian.com');
  check('news: title strips site, JSON-LD author kept, "Staff" dropped', () => {
    assert.strictEqual(m.title, 'Why sleep matters'); assert.strictEqual(m.author, 'Jane Doe');
    assert.strictEqual(m.siteName, 'The Guardian');
  });
  check('news: ISO date is not shifted by timezone', () => { assert.strictEqual(m.year, '2024'); assert.strictEqual(m.monthDay, 'March 5'); });

  m = await meta('journal.html', 'journals.example.org');
  check('journal: citation_* fields', () => {
    assert.strictEqual(m.title, 'Sleep and memory consolidation'); assert.strictEqual(m.author, 'Doe, Jane; Smith, John');
    assert.strictEqual(m.journal, 'Journal of Sleep Research'); assert.strictEqual(m.volume, '12');
    assert.strictEqual(m.issue, '3'); assert.strictEqual(m.pages, '45–67'); assert.strictEqual(m.year, '2021');
  });

  m = await meta('gov.html', 'www.example.gov.ph');
  check('gov: Dublin Core title/date and canonical', () => {
    assert.strictEqual(m.title, 'Mental health resources'); assert.strictEqual(m.year, '2023');
    assert.strictEqual(m.monthDay, 'November 2'); assert.strictEqual(m.canonical, 'https://www.example.gov.ph/mental-health');
  });

  m = await meta('blog.html', 'studyhacks.com');
  check('blog: profile-URL author ignored, og fields used', () => {
    assert.strictEqual(m.author, ''); assert.strictEqual(m.title, '10 tips for better studying'); assert.strictEqual(m.year, '2022');
  });

  m = await meta('bare.html', 'www.acmewidgets.com');
  check('bare page: site suffix stripped from <title>, no date invented', () => {
    assert.strictEqual(m.title, 'Our Story'); assert.strictEqual(m.year, '');
  });

  const h = await page.evaluate(() => ({
    slug: deriveTitleFromUrlPath('/blog/2024/my-great-post-title/12345'),
    site: mapDomainToSiteName('news.example.co.uk'),
    sim: titleSimilarity('Sleep and memory consolidation in adults', 'Sleep and Memory Consolidation in Adults.'),
    simLow: titleSimilarity('Sleep and memory consolidation', 'Cooking pasta at home quickly'),
    clean: cleanUrlForCitation(new URL('https://a.com/p?id=3&utm_source=x&fbclid=y#top'))
  }));
  check('slug skips trailing id', () => assert.strictEqual(h.slug, 'my great post title'));
  check('subdomain + co.uk site label', () => assert.strictEqual(h.site, 'Example'));
  check('title similarity thresholds', () => { assert.ok(h.sim >= 0.85); assert.ok(h.simLow < 0.3); });
  check('tracking params removed, real params kept', () => assert.strictEqual(h.clean, 'https://a.com/p?id=3'));

  const base = { year: '2024', monthDay: 'March 5', url: 'https://x.com/a' };
  assert.strictEqual(await ref({ ...base, type: 'article', title: 'Why sleep matters', authors: ['Doe, J.'], source: 'The Guardian' }),
    'Doe, J. (2024, March 5). Why sleep matters. *The Guardian*. https://x.com/a');
  assert.strictEqual(await ref({ ...base, type: 'webpage', title: 'Our story', authors: [], year: '', monthDay: '', source: 'Acme' }),
    '*Our story*. (n.d.). Acme. https://x.com/a');
  assert.strictEqual(await ref({ ...base, type: 'video', title: 'Sleep tips', authors: [{ name: 'Sleep Channel' }], year: '2023', monthDay: '', source: 'YouTube' }),
    'Sleep Channel. (2023). *Sleep tips* [Video]. YouTube. https://x.com/a');
  assert.strictEqual(await ref({ ...base, type: 'journal', title: 'Sleep and memory', authors: ['Doe, J.'], year: '2021', monthDay: '', source: 'Journal of Sleep Research', volume: '12', issue: '3', pages: '45-67', doi: '10.1/x' }),
    'Doe, J. (2021). Sleep and memory. *Journal of Sleep Research*, *12*(3), 45–67. https://doi.org/10.1/x');
  console.log('ok  - generator output for article, webpage, video, journal');

  // End to end with every network route blocked (simulates a site that refuses bots).
  const blocked = await browser.newPage();
  await blocked.route(/^(?!file:)/, r => r.request().url().includes('cdn') || r.request().url().includes('unpkg') || r.request().url().includes('tailwind') ? r.abort() : r.fulfill({ status: 403, contentType: 'text/html', body: '<html><head><title>Access Denied</title></head></html>' }));
  await blocked.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await blocked.waitForFunction(() => typeof resolveGeneralWebUrl === 'function');
  const apple = await blocked.evaluate(async () => {
    window.lucide = { createIcons() {} };
    await resolveGeneralWebUrl('https://www.apple.com/');
    const v = id => document.getElementById(id).value;
    return { type: v('cite-type'), title: v('cite-title'), authors: v('cite-authors'), source: v('cite-source'), year: v('cite-year'),
             status: document.getElementById('citation-status-desc').innerText, ref: document.getElementById('prev-citation-reference').innerText };
  });
  check('blocked apple.com: organization author, home-page title, no duplicate site', () => {
    assert.strictEqual(apple.authors, 'Apple Inc.'); assert.strictEqual(apple.title, 'Apple'); assert.strictEqual(apple.source, ''); assert.strictEqual(apple.year, '');
    assert.strictEqual(apple.ref, 'Apple Inc. (n.d.). Apple. https://www.apple.com/');
  });
  check('blocked apple.com: status explains the site refused access', () => assert.ok(/refused automated access/.test(apple.status), apple.status));
  const reasons = await blocked.evaluate(() => {
    lastFetchFailures = [{ message: 'HTTP 404' }]; const a = describeFetchFailure();
    lastFetchFailures = [{ message: 'The user aborted a request.' }]; const b = describeFetchFailure();
    return [a, b, looksLikeBlockPage('<html><head><title>Access Denied</title></head></html>'), looksLikeBlockPage('<html><head><title>Real article</title></head></html>')];
  });
  check('failure reasons and block-page detection', () => {
    assert.ok(/not found/.test(reasons[0])); assert.ok(/too long/.test(reasons[1])); assert.strictEqual(reasons[2], true); assert.strictEqual(reasons[3], false);
  });

  await browser.close();
  if (failures) { console.log(`\n${failures} failure(s)`); process.exit(1); }
  console.log('\nall passed');
})().catch(e => { console.error(e); process.exit(1); });
