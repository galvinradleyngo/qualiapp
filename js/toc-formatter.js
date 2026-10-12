// Table of Contents formatter: parse a rough draft, edit entries in a form, preview APA layout, export .docx.
// The top half is pure logic (testable in Node); the bottom half is the UI.

// ── Logic ──────────────────────────────────────────────────────────────
const TOC_LISTS = {
    contents: { label: 'Contents', title: 'Table of Contents' },
    tables: { label: 'Tables', title: 'List of Tables' },
    figures: { label: 'Figures', title: 'List of Figures' }
};
const TOC_MAX_LEVEL = 5;
const TOC_LABEL_WORDS = /^(table|figure|chapter|appendix|section|part|phase|step|study|experiment|exhibit|plate|page|wave|cohort|group|aim|hypothesis|question|session)$/i;
const ROMAN_PAGE = /^(?=[ivxlcdm]+$)m{0,3}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/i;

function isPageToken(token) {
    return /^\d{1,4}$/.test(token) || (token.length <= 6 && ROMAN_PAGE.test(token) && token.toLowerCase() !== 'mix');
}

// Splits "Introduction ........ 3" into { text, page }. Leaders, tabs and wide gaps all count as separators.
function splitTocLine(raw) {
    const line = raw.replace(/\s+$/, '');
    let m = line.match(/^(.*?\S)\s*(?:[.…·_•]{2,}[.…·_•\s]*|\t+|\s{2,}|\s*[-–—]\s+)\s*([0-9]{1,4}|[ivxlcdm]{1,6})\s*$/i);
    if (m && isPageToken(m[2])) return { text: m[1].replace(/[.…·_\s]+$/, ''), page: m[2] };
    m = line.match(/^(.*?\S)\s+(\d{1,4})$/);
    if (m && !TOC_LABEL_WORDS.test(m[1].split(/\s+/).pop()) && !/\b(?:19|20)\d\d$/.test(line) && !/^\d+(?:\.\d+)*$/.test(m[1])) {
        return { text: m[1], page: m[2] };
    }
    return { text: line.trim(), page: '' };
}

// Turns pasted text into [{ level, text, page }]. Levels come from outline numbers (1.2.3) when every
// line has one, otherwise from the ranked indentation of each line.
function parseTocDraftText(raw) {
    const lines = String(raw || '').replace(/\r/g, '').split('\n').filter(l => l.trim());
    const parsed = lines.map(line => {
        const lead = line.match(/^[ \t ]*/)[0];
        const indent = [...lead].reduce((n, ch) => n + (ch === '\t' ? 8 : 1), 0);
        const { text, page } = splitTocLine(line.trim());
        const num = text.match(/^(\d+(?:\.\d+)*)[.)]?\s+\S/);
        return { indent, text: text.replace(/\s+/g, ' '), page, depth: num ? num[1].split('.').length : 0 };
    }).filter(e => e.text && !/^(table of contents|contents|list of tables|list of figures)$/i.test(e.text));
    const useNumbers = parsed.length > 0 && parsed.every(e => e.depth > 0) && parsed.some(e => e.depth > 1);
    const ranks = [...new Set(parsed.map(e => e.indent))].sort((a, b) => a - b);
    return parsed.map(e => ({
        level: Math.min(TOC_MAX_LEVEL, useNumbers ? e.depth : ranks.indexOf(e.indent) + 1),
        text: e.text,
        page: e.page
    }));
}

function tocValidate(entries) {
    const warnings = [];
    const used = entries.filter(e => e.text.trim());
    if (!used.length) return warnings;
    const missing = used.filter(e => !String(e.page).trim());
    if (missing.length) warnings.push(`${missing.length} entr${missing.length === 1 ? 'y has' : 'ies have'} no page number.`);
    const numeric = used.filter(e => /^\d+$/.test(String(e.page).trim())).map(e => parseInt(e.page, 10));
    for (let i = 1; i < numeric.length; i++) {
        if (numeric[i] < numeric[i - 1]) { warnings.push('Page numbers go backwards somewhere. Check the order of your entries.'); break; }
    }
    let prev = 0;
    for (const e of used) {
        if (e.level > prev + 1 && prev > 0) { warnings.push(`"${e.text.slice(0, 40)}" skips a heading level (Level ${prev} is followed by Level ${e.level}).`); break; }
        prev = e.level;
    }
    const seen = new Set();
    for (const e of used) {
        const key = `${e.level}|${e.text.trim().toLowerCase()}`;
        if (seen.has(key)) { warnings.push(`"${e.text.slice(0, 40)}" appears more than once at the same level.`); break; }
        seen.add(key);
    }
    return warnings;
}

function tocSpacing(spacing) {
    if (spacing === 'single') return { line: 240, after: 0 };
    if (spacing === 'mixed') return { line: 240, after: 240 };
    return { line: 480, after: 0 };
}

function tocStylesXml(opts) {
    const { line, after } = tocSpacing(opts.spacing);
    const step = Math.round((opts.indent || 0.5) * 1440);
    const leader = opts.leaders ? ' w:leader="dot"' : '';
    const entry = (id, name, left, hanging) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="39"/><w:unhideWhenUsed/><w:pPr><w:tabs><w:tab w:val="right"${leader} w:pos="9350"/></w:tabs><w:spacing w:before="0" w:after="${after}" w:line="${line}" w:lineRule="auto"/><w:ind w:left="${left}" w:right="720" w:hanging="${hanging}"/></w:pPr></w:style>`;
    let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="' + W_NS + '">'
        + '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault>'
        + '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="480" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
        + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
        + '<w:style w:type="paragraph" w:styleId="TOCHeading"><w:name w:val="TOC Heading"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="39"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="0" w:after="0" w:line="480" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:bCs/></w:rPr></w:style>';
    for (let l = 1; l <= TOC_MAX_LEVEL; l++) xml += entry('TOC' + l, 'toc ' + l, (l - 1) * step + 720, 720);
    xml += entry('TableofFigures', 'table of figures', 720, 720);
    return xml + '</w:styles>';
}

function tocRunXml(text, props = '') {
    return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
}

// Builds the Word document for every non-empty list. Each list starts on its own page.
function tocBuildDocx(state) {
    const opts = state.opts;
    const order = ['contents', 'tables', 'figures'].filter(k => state.lists[k].some(e => e.text.trim()));
    const body = [];
    order.forEach((key, idx) => {
        const entries = state.lists[key].filter(e => e.text.trim());
        const title = (state.titles[key] || TOC_LISTS[key].title).trim() || TOC_LISTS[key].title;
        body.push(`<w:p><w:pPr><w:pStyle w:val="TOCHeading"/>${idx ? '<w:pageBreakBefore/>' : ''}</w:pPr>${tocRunXml(title)}</w:p>`);
        const live = key === 'contents' && opts.liveField;
        entries.forEach((e, i) => {
            const style = key === 'contents' ? 'TOC' + Math.min(TOC_MAX_LEVEL, Math.max(1, e.level)) : 'TableofFigures';
            const open = live && i === 0
                ? '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>' : '';
            const close = live && i === entries.length - 1 ? '<w:r><w:fldChar w:fldCharType="end"/></w:r>' : '';
            body.push(`<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr>${open}${tocRunXml(e.text.trim())}<w:r><w:tab/></w:r>${tocRunXml(String(e.page).trim())}${close}</w:p>`);
        });
    });
    return buildDocxPackage({
        bodyXml: body.join(''),
        stylesXml: tocStylesXml(opts),
        headerXml: opts.pageNumbers ? apaHeaderXml() : ''
    });
}

function tocPlainText(state, key) {
    const entries = state.lists[key].filter(e => e.text.trim());
    const title = state.titles[key] || TOC_LISTS[key].title;
    return [title, '', ...entries.map(e => `${'    '.repeat(key === 'contents' ? e.level - 1 : 0)}${e.text.trim()}\t${String(e.page).trim()}`)].join('\n');
}

// ── Reading a Word draft (needs DOMParser) ─────────────────────────────
function tocParagraphInfo(doc) {
    const body = doc.getElementsByTagNameNS(W_NS, 'body')[0];
    const paras = [];
    let pageNo = 1;
    const hasRendered = doc.getElementsByTagNameNS(W_NS, 'lastRenderedPageBreak').length > 0;
    [...body.getElementsByTagNameNS(W_NS, 'p')].forEach(p => {
        const pPr = wChild(p, 'pPr');
        const styleId = pPr && wChild(pPr, 'pStyle') ? wAttr(wChild(pPr, 'pStyle'), 'val') : '';
        const ind = pPr && wChild(pPr, 'ind');
        const left = ind ? parseInt(wAttr(ind, 'left') || wAttr(ind, 'start') || '0', 10) : 0;
        if (pPr && wChild(pPr, 'pageBreakBefore') && !hasRendered) pageNo++;
        let startPage = pageNo;
        let first = true;
        wDescendants(p, 'r').forEach(r => {
            [...r.children].forEach(c => {
                const isBreak = c.localName === 'lastRenderedPageBreak' || (!hasRendered && c.localName === 'br' && wAttr(c, 'type') === 'page');
                if (isBreak) { pageNo++; if (first) startPage = pageNo; }
                if (c.localName === 't' && c.textContent) first = false;
            });
        });
        paras.push({ text: paragraphPlainText(p).replace(/\s+/g, ' ').trim(), styleId, left, page: startPage, estimated: true });
    });
    return { paras, hasRendered };
}

const CAPTION_ONLY = /^(Table|Figure)\s+(\d+[A-Za-z]?)\s*$/;
const CAPTION_LINE = /^(Table|Figure)\s+(\d+[A-Za-z]?)[.:]\s+(\S.*)$/;

// Returns { source: 'toc' | 'headings' | 'none', contents, tables, figures, note }.
function tocFromDocxXml(xml) {
    const doc = parseXmlString(xml);
    const { paras, hasRendered } = tocParagraphInfo(doc);
    const result = { source: 'none', contents: [], tables: [], figures: [], note: '' };

    const tocParas = paras.filter(p => /^(TOC|toc)\d$/.test(p.styleId) || /^(TableofContents)$/i.test(p.styleId));
    const looksLikeToc = paras.map(p => p.text && /\S.*(?:\.{3,}|\t|\s{2,}|\s)\s*\d{1,4}$/.test(p.text) && p.text.length < 140);
    let runStart = -1, bestStart = -1, bestLen = 0;
    looksLikeToc.forEach((ok, i) => {
        if (ok && runStart < 0) runStart = i;
        if ((!ok || i === looksLikeToc.length - 1) && runStart >= 0) {
            const end = ok ? i + 1 : i;
            if (end - runStart > bestLen) { bestLen = end - runStart; bestStart = runStart; }
            runStart = -1;
        }
    });
    let tocBlock = [];
    if (tocParas.length >= 3) tocBlock = tocParas;
    else if (bestLen >= 4) tocBlock = paras.slice(bestStart, bestStart + bestLen);
    if (tocBlock.length >= 3) {
        const lefts = [...new Set(tocBlock.map(p => p.left))].sort((a, b) => a - b);
        tocBlock.forEach(p => {
            const { text, page } = splitTocLine(p.text.replace(/\t/g, '  '));
            if (!text) return;
            const styled = p.styleId.match(/(\d)$/);
            result.contents.push({ level: styled ? Math.min(TOC_MAX_LEVEL, +styled[1]) : lefts.indexOf(p.left) + 1, text, page });
        });
        result.source = 'toc';
        result.note = `Found a contents page with ${result.contents.length} entries.`;
    } else {
        paras.forEach(p => {
            const m = p.styleId.match(/^Heading([1-5])$/i);
            if (m && p.text) result.contents.push({ level: +m[1], text: p.text, page: String(p.page) });
        });
        if (result.contents.length) {
            result.source = 'headings';
            result.note = hasRendered
                ? `No contents page found, so ${result.contents.length} entries were built from the Heading styles. Page numbers come from where Word last paginated the file; check them.`
                : `No contents page found, so ${result.contents.length} entries were built from the Heading styles. This file has no saved pagination, so page numbers are only counted from manual page breaks; replace them with the real ones.`;
        }
    }

    // Tables and figures from their captions ("Table 1" on its own line, or "Table 1. Title").
    paras.forEach((p, i) => {
        if (tocBlock.includes(p)) return;
        let m = p.text.match(CAPTION_LINE);
        let title = m ? m[3] : '';
        if (!m) {
            m = p.text.match(CAPTION_ONLY);
            if (m) title = (paras[i + 1] && paras[i + 1].text) || '';
        }
        if (!m || !title || title.split(/\s+/).length > 30) return;
        const key = m[1].toLowerCase() === 'table' ? 'tables' : 'figures';
        result[key].push({ level: 1, text: `${m[1]} ${m[2]}. ${title}`, page: String(p.page) });
    });
    if (result.source === 'none' && (result.tables.length || result.figures.length)) result.source = 'captions';
    return result;
}

// ── UI ─────────────────────────────────────────────────────────────────
const TOC_SAMPLE = [
    { level: 1, text: 'Abstract', page: '2' },
    { level: 1, text: 'Sleep and Memory in Adolescents', page: '3' },
    { level: 2, text: 'Method', page: '5' },
    { level: 3, text: 'Participants', page: '5' },
    { level: 3, text: 'Procedure', page: '6' },
    { level: 2, text: 'Results', page: '8' },
    { level: 2, text: 'Discussion', page: '11' },
    { level: 1, text: 'References', page: '14' },
    { level: 1, text: 'Appendix A', page: '18' }
];
const TOC_COMMON = ['Abstract', 'Introduction', 'Literature Review', 'Method', 'Results', 'Discussion', 'Conclusion', 'References', 'Appendix A'];

const tocState = {
    active: 'contents',
    inputTab: 'form',
    lists: { contents: TOC_SAMPLE.map(e => ({ ...e })), tables: [], figures: [] },
    titles: { contents: 'Table of Contents', tables: 'List of Tables', figures: 'List of Figures' },
    opts: { leaders: true, spacing: 'double', indent: 0.5, liveField: false, pageNumbers: true }
};

const tocEl = id => document.getElementById(id);
const tocEntries = () => tocState.lists[tocState.active];

function loadTocWorkspace() {
    setMode('toc');
    showEditor();
    tocSwitchInput(tocState.inputTab);
    tocRenderAll();
}

function tocSwitchInput(tab) {
    tocState.inputTab = tab;
    ['form', 'paste', 'upload'].forEach(t => {
        tocEl('toc-input-' + t).classList.toggle('hidden', t !== tab);
        const btn = tocEl('toc-tab-' + t);
        btn.classList.toggle('bg-white', t === tab);
        btn.classList.toggle('text-blue-600', t === tab);
        btn.classList.toggle('shadow-sm', t === tab);
        btn.classList.toggle('text-slate-600', t !== tab);
        btn.setAttribute('aria-selected', t === tab ? 'true' : 'false');
    });
}

function tocSwitchList(key) {
    tocState.active = key;
    tocRenderAll();
}

function tocRenderAll() {
    ['contents', 'tables', 'figures'].forEach(k => {
        const btn = tocEl('toc-list-' + k);
        const on = k === tocState.active;
        btn.classList.toggle('bg-white', on);
        btn.classList.toggle('text-blue-600', on);
        btn.classList.toggle('shadow-sm', on);
        btn.classList.toggle('text-slate-600', !on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
        const count = tocState.lists[k].filter(e => e.text.trim()).length;
        btn.querySelector('.toc-count').innerText = count ? count : '';
    });
    tocEl('toc-title-input').value = tocState.titles[tocState.active];
    tocEl('toc-title-label').innerText = tocState.active === 'contents' ? 'Page title' : 'Page title';
    tocEl('toc-level-hint').classList.toggle('hidden', tocState.active !== 'contents');
    tocRenderRows();
    tocUpdate();
    if (window.lucide) lucide.createIcons();
}

function tocRenderRows() {
    const host = tocEl('toc-rows');
    const entries = tocEntries();
    const isContents = tocState.active === 'contents';
    host.innerHTML = '';
    if (!entries.length) {
        host.innerHTML = '<p class="text-xs text-slate-400 py-4 text-center">No entries yet. Add one below, paste a draft, or upload a Word file.</p>';
        return;
    }
    entries.forEach((entry, i) => {
        const row = document.createElement('div');
        row.className = 'flex flex-wrap sm:flex-nowrap items-center gap-2 pb-2 sm:pb-0 border-b border-slate-100 sm:border-0';
        row.dataset.index = i;
        const levelOptions = [1, 2, 3, 4, 5].map(n => `<option value="${n}"${n === entry.level ? ' selected' : ''}>${n}</option>`).join('');
        row.innerHTML = `
            ${isContents ? `<select aria-label="Heading level for entry ${i + 1}" data-field="level" class="w-14 shrink-0 min-h-[2.5rem] border border-slate-200 rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none">${levelOptions}</select>` : ''}
            <input type="text" aria-label="Entry ${i + 1} text" data-field="text" value="${escapeHtml(entry.text).replace(/"/g, '&quot;')}" placeholder="${isContents ? 'Heading text' : (tocState.active === 'tables' ? 'Table 1. Title of the table' : 'Figure 1. Title of the figure')}" class="min-w-0 w-full basis-full order-first sm:order-none sm:w-auto sm:basis-0 sm:flex-1 min-h-[2.5rem] border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none">
            <input type="text" inputmode="numeric" aria-label="Entry ${i + 1} page" data-field="page" value="${escapeHtml(String(entry.page))}" placeholder="Page" class="w-14 sm:w-16 shrink-0 min-h-[2.5rem] border border-slate-200 rounded-lg p-2 text-sm text-center focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none">
            <div class="flex shrink-0">
                <button type="button" data-act="up" aria-label="Move entry ${i + 1} up" class="tap-target px-1.5 py-1 text-slate-400 hover:text-slate-800 rounded">&uarr;</button>
                <button type="button" data-act="down" aria-label="Move entry ${i + 1} down" class="tap-target px-1.5 py-1 text-slate-400 hover:text-slate-800 rounded">&darr;</button>
                <button type="button" data-act="del" aria-label="Delete entry ${i + 1}" class="tap-target px-1.5 py-1 text-slate-400 hover:text-rose-600 rounded">&times;</button>
            </div>`;
        host.appendChild(row);
    });
}

function tocRowsClick(event) {
    const btn = event.target.closest('button[data-act]');
    if (!btn) return;
    const i = +btn.closest('[data-index]').dataset.index;
    const entries = tocEntries();
    if (btn.dataset.act === 'del') entries.splice(i, 1);
    if (btn.dataset.act === 'up' && i > 0) [entries[i - 1], entries[i]] = [entries[i], entries[i - 1]];
    if (btn.dataset.act === 'down' && i < entries.length - 1) [entries[i + 1], entries[i]] = [entries[i], entries[i + 1]];
    tocRenderRows();
    tocUpdate();
}

function tocRowsInput(event) {
    const field = event.target.dataset.field;
    if (!field) return;
    const i = +event.target.closest('[data-index]').dataset.index;
    const entry = tocEntries()[i];
    entry[field] = field === 'level' ? +event.target.value : event.target.value;
    tocUpdate();
}

function tocAddEntry(text = '', level = null) {
    const entries = tocEntries();
    const last = entries[entries.length - 1];
    entries.push({ level: tocState.active === 'contents' ? (level || (last ? last.level : 1)) : 1, text, page: '' });
    tocRenderRows();
    tocUpdate();
    const inputs = tocEl('toc-rows').querySelectorAll('input[data-field="text"]');
    const target = text ? tocEl('toc-rows').querySelectorAll('input[data-field="page"]') : inputs;
    if (target.length) target[target.length - 1].focus();
}

function tocClearAll() {
    tocState.lists[tocState.active] = [];
    tocRenderRows();
    tocUpdate();
}

function tocTitleCaseAll() {
    let changed = 0;
    tocEntries().forEach(e => {
        const next = tocState.active === 'contents' ? toTitleCase(e.text) : e.text.replace(/^((?:Table|Figure)\s+\S+[.:]?\s+)(.*)$/, (m, a, b) => a + toTitleCase(b));
        if (next !== e.text) { e.text = next; changed++; }
    });
    tocRenderRows();
    tocUpdate();
    showToast(changed ? `Title-cased ${changed} entr${changed === 1 ? 'y' : 'ies'}. Check small words and acronyms.` : 'Entries already in title case.');
}

function tocLoadEntries(parsed, replace = true) {
    if (replace) tocState.lists[tocState.active] = parsed;
    else tocState.lists[tocState.active].push(...parsed);
    tocRenderRows();
    tocUpdate();
}

function tocLoadPasted() {
    const parsed = parseTocDraftText(tocEl('toc-paste-input').value);
    if (!parsed.length) { showToast('Paste your draft contents first.'); return; }
    tocLoadEntries(parsed);
    tocSwitchInput('form');
    showToast(`Loaded ${parsed.length} entries. Adjust levels and pages below.`);
}

async function tocHandleFile(file) {
    const status = tocEl('toc-upload-status');
    if (!file) return;
    status.className = 'text-xs text-slate-500';
    status.innerText = 'Reading ' + file.name + '…';
    try {
        if (/\.txt$/i.test(file.name)) {
            const parsed = parseTocDraftText(await file.text());
            if (!parsed.length) throw new Error('No entries were found in that text file.');
            tocLoadEntries(parsed);
            status.innerText = `Loaded ${parsed.length} entries from ${file.name}.`;
            tocSwitchInput('form');
            return;
        }
        const files = await readDocxZip(await file.arrayBuffer());
        const found = tocFromDocxXml(new TextDecoder().decode(files.get('word/document.xml')));
        if (found.source === 'none') throw new Error('No contents page, Heading styles, or table and figure captions were found in that file. Try the "Paste a draft" tab, or add entries in the form.');
        if (found.contents.length) tocState.lists.contents = found.contents;
        if (found.tables.length) tocState.lists.tables = found.tables;
        if (found.figures.length) tocState.lists.figures = found.figures;
        if (!found.contents.length) tocState.active = found.tables.length ? 'tables' : 'figures';
        else tocState.active = 'contents';
        const extra = [found.tables.length && `${found.tables.length} table${found.tables.length === 1 ? '' : 's'}`, found.figures.length && `${found.figures.length} figure${found.figures.length === 1 ? '' : 's'}`].filter(Boolean);
        status.className = 'text-xs text-emerald-700';
        status.innerText = [found.note, extra.length ? `Also found ${extra.join(' and ')} (see the List of Tables / Figures tabs).` : ''].filter(Boolean).join(' ');
        tocRenderAll();
        tocSwitchInput('form');
    } catch (e) {
        status.className = 'text-xs text-rose-700';
        status.innerText = e.message;
    }
}

function tocOptionChanged() {
    const o = tocState.opts;
    o.leaders = tocEl('toc-opt-leaders').checked;
    o.spacing = tocEl('toc-opt-spacing').value;
    o.indent = parseFloat(tocEl('toc-opt-indent').value) || 0.5;
    o.liveField = tocEl('toc-opt-field').checked;
    o.pageNumbers = tocEl('toc-opt-header').checked;
    tocEl('toc-field-warning').classList.toggle('hidden', !o.liveField);
    tocUpdate();
}

function tocTitleChanged() {
    tocState.titles[tocState.active] = tocEl('toc-title-input').value;
    tocUpdate();
}

function tocUpdate() {
    const entries = tocEntries().filter(e => e.text.trim());
    const o = tocState.opts;
    const { line, after } = tocSpacing(o.spacing);
    const isContents = tocState.active === 'contents';
    const title = escapeHtml(tocState.titles[tocState.active] || TOC_LISTS[tocState.active].title);
    const rows = entries.map(e => {
        const pad = isContents ? (e.level - 1) * o.indent : 0;
        return `<div class="toc-row" style="padding-left:${pad}in; padding-right:0; margin-bottom:${after / 20}pt; line-height:${line / 240};"><span class="toc-text">${escapeHtml(e.text.trim())}</span>${o.leaders ? '<span class="toc-dots"></span>' : '<span class="toc-gap"></span>'}<span class="toc-page">${escapeHtml(String(e.page).trim())}</span></div>`;
    }).join('');
    const pageNo = o.pageNumbers ? '<div style="text-align:right; font-size:12pt; line-height:1; margin:-1.5rem 0 1.25rem;">1</div>' : '';
    tocEl('toc-export-container').innerHTML = `${pageNo}<div style="text-align:center; font-weight:bold; margin-bottom:0;">${title}</div>${rows || '<p style="color:#94a3b8; text-align:center;">Add entries to see your page.</p>'}`;

    const warnings = tocValidate(tocEntries());
    const box = tocEl('toc-checks');
    box.innerHTML = warnings.length
        ? `<ul class="issue-list">${warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`
        : (entries.length ? '<p class="text-emerald-700">No layout problems found in this list.</p>' : '<p class="text-slate-500">Add entries to run checks.</p>');
    tocEl('toc-lists-note').innerText = ['contents', 'tables', 'figures'].filter(k => k !== tocState.active && tocState.lists[k].some(e => e.text.trim())).length
        ? 'Export includes every list that has entries, each on its own page.' : '';
}

function exportTocDocx() {
    const any = Object.values(tocState.lists).some(list => list.some(e => e.text.trim()));
    if (!any) { showToast('Add some entries first.'); return; }
    downloadBlob(tocBuildDocx(tocState), 'APA_Table_of_Contents.docx');
    showToast('Word document (.docx) saved.');
}

function copyTocContent() {
    const text = tocPlainText(tocState, tocState.active);
    const rows = tocEntries().filter(e => e.text.trim());
    const html = `<div style="font-family:'Times New Roman',serif;font-size:12pt;"><p style="text-align:center;font-weight:bold;">${escapeHtml(tocState.titles[tocState.active])}</p>${rows.map(e => `<p style="margin:0 0 0 ${tocState.active === 'contents' ? (e.level - 1) * tocState.opts.indent : 0}in;">${escapeHtml(e.text.trim())}&emsp;${escapeHtml(String(e.page).trim())}</p>`).join('')}</div>`;
    if (navigator.clipboard && window.ClipboardItem) {
        navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })])
            .then(() => showToast('Contents copied. Use Export for the dotted-leader layout.'))
            .catch(() => showToast('Copy failed. Use Export instead.'));
    } else {
        showToast('Copy is not available in this browser. Use Export instead.');
    }
}

function initTocWorkspace() {
    const rows = tocEl('toc-rows');
    rows.addEventListener('click', tocRowsClick);
    rows.addEventListener('input', tocRowsInput);
    rows.addEventListener('change', tocRowsInput);
    const drop = tocEl('toc-dropzone');
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('border-blue-400', 'bg-blue-50/40'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('border-blue-400', 'bg-blue-50/40'); }));
    drop.addEventListener('drop', e => tocHandleFile(e.dataTransfer.files[0]));
    tocEl('toc-file-input').addEventListener('change', e => { tocHandleFile(e.target.files[0]); e.target.value = ''; });
    tocEl('toc-common').innerHTML = TOC_COMMON.map(t => `<button type="button" data-common="${escapeHtml(t)}" class="text-[11px] font-semibold bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-600 px-2.5 py-1 rounded-full transition">+ ${escapeHtml(t)}</button>`).join('');
    tocEl('toc-common').addEventListener('click', e => {
        const b = e.target.closest('[data-common]');
        if (b) { tocSwitchList('contents'); tocAddEntry(b.dataset.common, /^(Abstract|References|Appendix)/.test(b.dataset.common) ? 1 : 2); }
    });
}
