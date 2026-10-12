// Paper Reviewer engine, part 1: open a .docx, classify its structure, and apply the automatic
// (formatting-only) APA fixes. Anything that could change wording is collected as a question in
// paper-findings.js and only applied after the user approves it (paper-finish.js).

const PR_FONT_SIZES = { 'Times New Roman': 24, 'Calibri': 22, 'Arial': 22, 'Georgia': 22, 'Lucida Sans Unicode': 20 };
const PR_DEFAULT_OPTIONS = {
    paperType: 'student', font: 'Times New Roman', runningHead: '',
    titlePage: { title: '', author: '', affiliation: '', course: '', instructor: '', date: '' }
};
const PR_STAGES = [
    { id: 'read', label: 'Reading your document', weight: 8 },
    { id: 'map', label: 'Mapping the structure', weight: 12 },
    { id: 'layout', label: 'Page setup, fonts and spacing', weight: 14 },
    { id: 'front', label: 'Title page and abstract', weight: 10 },
    { id: 'headings', label: 'Headings', weight: 8 },
    { id: 'tables', label: 'Tables and figures', weight: 14 },
    { id: 'cites', label: 'In-text citations', weight: 12 },
    { id: 'refs', label: 'Reference list', weight: 12 },
    { id: 'pages', label: 'Pagination, page numbers and header', weight: 10 }
];

const PR_REF_HEADING = /^(references?|reference list|bibliography|works cited|literature cited|sources|list of references)$/i;
const PR_CAPTION = /^(Table|Figure|Fig\.)\s+(\d+[A-Za-z]?)(\s*[.:\-–—]\s*|\s*\t\s*|\s+)?(.*)$/;
const PR_SECTION_NAMES = /^(introduction|background|literature review|method|methods|methodology|results|discussion|conclusions?|limitations|findings|abstract|references|appendix.*)$/i;

class PaperSession {
    constructor(options) {
        this.options = { ...PR_DEFAULT_OPTIONS, ...options, titlePage: { ...PR_DEFAULT_OPTIONS.titlePage, ...(options && options.titlePage) } };
        this.auto = new Map();       // key -> { label, count }
        this.findings = [];          // questions and notes
        this.forceBreak = new Set(); // paragraphs that must start a page
        this.infos = new Map();      // element -> info
        this.captions = [];
        this.notes = [];
    }
    log(key, label, n = 1) {
        if (!n) return;
        const cur = this.auto.get(key) || { label, count: 0 };
        cur.count += n;
        this.auto.set(key, cur);
    }
    addFinding(f) { this.findings.push({ items: [], ...f }); }
}

async function prOpen(buffer, options) {
    const s = new PaperSession(options);
    s.files = await readDocxZip(buffer);
    const dec = new TextDecoder();
    const part = name => (s.files.has(name) ? parseXmlString(dec.decode(s.files.get(name))) : null);
    s.doc = part('word/document.xml');
    s.body = s.doc.getElementsByTagNameNS(W_NS, 'body')[0];
    if (!s.body) throw new DocxError('NOT_DOCX', 'That Word file has no document body.');
    s.styles = part('word/styles.xml');
    s.rels = part('word/_rels/document.xml.rels');
    s.types = part('[Content_Types].xml');
    s.settings = part('word/settings.xml');
    s.styleNames = new Map();
    if (s.styles) wDescendants(s.styles.documentElement, 'style').forEach(st => {
        const n = wChild(st, 'name');
        s.styleNames.set(wAttr(st, 'styleId'), n ? wAttr(n, 'val') : '');
    });
    return s;
}

// ── Paragraph facts ────────────────────────────────────────────────────
const prHasDrawing = p => !!(p.getElementsByTagNameNS(W_NS, 'drawing').length || p.getElementsByTagNameNS(W_NS, 'pict').length || p.getElementsByTagNameNS(W_NS, 'object').length);

function prRemovableBlank(p) {
    const pPr = wChild(p, 'pPr');
    if (pPr && wChild(pPr, 'sectPr')) return false;
    for (const c of p.children) {
        if (c.localName === 'pPr' || c.localName === 'proofErr') continue;
        if (c.localName !== 'r') return false;
        for (const k of c.children) {
            if (k.localName === 'rPr' || k.localName === 'lastRenderedPageBreak' || k.localName === 'tab') continue;
            if (k.localName === 'br' && wAttr(k, 'type') !== 'page') continue;
            if (k.localName === 't' && !k.textContent.trim()) continue;
            if (k.localName === 'br') continue; // a page-break-only paragraph is handled separately
            return false;
        }
    }
    return true;
}

function prHasPageBreakRun(p) {
    return wDescendants(p, 'br').some(b => wAttr(b, 'type') === 'page');
}

function prParaInfo(s, p) {
    const segs = prSegments(p);
    const text = segs.map(x => x.text).join('').replace(/[\t\n]/g, ' ').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
    const sid = prStyleId(p);
    const sname = s.styleNames.get(sid) || '';
    const hm = /^heading\s*([1-9])$/i.exec(sname) || /^Heading([1-9])$/i.exec(sid);
    const pPr = wChild(p, 'pPr');
    const ind = pPr && wChild(pPr, 'ind');
    const textRuns = segs.filter(x => x.kind === 't' && x.text.trim()).map(x => x.node.parentNode);
    return {
        el: p, kind: 'p', text, words: text ? text.split(' ').length : 0,
        sid, sname, level: hm ? +hm[1] : 0, isTitleStyle: /^title$/i.test(sname) || sid === 'Title',
        jc: prGetJc(p), hasDrawing: prHasDrawing(p), numbered: !!(pPr && wChild(pPr, 'numPr')),
        pbBefore: !!(pPr && wChild(pPr, 'pageBreakBefore')), hasBreakRun: prHasPageBreakRun(p),
        hasSect: !!(pPr && wChild(pPr, 'sectPr')), blank: !text && !prHasDrawing(p) && prRemovableBlank(p),
        left: ind ? parseInt(wAttr(ind, 'left') || wAttr(ind, 'start') || '0', 10) : 0,
        firstLine: ind ? parseInt(wAttr(ind, 'firstLine') || '0', 10) : 0,
        allBold: textRuns.length > 0 && textRuns.every(r => r && r.localName === 'r' && prRunIsBold(r)),
        allItalic: textRuns.length > 0 && textRuns.every(r => r && r.localName === 'r' && prRunIsItalic(r)),
        hasRevisions: !!(p.getElementsByTagNameNS(W_NS, 'ins').length || p.getElementsByTagNameNS(W_NS, 'del').length),
        hasCiteField: wDescendants(p, 'instrText').some(i => /ADDIN|CSL|ZOTERO|MENDELEY/i.test(i.textContent)),
        role: ''
    };
}

// ── Structure ──────────────────────────────────────────────────────────
function prMapStructure(s) {
    s.blocks = [...s.body.children].filter(c => c.namespaceURI === W_NS && ['p', 'tbl', 'sdt'].includes(c.localName));
    s.blocks.forEach(el => { if (el.localName === 'p') prSplitRuns(el); });
    s.list = s.blocks.map(el => {
        const info = el.localName === 'p' ? prParaInfo(s, el) : { el, kind: el.localName === 'tbl' ? 'tbl' : 'other', role: el.localName === 'tbl' ? 'table' : 'other', text: '', words: 0, blank: false };
        s.infos.set(el, info);
        return info;
    });
    const L = s.list;
    const isP = i => L[i] && L[i].kind === 'p';
    const nextNB = i => { for (let j = i + 1; j < L.length; j++) if (!(L[j].kind === 'p' && L[j].blank)) return j; return -1; };
    const prevNB = i => { for (let j = i - 1; j >= 0; j--) if (!(L[j].kind === 'p' && L[j].blank)) return j; return -1; };
    s.nextNB = nextNB; s.prevNB = prevNB;

    // Which paragraphs begin a new page in the source (explicit breaks), to find the title page boundary.
    const startsPage = new Array(L.length).fill(false);
    let pending = false;
    L.forEach((info, i) => {
        if (info.kind === 'p') {
            if (info.pbBefore) pending = true;
            if (pending && (info.text || info.hasDrawing)) { startsPage[i] = true; pending = false; }
            if (info.hasBreakRun) pending = true;
        }
    });

    // Existing contents page: leave alone apart from fonts.
    L.forEach((info, i) => {
        if (info.kind !== 'p') return;
        if (/^(TOC|toc)\d?$/.test(info.sid) || /^TOC\d/i.test(info.sname) || /^table of contents$/i.test(info.sname) || wDescendants(info.el, 'instrText').some(t => /^\s*TOC\b/.test(t.textContent))) info.role = 'toc';
    });
    L.forEach((info, i) => {
        if (info.kind === 'p' && /^(table of contents|contents)$/i.test(info.text) && !info.role) {
            const n = nextNB(i);
            if (n >= 0 && L[n].kind === 'p' && /\S.*\d+$/.test(L[n].text) && L[n].text.length < 140) {
                info.role = 'toc';
                for (let j = n; j < L.length && (L[j].blank || (L[j].kind === 'p' && /\S.*(\d+|[ivx]+)$/i.test(L[j].text) && L[j].text.length < 140)); j++) L[j].role = 'toc';
            }
        }
    });

    // References.
    let refIdx = -1;
    for (let i = L.length - 1; i >= 0; i--) {
        if (isP(i) && !L[i].role && L[i].words <= 4 && PR_REF_HEADING.test(L[i].text.replace(/[:.]$/, ''))) { refIdx = i; break; }
    }
    s.hasRefs = refIdx >= 0;
    if (refIdx >= 0) {
        L[refIdx].role = 'refHeading';
        for (let j = refIdx + 1; j < L.length; j++) {
            const x = L[j];
            if (x.kind !== 'p') break;
            if (x.blank) continue;
            if (x.level > 0 || x.hasDrawing || /^appendi(x|ces)\b/i.test(x.text) || (PR_CAPTION.test(x.text) && x.words < 40 && /^(Table|Figure|Fig\.)\s+\d+\s*([.:\-]|$)/.test(x.text))) break;
            x.role = 'reference';
        }
    }

    // Abstract.
    const limit = refIdx >= 0 ? refIdx : L.length;
    let absIdx = -1;
    for (let i = 0; i < limit; i++) if (isP(i) && !L[i].role && /^abstract$/i.test(L[i].text.replace(/[:.]$/, ''))) { absIdx = i; break; }
    s.hasAbstract = absIdx >= 0;
    if (absIdx >= 0) {
        L[absIdx].role = 'abstractHeading';
        for (let j = absIdx + 1; j < limit; j++) {
            const x = L[j];
            if (x.kind !== 'p') break;
            if (x.blank) continue;
            if (/^keywords?\s*[:.]/i.test(x.text)) { x.role = 'keywords'; break; }
            if (x.level > 0 || startsPage[j] || x.hasDrawing || (x.words <= 8 && (x.allBold || x.jc === 'center'))) break;
            x.role = 'abstract';
        }
    }

    // Title page: the leading run of short lines before the abstract / first body paragraph.
    const first = L.findIndex(x => x.kind === 'p' && !x.blank && !x.role);
    const titleLines = [];
    for (let j = first; j >= 0 && j < limit; j++) {
        const x = L[j];
        if (x.kind !== 'p') break;
        if (x.blank) continue;
        if (x.role || x.words > 25 || (x.level > 0 && !x.isTitleStyle) || x.hasDrawing) break;
        if (titleLines.length && startsPage[j]) break;
        if (/^(Table|Figure)\s+\d/.test(x.text) || /^appendix/i.test(x.text)) break;
        titleLines.push(j);
        if (x.hasBreakRun) break;
    }
    if (titleLines.length >= 2 && (absIdx < 0 || titleLines[titleLines.length - 1] < absIdx) && L.slice(titleLines[titleLines.length - 1] + 1).some(x => x.kind === 'p' && x.words > 25)) {
        titleLines.forEach(j => { L[j].role = 'titlePage'; });
        s.titleInfos = titleLines.map(j => L[j]);
        s.hasTitlePage = true;
        s.titleText = L[titleLines[0]].text;
    } else {
        s.titleInfos = [];
        s.hasTitlePage = false;
    }

    // Appendix labels.
    L.forEach((x, i) => {
        if (x.kind !== 'p' || x.role || x.blank) return;
        if (x.words <= 3 && /^appendix(es)?(\s+[A-Z0-9]{1,2})?$/i.test(x.text.replace(/[:.]$/, ''))) {
            x.role = 'appendixLabel';
            const n = nextNB(i);
            if (n >= 0 && L[n].kind === 'p' && !L[n].role && L[n].words <= 14 && !/[.]$/.test(L[n].text) && !PR_CAPTION.test(L[n].text)) L[n].role = 'appendixTitle';
        }
    });

    // Styled headings and a title in Title style.
    L.forEach(x => {
        if (x.kind !== 'p' || x.role || x.blank) return;
        if (x.level > 0) { x.role = 'heading'; x.headingLevel = x.level; x.source = 'style'; }
        else if (x.isTitleStyle && x.words <= 30) x.role = 'bodyTitle';
    });

    prMapCaptions(s, startsPage);

    // Keywords outside an abstract block, remaining blocks.
    L.forEach((x, i) => {
        if (x.kind !== 'p' || x.role) return;
        if (x.blank) { x.role = 'blank'; return; }
        if (x.numbered) { x.role = 'list'; return; }
        x.role = 'body';
    });

    // The paper title repeated at the top of the first page of text.
    if (s.hasTitlePage) {
        const first = L.find(x => x.kind === 'p' && x.role === 'body');
        const norm = v => v.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
        if (first && norm(first.text) === norm(s.titleText)) first.role = 'bodyTitle';
    }

    // Block quotes (existing indents) and quotes that could be block quotes (asked later).
    L.forEach(x => {
        if (x.role !== 'body') return;
        if (x.words >= 40 && x.left >= 540 && x.firstLine <= 0 && x.jc !== 'center') x.role = 'blockQuote';
        else if (/^(Quote|IntenseQuote|BlockText|BlockQuotation)$/i.test(x.sid) && x.words >= 40) x.role = 'blockQuote';
    });

    // Heading candidates: short lines formatted like headings but not using heading styles (asked later).
    s.headingCandidates = [];
    L.forEach((x, i) => {
        if (x.role !== 'body' || x.words > 12 || x.words < 1 || /[.!?,;]$/.test(x.text) || x.numbered) return;
        const n = nextNB(i);
        if (n < 0 || L[n].kind !== 'p' || L[n].words < 8) return;
        const known = PR_SECTION_NAMES.test(x.text);
        const formatted = x.allBold || (x.jc === 'center' && x.words <= 8) || (x.allItalic && x.words <= 8 && x.jc !== 'center');
        if (!known && !formatted) return;
        if (!known && !x.allBold && x.jc !== 'center' && !x.allItalic) return;
        let level = 1;
        if (x.jc === 'center') level = 1;
        else if (x.allBold && x.allItalic) level = 3;
        else if (x.allBold) level = known ? 1 : 2;
        else if (x.allItalic) level = 3;
        else level = 1;
        s.headingCandidates.push({ info: x, level });
    });
}

// ── Captions, tables, figures ──────────────────────────────────────────
function prMapCaptions(s, startsPage) {
    const L = s.list;
    const nextNB = s.nextNB, prevNB = s.prevNB;
    const isImgPara = x => x && x.kind === 'p' && x.hasDrawing && x.words <= 3;
    const captions = [];
    const used = new Set();
    L.forEach((x, i) => {
        if (x.kind !== 'p' || x.role || x.blank || used.has(i)) return;
        const m = x.text.match(PR_CAPTION);
        if (!m) return;
        const kind = m[1] === 'Table' ? 'Table' : 'Figure';
        const sep = (m[3] || '').trim() || (/\t/.test(prText(x.el)) ? '\t' : '');
        const rest = m[4].trim();
        let single = false;
        if (!rest) { /* label only */ }
        else if (sep) single = true;
        else if ((x.allBold || x.allItalic) && x.words <= 25 && !/[.!?]$/.test(x.text)) single = true;
        else return;
        if (x.words > 45) return;
        const cap = { kind, num: m[2], label: x.el, labelInfo: x, single, titleInfo: null, position: 'orphan', target: null, ordinal: 0 };
        let last = i;
        if (!single) {
            const n = nextNB(i);
            const t = n >= 0 ? L[n] : null;
            if (t && t.kind === 'p' && !t.role && t.words > 0 && t.words <= 30 && !PR_CAPTION.test(t.text) && !t.hasDrawing && !/^(Note|Source)\b/i.test(t.text)) { cap.titleInfo = t; last = n; used.add(n); }
        } else cap.titleInfo = x;
        // Where is the table or figure this caption belongs to?
        const isTarget = el => el && (kind === 'Table' ? el.kind === 'tbl' : isImgPara(el));
        const fwd = nextNB(last);
        const back = prevNB(i);
        if (fwd >= 0 && isTarget(L[fwd])) { cap.position = 'above'; cap.target = L[fwd]; }
        else if (back >= 0 && isTarget(L[back])) { cap.position = 'below'; cap.target = L[back]; }
        cap.firstIdx = i; cap.lastIdx = last;
        x.role = single ? 'captionSingle' : 'captionLabel';
        if (!single && cap.titleInfo) cap.titleInfo.role = 'captionTitle';
        captions.push(cap);
    });
    // Notes under tables and figures.
    L.forEach((x, i) => {
        if (x.kind === 'tbl' || isImgPara(x)) {
            let n = nextNB(i);
            // skip a caption that sits below the object
            const cap = captions.find(c => c.target === x && c.position === 'below');
            if (cap) n = nextNB(cap.lastIdx);
            if (n >= 0 && L[n].kind === 'p' && !L[n].role && /^(Notes?|Sources?)\b|^\*+\s*p\s*[<=]/i.test(L[n].text)) L[n].role = 'tableNote';
        }
        if (isImgPara(x) && !x.role) x.role = 'figureImage';
    });
    s.captions = captions;
}

// ── Automatic fixes ────────────────────────────────────────────────────
const PR_TEXT_ROLES = new Set(['body', 'abstract', 'keywords', 'blockQuote', 'list', 'reference', 'heading', 'titlePage', 'captionLabel', 'captionTitle', 'captionSingle', 'tableNote', 'bodyTitle', 'refHeading', 'abstractHeading', 'appendixLabel', 'appendixTitle']);

function prFixWhitespace(s) {
    let lead = 0, doubles = 0, trail = 0;
    s.list.forEach(x => {
        if (x.kind !== 'p' || !PR_TEXT_ROLES.has(x.role) || x.hasRevisions) return;
        let text = prText(x.el);
        const hits = [];
        const re = /(\S)( {2,})(?=\S)/g;
        let m;
        while ((m = re.exec(text))) hits.push([m.index + 1, m.index + m[0].length]);
        hits.reverse().forEach(([a, b]) => { prReplace(x.el, a, b, ' '); doubles++; });
        text = prText(x.el);
        const t = text.match(/[ \t ]+$/);
        if (t) { prReplace(x.el, text.length - t[0].length, text.length, ''); trail++; }
        const l = prText(x.el).match(/^[ \t ]+/);
        if (l && x.role !== 'list') { prReplace(x.el, 0, l[0].length, ''); lead++; }
    });
    s.log('space-lead', 'Removed leading spaces/tabs used to fake paragraph indents', lead);
    s.log('space-double', 'Collapsed double spaces to single spaces (APA 7: one space after periods)', doubles);
    s.log('space-trail', 'Removed trailing spaces', trail);
}

// Blank paragraphs and manual page breaks are replaced by real spacing and page-break-before settings.
function prNormalizeBlanksAndBreaks(s) {
    let blanks = 0, breaks = 0;
    const body = s.body;
    const kids = () => [...body.children].filter(c => c.namespaceURI === W_NS && ['p', 'tbl', 'sdt'].includes(c.localName));
    kids().forEach(el => {
        if (el.localName !== 'p') return;
        const info = s.infos.get(el);
        if (!info) return;
        // Manual page break at the end of (or alone in) a paragraph: move to the next paragraph.
        if (info.hasBreakRun && !info.hasDrawing) {
            const all = kids();
            const next = all[all.indexOf(el) + 1];
            const textBefore = info.text;
            const onlyBreak = !textBefore;
            if (next && next.localName === 'p' && (onlyBreak || info.role === 'titlePage' || info.role === 'abstract' || info.role === 'keywords' || info.role === 'body' || info.role === 'reference')) {
                wDescendants(el, 'br').filter(b => wAttr(b, 'type') === 'page').forEach(b => { const r = b.parentNode; b.remove(); if (r.localName === 'r' && ![...r.children].some(k => k.localName !== 'rPr')) r.remove(); });
                info.hasBreakRun = false;
                breaks++;
            }
        }
    });
    // A leftover page break inside the first paragraph's own pPr is dropped when the role rules decide breaks.
    s.list.forEach(x => { if (x.kind === 'p' && x.pbBefore && !['refHeading', 'abstractHeading', 'appendixLabel'].includes(x.role)) { breaks++; } });
    const all = kids();
    all.forEach((el, i) => {
        if (el.localName !== 'p') return;
        const info = s.infos.get(el);
        if (!info || !info.blank && !(info.role === 'blank')) return;
        const prev = all[i - 1], next = all[i + 1];
        if (i === all.length - 1) return;
        if (prev && prev.localName === 'tbl' && (!next || next.localName === 'tbl')) return;
        el.remove();
        blanks++;
    });
    s.log('blank-lines', 'Removed empty paragraphs used as spacing (spacing now comes from the paragraph settings)', blanks);
    s.log('page-breaks', 'Replaced manual page breaks with APA page-break rules (title page, abstract, text, references, appendices)', breaks);
    s.blocks = kids();
}

// Moves captions that sit below their table/figure to the top, and splits "Table 1. Title" into two lines.
function prRestructureCaptions(s) {
    const doc = s.doc;
    let split = 0, moved = 0;
    s.captions.forEach(c => {
        if (c.single) {
            const info = c.labelInfo;
            const text = prText(info.el);
            const m = text.match(/^\s*(Table|Figure|Fig\.)\s+(\d+[A-Za-z]?)(\s*[.:\-–—]\s*|\s*\t\s*|\s+)?/);
            if (m) {
                const labelP = prNewParagraph(doc, `${c.kind} ${c.num}`, { bold: true });
                info.el.before(labelP);
                prReplace(info.el, 0, m[0].length, '');
                const li = { el: labelP, kind: 'p', role: 'captionLabel', text: `${c.kind} ${c.num}`, words: 2, blank: false };
                s.infos.set(labelP, li);
                info.role = 'captionTitle';
                c.label = labelP; c.labelInfo = li; c.single = false; c.titleInfo = info;
                split++;
            }
        }
        if (c.position === 'below' && c.target) {
            const target = c.target.el;
            target.before(c.label);
            if (c.titleInfo && c.titleInfo.el !== c.label) target.before(c.titleInfo.el);
            c.position = 'above';
            moved++;
        }
    });
    s.log('caption-split', 'Put each table/figure number and title on separate lines ("Table 1" bold, title in italics)', split);
    s.log('caption-move', 'Moved table and figure captions above their table or figure', moved);
    s.blocks = [...s.body.children].filter(c => c.namespaceURI === W_NS && ['p', 'tbl', 'sdt'].includes(c.localName));
    s.list = s.blocks.map(el => s.infos.get(el) || (el.localName === 'p' ? prParaInfo(s, el) : { el, kind: el.localName === 'tbl' ? 'tbl' : 'other', role: 'other', text: '', words: 0 }));
    s.list.forEach(x => s.infos.set(x.el, x));
}

// Title and body positions after restructuring.
function prSpecFor(s, x) {
    const E = { style: 'ApaBody' };
    switch (x.role) {
        case 'body': return { spec: { style: 'ApaBody' } };
        case 'abstract': return { spec: { style: 'ApaBody', ind: { firstLine: 0 } } };
        case 'keywords': return { spec: { style: 'ApaBody' } };
        case 'blockQuote': return { spec: { style: 'ApaBlockQuote' } };
        case 'reference': return { spec: { style: 'Reference' } };
        case 'titlePage': return { spec: { style: 'ApaTitlePage' } };
        case 'bodyTitle': return { spec: { style: 'ApaTitlePage', keepNext: true }, bold: true };
        case 'heading': return { spec: { style: 'Heading' + Math.min(5, x.headingLevel || 1) }, plain: true };
        case 'refHeading': case 'abstractHeading': case 'appendixTitle': return { spec: { style: 'Heading1' }, plain: true };
        case 'appendixLabel': return { spec: { style: 'Heading1', keepNext: true }, plain: true };
        case 'captionLabel': return { spec: { style: 'Caption', keepNext: true }, fmt: { bold: true, italic: false } };
        case 'captionTitle': return { spec: { style: 'Caption', keepNext: true }, fmt: { italic: true, bold: false } };
        case 'tableNote': return { spec: { style: 'TableNote' } };
        default: return E && null;
    }
}

function prAddFlag(p, name) {
    const pPr = prPPr(p);
    if (!wChild(pPr, name)) { pPr.appendChild(wEl(p.ownerDocument, name)); prSortChildren(pPr, PR_PPR_ORDER); }
}

function prDecideBreaks(s) {
    const L = s.list;
    const idx = x => L.indexOf(x);
    const firstEl = L[0] && L[0].el;
    const mark = x => { if (x && x.el !== firstEl && x.kind === 'p') s.forceBreak.add(x.el); };
    L.forEach(x => { if (x.role === 'refHeading' || x.role === 'appendixLabel') mark(x); });
    const abs = L.find(x => x.role === 'abstractHeading');
    if (abs && s.hasTitlePage) mark(abs);
    // First page of the text starts on a new page after the title page / abstract.
    if (s.hasTitlePage || abs) {
        const lastFront = Math.max(...L.map((x, i) => (['titlePage', 'abstractHeading', 'abstract', 'keywords'].includes(x.role) ? i : -1)));
        const firstBody = L.findIndex((x, i) => i > lastFront && x.kind === 'p' && ['bodyTitle', 'heading', 'body', 'list', 'blockQuote', 'toc'].includes(x.role));
        if (firstBody >= 0) { s.firstBodyInfo = L[firstBody]; if (!(abs && !s.hasTitlePage && false)) mark(L[firstBody]); }
        else if (s.hasTitlePage && !abs) { /* nothing after the title page */ }
    }
    // Tables and figures placed after the references each get their own page.
    const refAt = L.findIndex(x => x.role === 'refHeading');
    if (refAt >= 0) s.captions.forEach(c => { if (idx(c.labelInfo) > refAt) mark(c.labelInfo); });
}

function prFormatParagraphs(s) {
    const o = s.options;
    let counts = { body: 0, spacing: 0, align: 0, headings: 0, refs: 0 };
    const inEnd = new Set();
    s.list.forEach(x => {
        if (x.kind !== 'p') return;
        const p = x.el;
        const before = { jc: x.jc, line: (() => { const sp = wChild(prPPr(p), 'spacing'); return sp ? wAttr(sp, 'line') : ''; })() };
        if (x.jc === 'both') counts.align++;
        if (x.role === 'toc') { prCleanParagraphRuns(p, {}); return; }
        if (x.role === 'blank') { prCleanParagraphRuns(p, {}); return; }
        if (x.role === 'list') {
            prSetP(p, { spacing: { before: 0, after: 0, line: 480 } }, ['pStyle', 'ind', 'numPr']);
            prCleanParagraphRuns(p, {});
            counts.spacing++;
            return;
        }
        if (x.role === 'figureImage') {
            const jc = x.jc === 'center' || x.jc === 'right' ? x.jc : 'left';
            prSetP(p, { spacing: { before: 0, after: 0, line: 240 }, jc, keepLines: true }, []);
            if (s.forceBreak.has(p)) prAddFlag(p, 'pageBreakBefore');
            prCleanParagraphRuns(p, { keepSize: true });
            return;
        }
        if (x.hasDrawing && !x.role) { prSetP(p, { spacing: { before: 0, after: 0, line: 240 }, jc: x.jc === 'center' ? 'center' : 'left' }, []); return; }
        const r = prSpecFor(s, x);
        if (!r) { prCleanParagraphRuns(p, {}); return; }
        const spec = { ...r.spec };
        if (s.forceBreak.has(p)) spec.pageBreakBefore = true;
        const isTitleLine = x.role === 'titlePage' && s.titleInfos[0] === x;
        if (isTitleLine) spec.spacing = { before: 1440, after: 480, line: 480 };
        prSetP(p, spec);
        prCleanParagraphRuns(p, { emphasis: !r.plain });
        if (r.bold) prSetParagraphRunFmt(p, { bold: true });
        if (r.fmt) prSetParagraphRunFmt(p, r.fmt);
        if (isTitleLine) prSetParagraphRunFmt(p, { bold: true });
        if (x.role === 'refHeading' || x.role === 'abstractHeading' || x.role === 'appendixLabel' || x.role === 'appendixTitle') counts.headings++;
        if (x.role === 'body') counts.body++;
        if (x.role === 'reference') counts.refs++;
        counts.spacing++;
    });
    s.log('spacing', 'Set double spacing with no extra space before/after paragraphs', counts.spacing);
    s.log('align', 'Changed justified text to left-aligned (ragged right)', counts.align);
    s.log('body-indent', 'Applied a 0.5-inch first-line indent to body paragraphs', counts.body);
    s.log('hanging', 'Applied 0.5-inch hanging indents to reference entries', counts.refs);

    // Keywords label in italics; "Note." labels in italics; abstract/keyword indents.
    s.list.forEach(x => {
        if (x.role === 'keywords') {
            const m = prText(x.el).match(/^\s*(Keywords?)\s*[:.]?\s*/i);
            if (m) {
                const labelEnd = m[0].length;
                prFormatRange(x.el, 0, m[1].length + (/[:.]/.test(m[0]) ? 1 : 0), { italic: true });
                void labelEnd;
            }
        }
        if (x.role === 'tableNote') {
            const t = prText(x.el);
            const m = t.match(/^(Notes?|Sources?)\s*[.:]?/i);
            if (m) {
                const label = m[1];
                const canonical = /^note/i.test(label) ? (/^notes/i.test(label) ? 'Notes' : 'Note') : (/^sources/i.test(label) ? 'Sources' : 'Source');
                const labelPart = canonical + '.';
                if (m[0] !== labelPart) prReplace(x.el, 0, m[0].length, labelPart);
                prFormatRange(x.el, 0, labelPart.length, { italic: true });
            }
        }
    });
}

// Statistical symbols (M, SD, p, t, F, r, n, N, d, df) are italic in APA 7. Formatting only.
function prItalicizeStats(s) {
    let count = 0;
    const re = /(^|[^\p{L}\p{N}_\-])(SD|SE|df|M|p|t|F|r|n|N|d)(?=\s*(?:=|<|>|≤|≥|\(\s*\d))/gu;
    s.list.forEach(x => {
        if (x.kind !== 'p' || !['body', 'abstract', 'blockQuote', 'list'].includes(x.role)) return;
        const text = prText(x.el);
        const hits = [];
        let m;
        re.lastIndex = 0;
        while ((m = re.exec(text))) {
            const start = m.index + m[1].length;
            // A lone "d" or "n" or "r" counts only before = < >, so prose like "n (the sample)" is left alone.
            if (/^[dnr]$/.test(m[2]) && !/^\s*(=|<|>)/.test(text.slice(start + 1))) continue;
            hits.push([start, start + m[2].length]);
        }
        if (!hits.length) return;
        hits.reverse().forEach(([a, b]) => { prFormatRange(x.el, a, b, { italic: true }); count++; });
    });
    s.log('stats-italic', 'Italicized statistical symbols (M, SD, p, t, F, r, n, N...)', count);
}

function prFormatTables(s) {
    const doc = s.doc;
    let count = 0;
    s.list.forEach(x => {
        if (x.kind !== 'tbl') return;
        const tbl = x.el;
        count++;
        const tblPr = prEnsure(tbl, 'tblPr', ['tblPr', 'tblGrid']);
        wChildren(tblPr, 'tblStyle').forEach(e => e.remove());
        wChildren(tblPr, 'shd').forEach(e => e.remove());
        const rule = sz => ({ val: 'single', sz, space: 0, color: '000000' });
        const borders = wEl(doc, 'tblBorders');
        borders.appendChild(wEl(doc, 'top', rule(8)));
        borders.appendChild(wEl(doc, 'bottom', rule(8)));
        wChildren(tblPr, 'tblBorders').forEach(e => e.remove());
        tblPr.appendChild(borders);
        prSortChildren(tblPr, PR_TBLPR_ORDER);
        wChildren(tbl, 'tr').forEach((tr, ri) => {
            const trPr = prEnsure(tr, 'trPr', ['tblPrEx', 'trPr', 'tc']);
            [['cantSplit', true], ['tblHeader', ri === 0]].forEach(([n, on]) => { wChildren(trPr, n).forEach(e => e.remove()); if (on) trPr.appendChild(wEl(doc, n)); });
            prSortChildren(trPr, PR_TRPR_ORDER);
            wChildren(tr, 'tc').forEach(tc => {
                const tcPr = prEnsure(tc, 'tcPr', ['tcPr', 'p', 'tbl']);
                wChildren(tcPr, 'tcBorders').forEach(e => e.remove());
                wChildren(tcPr, 'shd').forEach(e => e.remove());
                if (ri === 0) { const b = wEl(doc, 'tcBorders'); b.appendChild(wEl(doc, 'bottom', rule(4))); tcPr.appendChild(b); }
                prSortChildren(tcPr, PR_TCPR_ORDER);
                wDescendants(tc, 'p').forEach(p => {
                    const jc = prGetJc(p);
                    prSplitRuns(p);
                    prSetP(p, { spacing: { before: 60, after: 60, line: 240 }, jc: jc === 'both' ? 'left' : (jc || undefined) }, ['numPr']);
                    prCleanParagraphRuns(p, { keepSize: true });
                });
            });
        });
    });
    s.log('tables', 'Reformatted tables: horizontal rules only (top, bottom, under the header row), no vertical lines or shading, header row repeats across pages, rows do not split', count);
}

// ── Styles, defaults and page setup ────────────────────────────────────
function prApplyStyles(s) {
    const o = s.options;
    const size = PR_FONT_SIZES[o.font] || 24;
    if (!s.styles) {
        s.styles = parseXmlString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="${W_NS}"></w:styles>`);
        s.newStyles = true;
    }
    const root = s.styles.documentElement;
    const font = xmlEscape(o.font);
    wChildren(root, 'docDefaults').forEach(e => e.remove());
    root.insertBefore(xmlFragment(s.styles, `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:eastAsia="${font}" w:cs="${font}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0" w:line="480" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`), root.firstChild);
    // Strip fonts, colours and sizes from every existing style so the APA defaults rule.
    wDescendants(root, 'style').forEach(st => {
        const rPr = wChild(st, 'rPr');
        if (rPr) {
            wChildren(rPr, 'rFonts').forEach(e => e.remove());
            if (wAttr(st, 'type') === 'paragraph' && !/^(FootnoteText|EndnoteText|Header|Footer)$/.test(wAttr(st, 'styleId'))) ['color', 'sz', 'szCs', 'caps', 'smallCaps'].forEach(n => wChildren(rPr, n).forEach(e => e.remove()));
        }
    });
    const rp = b => `<w:rPr>${b}</w:rPr>`;
    const sp = '<w:spacing w:before="0" w:after="0" w:line="480" w:lineRule="auto"/>';
    const head = (n, jc, ind, bold, italic) => `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="ApaBody"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/>${sp}${ind ? '<w:ind w:left="720"/>' : ''}<w:jc w:val="${jc}"/><w:outlineLvl w:val="${n - 1}"/></w:pPr>${rp(`<w:b/><w:bCs/>${italic ? '<w:i/><w:iCs/>' : ''}`)}</w:style>`;
    const defs = {
        Normal: `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr>${sp}</w:pPr></w:style>`,
        Heading1: head(1, 'center', false, true, false),
        Heading2: head(2, 'left', false, true, false),
        Heading3: head(3, 'left', false, true, true),
        Heading4: head(4, 'left', true, true, false),
        Heading5: head(5, 'left', true, true, true),
        ApaBody: '<w:style w:type="paragraph" w:customStyle="1" w:styleId="ApaBody"><w:name w:val="APA Body Text"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:firstLine="720"/></w:pPr></w:style>',
        ApaBlockQuote: '<w:style w:type="paragraph" w:customStyle="1" w:styleId="ApaBlockQuote"><w:name w:val="APA Block Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="720" w:firstLine="0"/></w:pPr></w:style>',
        ApaTitlePage: '<w:style w:type="paragraph" w:customStyle="1" w:styleId="ApaTitlePage"><w:name w:val="APA Title Page"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="center"/></w:pPr></w:style>',
        Reference: '<w:style w:type="paragraph" w:customStyle="1" w:styleId="Reference"><w:name w:val="Reference"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="720" w:hanging="720"/></w:pPr></w:style>',
        Caption: `<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="35"/><w:qFormat/><w:pPr><w:keepNext/>${sp}<w:jc w:val="left"/></w:pPr></w:style>`,
        TableNote: '<w:style w:type="paragraph" w:customStyle="1" w:styleId="TableNote"><w:name w:val="Table Note"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="60" w:after="0" w:line="360" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr></w:style>'
    };
    Object.entries(defs).forEach(([id, xml]) => prUpsertStyle(s.styles, id, xml));
    // Common source styles that would otherwise carry their own colours/borders.
    ['Title', 'Subtitle'].forEach(id => {
        const st = prStyleById(s.styles, id);
        if (st) { wChildren(st, 'pPr').forEach(e => e.remove()); wChildren(st, 'rPr').forEach(e => e.remove()); }
    });
    s.log('styles', `Set the document font to ${o.font} ${size / 2} pt and redefined Normal, Heading 1-5, Body, Block Quote, Reference, Caption and Table Note as real Word styles`, 1);
}

function prApplyPageSetup(s) {
    const doc = s.doc;
    const o = s.options;
    let sections = 0;
    const sects = wDescendants(s.body, 'sectPr');
    if (!wChildren(s.body, 'sectPr').length) s.body.appendChild(wEl(doc, 'sectPr'));
    const all = wDescendants(s.body, 'sectPr');
    all.forEach(sect => {
        sections++;
        const pgSz = wChild(sect, 'pgSz');
        const land = pgSz && wAttr(pgSz, 'orient') === 'landscape';
        wChildren(sect, 'pgSz').forEach(e => e.remove());
        sect.appendChild(wEl(doc, 'pgSz', land ? { w: 15840, h: 12240, orient: 'landscape' } : { w: 12240, h: 15840 }));
        wChildren(sect, 'pgMar').forEach(e => e.remove());
        sect.appendChild(wEl(doc, 'pgMar', { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 720, footer: 720, gutter: 0 }));
        ['headerReference', 'footerReference', 'titlePg', 'pgBorders', 'pgNumType'].forEach(n => wChildren(sect, n).forEach(e => e.remove()));
        const ref = wEl(doc, 'headerReference', { type: 'default' });
        ref.setAttributeNS(R_NS, 'r:id', 'rIdApaHdr');
        sect.appendChild(ref);
        prSortChildren(sect, PR_SECT_ORDER);
    });
    void sects;
    // Make the single header apply to every page.
    if (s.settings) {
        ['evenAndOddHeaders', 'mirrorMargins'].forEach(n => wDescendants(s.settings.documentElement, n).forEach(e => e.remove()));
    }
    s.log('page-setup', 'Set US Letter paper with 1-inch margins on all sides', sections);
    s.log('header', o.paperType === 'professional'
        ? 'Added the running head (left) and page number (right) in the header of every page, including the title page'
        : 'Added the page number at the top right of every page, including the title page', 1);
}

// ── Orchestrator, phase 1 ──────────────────────────────────────────────
async function prReview(buffer, options, progress = () => {}) {
    const total = PR_STAGES.reduce((n, st) => n + st.weight, 0);
    let done = 0;
    const stage = async (id, fn) => {
        const st = PR_STAGES.find(x => x.id === id);
        progress({ id, label: st.label, pct: Math.round(done / total * 100), state: 'start' });
        await nextFrame(30);
        const out = await fn();
        done += st.weight;
        progress({ id, label: st.label, pct: Math.round(done / total * 100), state: 'done' });
        await nextFrame(200);
        return out;
    };
    const s = await stage('read', () => prOpen(buffer, options));
    await stage('map', async () => {
        if (s.doc.getElementsByTagNameNS(W_NS, 'ins').length || s.doc.getElementsByTagNameNS(W_NS, 'del').length) {
            s.addFinding({ id: 'tracked', tier: 'manual', group: 'Document', title: 'Tracked changes are present', detail: 'Edits to wording are skipped in paragraphs that contain tracked changes. Accept or reject all changes in Word (Review > Accept All), then run the review again for a complete pass.' });
            s.hasRevisions = true;
        }
        prMapStructure(s);
        prNormalizeBlanksAndBreaks(s);
        prRestructureCaptions(s);
        prFixWhitespace(s);
    });
    await stage('layout', async () => {
        prApplyStyles(s);
        prDecideBreaks(s);
        prFormatParagraphs(s);
        prItalicizeStats(s);
        prApplyPageSetup(s);
    });
    await stage('front', async () => prFindFrontMatterIssues(s));
    await stage('headings', async () => prFindHeadingIssues(s));
    await stage('tables', async () => { prFormatTables(s); prFindTableFigureIssues(s); });
    await stage('cites', async () => prFindCitationIssues(s));
    await stage('refs', async () => prFindReferenceIssues(s));
    await stage('pages', async () => prFindPaginationIssues(s));
    progress({ id: 'done', label: 'Review complete', pct: 100, state: 'done' });
    return s;
}
