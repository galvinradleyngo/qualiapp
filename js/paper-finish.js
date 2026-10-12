// Paper Reviewer engine, part 3: apply the changes the user approved, write the .docx package,
// and build the review report.

const PR_FINISH_STAGES = [
    { id: 'apply', label: 'Applying your approved changes', weight: 35 },
    { id: 'package', label: 'Writing styles, header and page numbers', weight: 30 },
    { id: 'zip', label: 'Packing the Word file', weight: 20 },
    { id: 'report', label: 'Writing the review report', weight: 15 }
];

function prAskFindings(s) { return s.findings.filter(f => f.tier === 'ask'); }

function prApplyApproved(s, approved) {
    const items = prAskFindings(s).flatMap(f => f.items.map(it => ({ ...it, finding: f }))).filter(it => approved.has(it.id));
    const byPara = new Map();
    items.forEach(it => (it.edits || []).forEach(e => {
        if (!byPara.has(e.p)) byPara.set(e.p, []);
        byPara.get(e.p).push(e);
    }));
    byPara.forEach((edits, p) => {
        edits.sort((a, b) => b.start - a.start || b.end - a.end).forEach(e => prReplace(p, e.start, e.end, e.text));
    });
    items.filter(it => it.run).sort((a, b) => (a.priority || 0) - (b.priority || 0)).forEach(it => it.run());
    return items;
}

function prRunningHead(s) {
    if (s.options.paperType !== 'professional') return '';
    const raw = (s.options.runningHead || s.options.titlePage.title || s.titleText || '').trim().toUpperCase();
    return raw.slice(0, 50);
}

function prAssemble(s) {
    const enc = new TextEncoder();
    const files = s.files;
    files.set('word/document.xml', enc.encode(serializeXml(s.doc)));
    files.set('word/styles.xml', enc.encode(serializeXml(s.styles)));
    if (s.settings) files.set('word/settings.xml', enc.encode(serializeXml(s.settings)));
    files.set('word/apaHeader1.xml', enc.encode(apaHeaderXml(prRunningHead(s))));

    const relsDoc = s.rels || parseXmlString(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`);
    const relRoot = relsDoc.documentElement;
    const addRel = (id, type, target) => {
        if ([...relRoot.children].some(r => r.getAttribute('Id') === id)) return;
        const r = relsDoc.createElementNS(relRoot.namespaceURI, 'Relationship');
        r.setAttribute('Id', id); r.setAttribute('Type', `${DOCX_REL}/${type}`); r.setAttribute('Target', target);
        relRoot.appendChild(r);
    };
    addRel('rIdApaHdr', 'header', 'apaHeader1.xml');
    if (s.newStyles && ![...relRoot.children].some(r => /\/styles$/.test(r.getAttribute('Type') || ''))) addRel('rIdApaStyles', 'styles', 'styles.xml');
    files.set('word/_rels/document.xml.rels', enc.encode(serializeXml(relsDoc)));

    const typesRoot = s.types.documentElement;
    const addOverride = (part, type) => {
        if ([...typesRoot.children].some(o => o.getAttribute('PartName') === part)) return;
        const o = s.types.createElementNS(typesRoot.namespaceURI, 'Override');
        o.setAttribute('PartName', part); o.setAttribute('ContentType', type);
        typesRoot.appendChild(o);
    };
    addOverride('/word/apaHeader1.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml');
    if (s.newStyles) addOverride('/word/styles.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml');
    files.set('[Content_Types].xml', enc.encode(serializeXml(s.types)));
    return writeDocxZip(files);
}

// ── Report ─────────────────────────────────────────────────────────────
function prReportParagraph(text, { bold = false, size = 22, indent = 0, after = 80, italic = false } = {}) {
    const run = `<w:r><w:rPr>${bold ? '<w:b/>' : ''}${italic ? '<w:i/>' : ''}<w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
    return `<w:p><w:pPr><w:spacing w:before="0" w:after="${after}" w:line="259" w:lineRule="auto"/>${indent ? `<w:ind w:left="${indent}" w:hanging="260"/>` : ''}</w:pPr>${run}</w:p>`;
}

function prBuildReport(s, summary, fileName) {
    const P = prReportParagraph;
    const body = [P('APA 7 Review Report', { bold: true, size: 32, after: 120 }), P(`${fileName} · ${new Date().toLocaleDateString()} · ${s.options.paperType === 'professional' ? 'Professional' : 'Student'} paper · ${s.options.font}`, { italic: true, after: 240 })];
    body.push(P('Fixed automatically (formatting only)', { bold: true, size: 26, after: 100 }));
    summary.auto.forEach(a => body.push(P(`• ${a.label}${a.count > 1 ? ` (${a.count})` : ''}`, { indent: 360 })));
    body.push(P(`Changes you approved (${summary.approved.length})`, { bold: true, size: 26, after: 100 }));
    if (!summary.approved.length) body.push(P('None.', { indent: 360 }));
    summary.approved.forEach(a => body.push(P(`• ${a.group}: ${a.label}${a.before ? ` — "${a.before}" → "${a.after}"` : ''}`, { indent: 360 })));
    body.push(P(`Changes you declined (${summary.declined.length})`, { bold: true, size: 26, after: 100 }));
    if (!summary.declined.length) body.push(P('None.', { indent: 360 }));
    summary.declined.forEach(a => body.push(P(`• ${a.group}: ${a.label}${a.before ? ` — "${a.before}"` : ''}`, { indent: 360 })));
    body.push(P(`Needs your attention (${summary.manual.length})`, { bold: true, size: 26, after: 100 }));
    if (!summary.manual.length) body.push(P('Nothing flagged.', { indent: 360 }));
    summary.manual.forEach(m => {
        body.push(P(`• ${m.group}: ${m.title}`, { indent: 360, bold: true, after: 20 }));
        body.push(P(m.detail, { indent: 360, after: 40 }));
        (m.items || []).slice(0, 40).forEach(it => body.push(P(`– ${it.label}`, { indent: 720, after: 20, size: 20 })));
    });
    body.push(P('This review checks formatting and common APA 7 patterns. It does not judge writing quality, bias-free language, source accuracy or whether your citations support your claims. Read the final document once in Word before submitting.', { italic: true, size: 20, after: 0 }));
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="${W_NS}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`;
    return buildDocxPackage({ bodyXml: body.join(''), stylesXml: styles });
}

function prSummary(s, approvedItems, approved) {
    const asks = prAskFindings(s);
    const declined = [];
    asks.forEach(f => f.items.filter(it => !approved.has(it.id)).forEach(it => declined.push({ group: f.group, label: it.label, before: it.before })));
    return {
        auto: [...s.auto.values()],
        approved: approvedItems.map(it => ({ group: it.finding.group, label: it.label, before: it.before, after: it.after })),
        declined,
        manual: s.findings.filter(f => f.tier === 'manual'),
        stats: s.stats
    };
}

async function prFinish(s, approvedIds, fileName, progress = () => {}) {
    const approved = new Set(approvedIds);
    const total = PR_FINISH_STAGES.reduce((n, x) => n + x.weight, 0);
    let done = 0;
    const stage = async (id, fn) => {
        const st = PR_FINISH_STAGES.find(x => x.id === id);
        progress({ id, label: st.label, pct: Math.round(done / total * 100), state: 'start' });
        await nextFrame(30);
        const out = await fn();
        done += st.weight;
        progress({ id, label: st.label, pct: Math.round(done / total * 100), state: 'done' });
        await nextFrame(200);
        return out;
    };
    let items = [];
    await stage('apply', async () => { items = prApplyApproved(s, approved); });
    const summary = prSummary(s, items, approved);
    await stage('package', async () => { s.runningHeadText = prRunningHead(s); });
    const docx = await stage('zip', async () => prAssemble(s));
    const report = await stage('report', async () => prBuildReport(s, summary, fileName));
    progress({ id: 'done', label: 'Your reformatted paper is ready', pct: 100, state: 'done' });
    return { docx, report, summary };
}
