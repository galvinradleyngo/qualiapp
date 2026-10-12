// Paper Reviewer engine, part 2: everything that could change wording or structure. These become
// questions (tier 'ask', each item needs the user's approval) or notes (tier 'manual', nothing is changed).

let prItemCounter = 0;
const prItemId = prefix => `${prefix}-${++prItemCounter}`;

function prSnippet(text, start, end, replacement) {
    const a = Math.max(0, start - 28), b = Math.min(text.length, end + 28);
    const clip = t => t.replace(/\s+/g, ' ');
    return {
        before: (a > 0 ? '…' : '') + clip(text.slice(a, start)) + '[' + clip(text.slice(start, end)) + ']' + clip(text.slice(end, b)) + (b < text.length ? '…' : ''),
        after: (a > 0 ? '…' : '') + clip(text.slice(a, start)) + '[' + replacement + ']' + clip(text.slice(end, b)) + (b < text.length ? '…' : '')
    };
}

const prBodyInfos = s => s.list.filter(x => x.kind === 'p' && ['body', 'abstract', 'blockQuote', 'list', 'keywords'].includes(x.role));
const prCanEdit = x => !x.hasRevisions && !x.hasCiteField;

function prFormatHeading(s, info, level) {
    info.role = 'heading';
    info.headingLevel = level;
    prSetP(info.el, { style: 'Heading' + level });
    prCleanParagraphRuns(info.el, { emphasis: false });
}

// ── Title page, abstract, first page of text ───────────────────────────
function prFindFrontMatterIssues(s) {
    const o = s.options;
    const L = s.list;
    const abs = L.filter(x => x.role === 'abstract');
    const words = abs.reduce((n, x) => n + x.words, 0);
    if (words > 250) s.addFinding({ id: 'abstract-length', tier: 'manual', group: 'Title page and abstract', title: `Abstract is ${words} words`, detail: 'APA recommends 250 words or fewer. Shorten it yourself; the reviewer will not cut your wording.' });
    if (!s.hasAbstract) s.addFinding({ id: 'no-abstract', tier: 'manual', group: 'Title page and abstract', title: 'No abstract found', detail: 'Professional papers and many course papers need an abstract. If yours should have one, add it under a centered, bold "Abstract" heading and review again.' });

    if (s.hasTitlePage) {
        const text = s.titleInfos.map(x => x.text).join(' | ');
        const missing = [];
        if (!/(University|College|School|Institute|Department|Academy|Universidad|Faculty)/i.test(text)) missing.push('affiliation (department and university)');
        if (o.paperType === 'student') {
            if (!/\b[A-Z]{2,5}\s?-?\d{3,4}\b/.test(text)) missing.push('course number and name');
            if (!/\b(Prof|Professor|Dr\.?|Instructor|Mr\.|Ms\.|Mrs\.)/i.test(text)) missing.push('instructor name');
            if (!/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4}|\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}/i.test(text)) missing.push('due date');
        }
        if (missing.length) s.addFinding({ id: 'titlepage-missing', tier: 'manual', group: 'Title page and abstract', title: 'Title page may be missing: ' + missing.join(', '), detail: `Found: ${s.titleInfos.length} lines (${text.slice(0, 160)}). The student title page needs title, author, affiliation, course, instructor and due date, in that order. Add what is missing and review again.` });
        if (!L.some(x => x.role === 'bodyTitle') && s.firstBodyInfo && s.firstBodyInfo.role !== 'bodyTitle') {
            const first = s.firstBodyInfo;
            s.addFinding({
                id: 'body-title', tier: 'ask', group: 'Title page and abstract', title: 'Repeat the paper title at the top of the first page of text',
                detail: 'APA puts the title again (centered, bold) above the first paragraph of the text.',
                items: [{
                    id: prItemId('bodytitle'), label: 'Add the title above the first page of text', before: '(no title on the first page of text)', after: s.titleText, priority: 5,
                    run: () => {
                        const t = prNewParagraph(s.doc, s.titleText, { bold: true });
                        const wasBreak = wChild(prPPr(first.el), 'pageBreakBefore');
                        first.el.before(t);
                        prSetP(t, { style: 'ApaTitlePage', keepNext: true, pageBreakBefore: !!wasBreak || s.forceBreak.has(first.el) });
                        if (wasBreak) wasBreak.remove();
                        s.infos.set(t, { el: t, kind: 'p', role: 'bodyTitle', text: s.titleText, words: s.titleText.split(' ').length });
                    }
                }]
            });
        }
    } else {
        const tp = o.titlePage;
        if (tp.title.trim()) {
            const lines = o.paperType === 'professional'
                ? [tp.title, tp.author, tp.affiliation]
                : [tp.title, tp.author, tp.affiliation, tp.course, tp.instructor, tp.date];
            const used = lines.filter(x => x && x.trim());
            s.addFinding({
                id: 'insert-titlepage', tier: 'ask', group: 'Title page and abstract', title: 'Add a title page from the details you entered',
                detail: 'No title page was found in the document. This adds the lines you typed in the options form as a new first page.',
                items: [{
                    id: prItemId('titlepage'), label: 'Insert title page', before: '(no title page)', after: used.join('  /  '), priority: 6,
                    run: () => {
                        const firstBlock = s.body.firstElementChild;
                        used.forEach((line, i) => {
                            const p = prNewParagraph(s.doc, line.trim(), { bold: i === 0 });
                            prSetP(p, i === 0 ? { style: 'ApaTitlePage', spacing: { before: 1440, after: 480, line: 480 } } : { style: 'ApaTitlePage' });
                            s.body.insertBefore(p, firstBlock);
                        });
                        if (firstBlock && firstBlock.localName === 'p') prAddFlag(firstBlock, 'pageBreakBefore');
                    }
                }]
            });
        } else {
            s.addFinding({ id: 'no-titlepage', tier: 'manual', group: 'Title page and abstract', title: 'No title page found', detail: `Type your title, author, affiliation${o.paperType === 'student' ? ', course, instructor and due date' : ''} in "Title page details" on the first screen and run the review again to have one added (you will be asked first).` });
        }
    }
}

// ── Headings ───────────────────────────────────────────────────────────
function prFindHeadingIssues(s) {
    const L = s.list;
    // Title case for headings.
    const caseItems = [];
    L.filter(x => x.role === 'heading' || x.role === 'bodyTitle').forEach(x => {
        if (!prCanEdit(x)) return;
        if (x.role === 'bodyTitle') x.headingLevel = 1;
        let text = prText(x.el).trim();
        let base = text;
        if (x.headingLevel <= 3) base = base.replace(/[.]+$/, '');
        const source = base === base.toUpperCase() && /[A-Z]{4,}/.test(base) ? base.toLowerCase() : base;
        let next = toTitleCase(source);
        if (x.headingLevel >= 4 && !/\.$/.test(next)) next += '.';
        if (next !== text) caseItems.push({ id: prItemId('hcase'), label: x.role === 'bodyTitle' ? 'Paper title' : `Level ${x.headingLevel} heading`, before: text, after: next, edits: [{ p: x.el, start: 0, end: prText(x.el).length, text: next }] });
    });
    if (caseItems.length) s.addFinding({ id: 'heading-case', tier: 'ask', group: 'Headings', title: 'Headings not in APA title case', detail: 'APA headings use title case (levels 1 to 5), and levels 4 and 5 end with a period. Check acronyms and names after applying.', items: caseItems });

    // Rename the reference list heading.
    const rh = L.find(x => x.role === 'refHeading');
    if (rh && rh.text.replace(/[:.]$/, '') !== 'References' && prCanEdit(rh)) {
        s.addFinding({ id: 'ref-heading', tier: 'ask', group: 'References', title: 'Rename the reference list heading to "References"', detail: 'APA 7 calls the list "References", not "Bibliography" or "Works Cited".', items: [{ id: prItemId('refhead'), label: 'Heading text', before: rh.text, after: 'References', edits: [{ p: rh.el, start: 0, end: prText(rh.el).length, text: 'References' }] }] });
    }

    // Plain paragraphs that look like headings.
    if (s.headingCandidates.length) {
        s.addFinding({
            id: 'heading-candidates', tier: 'ask', group: 'Headings', title: 'Lines that look like headings but are not set up as headings',
            detail: 'These short bold, centered or italic lines would get the APA heading style for the level shown (level 1 centered bold, level 2 left bold, level 3 left bold italic). Approve only the ones that really are headings.',
            items: s.headingCandidates.map(c => {
                const raw = prText(c.info.el).trim();
                const cased = toTitleCase(raw === raw.toUpperCase() && /[A-Z]{3,}/.test(raw) ? raw.toLowerCase() : raw);
                const edits = cased !== raw && prCanEdit(c.info) ? [{ p: c.info.el, start: 0, end: prText(c.info.el).length, text: cased }] : [];
                return { id: prItemId('hcand'), label: `Make Level ${c.level} heading${edits.length ? ' (and use title case)' : ''}`, before: c.info.text, after: `Level ${c.level}: ${edits.length ? cased : c.info.text}`, priority: 4, edits, run: () => prFormatHeading(s, c.info, c.level) };
            })
        });
    }

    // Structure notes.
    const heads = L.filter(x => x.role === 'heading' || x.role === 'refHeading' || x.role === 'abstractHeading');
    let prev = 0;
    for (const h of heads.filter(x => x.role === 'heading')) {
        if (prev && h.headingLevel > prev + 1) { s.addFinding({ id: 'heading-skip', tier: 'manual', group: 'Headings', title: `Heading level skipped before "${h.text.slice(0, 50)}"`, detail: `Level ${prev} is followed by Level ${h.headingLevel}. APA levels must nest in order.` }); break; }
        prev = h.headingLevel;
    }
    if (L.some(x => x.role === 'heading' && /^introduction$/i.test(x.text))) s.addFinding({ id: 'intro-label', tier: 'manual', group: 'Headings', title: 'An "Introduction" heading is used', detail: 'APA does not label the introduction; the paper title at the top of page one serves as its heading. Consider removing the heading.' });
    const levels = {};
    let parentKey = '';
    heads.filter(x => x.role === 'heading').forEach(h => {
        if (h.headingLevel === 1) { parentKey = h.text; levels[parentKey] = { l2: 0 }; }
        else if (h.headingLevel === 2 && levels[parentKey]) levels[parentKey].l2++;
    });
    Object.entries(levels).forEach(([k, v]) => { if (v.l2 === 1) s.addFinding({ id: 'single-sub', tier: 'manual', group: 'Headings', title: `Only one subheading under "${k.slice(0, 40)}"`, detail: 'APA asks for at least two subsections at any level, or none.' }); });
}

// ── Tables and figures ─────────────────────────────────────────────────
const PR_MENTION = /\b(Tables?|Figures?)\s+(\d+(?:\s*(?:,|and|&|–|-|through)\s*\d+)*)/g;

function prFindTableFigureIssues(s) {
    const L = s.list;
    ['Table', 'Figure'].forEach(kind => {
        const caps = s.captions.filter(c => c.kind === kind && /^\d+$/.test(c.num));
        const ordered = caps.map(c => ({ c, pos: L.indexOf(c.labelInfo) })).sort((a, b) => a.pos - b.pos).map(x => x.c);
        const seen = new Map();
        ordered.forEach(c => seen.set(c.num, (seen.get(c.num) || 0) + 1));
        const dup = [...seen].filter(([, n]) => n > 1).map(([k]) => k);
        if (dup.length) { s.addFinding({ id: `${kind}-dup`, tier: 'manual', group: 'Tables and figures', title: `${kind} number ${dup.join(', ')} is used more than once`, detail: 'Renumbering is skipped for duplicated numbers because the in-text mentions would be ambiguous. Fix the duplicates by hand.' }); return; }
        const map = new Map();
        ordered.forEach((c, i) => map.set(c.num, String(i + 1)));
        const changes = ordered.filter(c => map.get(c.num) !== c.num);
        if (changes.length) {
            const mentions = [];
            s.list.filter(x => x.kind === 'p' && ['body', 'abstract', 'blockQuote', 'list', 'tableNote'].includes(x.role) && prCanEdit(x)).forEach(x => {
                const text = prText(x.el);
                let m;
                const re = new RegExp(PR_MENTION.source, 'g');
                while ((m = re.exec(text))) {
                    if (m[1].replace(/s$/, '') !== kind) continue;
                    const base = m.index + m[0].length - m[2].length;
                    const nre = /\d+/g;
                    let n;
                    while ((n = nre.exec(m[2]))) mentions.push({ p: x.el, num: n[0], start: base + n.index, end: base + n.index + n[0].length, ctx: text });
                }
            });
            const items = changes.map(c => {
                const labelText = prText(c.label);
                const ds = labelText.search(/\d/);
                const to = map.get(c.num);
                const mine = mentions.filter(m => m.num === c.num);
                const edits = [{ p: c.label, start: ds, end: ds + c.num.length, text: to }, ...mine.map(m => ({ p: m.p, start: m.start, end: m.end, text: to }))];
                return { id: prItemId('num'), label: `${kind} ${c.num} → ${kind} ${to} (caption and ${mine.length} mention${mine.length === 1 ? '' : 's'} in the text)`, before: `${kind} ${c.num}`, after: `${kind} ${to}`, edits };
            });
            s.addFinding({ id: `${kind}-numbering`, tier: 'ask', group: 'Tables and figures', title: `${kind}s are not numbered 1, 2, 3 in order of appearance`, detail: `APA numbers ${kind.toLowerCase()}s in the order they appear. Each fix renumbers the caption and every mention in the text so they stay matched.`, items });
        }
        // Mentions and dangling references.
        const bodyText = prBodyInfos(s).map(x => prText(x.el)).join('\n');
        ordered.forEach(c => {
            const re = new RegExp(`\\b${kind}s?\\s+(?:[\\d,\\s&\\u2013-]|and|through)*\\b${c.num}\\b`);
            if (!re.test(bodyText)) s.addFinding({ id: `${kind}-unmentioned-${c.num}`, tier: 'manual', group: 'Tables and figures', title: `${kind} ${c.num} is never mentioned in the text`, detail: `APA asks you to refer to every ${kind.toLowerCase()} in the text (for example, "as shown in ${kind} ${c.num}").` });
        });
        const re = new RegExp(`\\b${kind}s?\\s+(\\d+)`, 'g');
        const have = new Set(ordered.map(c => c.num));
        const missing = new Set();
        let m;
        while ((m = re.exec(bodyText))) if (!have.has(m[1])) missing.add(m[1]);
        if (missing.size && ordered.length) s.addFinding({ id: `${kind}-dangling`, tier: 'manual', group: 'Tables and figures', title: `The text mentions ${kind} ${[...missing].join(', ')} but no caption with that number was found`, detail: 'Check the number, or add the missing caption.' });
    });

    // Title case for caption titles.
    const items = [];
    s.captions.forEach(c => {
        const t = c.titleInfo;
        if (!t || t === c.labelInfo || !prCanEdit(t)) return;
        const text = prText(t.el).trim();
        const next = toTitleCase(text === text.toUpperCase() ? text.toLowerCase() : text.replace(/[.]$/, ''));
        if (next !== text) items.push({ id: prItemId('ccase'), label: `${c.kind} ${c.num} title`, before: text, after: next, edits: [{ p: t.el, start: 0, end: prText(t.el).length, text: next }] });
    });
    if (items.length) s.addFinding({ id: 'caption-case', tier: 'ask', group: 'Tables and figures', title: 'Table and figure titles not in title case', detail: 'APA table and figure titles are italic title case.', items });

    // Tables without captions, figures without alt text.
    const tables = L.filter(x => x.kind === 'tbl');
    const captioned = new Set(s.captions.map(c => c.target && c.target.el));
    tables.forEach((t, i) => { if (!captioned.has(t.el)) s.addFinding({ id: 'table-nocap-' + i, tier: 'manual', group: 'Tables and figures', title: 'A table has no "Table N" caption above it', detail: 'Add a bold "Table N" line and an italic title line above the table.' }); });
    const noAlt = wDescendants(s.body, 'drawing').flatMap(d => [...d.getElementsByTagNameNS(WP_NS, 'docPr')]).filter(e => !(e.getAttribute('descr') || '').trim());
    if (noAlt.length) s.addFinding({ id: 'alt-text', tier: 'manual', group: 'Tables and figures', title: `${noAlt.length} image${noAlt.length === 1 ? ' has' : 's have'} no alternative text`, detail: 'APA 7 asks for accessible figures. In Word: right-click the image > View Alt Text, and describe what it shows.' });
}

// ── In-text citations ──────────────────────────────────────────────────
const PR_NOT_NAMES = /^(In|Since|During|By|From|After|Before|Until|Around|Circa|January|February|March|April|May|June|July|August|September|October|November|December|Table|Figure|Chapter|Section|Study|Phase|Wave|Fall|Spring|Summer|Winter|Version|Appendix|Experiment|Year|Grade|Age)\b/;
const PR_ORG = /\b(Association|Institute|University|Organization|Department|Council|Center|Centre|Society|Inc|Ltd|Agency|Foundation|Services|Administration|Bureau|Commission|Committee|Ministry|Office|College|Board|Group|Company|Corporation)\b/;
const PR_YEAR = '(?:1[5-9]\\d\\d|20\\d\\d)[a-z]?';

function prFindCitationIssues(s) {
    const items = { comma: [], amp: [], etal: [], etalForm: [], page: [], narrAmp: [], narrEtal: [] };
    const quoteNoPage = [];
    const personal = tok => /^[A-Z][\p{L}'’\-]+(?:\s+[A-Z][\p{L}'’\-]+)?$/u.test(tok.trim()) && !PR_ORG.test(tok);
    const push = (bucket, x, text, start, end, repl, label) => {
        const sn = prSnippet(text, start, end, repl);
        items[bucket].push({ id: prItemId('cite'), label, before: sn.before, after: sn.after, edits: [{ p: x.el, start, end, text: repl }] });
    };
    prBodyInfos(s).concat(s.list.filter(x => x.role === 'tableNote')).forEach(x => {
        if (!prCanEdit(x)) { if (x.hasCiteField) s.citeFieldSkipped = true; return; }
        const text = prText(x.el);
        let m;
        const paren = /\(([^()]{3,300})\)/g;
        while ((m = paren.exec(text))) {
            let off = m.index + 1;
            m[1].split(';').forEach(part => {
                const partStart = off;
                off += part.length + 1;
                const lead = (part.match(/^\s*(?:see also|see|e\.g\.,?|cf\.|but see|also|for example|i\.e\.,?)\s+/i) || [''])[0].length;
                const body = part.slice(lead);
                const mm = body.match(new RegExp(`^([A-Z][^0-9()]*?)(,?)(\\s+)(${PR_YEAR}|n\\.d\\.)(.*)$`, 's'));
                if (!mm || PR_NOT_NAMES.test(mm[1]) || mm[1].split(/\s+/).length > 14 || !/^[A-Z][\p{L}.'’\-&, ]*$/u.test(mm[1])) return;
                const names = mm[1];
                const nStart = partStart + lead;
                const nEnd = nStart + names.length;
                if (mm[2] === '' && /[\p{L}.]$/u.test(names)) push('comma', x, text, nEnd, nEnd, ',', 'Add a comma before the year');
                const tokens = names.split(/\s*,\s*(?:&\s*|and\s+)?|\s+(?:&|and)\s+/).filter(Boolean);
                if (!/et\s*\.?\s*al/i.test(names) && tokens.length >= 3 && tokens.every(personal)) {
                    push('etal', x, text, nStart, nEnd, `${tokens[0]} et al.`, 'Three or more authors: use et al.');
                } else if (/\sand\s/.test(names) && tokens.length <= 2 && tokens.every(personal)) {
                    const i = names.indexOf(' and ');
                    push('amp', x, text, nStart + i + 1, nStart + i + 4, '&', 'Use & inside parentheses');
                }
                const pg = mm[5].match(/\bpp?\.(?=\d)/);
                if (pg) { const at = nEnd + (body.length - names.length - mm[5].length) + mm[2].length + mm[3].length + mm[4].length + pg.index; push('page', x, text, at + pg[0].length, at + pg[0].length, ' ', 'Add a space after "p."'); }
                const range = mm[5].match(/(pp?\.\s*\d+)(-)(\d+)/);
                if (range) { const at = nStart + (body.length - mm[5].length) + range.index + range[1].length; push('page', x, text, at, at + 1, '–', 'Use an en dash in a page range'); }
            });
        }
        const narrAmp = /([A-Z][\p{L}'’\-]+)(\s*&\s*)([A-Z][\p{L}'’\-]+)(?=\s*(?:['’]s)?\s*\(\s*(?:1[5-9]\d\d|20\d\d))/gu;
        while ((m = narrAmp.exec(text))) push('narrAmp', x, text, m.index + m[1].length, m.index + m[1].length + m[2].length, ' and ', 'In running text use "and", not "&"');
        const narrEtal = /([A-Z][\p{L}'’\-]+)((?:,\s+[A-Z][\p{L}'’\-]+)+),?\s+(?:&|and)\s+[A-Z][\p{L}'’\-]+(?=\s*(?:['’]s)?\s*\(\s*(?:1[5-9]\d\d|20\d\d))/gu;
        while ((m = narrEtal.exec(text))) push('narrEtal', x, text, m.index, m.index + m[0].length, `${m[1]} et al.`, 'Three or more authors: use et al.');
        const etal = /\bet\.? ?al(?:\.|\b)/gi;
        while ((m = etal.exec(text))) if (m[0] !== 'et al.') push('etalForm', x, text, m.index, m.index + m[0].length, 'et al.', 'Write "et al." with a period after "al"');
        const quote = /[“"]([^”"]{25,})[”"]\s*\(([^)]*)\)/g;
        while ((m = quote.exec(text))) if (new RegExp(PR_YEAR).test(m[2]) && !/\bpp?\.|para\.|¶/.test(m[2])) quoteNoPage.push(`"${m[1].slice(0, 50)}…" ${'(' + m[2] + ')'}`);
    });
    const groups = [
        ['comma', 'Missing comma between author and year', 'APA parenthetical citations read (Author, Year).'],
        ['amp', 'Use & instead of "and" inside parentheses', 'In parentheses APA joins two authors with an ampersand: (Smith & Lee, 2020).'],
        ['narrAmp', 'Use "and" instead of & in running text', 'In the sentence itself write "Smith and Lee (2020)".'],
        ['etal', 'Three or more authors should be shortened to et al.', 'Since APA 7, cite three or more authors as (Smith et al., 2020) from the first citation. Check that the reference list still names every author.'],
        ['narrEtal', 'Three or more authors in running text', 'Shorten to the first author plus et al.'],
        ['etalForm', '"et al." written incorrectly', 'APA writes "et al." with a period and no comma before it.'],
        ['page', 'Page number formatting in citations', 'Write "p. 15" and "pp. 15–20" with a space and an en dash.']
    ];
    groups.forEach(([key, title, detail]) => { if (items[key].length) s.addFinding({ id: 'cite-' + key, tier: 'ask', group: 'In-text citations', title, detail, items: items[key] }); });
    if (quoteNoPage.length) s.addFinding({ id: 'quote-page', tier: 'manual', group: 'In-text citations', title: `${quoteNoPage.length} direct quotation${quoteNoPage.length === 1 ? '' : 's'} may need a page or paragraph number`, detail: 'APA requires a page (p. 15) or paragraph (para. 4) number for direct quotes.', items: quoteNoPage.map(q => ({ id: prItemId('q'), label: q })) });
    if (s.citeFieldSkipped) s.addFinding({ id: 'cite-fields', tier: 'manual', group: 'In-text citations', title: 'Citations managed by Zotero, Mendeley or EndNote were left alone', detail: 'Paragraphs with reference-manager fields are not edited here. Set the citation style to APA 7 in your reference manager and refresh.' });

    // Block quotes: long quotations should be indented without quotation marks.
    const bq = [];
    s.list.filter(x => x.role === 'body' && x.words >= 40 && prCanEdit(x)).forEach(x => {
        const text = prText(x.el).trim();
        const open = /^[“"]/.test(text);
        const closeIdx = Math.max(text.lastIndexOf('”'), text.lastIndexOf('"'));
        const quoteMarks = (text.match(/[“”"]/g) || []).length;
        if (open && closeIdx > text.length - 140 && closeIdx > 0 && quoteMarks === 2) {
            const raw = prText(x.el);
            const lead = raw.length - raw.trimStart().length;
            bq.push({ id: prItemId('bq'), label: `${x.words}-word quotation`, before: text.slice(0, 70) + '…', after: 'Indented block, no quotation marks: ' + text.slice(1, 70) + '…', priority: 3, edits: [{ p: x.el, start: raw.lastIndexOf(text[closeIdx]), end: raw.lastIndexOf(text[closeIdx]) + 1, text: '' }, { p: x.el, start: lead, end: lead + 1, text: '' }], run: () => { prSetP(x.el, { style: 'ApaBlockQuote' }); x.role = 'blockQuote'; } });
        }
    });
    if (bq.length) s.addFinding({ id: 'block-quotes', tier: 'ask', group: 'In-text citations', title: 'Quotations of 40+ words should be block quotes', detail: 'APA sets quotations of 40 or more words as an indented block with no quotation marks. After applying, check that the citation sits after the final period.', items: bq });

    // Citations vs reference list.
    const refs = s.list.filter(x => x.role === 'reference');
    if (refs.length) {
        const body = prBodyInfos(s).map(x => prText(x.el)).join('\n');
        const entries = refs.map(r => stripItalicMarkers(prText(r.el)).replace(/\s+/g, ' ').trim()).map(entry => ({ entry, author: referenceAuthorBlock(entry), year: (entry.match(/\((\d{4}[a-z]?|n\.d\.(?:-[a-z])?)/i) || [])[1] || '' }));
        const seen = new Set();
        const cites = extractInTextCitations(body).filter(c => { const k = `${c.name.toLowerCase()}|${c.year}`; if (seen.has(k)) return false; seen.add(k); return true; });
        const missing = cites.filter(c => !entries.some(r => citationMatchesReference(c, r)));
        const uncited = entries.filter(r => !cites.some(c => citationMatchesReference(c, r)));
        if (missing.length) s.addFinding({ id: 'cited-missing', tier: 'manual', group: 'References', title: `${missing.length} citation${missing.length === 1 ? '' : 's'} not found in the reference list`, detail: 'Add the missing references, or fix the spelling or year in the citation. Group-author abbreviations and secondary citations are not matched automatically.', items: missing.map(c => ({ id: prItemId('m'), label: `${c.name}, ${c.year}` })) });
        if (uncited.length) s.addFinding({ id: 'uncited', tier: 'manual', group: 'References', title: `${uncited.length} reference${uncited.length === 1 ? ' is' : 's are'} never cited in the text`, detail: 'APA reference lists include only works cited in the paper. Cite them or remove them.', items: uncited.map(r => ({ id: prItemId('u'), label: r.entry.slice(0, 120) })) });
    }
}

// ── Reference list ─────────────────────────────────────────────────────
function prFindReferenceIssues(s) {
    const refs = s.list.filter(x => x.role === 'reference');
    if (!refs.length) {
        if (!s.hasRefs) s.addFinding({ id: 'no-refs', tier: 'manual', group: 'References', title: 'No reference list found', detail: 'No "References" heading was found. If the paper cites sources, add a reference list on its own page.' });
        return;
    }
    const items = [];
    const afters = [];
    const notes = [];
    refs.forEach(r => {
        const before = prMarkedText(r.el);
        if (!prCanEdit(r)) { afters.push(before); return; }
        const res = applyBibliographyAutoFix(before, { rebuild: true });
        const after = res.fixed;
        afters.push(after);
        if (after !== before.replace(/^\s*(?:\d+[.)]\s+|[-*•]\s+)/, '')) {
            items.push({ id: prItemId('ref'), label: before.replace(/\*/g, '').slice(0, 60) + '…', before, after, priority: 1, run: () => prSetMarkedText(r.el, after) });
        }
        analyzeReferenceIssues(after).filter(i => !/No DOI\/URL|Could not clearly detect|Could not validate/.test(i)).forEach(i => notes.push({ id: prItemId('rn'), label: `${stripItalicMarkers(after).slice(0, 70)}… — ${i}` }));
    });
    if (items.length) s.addFinding({ id: 'ref-rebuild', tier: 'ask', group: 'References', title: `${items.length} reference${items.length === 1 ? '' : 's'} can be corrected`, detail: 'Fixes punctuation, initials, DOI format, en dashes and italics (*asterisks* show italic text below). Entries that cannot be read with confidence are left as written.', items });
    const sorted = sortBibliographyEntries(afters);
    if (sorted.some((t, i) => t !== afters[i])) {
        s.addFinding({
            id: 'ref-order', tier: 'ask', group: 'References', title: 'Reference list is not in alphabetical order', detail: 'APA orders entries alphabetically by the first author\'s surname, then by year.',
            items: [{
                id: prItemId('order'), label: `Reorder ${refs.length} references`, before: afters.slice(0, 3).map(stripItalicMarkers).map(t => t.slice(0, 40)).join(' / ') + '…', after: sorted.slice(0, 3).map(stripItalicMarkers).map(t => t.slice(0, 40)).join(' / ') + '…', priority: 9,
                run: () => {
                    const els = refs.map(r => r.el);
                    const texts = els.map(prMarkedText);
                    const order = sortBibliographyEntries(texts).map(t => texts.indexOf(t));
                    const anchor = els[els.length - 1].nextSibling;
                    const parent = els[0].parentNode;
                    const used = new Set();
                    order.forEach(i => { let k = i; while (used.has(k)) k = texts.indexOf(texts[i], k + 1); used.add(k); parent.insertBefore(els[k], anchor); });
                }
            }]
        });
    }
    if (assignYearSuffixes(sorted).notes.length) s.addFinding({ id: 'ref-suffix', tier: 'manual', group: 'References', title: 'Same author and year: add a, b, c to the years', detail: 'Several works by the same author(s) share a year. Add 2020a, 2020b, and update the in-text citations to match.' });
    if (notes.length) s.addFinding({ id: 'ref-notes', tier: 'manual', group: 'References', title: `${notes.length} reference problem${notes.length === 1 ? '' : 's'} to check by hand`, detail: 'The automatic checks could not safely fix these (author format, date, title capitalization).', items: notes });
}

function prFindPaginationIssues(s) {
    const total = s.list.filter(x => x.kind === 'p' && x.role !== 'blank').length;
    s.stats = {
        paragraphs: total,
        words: s.list.filter(x => x.kind === 'p').reduce((n, x) => n + (x.words || 0), 0),
        tables: s.list.filter(x => x.kind === 'tbl').length,
        figures: s.captions.filter(c => c.kind === 'Figure').length,
        references: s.list.filter(x => x.role === 'reference').length,
        headings: s.list.filter(x => x.role === 'heading').length
    };
    s.log('pagination', 'Set page breaks before the abstract, first page of text, references and appendices; kept headings and captions with the text that follows', 1);
    const sections = wDescendants(s.body, 'sectPr').length;
    if (sections > 1) s.addFinding({ id: 'sections', tier: 'manual', group: 'Document', title: `The document has ${sections} sections`, detail: 'Page size, margins and the page-number header were applied to every section. Landscape pages were kept landscape.' });
}
