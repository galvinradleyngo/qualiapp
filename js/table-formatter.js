// Table Formatter: grid editor, templates, paste import and live APA table preview.

// State Engine
let gridData = [];
let gridLinesEnabled = true;

const templates = {
    blank: [
        ['Column 1', 'Column 2', 'Column 3'],
        ['Data', 'Data', 'Data'],
        ['Data', 'Data', 'Data']
    ],
    descriptive: [
        ['Variable', 'M', 'SD', 'n'],
        ['1. Age', '24.5', '3.1', '120'],
        ['2. Years of Experience', '4.2', '1.5', '120'],
        ['3. Self-Efficacy Score', '3.8', '0.6', '120']
    ],
    correlation: [
        ['Variable', '1', '2', '3', '4'],
        ['1. Extroversion', '—', '', '', ''],
        ['2. Agreeableness', '.24*', '—', '', ''],
        ['3. Conscientiousness', '.15', '.42**', '—', ''],
        ['4. Neuroticism', '-.31**', '-.18*', '-.22*', '—']
    ],
    qual_themes: [
        ['Theme', 'Subtheme', 'Illustrative Quote'],
        ['1. Overcoming Adversity', 'Resilience', '"I just had to keep pushing forward, no matter what." (P1)'],
        ['', 'Community Support', '"My neighbors were my rock during that time." (P4)'],
        ['2. Career Transition', 'Skill Gap', '"I realized I needed to learn completely new tools." (P2)'],
        ['', 'Mentorship', '"Having a guide made all the difference in my journey." (P3)']
    ],
    qual_demographics: [
        ['Participant', 'Age', 'Gender', 'Role'],
        ['Alex', '34', 'Non-binary', 'Teacher'],
        ['Jordan', '28', 'Female', 'Software Engineer'],
        ['Taylor', '45', 'Male', 'Nurse'],
        ['Casey', '31', 'Female', 'Social Worker']
    ]
};

// ── Paste Table Feature ──────────────────────────────────────────────
let parsedPasteData = null;

function openPasteTableModal() {
    const modal = document.getElementById('paste-table-modal');
    const pasteZone = document.getElementById('paste-zone');
    const previewInfo = document.getElementById('paste-preview-info');
    const errorInfo = document.getElementById('paste-error-info');
    const btnImport = document.getElementById('btn-import-table');

    pasteZone.innerHTML = '';
    previewInfo.classList.add('hidden');
    errorInfo.classList.add('hidden');
    btnImport.disabled = true;
    parsedPasteData = null;

    modal.classList.remove('hidden');
    setTimeout(() => pasteZone.focus(), 50);
}

function closePasteTableModal() {
    document.getElementById('paste-table-modal').classList.add('hidden');
    parsedPasteData = null;
}

function parseHtmlTable(htmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    const table = doc.querySelector('table');
    if (!table) return null;

    const rows = [];
    table.querySelectorAll('tr').forEach(tr => {
        const cells = [];
        tr.querySelectorAll('th, td').forEach(cell => {
            cells.push((cell.innerText || cell.textContent || '').trim().replace(/\s+/g, ' '));
        });
        if (cells.some(c => c !== '')) {
            rows.push(cells);
        }
    });

    if (!rows.length) return null;

    const maxCols = Math.max(...rows.map(r => r.length));
    rows.forEach(row => { while (row.length < maxCols) row.push(''); });
    return rows;
}

function parseTsvTable(tsvString) {
    const lines = tsvString.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const rows = lines
        .filter(l => l.trim())
        .map(l => l.split('\t').map(c => c.trim()));

    if (!rows.length || rows[0].length < 2) return null;

    const maxCols = Math.max(...rows.map(r => r.length));
    rows.forEach(row => { while (row.length < maxCols) row.push(''); });
    return rows;
}

function handlePasteInZone(e) {
    e.preventDefault();
    const clipboardData = e.clipboardData || window.clipboardData;
    const htmlData = clipboardData.getData('text/html');
    const textData = clipboardData.getData('text/plain');

    const pasteZone = document.getElementById('paste-zone');
    const previewInfo = document.getElementById('paste-preview-info');
    const previewText = document.getElementById('paste-preview-text');
    const errorInfo = document.getElementById('paste-error-info');
    const btnImport = document.getElementById('btn-import-table');

    let result = null;
    let sourceLabel = '';

    if (htmlData) {
        result = parseHtmlTable(htmlData);
        if (result) sourceLabel = 'HTML table (Word / Google Docs)';
    }
    if (!result && textData) {
        result = parseTsvTable(textData);
        if (result) sourceLabel = 'tab-separated table (Excel / Google Sheets)';
    }

    if (result) {
        parsedPasteData = result;
        pasteZone.innerHTML = `<span class="text-slate-700 font-semibold">Table detected — ${result.length} row${result.length !== 1 ? 's' : ''} × ${result[0].length} column${result[0].length !== 1 ? 's' : ''}</span>`;
        previewText.innerText = `Detected ${sourceLabel}: ${result.length} rows × ${result[0].length} columns. Click "Import & Format Table" to continue.`;
        previewInfo.classList.remove('hidden');
        errorInfo.classList.add('hidden');
        btnImport.disabled = false;
    } else {
        parsedPasteData = null;
        pasteZone.innerHTML = '';
        previewInfo.classList.add('hidden');
        errorInfo.classList.remove('hidden');
        btnImport.disabled = true;
    }
    lucide.createIcons();
}

function importPastedTable() {
    if (!parsedPasteData) return;
    setMode('table');
    gridData = parsedPasteData;
    document.getElementById('table-title').value = 'Imported Table';
    document.getElementById('note-general').value = '';
    document.getElementById('note-specific').value = '';
    document.getElementById('note-prob').value = '';
    renderEditorGrid();
    updatePreview();
    closePasteTableModal();
    showEditor();
    showToast(`Table imported: ${gridData.length} rows × ${gridData[0].length} columns. Edit title and cells to finalize.`);
}

function toggleGridLineHelper() {
    const canvas = document.querySelector('.preview-canvas');
    gridLinesEnabled = !gridLinesEnabled;
    if (gridLinesEnabled) {
        canvas.style.backgroundImage = 'radial-gradient(#e2e8f0 1.5px, transparent 1.5px)';
    } else {
        canvas.style.backgroundImage = 'none';
    }
}

function loadTemplate(type) {
    if (templates[type]) {
        setMode('table');
        gridData = JSON.parse(JSON.stringify(templates[type]));
        
        if (type === 'correlation') {
            document.getElementById('table-title').value = "Correlations Between Personality Traits";
            document.getElementById('note-prob').value = "* p < .05. ** p < .01.";
            document.getElementById('note-general').value = "N = 250.";
            document.getElementById('note-specific').value = "";
        } else if (type === 'qual_themes') {
            document.getElementById('table-title').value = "Themes and Illustrative Quotes from Participant Interviews";
            document.getElementById('note-prob').value = "";
            document.getElementById('note-general').value = "P = Participant ID.";
            document.getElementById('note-specific').value = "";
        } else if (type === 'qual_demographics') {
            document.getElementById('table-title').value = "Participant Demographic Profiles";
            document.getElementById('note-prob').value = "";
            document.getElementById('note-general').value = "All participant names are research pseudonyms.";
            document.getElementById('note-specific').value = "";
        } else if (type === 'blank') {
            document.getElementById('table-title').value = "Custom Sample Table Title";
            document.getElementById('note-prob').value = "";
            document.getElementById('note-general').value = "";
            document.getElementById('note-specific').value = "";
        } else {
            document.getElementById('table-title').value = "Descriptive Statistics for Study Variables";
            document.getElementById('note-prob').value = "";
            document.getElementById('note-general').value = "";
            document.getElementById('note-specific').value = "";
        }
        
        renderEditorGrid();
        updatePreview();
        showEditor();
        showToast(`Loaded ${type.replace('qual_', 'Qualitative ').replace('blank', 'Blank').replace('descriptive', 'Descriptives').toUpperCase()} layout.`);
    }
}

// Render the high-fidelity inline spreadsheet layout grid
function renderEditorGrid() {
    const tbody = document.getElementById('editor-grid');
    tbody.innerHTML = '';
    
    gridData.forEach((row, rowIndex) => {
        const tr = document.createElement('tr');
        tr.className = rowIndex === 0 ? "bg-slate-50 border-b border-slate-200" : "border-b border-slate-100 hover:bg-slate-50/50 transition-colors";
        
        row.forEach((cellText, colIndex) => {
            const td = document.createElement(rowIndex === 0 ? 'th' : 'td');
            td.className = `p-0 text-sm relative ${rowIndex === 0 ? 'font-bold text-slate-700 bg-slate-50/80' : 'font-normal text-slate-600'}`;
            
            // Column indexing helper for headers
            if (rowIndex === 0) {
                const colIndicator = document.createElement('span');
                colIndicator.className = "absolute top-1 left-1.5 text-[8px] font-extrabold uppercase tracking-widest text-slate-400 select-none";
                colIndicator.innerText = String.fromCharCode(65 + colIndex);
                td.appendChild(colIndicator);
            }

            const div = document.createElement('div');
            div.className = "editor-cell px-3.5 py-3 w-full h-full outline-none min-h-[44px] text-left";
            div.contentEditable = true;
            div.setAttribute('role', 'textbox');
            div.setAttribute('aria-label', rowIndex === 0 ? `Column ${colIndex + 1} header` : `Row ${rowIndex}, column ${colIndex + 1}`);
            div.dataset.placeholder = rowIndex === 0 ? "Header..." : "Data...";
            div.innerText = cellText;
            
            div.addEventListener('input', (e) => {
                gridData[rowIndex][colIndex] = e.target.innerText;
                updatePreview();
            });
            
            div.addEventListener('paste', (e) => {
                e.preventDefault();
                let text = (e.originalEvent || e).clipboardData.getData('text/plain');
                document.execCommand('insertText', false, text);
            });

            td.appendChild(div);
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
}

function applyPreviewTableSizing(prevTable) {
    if (!prevTable || !gridData.length || !gridData[0]) {
        return;
    }

    prevTable.classList.remove('preview-fixed', 'preview-compact', 'preview-tight');

    const columnCount = gridData[0].length;
    const container = document.getElementById('table-export-container');
    const availableWidth = container ? container.clientWidth : 0;

    // A readable stub column plus about 80px (compact) or 60px (tight) per data column.
    const needsCompact = columnCount >= 8 || (availableWidth && 160 + (columnCount - 1) * 80 > availableWidth);
    const needsTight = columnCount >= 11 || (availableWidth && 130 + (columnCount - 1) * 60 > availableWidth);

    if (needsCompact) {
        prevTable.classList.add('preview-fixed', 'preview-compact');
    }

    if (needsTight) {
        prevTable.classList.add('preview-tight');
    }
}

// Dynamic dimension adjusters
function modifyGrid(axis, action) {
    if (axis === 'row') {
        if (action === 'add') {
            const newRow = new Array(gridData[0].length).fill('');
            gridData.push(newRow);
        } else if (action === 'remove' && gridData.length > 2) {
            gridData.pop();
        }
    } else if (axis === 'col') {
        if (action === 'add') {
            gridData.forEach(row => row.push(''));
        } else if (action === 'remove' && gridData[0].length > 1) {
            gridData.forEach(row => row.pop());
        }
    }
    renderEditorGrid();
    updatePreview();
}

// Keep preview perfectly synced
function updatePreview() {
    if (!gridData.length) {
        return;
    }

    document.getElementById('prev-num').innerText = document.getElementById('table-number').value || '1';
    document.getElementById('prev-title').innerText = document.getElementById('table-title').value || 'Untitled Table';

    const prevTable = document.getElementById('prev-table');
    prevTable.innerHTML = '';
    
    // Generate structured Header Group
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    gridData[0].forEach(header => {
        const th = document.createElement('th');
        th.innerHTML = header || '&nbsp;';
        headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    prevTable.appendChild(thead);

    // Generate structured Body Group
    const tbody = document.createElement('tbody');
    for (let i = 1; i < gridData.length; i++) {
        const tr = document.createElement('tr');
        gridData[i].forEach(cellData => {
            const td = document.createElement('td');
            td.innerHTML = cellData || '&nbsp;';
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    }
    prevTable.appendChild(tbody);

    applyPreviewTableSizing(prevTable);

    // Synchronize notes
    const noteGen = document.getElementById('note-general').value.trim();
    const noteSpec = document.getElementById('note-specific').value.trim();
    const noteProb = document.getElementById('note-prob').value.trim();

    const wrapGen = document.getElementById('prev-note-general-wrapper');
    const wrapSpec = document.getElementById('prev-note-specific-wrapper');
    const wrapProb = document.getElementById('prev-note-prob-wrapper');

    wrapGen.style.display = noteGen ? 'inline' : 'none';
    document.getElementById('prev-note-general').innerText = noteGen + (noteGen && !noteGen.endsWith('.') ? '.' : '') + ' ';

    wrapSpec.style.display = noteSpec ? 'inline' : 'none';
    document.getElementById('prev-note-specific').innerHTML = formatNoteSuperscript(noteSpec) + ' ';

    wrapProb.style.display = noteProb ? 'inline' : 'none';
    document.getElementById('prev-note-prob').innerHTML = formatProbNote(noteProb);
}

// RegEx parser to automatically italicize statistics symbol variables (e.g. "p")
function formatProbNote(text) {
    if(!text) return "";
    return text.replace(/\bp\b/g, '<i>p</i>');
}

// Sub-text formatting engine
function formatNoteSuperscript(text) {
    if(!text) return "";
    return text.replace(/^([a-z])\s/i, '<sup>$1</sup> ');
}
