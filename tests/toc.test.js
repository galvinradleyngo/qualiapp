// Run: node tests/toc.test.js   (pure Node, no browser)
// Covers the Table of Contents logic: draft parsing, validation and .docx export structure.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({ console, URL, Blob, TextEncoder, TextDecoder, Uint8Array, Uint32Array, Response });
for (const f of ['reference-engine.js', 'export.js', 'docx-io.js', 'toc-formatter.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
}
const run = (expr, vars = {}) => { Object.assign(ctx, { __v: vars }); return vm.runInContext(expr, ctx); };
let failures = 0;
const check = async (name, fn) => { try { await fn(); console.log('ok  -', name); } catch (e) { failures++; console.log('FAIL-', name, '\n     ', e.message); } };
const parse = text => JSON.parse(JSON.stringify(run('parseTocDraftText(__v.t)', { t: text })));

(async () => {
  await check('leaders, tabs and wide gaps split text from page', () => {
    const r = parse('Introduction ........ 3\nMethod\t5\nResults      8');
    assert.deepStrictEqual(r.map(e => [e.text, e.page]), [['Introduction', '3'], ['Method', '5'], ['Results', '8']]);
  });
  await check('indentation ranks become levels', () => {
    const r = parse('Method ... 5\n    Participants ... 5\n        Sampling ... 6\n    Procedure ... 7');
    assert.deepStrictEqual(r.map(e => e.level), [1, 2, 3, 2]);
  });
  await check('outline numbers decide levels', () => {
    const r = parse('1 Intro 1\n1.1 Background 2\n1.1.1 Detail 3\n2 Method 5');
    assert.deepStrictEqual(r.map(e => e.level), [1, 2, 3, 1]);
  });
  await check('"Table 1" and "Study 2" keep their numbers (not mistaken for pages)', () => {
    const r = parse('Table 1\nStudy 2\nReferences 14');
    assert.deepStrictEqual(r.map(e => [e.text, e.page]), [['Table 1', ''], ['Study 2', ''], ['References', '14']]);
  });
  await check('roman-numeral pages and existing title line are handled', () => {
    const r = parse('Table of Contents\nAbstract ..... iii\nIntroduction ..... 1');
    assert.deepStrictEqual(r.map(e => [e.text, e.page]), [['Abstract', 'iii'], ['Introduction', '1']]);
  });
  await check('validation flags missing pages, backwards pages and skipped levels', () => {
    const w = run('tocValidate(__v.e)', { e: [{ level: 1, text: 'A', page: '5' }, { level: 3, text: 'B', page: '' }, { level: 1, text: 'C', page: '2' }] });
    assert.ok(w.some(x => /no page number/.test(x)));
    assert.ok(w.some(x => /backwards/.test(x)));
    assert.ok(w.some(x => /skips a heading level/.test(x)));
  });
  await check('docx package lists header, styles and document parts', async () => {
    const state = { lists: { contents: [{ level: 1, text: 'Q&A <draft>', page: '3' }, { level: 2, text: 'Sub', page: '4' }], tables: [{ level: 1, text: 'Table 1. Means', page: '6' }], figures: [] }, titles: { contents: 'Table of Contents', tables: 'List of Tables' }, opts: { leaders: true, spacing: 'mixed', indent: 0.5, liveField: true, pageNumbers: true } };
    const blob = run('tocBuildDocx(__v.s)', { s: state });
    const buf = Buffer.from(await blob.arrayBuffer());
    const names = [];
    for (let i = 0; i < buf.length - 4; i++) if (buf.readUInt32LE(i) === 0x04034b50) names.push(buf.toString('utf8', i + 30, i + 30 + buf.readUInt16LE(i + 26)));
    assert.deepStrictEqual(names, ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/_rels/document.xml.rels', 'word/styles.xml', 'word/header1.xml']);
    const text = buf.toString('utf8');
    assert.ok(text.includes('Q&amp;A &lt;draft&gt;'), 'text must be XML-escaped');
    assert.ok(text.includes('w:leader="dot"'), 'dot leader style');
    assert.ok(text.includes('TOC \\o "1-3"'), 'live field instruction');
    assert.ok(text.includes('List of Tables') && text.includes('pageBreakBefore'), 'second list on its own page');
  });
  console.log(failures ? `\n${failures} failure(s)` : '\nAll ToC tests passed');
  process.exit(failures ? 1 : 0);
})();
