// App shell: shared state, navigation between home and tools, toasts and form-label wiring.

let currentMode = 'table';
// ── End Paste Table Feature ──────────────────────────────────────────

// Application Lifecycles
function init() {
    if (window.pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    lucide.createIcons();
    showHome();
    document.getElementById('paste-zone').addEventListener('paste', handlePasteInZone);
    initPdfDropzone();
    initCitationBatch();
    const bibInputEl = document.getElementById('bibliography-input');
    const savedDraft = readBibliographyDraft();
    if (savedDraft && !bibInputEl.value.trim()) bibInputEl.value = savedDraft;
    bibInputEl.addEventListener('input', () => { bibInputIsSample = false; scheduleBibliographyDraftSave(); });
    initTocWorkspace();
    initPaperReviewUi();
    associateFormLabels();
    PROVENANCE_FIELDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => el.classList.remove('prov-found', 'prov-guess', 'prov-missing'));
    });
}

// Gives every visible label a matching `for` so screen readers announce field names.
function associateFormLabels() {
    let counter = 0;
    document.querySelectorAll('label:not([for])').forEach(label => {
        if (label.querySelector('input, textarea, select')) return;
        const scope = label.parentElement && label.parentElement.parentElement && label.parentElement.querySelector('input, textarea, select') ? label.parentElement : label.parentElement && label.parentElement.parentElement;
        const control = scope && scope.querySelector('input:not([type="checkbox"]), textarea, select');
        if (!control) return;
        if (!control.id) control.id = `field-auto-${++counter}`;
        label.setAttribute('for', control.id);
    });
}

function setMode(mode) {
    currentMode = mode;
    const isTableMode = mode === 'table';
    const isBibMode = mode === 'bibliography';
    const isCiteMode = mode === 'citation';
    const isTocMode = mode === 'toc';

    document.getElementById('table-editor-panel').style.display = isTableMode ? 'block' : 'none';
    document.getElementById('bibliography-editor-panel').style.display = isBibMode ? 'block' : 'none';
    document.getElementById('citation-editor-panel').style.display = isCiteMode ? 'block' : 'none';
    document.getElementById('toc-editor-panel').style.display = isTocMode ? 'block' : 'none';
    document.getElementById('toc-export-container').style.display = isTocMode ? 'block' : 'none';

    document.getElementById('table-export-container').style.display = isTableMode ? 'block' : 'none';
    document.getElementById('bibliography-export-container').style.display = isBibMode ? 'block' : 'none';
    document.getElementById('citation-preview-wrapper').style.display = isCiteMode ? 'block' : 'none';
    const gridToggle = document.querySelector('[onclick="toggleGridLineHelper()"]');
    if (gridToggle) gridToggle.style.display = isTableMode ? '' : 'none';

    if (isTableMode) {
        document.getElementById('btn-copy-label').innerText = 'Copy Formatted Table';
        document.getElementById('btn-export-label').innerText = 'Export Table to Word';
        document.getElementById('preview-mode-label').innerHTML = '<span class="w-2 h-2 rounded-full bg-blue-500"></span>Manuscript Paper Preview';
        document.getElementById('preview-disclaimer').innerText = 'Table styling matches exact APA manuscript guidelines (double-spaced headers, no vertical borders, 1-inch margins).';
    } else if (isBibMode) {
        document.getElementById('btn-copy-label').innerText = 'Copy Formatted Bibliography';
        document.getElementById('btn-export-label').innerText = 'Export Bibliography to Word';
        document.getElementById('preview-mode-label').innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-500"></span>Reference List Preview';
        document.getElementById('preview-disclaimer').innerText = 'Reference list uses APA 7 ordering and hanging-indented, double-spaced manuscript styling.';
    } else if (isTocMode) {
        document.getElementById('btn-copy-label').innerText = 'Copy Contents';
        document.getElementById('btn-export-label').innerText = 'Export Contents to Word';
        document.getElementById('preview-mode-label').innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-500"></span>Contents Page Preview';
        document.getElementById('preview-disclaimer').innerText = 'Entries are indented 0.5 inch per heading level with right-aligned page numbers. Export keeps the dot leaders and Word styles.';
    } else if (isCiteMode) {
        document.getElementById('btn-copy-label').innerText = 'Copy APA Citation';
        document.getElementById('btn-export-label').innerText = 'Export Citation to Word';
        document.getElementById('preview-mode-label').innerHTML = '<span class="w-2 h-2 rounded-full bg-indigo-500"></span>APA Citation Preview';
        document.getElementById('preview-disclaimer').innerText = 'Reference entries use APA 7 hanging indents with italicized journals/books and live in-text citations.';
    }
    lucide.createIcons();
}

function setEditorPane(pane) {
    document.getElementById('editor-view').dataset.pane = pane;
    [['edit', 'pane-tab-edit'], ['preview', 'pane-tab-preview']].forEach(([name, id]) => {
        const on = name === pane;
        const b = document.getElementById(id);
        ['bg-white', 'text-blue-600', 'shadow-sm'].forEach(c => b.classList.toggle(c, on));
        b.classList.toggle('text-slate-600', !on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const target = document.getElementById(pane === 'edit' ? 'edit-pane' : 'preview-pane');
    if (target) target.scrollTop = 0;
}

function showHome() {
    document.getElementById('home-tools').classList.remove('hidden');
    document.getElementById('table-templates-section').classList.add('hidden');
    refreshContinueStrip();
    document.getElementById('home-view').style.display = 'flex';
    document.getElementById('paper-view').style.display = 'none';
    document.getElementById('editor-view').style.display = 'none';
    document.getElementById('btn-home').style.display = 'none';
    document.getElementById('btn-export').style.display = 'none';
    document.getElementById('btn-copy').style.display = 'none';
}

function showEditor() {
    setEditorPane('edit');
    document.getElementById('home-view').style.display = 'none';
    document.getElementById('paper-view').style.display = 'none';
    document.getElementById('editor-view').style.display = 'flex';
    document.getElementById('btn-home').style.display = 'flex';
    document.getElementById('btn-export').style.display = 'flex';
    document.getElementById('btn-copy').style.display = 'flex';
}

function showToast(message) {
    const toast = document.getElementById('toast');
    const msgSpan = document.getElementById('toast-message');
    msgSpan.innerText = message;
    toast.classList.remove('opacity-0', 'translate-y-12', 'pointer-events-none');
    toast.classList.add('opacity-100', 'translate-y-0');
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-12', 'pointer-events-none');
        toast.classList.remove('opacity-100', 'translate-y-0');
    }, 3000);
}

function openTableTemplates() {
    document.getElementById('home-tools').classList.add('hidden');
    document.getElementById('home-continue').classList.add('hidden');
    document.getElementById('table-templates-section').classList.remove('hidden');
    document.getElementById('home-view').scrollTop = 0;
    lucide.createIcons();
}

function loadCitationWorkspace() {
    setMode('citation');
    showEditor();
    switchCitationTab('link');
    handleCiteTypeChange();
    const urlInput = document.getElementById('citation-url-input');
    if (urlInput && !document.getElementById('cite-title').value.trim()) urlInput.focus();
}
