// Low-level Word XML editing for the Paper Reviewer: schema-ordered property setters, run cleaning,
// and text edit primitives that keep each run's formatting. Needs DOMParser (browser).

const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const WP_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';

// Word rejects property elements that appear out of schema order, so every write goes through these lists.
const PR_PPR_ORDER = ['pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'framePr', 'widowControl', 'numPr', 'suppressLineNumbers', 'pBdr', 'shd', 'tabs', 'suppressAutoHyphens', 'kinsoku', 'wordWrap', 'overflowPunct', 'topLinePunct', 'autoSpaceDE', 'autoSpaceDN', 'bidi', 'adjustRightInd', 'snapToGrid', 'spacing', 'ind', 'contextualSpacing', 'mirrorIndents', 'suppressOverlap', 'jc', 'textDirection', 'textAlignment', 'textboxTightWrap', 'outlineLvl', 'divId', 'cnfStyle', 'rPr', 'sectPr', 'pPrChange'];
const PR_RPR_ORDER = ['rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike', 'dstrike', 'outline', 'shadow', 'emboss', 'imprint', 'noProof', 'snapToGrid', 'vanish', 'webHidden', 'color', 'spacing', 'w', 'kern', 'position', 'sz', 'szCs', 'highlight', 'u', 'effect', 'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout', 'specVanish', 'oMath'];
const PR_TBLPR_ORDER = ['tblStyle', 'tblpPr', 'tblOverlap', 'bidiVisual', 'tblStyleRowBandSize', 'tblStyleColBandSize', 'tblW', 'jc', 'tblCellSpacing', 'tblInd', 'tblBorders', 'shd', 'tblLayout', 'tblCellMar', 'tblLook', 'tblCaption', 'tblDescription'];
const PR_TCPR_ORDER = ['cnfStyle', 'tcW', 'gridSpan', 'hMerge', 'vMerge', 'tcBorders', 'shd', 'noWrap', 'tcMar', 'textDirection', 'tcFitText', 'vAlign', 'hideMark'];
const PR_TRPR_ORDER = ['cnfStyle', 'divId', 'gridBefore', 'gridAfter', 'wBefore', 'wAfter', 'cantSplit', 'trHeight', 'tblHeader', 'tblCellSpacing', 'jc', 'hidden'];
const PR_SECT_ORDER = ['headerReference', 'footerReference', 'footnotePr', 'endnotePr', 'type', 'pgSz', 'pgMar', 'paperSrc', 'pgBorders', 'lnNumType', 'pgNumType', 'cols', 'formProt', 'vAlign', 'noEndnote', 'titlePg', 'textDirection', 'bidi', 'rtlGutter', 'docGrid'];

function wEl(doc, name, attrs = {}) {
    const el = doc.createElementNS(W_NS, 'w:' + name);
    for (const [k, v] of Object.entries(attrs)) el.setAttributeNS(W_NS, 'w:' + k, String(v));
    return el;
}

function prSortChildren(parent, order) {
    const rank = el => { const i = order.indexOf(el.localName); return i < 0 ? order.length : i; };
    [...parent.children].map((el, i) => ({ el, i })).sort((a, b) => rank(a.el) - rank(b.el) || a.i - b.i).forEach(({ el }) => parent.appendChild(el));
}

// Gets (or creates, in schema order) a child property container such as pPr, rPr, tblPr.
function prEnsure(parent, name, order) {
    let el = wChild(parent, name);
    if (!el) { el = wEl(parent.ownerDocument, name); parent.appendChild(el); prSortChildren(parent, order); }
    return el;
}

function prSetChild(parent, name, attrs, order) {
    wChildren(parent, name).forEach(e => e.remove());
    if (attrs === null) return null;
    const el = wEl(parent.ownerDocument, name, attrs);
    parent.appendChild(el);
    prSortChildren(parent, order);
    return el;
}

// ── Paragraph properties ───────────────────────────────────────────────
const PR_PPR_MANAGED = ['pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'widowControl', 'spacing', 'ind', 'contextualSpacing', 'mirrorIndents', 'jc', 'textAlignment', 'shd', 'pBdr', 'tabs', 'outlineLvl'];

function prPPr(p) {
    let pPr = wChild(p, 'pPr');
    if (!pPr) { pPr = wEl(p.ownerDocument, 'pPr'); p.insertBefore(pPr, p.firstChild); }
    return pPr;
}

// Replaces the managed paragraph properties with `spec`; names listed in `keep` are left alone.
function prSetP(p, spec = {}, keep = []) {
    const pPr = prPPr(p);
    PR_PPR_MANAGED.forEach(n => { if (!keep.includes(n)) wChildren(pPr, n).forEach(e => e.remove()); });
    const doc = p.ownerDocument;
    const add = (name, attrs) => pPr.appendChild(wEl(doc, name, attrs));
    if (spec.style) add('pStyle', { val: spec.style });
    if (spec.keepNext) add('keepNext');
    if (spec.keepLines) add('keepLines');
    if (spec.pageBreakBefore) add('pageBreakBefore');
    if (spec.spacing) add('spacing', { before: spec.spacing.before ?? 0, after: spec.spacing.after ?? 0, line: spec.spacing.line ?? 480, lineRule: 'auto' });
    if (spec.ind) add('ind', spec.ind);
    if (spec.jc) add('jc', { val: spec.jc });
    prSortChildren(pPr, PR_PPR_ORDER);
    if (!pPr.children.length) pPr.remove();
}

function prGetJc(p) {
    const pPr = wChild(p, 'pPr');
    const jc = pPr && wChild(pPr, 'jc');
    return jc ? wAttr(jc, 'val') : '';
}

function prStyleId(p) {
    const pPr = wChild(p, 'pPr');
    const s = pPr && wChild(pPr, 'pStyle');
    return s ? wAttr(s, 'val') : '';
}

// ── Run properties ─────────────────────────────────────────────────────
function prRPr(r) {
    let rPr = wChild(r, 'rPr');
    if (!rPr) { rPr = wEl(r.ownerDocument, 'rPr'); r.insertBefore(rPr, r.firstChild); }
    return rPr;
}

// Removes font, size and colour overrides so the document styles (APA) decide. Bold/italic are kept
// unless `emphasis` is false. `keepSize` leaves readable sizes in tables and figure notes.
function prCleanRPr(rPr, { keepSize = false, emphasis = true } = {}) {
    if (!rPr) return;
    ['rFonts', 'color', 'caps', 'smallCaps', 'shd', 'spacing', 'w', 'kern', 'position', 'em', 'effect'].forEach(n => wChildren(rPr, n).forEach(e => e.remove()));
    const size = wChild(rPr, 'sz');
    if (!keepSize || !size || +wAttr(size, 'val') < 16 || +wAttr(size, 'val') > 28) ['sz', 'szCs'].forEach(n => wChildren(rPr, n).forEach(e => e.remove()));
    const style = wChild(rPr, 'rStyle');
    if (style && /(Char|Title|Heading\d?)$/i.test(wAttr(style, 'val'))) style.remove();
    if (!emphasis) ['b', 'bCs', 'i', 'iCs', 'u'].forEach(n => wChildren(rPr, n).forEach(e => e.remove()));
    if (!rPr.children.length && rPr.parentNode && rPr.parentNode.localName === 'r') rPr.remove();
}

function prRuns(p) {
    return wDescendants(p, 'r').filter(r => !prInsideTextbox(r, p));
}

function prInsideTextbox(node, root) {
    for (let n = node.parentNode; n && n !== root; n = n.parentNode) if (n.localName === 'txbxContent') return true;
    return false;
}

function prCleanParagraphRuns(p, opts) {
    prRuns(p).forEach(r => prCleanRPr(wChild(r, 'rPr'), opts));
    const markRPr = wChild(prPPr(p), 'rPr');
    if (markRPr) prCleanRPr(markRPr, { ...opts, emphasis: true });
    const pPr = wChild(p, 'pPr');
    if (pPr && !pPr.children.length) pPr.remove();
}

// value: true = add, false = remove (let the style decide), 'off' = explicitly turn off.
function prSetRunFmt(r, { bold, italic }) {
    const rPr = prRPr(r);
    const apply = (name, csName, value) => {
        if (value === undefined) return;
        wChildren(rPr, name).forEach(e => e.remove());
        wChildren(rPr, csName).forEach(e => e.remove());
        if (value === true) { rPr.appendChild(wEl(r.ownerDocument, name)); rPr.appendChild(wEl(r.ownerDocument, csName)); }
        if (value === 'off') { rPr.appendChild(wEl(r.ownerDocument, name, { val: 0 })); rPr.appendChild(wEl(r.ownerDocument, csName, { val: 0 })); }
    };
    apply('b', 'bCs', bold);
    apply('i', 'iCs', italic);
    prSortChildren(rPr, PR_RPR_ORDER);
    if (!rPr.children.length) rPr.remove();
}

function prSetParagraphRunFmt(p, fmt) {
    prRuns(p).forEach(r => { if (wChild(r, 't') || wChild(r, 'tab')) prSetRunFmt(r, fmt); });
}

function prRunIsItalic(r) {
    const rPr = wChild(r, 'rPr');
    return !!(rPr && isTruthyToggle(wChild(rPr, 'i')));
}
function prRunIsBold(r) {
    const rPr = wChild(r, 'rPr');
    return !!(rPr && isTruthyToggle(wChild(rPr, 'b')));
}

// Splits runs that mix text with other content so every text run holds exactly one <w:t>.
function prSplitRuns(p) {
    prRuns(p).forEach(r => {
        wChildren(r, 'lastRenderedPageBreak').forEach(e => e.remove());
        const rPr = wChild(r, 'rPr');
        const kids = [...r.children].filter(k => k !== rPr);
        if (kids.length < 2 || !kids.some(k => k.localName === 't')) return;
        let last = r;
        kids.slice(1).forEach(k => {
            const nr = r.cloneNode(false);
            if (rPr) nr.appendChild(rPr.cloneNode(true));
            nr.appendChild(k);
            last.after(nr);
            last = nr;
        });
    });
}

// ── Text segments and edits ────────────────────────────────────────────
function prSegments(p) {
    const segs = [];
    let off = 0;
    const push = (kind, node, text) => { segs.push({ kind, node, text, start: off }); off += text.length; };
    const walk = parent => {
        for (const c of parent.children) {
            if (c.namespaceURI !== W_NS) continue;
            switch (c.localName) {
                case 'r':
                    for (const k of c.children) {
                        if (k.namespaceURI !== W_NS) continue;
                        if (k.localName === 't') push('t', k, k.textContent);
                        else if (k.localName === 'tab') push('sep', k, '\t');
                        else if (k.localName === 'br' && wAttr(k, 'type') !== 'page' && wAttr(k, 'type') !== 'column') push('sep', k, '\n');
                        else if (k.localName === 'noBreakHyphen') push('sep', k, '-');
                    }
                    break;
                case 'hyperlink': case 'ins': case 'smartTag': case 'fldSimple': case 'sdt': case 'sdtContent': case 'moveTo':
                    walk(c);
                    break;
                default:
                    break;
            }
        }
    };
    walk(p);
    return segs;
}

const prText = p => prSegments(p).map(s => s.text).join('');

function prSetPreserve(t) {
    t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
}

// Replaces [start, end) of the paragraph text with `text`, keeping the formatting of the first run touched.
function prReplace(p, start, end, text) {
    const segs = prSegments(p);
    let wrote = false;
    for (const s of segs) {
        const s0 = s.start;
        const s1 = s.start + s.text.length;
        if (s.kind === 't') {
            const overlaps = s0 < end && s1 > start;
            const atPoint = start === end && s0 <= start && start <= s1;
            if (!overlaps && !atPoint) continue;
            const a = Math.max(start, s0) - s0;
            const b = Math.max(a, Math.min(end, s1) - s0);
            const val = s.node.textContent;
            s.node.textContent = val.slice(0, a) + (wrote ? '' : text) + val.slice(b);
            prSetPreserve(s.node);
            wrote = true;
            if (start === end) break;
        } else if (s0 >= start && s1 <= end && s1 > s0) {
            s.node.remove();
        }
    }
    return wrote;
}

// Applies bold/italic to [start, end), splitting runs at the edges.
function prFormatRange(p, start, end, fmt) {
    prSegments(p).filter(s => s.kind === 't').forEach(s => {
        const s0 = s.start;
        const s1 = s.start + s.text.length;
        if (!(s0 < end && s1 > start)) return;
        const r = s.node.parentNode;
        if (!r || r.localName !== 'r') return;
        const a = Math.max(start, s0) - s0;
        const b = Math.min(end, s1) - s0;
        const val = s.node.textContent;
        const pieces = [[val.slice(0, a), false], [val.slice(a, b), true], [val.slice(b), false]].filter(x => x[0] !== '');
        pieces.forEach(([text, hit]) => {
            const nr = r.cloneNode(true);
            const t = wChild(nr, 't');
            t.textContent = text;
            prSetPreserve(t);
            r.before(nr);
            if (hit) prSetRunFmt(nr, fmt);
        });
        r.remove();
    });
}

// Paragraph text with *asterisks* around italic runs (the format the reference engine understands).
function prMarkedText(p) {
    let out = '';
    let open = false;
    prSegments(p).forEach(s => {
        const r = s.kind === 't' ? s.node.parentNode : null;
        const italic = !!r && r.localName === 'r' && prRunIsItalic(r);
        const text = s.kind === 'sep' ? ' ' : s.text;
        if (italic && !open) { out += '*'; open = true; }
        if (!italic && open && text.trim()) { out += '*'; open = false; }
        out += text;
    });
    if (open) out += '*';
    return out.replace(/\*\s*\*/g, '').replace(/\s+/g, ' ').trim();
}

// Replaces all runs of a paragraph with new text, honouring *italic* markers.
function prSetMarkedText(p, marked) {
    const doc = p.ownerDocument;
    [...p.children].forEach(c => {
        if (c.localName === 'pPr' || c.localName === 'bookmarkStart' || c.localName === 'bookmarkEnd') return;
        c.remove();
    });
    marked.split('*').forEach((chunk, i) => {
        if (!chunk) return;
        const r = wEl(doc, 'r');
        if (i % 2 === 1) { const rPr = wEl(doc, 'rPr'); rPr.appendChild(wEl(doc, 'i')); rPr.appendChild(wEl(doc, 'iCs')); r.appendChild(rPr); }
        const t = wEl(doc, 't');
        t.textContent = chunk;
        prSetPreserve(t);
        r.appendChild(t);
        p.appendChild(r);
    });
}

function prNewParagraph(doc, text, fmt = {}) {
    const p = wEl(doc, 'p');
    const r = wEl(doc, 'r');
    const t = wEl(doc, 't');
    t.textContent = text;
    prSetPreserve(t);
    r.appendChild(t);
    p.appendChild(r);
    if (fmt.bold || fmt.italic) prSetRunFmt(r, fmt);
    return p;
}

// ── Styles part ────────────────────────────────────────────────────────
function prStyleById(stylesDoc, id) {
    return wDescendants(stylesDoc.documentElement, 'style').find(s => wAttr(s, 'styleId') === id) || null;
}

function prUpsertStyle(stylesDoc, id, xml) {
    const old = prStyleById(stylesDoc, id);
    const next = xmlFragment(stylesDoc, xml);
    if (old) old.replaceWith(next);
    else stylesDoc.documentElement.appendChild(next);
}
