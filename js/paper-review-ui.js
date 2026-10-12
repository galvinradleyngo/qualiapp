// Reformat Your Paper: upload, progress bar, questions, download.

const prUi = { file: null, session: null, busy: false };
const prEl = id => document.getElementById(id);

function loadPaperReviewer() {
    prEl('home-view').style.display = 'none';
    prEl('editor-view').style.display = 'none';
    prEl('paper-view').style.display = 'block';
    prEl('btn-home').style.display = 'flex';
    prEl('btn-export').style.display = 'none';
    prEl('btn-copy').style.display = 'none';
    if (!prUi.busy && !prUi.session) prShowStep('upload');
    if (window.lucide) lucide.createIcons();
}

function prShowStep(name) {
    ['upload', 'progress', 'review', 'done'].forEach(n => prEl('pr-step-' + n).classList.toggle('hidden', n !== name));
    prEl('paper-view').scrollTop = 0;
}

function prReset() {
    prUi.file = null; prUi.session = null; prUi.busy = false;
    prEl('pr-file-name').innerText = 'Drop your paper here, or click to browse';
    prEl('pr-start').disabled = true;
    prEl('pr-upload-error').classList.add('hidden');
    prShowStep('upload');
}

function prSetFile(file) {
    const err = prEl('pr-upload-error');
    err.classList.add('hidden');
    if (!file) return;
    if (/\.doc$/i.test(file.name)) {
        err.innerText = 'That is an older .doc file. Open it in Word, choose File > Save As > Word Document (.docx), and upload that copy.';
        err.classList.remove('hidden');
        return;
    }
    if (!/\.docx$/i.test(file.name)) {
        err.innerText = 'Please choose a Word .docx file.';
        err.classList.remove('hidden');
        return;
    }
    prUi.file = file;
    prEl('pr-file-name').innerText = file.name + ' (' + Math.max(1, Math.round(file.size / 1024)) + ' KB)';
    prEl('pr-start').disabled = false;
}

function initPaperReviewUi() {
    const input = prEl('pr-file-input');
    input.addEventListener('change', e => { prSetFile(e.target.files[0]); e.target.value = ''; });
    const drop = prEl('pr-dropzone');
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('border-violet-400', 'bg-violet-50/30'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('border-violet-400', 'bg-violet-50/30'); }));
    drop.addEventListener('drop', e => prSetFile(e.dataTransfer.files[0]));
}

function prRenderStages(stages) {
    prEl('pr-stage-list').innerHTML = stages.map(st => `<li id="pr-stage-${st.id}" class="flex items-center gap-2 pr-stage-wait"><span class="pr-mark w-4 text-center">○</span><span>${escapeHtml(st.label)}</span></li>`).join('');
}

function prOnProgress(p) {
    prEl('pr-bar').style.width = p.pct + '%';
    prEl('pr-bar-track').setAttribute('aria-valuenow', p.pct);
    prEl('pr-progress-pct').innerText = p.pct + '%';
    prEl('pr-progress-label').innerText = p.label;
    const li = prEl('pr-stage-' + p.id);
    if (!li) return;
    li.className = 'flex items-center gap-2 ' + (p.state === 'done' ? 'pr-stage-done' : 'pr-stage-active');
    li.querySelector('.pr-mark').innerText = p.state === 'done' ? '✓' : '●';
}

function prReadOptions() {
    const v = id => prEl(id).value.trim();
    return {
        paperType: prEl('pr-type').value, font: prEl('pr-font').value, runningHead: v('pr-runhead'),
        titlePage: { title: v('pr-tp-title'), author: v('pr-tp-author'), affiliation: v('pr-tp-affil'), course: v('pr-tp-course'), instructor: v('pr-tp-instr'), date: v('pr-tp-date') }
    };
}

async function prStartReview() {
    if (!prUi.file || prUi.busy) return;
    prUi.busy = true;
    prEl('pr-progress-title').innerText = 'Reviewing your paper';
    prEl('pr-bar').style.width = '0%';
    prRenderStages(PR_STAGES);
    prShowStep('progress');
    try {
        const buffer = await prUi.file.arrayBuffer();
        prUi.session = await prReview(buffer, prReadOptions(), prOnProgress);
        prUi.busy = false;
        await nextFrame(500);
        prRenderReview();
        prShowStep('review');
    } catch (e) {
        prUi.busy = false;
        prUi.session = null;
        prShowStep('upload');
        const err = prEl('pr-upload-error');
        err.innerText = e instanceof DocxError ? e.message : 'Something went wrong while reviewing this file: ' + e.message;
        err.classList.remove('hidden');
        console.error(e);
    }
}

const prHighlight = (text, cls) => escapeHtml(text).replace(/\[([^\]]*)\]/g, `<span class="${cls}">$1</span>`);

function prRenderReview() {
    const s = prUi.session;
    const asks = s.findings.filter(f => f.tier === 'ask');
    const manual = s.findings.filter(f => f.tier === 'manual');
    const auto = [...s.auto.values()];
    const questionCount = asks.reduce((n, f) => n + f.items.length, 0);
    const card = (n, label, tone) => `<div class="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4"><p class="text-2xl sm:text-3xl font-extrabold ${tone}">${n}</p><p class="text-[11px] sm:text-xs font-semibold text-slate-500 mt-1">${label}</p></div>`;
    let html = `<div class="grid grid-cols-3 gap-2 sm:gap-4">${card(auto.length, 'fixes done automatically', 'text-emerald-600')}${card(questionCount, 'changes waiting for your OK', 'text-violet-600')}${card(manual.length, 'notes for you to handle', 'text-amber-600')}</div>`;

    html += `<details class="bg-white border border-slate-200 rounded-2xl p-5"><summary class="cursor-pointer font-bold text-slate-800 text-sm">Fixed automatically (formatting only, no wording changed)</summary><ul class="mt-3 space-y-1.5 text-sm text-slate-700">${auto.map(a => `<li class="flex gap-2"><span class="text-emerald-600">✓</span><span>${escapeHtml(a.label)}${a.count > 1 ? ` <span class="text-slate-400">(${a.count})</span>` : ''}</span></li>`).join('')}</ul></details>`;

    if (asks.length) {
        html += `<div class="space-y-1"><h3 class="text-lg font-extrabold text-slate-900">Your call: these could change your content</h3><p class="text-sm text-slate-500">Nothing below is applied unless you tick it. Skip anything you want to keep as it is.</p></div>`;
        const groups = [...new Set(asks.map(f => f.group))];
        groups.forEach(g => {
            html += `<div class="space-y-3"><h4 class="text-xs font-extrabold uppercase tracking-widest text-violet-600">${escapeHtml(g)}</h4>`;
            asks.filter(f => f.group === g).forEach(f => {
                html += `<div class="bg-white border border-slate-200 rounded-2xl p-5 space-y-3" data-finding="${f.id}">
                    <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div><p class="font-bold text-slate-800 text-sm">${escapeHtml(f.title)}</p><p class="text-xs text-slate-500 mt-0.5">${escapeHtml(f.detail)}</p></div>
                        <label class="shrink-0 text-xs font-semibold text-violet-700 flex items-center gap-1.5 cursor-pointer"><input type="checkbox" class="pr-all rounded border-slate-300" aria-label="Approve all in: ${escapeHtml(f.title)}"> All ${f.items.length}</label>
                    </div>
                    <ul class="space-y-2 max-h-80 overflow-y-auto custom-scrollbar pr-1">${f.items.map(it => `<li><label class="flex items-start gap-2.5 text-sm cursor-pointer rounded-xl border border-slate-100 hover:border-violet-200 p-2.5"><input type="checkbox" class="pr-item mt-1 rounded border-slate-300" data-id="${it.id}"><span class="min-w-0 space-y-0.5"><span class="block text-xs font-semibold text-slate-500">${escapeHtml(it.label)}</span><span class="block text-slate-700 break-words"><span class="text-[10px] font-bold text-rose-500 mr-1">BEFORE</span>${prHighlight(it.before || '', 'pr-diff-before')}</span><span class="block text-slate-700 break-words"><span class="text-[10px] font-bold text-emerald-600 mr-1">AFTER</span>${prHighlight(it.after || '', 'pr-diff-after')}</span></span></label></li>`).join('')}</ul>
                </div>`;
            });
            html += '</div>';
        });
    } else {
        html += '<div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-sm text-emerald-900">No wording changes were suggested. Everything found was formatting, which has been fixed.</div>';
    }

    if (manual.length) {
        html += `<div class="space-y-3"><h3 class="text-lg font-extrabold text-slate-900">Needs your attention</h3><p class="text-sm text-slate-500">These cannot be fixed safely by software. They also go into the review report.</p>${manual.map(m => `<div class="bg-amber-50 border border-amber-200 rounded-2xl p-4"><p class="font-bold text-amber-900 text-sm">${escapeHtml(m.title)}</p><p class="text-xs text-amber-800 mt-0.5">${escapeHtml(m.detail)}</p>${m.items && m.items.length ? `<ul class="list-disc pl-5 mt-2 text-xs text-amber-900 space-y-0.5 max-h-40 overflow-y-auto">${m.items.slice(0, 40).map(i => `<li>${escapeHtml(i.label)}</li>`).join('')}</ul>` : ''}</div>`).join('')}</div>`;
    }

    html += `<div class="sticky bottom-0 -mx-2 bg-slate-50/95 backdrop-blur border-t border-slate-200 py-4 px-2 flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-slate-600"><strong id="pr-approved-count">0</strong> of ${questionCount} suggested changes approved</p>
        <div class="flex gap-2 w-full sm:w-auto"><button type="button" onclick="prReset()" class="text-sm font-semibold text-slate-600 hover:bg-white border border-slate-200 px-4 py-2.5 rounded-xl">Start over</button>
        <button type="button" onclick="prBuild()" class="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-semibold py-2.5 px-5 rounded-xl shadow-md flex items-center gap-2">Build my reformatted paper</button></div>
    </div>`;
    const host = prEl('pr-step-review');
    host.innerHTML = html;
    host.onchange = e => {
        if (e.target.classList.contains('pr-all')) host.querySelectorAll(`[data-finding="${e.target.closest('[data-finding]').dataset.finding}"] .pr-item`).forEach(c => { c.checked = e.target.checked; });
        const total = host.querySelectorAll('.pr-item:checked').length;
        prEl('pr-approved-count').innerText = total;
    };
    if (window.lucide) lucide.createIcons();
}

async function prBuild() {
    if (prUi.busy || !prUi.session) return;
    prUi.busy = true;
    const approved = [...document.querySelectorAll('#pr-step-review .pr-item:checked')].map(c => c.dataset.id);
    prEl('pr-progress-title').innerText = 'Building your paper';
    prEl('pr-bar').style.width = '0%';
    prRenderStages(PR_FINISH_STAGES);
    prShowStep('progress');
    try {
        const base = prUi.file.name.replace(/\.docx$/i, '');
        const out = await prFinish(prUi.session, approved, prUi.file.name, prOnProgress);
        prUi.busy = false;
        await nextFrame(500);
        prRenderDone(out, base);
        prShowStep('done');
    } catch (e) {
        prUi.busy = false;
        console.error(e);
        prShowStep('review');
        showToast('Could not build the file: ' + e.message);
    }
}

function prRenderDone(out, base) {
    const sm = out.summary;
    const host = prEl('pr-step-done');
    host.innerHTML = `
        <div class="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4">
            <div class="mx-auto w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-2xl font-bold">✓</div>
            <h3 class="text-2xl font-extrabold text-slate-900">Your paper is ready</h3>
            <p class="text-sm text-slate-600">${sm.auto.length} automatic fixes, ${sm.approved.length} approved change${sm.approved.length === 1 ? '' : 's'}, ${sm.declined.length} skipped, ${sm.manual.length} note${sm.manual.length === 1 ? '' : 's'} for you.</p>
            <div class="flex flex-wrap justify-center gap-3 pt-2">
                <button type="button" id="pr-dl-doc" class="bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold py-3 px-6 rounded-xl shadow-md">Download reformatted paper (.docx)</button>
                <button type="button" id="pr-dl-report" class="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold py-3 px-6 rounded-xl">Download review report (.docx)</button>
            </div>
            <p class="text-xs text-slate-500">Open it in Word and skim every page once. Word may ask to update fields: choose Yes so page numbers refresh.</p>
            <button type="button" onclick="prReset()" class="text-sm font-semibold text-violet-700 hover:underline">Review another paper</button>
        </div>`;
    prEl('pr-dl-doc').onclick = () => downloadBlob(out.docx, base + '_APA7.docx');
    prEl('pr-dl-report').onclick = () => downloadBlob(out.report, base + '_APA7_Review_Report.docx');
}
