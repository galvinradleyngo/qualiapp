// Copy and export: clipboard helpers, Word (.doc) export and native .docx writer.

// Custom Rich-Text Clipboard Copier
function copyFormattedContent() {
    if (currentMode === 'toc') { copyTocContent(); return; }
    if (currentMode === 'citation') {
        const refEl = document.getElementById('prev-citation-reference');
        if (!refEl) {
            showToast('No citation generated yet.');
            return;
        }

        const plainText = (currentCitationPlain || refEl.innerText || '').trim();
        if (!plainText) {
            showToast('No citation generated yet.');
            return;
        }

        // Rich HTML representation with APA 7 hanging indent and Times New Roman
        const htmlText = `<p style="font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 2; margin: 0; padding-left: 0.5in; text-indent: -0.5in;">${refEl.innerHTML}</p>`;

        if (navigator.clipboard && window.ClipboardItem) {
            const blobHtml = new Blob([htmlText], { type: 'text/html' });
            const blobText = new Blob([plainText], { type: 'text/plain' });
            const item = new ClipboardItem({
                'text/html': blobHtml,
                'text/plain': blobText
            });

            navigator.clipboard.write([item]).then(() => {
                showToast('APA citation copied!');
            }).catch(() => {
                fallbackCopyCitation(refEl, plainText);
            });
        } else {
            fallbackCopyCitation(refEl, plainText);
        }
        return;
    }

    const range = document.createRange();
    const target = currentMode === 'table'
        ? document.getElementById('table-export-container')
        : document.getElementById('bibliography-export-container');

    range.selectNode(target);
    
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            const msg = currentMode === 'table' ? 'APA table copied with rich formatting!' : 'APA bibliography copied with rich formatting!';
            showToast(msg);
        } else {
            showToast('Copy failed, please export directly.');
        }
    } catch (err) {
        showToast('System error copying formatting.');
    }
    selection.removeAllRanges();
}

function fallbackCopyCitation(refEl, plainText) {
    const range = document.createRange();
    range.selectNodeContents(refEl);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    let ok = false;
    try {
        ok = document.execCommand('copy');
    } catch (e) {
        ok = false;
    }
    selection.removeAllRanges();

    if (!ok && plainText) {
        const ta = document.createElement('textarea');
        ta.value = plainText;
        ta.style.position = 'fixed';
        ta.style.top = '0';
        ta.style.left = '0';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try {
            ok = document.execCommand('copy');
        } catch (e) {}
        document.body.removeChild(ta);
    }

    showToast(ok ? 'APA citation copied!' : 'Copy failed, please export directly.');
}

function fallbackCopyElement(element, successMsg) {
    const range = document.createRange();
    range.selectNode(element);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    try {
        const ok = document.execCommand('copy');
        showToast(ok ? successMsg : 'Copy failed, please export directly.');
    } catch (e) {
        showToast('System error copying formatting.');
    }
    selection.removeAllRanges();
}

// DOC format exporter with MS Word parsing schemas
// ── Native .docx export (no library: minimal OOXML in a store-only ZIP) ─
const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

function buildZip(files) {
    const enc = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;
    const u16 = n => [n & 0xFF, (n >>> 8) & 0xFF];
    const u32 = n => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];
    files.forEach(f => {
        const name = enc.encode(f.name);
        const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
        const crc = crc32(data);
        const common = [...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)];
        parts.push(new Uint8Array([...u32(0x04034b50), ...common]), name, data);
        central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...common, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
        offset += 30 + name.length + data.length;
    });
    const centralSize = central.reduce((n, c) => n + c.length, 0);
    const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(centralSize), ...u32(offset), ...u16(0)]);
    return new Blob([...parts, ...central, end], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

function xmlEscape(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Flattens an element's children into [{ text, italic, bold }] runs.
function runsFromNode(node, inherited = {}) {
    const runs = [];
    node.childNodes.forEach(child => {
        if (child.nodeType === 3) {
            if (child.nodeValue) runs.push({ text: child.nodeValue.replace(/[ \t\r\n]+/g, ' '), ...inherited });
        } else if (child.nodeType === 1) {
            const tag = child.tagName.toLowerCase();
            const style = { ...inherited };
            if (tag === 'i' || tag === 'em') style.italic = true;
            if (tag === 'b' || tag === 'strong') style.bold = true;
            if (tag === 'sup') style.sup = true;
            runs.push(...runsFromNode(child, style));
        }
    });
    return runs;
}

// `inherit` runs take font and size from the paragraph style so restyling in Word works.
function docxRun(r, inherit = false) {
    const text = String(r.text).replace(/\u00a0/g, ' ');
    const font = inherit ? '' : '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>';
    const size = inherit ? '' : `<w:sz w:val="${r.size || 24}"/>`;
    return `<w:r><w:rPr>${font}${r.bold ? '<w:b/>' : ''}${r.italic ? '<w:i/>' : ''}${size}${r.sup ? '<w:vertAlign w:val="superscript"/>' : ''}</w:rPr><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
}

function docxParagraph(runs, { hanging = false, center = false, align = '', line = 480, before = 0, after = 0, style = '' } = {}) {
    if (style) return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr>${runs.map(r => docxRun(r, true)).join('')}</w:p>`;
    // Child order follows the OOXML schema (spacing, ind, jc); Word rejects out-of-order elements.
    const jc = center ? 'center' : align;
    const pPr = `<w:pPr><w:spacing w:before="${before}" w:after="${after}" w:line="${line}" w:lineRule="auto"/>${hanging ? '<w:ind w:left="720" w:hanging="720"/>' : ''}${jc ? `<w:jc w:val="${jc}"/>` : ''}</w:pPr>`;
    return `<w:p>${pPr}${runs.map(docxRun).join('')}</w:p>`;
}

// APA table: rules only above and below the table and under the heading row, no vertical lines.
function docxTable(rows) {
    const cols = Math.max(...rows.map(r => r.length));
    const width = Math.floor(9360 / cols);
    const rule = (side, sz) => `<w:${side} w:val="single" w:sz="${sz}" w:space="0" w:color="000000"/>`;
    const grid = `<w:tblGrid>${Array.from({ length: cols }, () => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>`;
    const body = rows.map((cells, rowIndex) => {
        const tcs = Array.from({ length: cols }, (_, c) => {
            const runs = cells[c] && cells[c].length ? cells[c] : [{ text: '' }];
            const borders = rowIndex === 0 ? `<w:tcBorders>${rule('bottom', 8)}</w:tcBorders>` : '';
            return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${borders}<w:vAlign w:val="center"/></w:tcPr>${docxParagraph(runs, { align: c === 0 ? 'left' : 'center', line: 240, before: 60, after: 60 })}</w:tc>`;
        }).join('');
        return `<w:tr>${tcs}</w:tr>`;
    }).join('');
    return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${rule('top', 12)}${rule('bottom', 12)}</w:tblBorders><w:tblLayout w:type="autofit"/><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>${grid}${body}</w:tbl>`;
}

const DOCX_STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault>'
    + '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="480" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
    + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
    + '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:bCs/></w:rPr></w:style>'
    + '<w:style w:type="paragraph" w:customStyle="1" w:styleId="Reference"><w:name w:val="Reference"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="720" w:hanging="720"/></w:pPr></w:style>'
    + '</w:styles>';

function buildDocxFromParagraphs(paragraphXml) {
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphXml.join('')}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    return buildZip([
        { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>' },
        { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
        { name: 'word/document.xml', data: documentXml },
        { name: 'word/_rels/document.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
        { name: 'word/styles.xml', data: DOCX_STYLES_XML }
    ]);
}

function referenceParagraphElements() {
    if (currentMode === 'citation') {
        const el = document.getElementById('prev-citation-reference');
        return el && currentCitationMarked ? [el] : [];
    }
    return [...document.querySelectorAll('#bibliography-preview-list .apa-reference-item')]
        .filter(el => !/^Paste references and click/.test(el.innerText));
}

function exportReferencesDocx() {
    const elements = referenceParagraphElements();
    if (!elements.length) {
        showToast(currentMode === 'citation' ? 'No citation generated yet.' : 'Format your bibliography first.');
        return;
    }
    // Real Word styles (Heading 1 and a "Reference" style) so the user can restyle the whole list in Word.
    const paragraphs = [docxParagraph([{ text: 'References' }], { style: 'Heading1' }),
        ...elements.map(el => docxParagraph(runsFromNode(el), { style: 'Reference' }))];
    const blob = buildDocxFromParagraphs(paragraphs);
    downloadDocx(blob, currentMode === 'citation' ? 'APA_Citation.docx' : 'APA_References.docx');
}

function downloadDocx(blob, filename) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    showToast('Word document (.docx) saved.');
}

function exportTableDocx() {
    const table = document.getElementById('prev-table');
    if (!table || !table.rows.length) {
        showToast('Build a table first.');
        return;
    }
    const number = document.getElementById('table-number').value || '1';
    const rows = [...table.rows].map(tr => [...tr.cells].map(cell => runsFromNode(cell).map(r => ({ ...r, text: r.text.replace(/\u00a0/g, '') })).filter(r => r.text)));
    const title = document.getElementById('table-title').value || 'Untitled Table';
    const noteRuns = [];
    ['prev-note-general-wrapper', 'prev-note-specific-wrapper', 'prev-note-prob-wrapper'].forEach(id => {
        const wrapper = document.getElementById(id);
        if (wrapper && wrapper.style.display !== 'none') noteRuns.push(...runsFromNode(wrapper));
    });
    for (let i = noteRuns.length - 1; i > 0; i--) {
        if (/\s$/.test(noteRuns[i - 1].text) && /^\s/.test(noteRuns[i].text)) noteRuns[i] = { ...noteRuns[i], text: noteRuns[i].text.replace(/^\s+/, '') };
    }
    noteRuns.splice(0, noteRuns.length, ...noteRuns.filter(r => r.text));
    if (noteRuns.length) {
        noteRuns[0] = { ...noteRuns[0], text: noteRuns[0].text.replace(/^\s+/, '') };
        const last = noteRuns.length - 1;
        noteRuns[last] = { ...noteRuns[last], text: noteRuns[last].text.replace(/\s+$/, '') };
    }
    const paragraphs = [
        docxParagraph([{ text: `Table ${number}`, bold: true }]),
        docxParagraph([{ text: title, italic: true }], { after: 120 }),
        docxTable(rows),
        docxParagraph(noteRuns.length ? noteRuns.map(r => ({ ...r, size: 22 })) : [{ text: '' }], { line: 360, before: 120 })
    ];
    downloadDocx(buildDocxFromParagraphs(paragraphs), `APA_Table_${String(number).replace(/[^\w.-]+/g, '_')}.docx`);
}

function exportToWord() {
    if (currentMode === 'toc') exportTocDocx();
    else if (currentMode === 'table') exportTableDocx();
    else exportReferencesDocx();
}
