// Bibliography Formatter UI: formatting, issue list, drafts, in-text check and BibTeX/RIS import.

let latestBibliographyFixNotes = [];

// ── Bibliography draft persistence ─────────────────────────────────────
const BIB_DRAFT_KEY = 'apastudio.bibliographyDraft.v1';
const BIB_SAMPLE_TEXT = [
    'Smith, J. A., & Lee, R. T. (2021). Learning analytics in blended classrooms. Journal of Educational Computing, 35(2), 145-162. https://doi.org/10.1000/xyz123',
    'Alvarez, P. M. (2019). Student motivation in remote environments. Academic Press.',
    'Brown, K. (2023). Reflective pedagogy in higher education. Teaching Review, 18(4), 55-73.'
].join('\n');
let bibDraftTimer = null;
let bibInputIsSample = false;

function saveBibliographyDraft() {
    try {
        const value = document.getElementById('bibliography-input').value.trim();
        if (!value || bibInputIsSample) {
            localStorage.removeItem(BIB_DRAFT_KEY);
        } else {
            localStorage.setItem(BIB_DRAFT_KEY, value);
        }
    } catch (e) { /* storage unavailable (private mode, blocked): the app still works */ }
}

function scheduleBibliographyDraftSave() {
    clearTimeout(bibDraftTimer);
    bibDraftTimer = setTimeout(saveBibliographyDraft, 400);
}

function readBibliographyDraft() {
    try { return localStorage.getItem(BIB_DRAFT_KEY) || ''; } catch (e) { return ''; }
}

function refreshContinueStrip() {
    const strip = document.getElementById('home-continue');
    if (!strip) return;
    const draft = readBibliographyDraft();
    if (!draft) { strip.classList.add('hidden'); return; }
    const count = parseBibliographyEntries(draft).length;
    document.getElementById('home-continue-text').innerText = `Your bibliography draft (${count} reference${count === 1 ? '' : 's'}) was saved in this browser.`;
    strip.classList.remove('hidden');
    lucide.createIcons();
}

function discardBibliographyDraft() {
    try { localStorage.removeItem(BIB_DRAFT_KEY); } catch (e) { /* ignore */ }
    document.getElementById('bibliography-input').value = '';
    refreshContinueStrip();
    showToast('Saved bibliography draft discarded.');
}

function loadBibliographyWorkspace() {
    const bibliographyInput = document.getElementById('bibliography-input');
    if (!bibliographyInput.value.trim()) {
        bibliographyInput.value = BIB_SAMPLE_TEXT;
        bibInputIsSample = true;
    }

    setMode('bibliography');
    formatBibliography();
    showEditor();
    showToast('Bibliography formatter is ready.');
}

function renderBibliographyIssues(entries) {
    const target = document.getElementById('bibliography-issues');
    target.innerHTML = '';

    if (!entries.length) {
        target.innerText = 'No warnings yet. Format your bibliography to run checks.';
        return;
    }

    if (latestBibliographyFixNotes.length) {
        const fixSummary = document.createElement('p');
        fixSummary.className = 'font-semibold text-emerald-700';
        fixSummary.innerText = `Auto-corrections applied: ${latestBibliographyFixNotes.length}`;
        target.appendChild(fixSummary);

        const fixList = document.createElement('ul');
        fixList.className = 'issue-list text-emerald-800';
        latestBibliographyFixNotes.forEach(note => {
            const li = document.createElement('li');
            li.innerText = note;
            fixList.appendChild(li);
        });
        const fixDetails = document.createElement('details');
        fixDetails.className = 'mb-2';
        const fixToggle = document.createElement('summary');
        fixToggle.className = 'cursor-pointer text-[11px] font-semibold text-emerald-700';
        fixToggle.innerText = 'Show what changed';
        fixDetails.appendChild(fixToggle);
        fixDetails.appendChild(fixList);
        target.appendChild(fixDetails);
    }

    const analyzed = entries.map(entry => ({ entry, issues: analyzeReferenceIssues(entry) }));
    const warningEntries = analyzed.filter(item => item.issues.length > 0);

    if (!warningEntries.length) {
        target.innerHTML = '<p class="text-emerald-700">No obvious APA metadata issues detected by the automated checks.</p>';
        return;
    }

    if (warningEntries.some(item => item.issues.includes(SENTENCE_CASE_ISSUE))) {
        const fixAll = document.createElement('button');
        fixAll.type = 'button';
        fixAll.className = 'mb-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg';
        fixAll.innerText = 'Apply sentence case to all flagged titles';
        fixAll.addEventListener('click', fixAllSentenceCase);
        target.appendChild(fixAll);
    }

    const summary = document.createElement('p');
    summary.className = 'font-semibold';
    summary.innerText = `${warningEntries.length} of ${entries.length} reference${entries.length === 1 ? '' : 's'} flagged for review.`;
    target.appendChild(summary);

    warningEntries.forEach((item, index) => {
        const block = document.createElement('div');
        block.className = 'mt-2 border border-amber-200 bg-white/60 rounded-lg p-2.5';

        const heading = document.createElement('p');
        heading.className = 'font-semibold';
        const shown = stripItalicMarkers(item.entry);
        heading.innerText = `Entry ${index + 1}: ${shown.slice(0, 90)}${shown.length > 90 ? '...' : ''}`;
        block.appendChild(heading);

        const list = document.createElement('ul');
        list.className = 'issue-list';
        item.issues.forEach(issue => {
            const li = document.createElement('li');
            li.innerText = issue + ' ';
            if (issue === SENTENCE_CASE_ISSUE) {
                const fix = document.createElement('button');
                fix.type = 'button';
                fix.className = 'ml-1 text-[11px] font-semibold text-emerald-700 underline hover:text-emerald-900';
                fix.innerText = 'Fix it';
                fix.addEventListener('click', () => fixSentenceCaseFor(item.entry));
                li.appendChild(fix);
            }
            list.appendChild(li);
        });
        block.appendChild(list);
        target.appendChild(block);
    });
}

function updateBibliographyPreview(entries) {
    const list = document.getElementById('bibliography-preview-list');
    list.innerHTML = '';

    if (!entries.length) {
        list.innerHTML = '<p class="apa-reference-item">Paste references and click Format Bibliography to generate an APA 7 reference list.</p>';
        return;
    }

    entries.forEach(entry => {
        const row = document.createElement('p');
        row.className = 'apa-reference-item';
        row.innerHTML = referenceToHtml(entry);
        list.appendChild(row);
    });
}

function replaceBibliographyEntry(oldEntry, newEntry) {
    const input = document.getElementById('bibliography-input');
    input.value = input.value.split('\n').map(line => (line.trim() === oldEntry ? newEntry : line)).join('\n');
}

function fixSentenceCaseFor(entry) {
    const clean = stripItalicMarkers(entry);
    replaceBibliographyEntry(clean, sentenceCaseEntry(clean));
    formatBibliography();
    showToast('Applied sentence case to the title.');
}

function fixAllSentenceCase() {
    const input = document.getElementById('bibliography-input');
    let count = 0;
    input.value = input.value.split('\n').map(line => {
        const entry = line.trim();
        if (!entry || !analyzeReferenceIssues(entry).includes(SENTENCE_CASE_ISSUE)) return line;
        const fixed = sentenceCaseEntry(entry);
        if (fixed !== entry) count++;
        return fixed;
    }).join('\n');
    formatBibliography();
    showToast(count ? `Applied sentence case to ${count} title${count === 1 ? '' : 's'}.` : 'No titles needed changes.');
}

function checkCitationsAgainstReferences() {
    const manuscript = document.getElementById('manuscript-input').value;
    const out = document.getElementById('citation-check-results');
    if (!manuscript.trim()) { out.innerHTML = '<p class="text-slate-500">Paste your manuscript text above first.</p>'; return; }
    const refs = parseBibliographyEntries(document.getElementById('bibliography-input').value).map(entry => {
        const text = stripItalicMarkers(entry);
        const year = (text.match(/\((\d{4}[a-z]?|n\.d\.(?:-[a-z])?)/i) || [])[1] || '';
        return { entry, author: referenceAuthorBlock(entry), year };
    });
    const cites = extractInTextCitations(manuscript);
    const seen = new Set();
    const unique = cites.filter(c => { const k = `${c.name.toLowerCase()}|${c.year}`; if (seen.has(k)) return false; seen.add(k); return true; });
    const missing = unique.filter(c => !refs.some(r => citationMatchesReference(c, r)));
    const uncited = refs.filter(r => !unique.some(c => citationMatchesReference(c, r)));

    const list = (items, render) => `<ul class="list-disc pl-5 space-y-1">${items.map(i => `<li>${escapeHtml(render(i))}</li>`).join('')}</ul>`;
    let html = `<p class="font-semibold">${unique.length} in-text citation${unique.length === 1 ? '' : 's'} found, ${refs.length} reference${refs.length === 1 ? '' : 's'} listed.</p>`;
    html += missing.length
        ? `<p class="font-semibold text-rose-700 mt-2">Cited but not in the reference list (${missing.length}):</p>${list(missing, c => `${c.name}, ${c.year}`)}`
        : '<p class="text-emerald-700 mt-2">Every in-text citation has a matching reference.</p>';
    html += uncited.length
        ? `<p class="font-semibold text-amber-700 mt-2">In the reference list but never cited (${uncited.length}):</p>${list(uncited, r => r.entry.slice(0, 110) + (r.entry.length > 110 ? '…' : ''))}`
        : '<p class="text-emerald-700 mt-2">Every reference is cited in the text.</p>';
    html += '<p class="text-slate-500 mt-2">Group-author abbreviations such as (WHO, 2020) and secondary citations are not matched automatically; check those by hand.</p>';
    out.innerHTML = html;
}

function importReferencesText(text) {
    const trimmed = text.trim();
    const items = /^\s*@\w+\s*\{/m.test(trimmed) ? parseBibtexEntries(trimmed) : (/^TY {2}-/m.test(trimmed) ? parseRisEntries(trimmed) : []);
    const valid = items.filter(it => it.title);
    if (!valid.length) { showToast('No BibTeX or RIS references were found in that file.'); return 0; }
    const entries = valid.map(it => generateApaReference({ monthDay: '', retrieved: '', translator: '', ...it }).marked);
    const input = document.getElementById('bibliography-input');
    const existing = input.value.trim();
    bibInputIsSample = false;
    input.value = existing ? `${existing}\n\n${entries.join('\n\n')}` : entries.join('\n\n');
    formatBibliography();
    showToast(`Imported ${valid.length} reference${valid.length === 1 ? '' : 's'}.`);
    return valid.length;
}

function handleReferenceFileImport(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { importReferencesText(String(reader.result || '')); event.target.value = ''; };
    reader.readAsText(file);
}

// The text box stays free of *asterisks*; the italic markers for formatted entries are remembered here
// so a second click on Format (or editing one line) keeps the italics the rebuild worked out.
let bibMarkedLookup = new Map();

function formatBibliography(options) {
    const quiet = !!(options && options.quiet);
    const rawText = document.getElementById('bibliography-input').value;
    const parsedEntries = parseBibliographyEntries(rawText).map(entry => bibMarkedLookup.get(entry) || entry);
    const rebuildToggle = document.getElementById('rebuild-toggle');
    const rebuild = !rebuildToggle || rebuildToggle.checked;
    const fixedResults = parsedEntries.map(entry => applyBibliographyAutoFix(entry, { rebuild }));
    const fixedEntries = fixedResults.map(result => result.fixed);
    latestBibliographyFixNotes = fixedResults.flatMap(result => result.notes);
    const suffixed = assignYearSuffixes(sortBibliographyEntries(fixedEntries));
    const sortedEntries = suffixed.entries;
    latestBibliographyFixNotes.push(...suffixed.notes);
    updateBibliographyPreview(sortedEntries);
    renderBibliographyIssues(sortedEntries);

    if (!sortedEntries.length) {
        if (!quiet) showToast('No references found to format.');
        return 0;
    }

    const autoFixedCount = parsedEntries.reduce((count, original, index) => {
        return count + (normalizeReferenceEntry(original) !== fixedEntries[index] ? 1 : 0);
    }, 0);

    bibMarkedLookup = new Map(sortedEntries.map(entry => [stripItalicMarkers(entry), entry]).filter(([clean, marked]) => clean !== marked));
    // A blank line between entries keeps author-less entries (title first) from merging when the text is read again.
    document.getElementById('bibliography-input').value = sortedEntries.map(stripItalicMarkers).join('\n\n');
    saveBibliographyDraft();

    if (!quiet) showToast(`Formatted ${sortedEntries.length} reference${sortedEntries.length === 1 ? '' : 's'} in APA 7 style. Auto-fixed ${autoFixedCount}.`);
    return sortedEntries.length;
}
