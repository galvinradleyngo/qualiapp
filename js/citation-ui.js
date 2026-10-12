// Citation Generator UI: form handling, DOI/URL/PDF resolution and live citation preview.

// ── Citation Generator Engine ──────────────────────────────────────────
let currentCitationPlain = '';
let lastCitationStatus = { state: null, title: '', desc: '' };
let currentCitationMarked = '';

const sampleCitations = {
    nature: {
        type: 'journal',
        title: 'Array programming with NumPy',
        authors: 'Harris, C. R., Millman, K. J., & van der Walt, S. J.',
        year: '2020',
        source: 'Nature',
        volume: '585',
        issue: '7825',
        pages: '357–362',
        doiUrl: 'https://doi.org/10.1038/s41586-020-2649-2',
        status: { title: 'Verified Nature Article', desc: 'Loaded verified sample via DOI 10.1038/s41586-020-2649-2' }
    },
    arxiv: {
        type: 'journal',
        title: 'Verifiable Fully Homomorphic Encryption',
        authors: 'Viand, A., & Knabenhans, C.',
        year: '2023',
        source: 'arXiv',
        volume: '',
        issue: '',
        pages: '',
        doiUrl: 'https://doi.org/10.48550/arXiv.2301.07041',
        status: { title: 'Verified arXiv Preprint', desc: 'Loaded preprint sample via DOI 10.48550/arXiv.2301.07041' }
    },
    who: {
        type: 'webpage',
        title: 'Mental health: Strengthening our response',
        authors: '',
        year: '2022',
        monthDay: 'June 17',
        source: 'World Health Organization',
        volume: '',
        issue: '',
        pages: '',
        doiUrl: 'https://www.who.int/news-room/fact-sheets/detail/mental-health-strengthening-our-response',
        status: { title: 'Verified WHO Webpage', desc: 'In APA 7, when author and site are identical, the organization is listed in the author position.' }
    }
};

function switchCitationTab(tab) {
    const isPdf = tab === 'pdf';
    document.getElementById('tab-btn-pdf').setAttribute('aria-pressed', String(isPdf));
    document.getElementById('tab-btn-link').setAttribute('aria-pressed', String(!isPdf));
    const pdfSection = document.getElementById('citation-pdf-tab');
    const linkSection = document.getElementById('citation-link-tab');
    if (pdfSection) pdfSection.classList.toggle('hidden', !isPdf);
    if (linkSection) linkSection.classList.toggle('hidden', isPdf);

    const btnPdf = document.getElementById('tab-btn-pdf');
    const btnLink = document.getElementById('tab-btn-link');

    if (isPdf) {
        btnPdf.className = "flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 bg-white text-indigo-600 shadow-sm";
        btnLink.className = "flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 text-slate-600 hover:text-slate-900";
    } else {
        btnLink.className = "flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 bg-white text-indigo-600 shadow-sm";
        btnPdf.className = "flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 text-slate-600 hover:text-slate-900";
    }
    lucide.createIcons();
}

function initPdfDropzone() {
    const dropzone = document.getElementById('pdf-dropzone');
    if (!dropzone) return;

    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add('border-indigo-600', 'bg-indigo-50/50');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('border-indigo-600', 'bg-indigo-50/50');
        });
    });

    dropzone.addEventListener('drop', (e) => {
        const files = e.dataTransfer && e.dataTransfer.files;
        if (files && files.length > 0) processPdfFiles(files);
    });
}

function handlePdfFileInput(e) {
    const files = e.target.files;
    if (files && files.length) processPdfFiles(files);
    e.target.value = '';
}

function setCitationStatus(state, title, desc) {
    const card = document.getElementById('citation-status-card');
    const icon = document.getElementById('citation-status-icon');
    const titleEl = document.getElementById('citation-status-title');
    const descEl = document.getElementById('citation-status-desc');

    if (!card || !icon || !titleEl || !descEl) return;
    lastCitationStatus = { state, title, desc };

    if (!state) {
        card.classList.add('hidden');
        return;
    }

    card.classList.remove('hidden', 'bg-indigo-50', 'text-indigo-900', 'border-indigo-200', 'bg-emerald-50', 'text-emerald-900', 'border-emerald-200', 'bg-amber-50', 'text-amber-900', 'border-amber-200', 'bg-rose-50', 'text-rose-900', 'border-rose-200');
    card.classList.add('border');

    if (state === 'loading') {
        card.classList.add('bg-indigo-50', 'text-indigo-900', 'border-indigo-200');
        icon.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 text-indigo-600 animate-spin"></i>';
    } else if (state === 'success') {
        card.classList.add('bg-emerald-50', 'text-emerald-900', 'border-emerald-200');
        icon.innerHTML = '<i data-lucide="check-circle-2" class="w-4 h-4 text-emerald-600"></i>';
    } else if (state === 'warning') {
        card.classList.add('bg-amber-50', 'text-amber-900', 'border-amber-200');
        icon.innerHTML = '<i data-lucide="alert-triangle" class="w-4 h-4 text-amber-600"></i>';
    } else {
        card.classList.add('bg-rose-50', 'text-rose-900', 'border-rose-200');
        icon.innerHTML = '<i data-lucide="alert-circle" class="w-4 h-4 text-rose-600"></i>';
    }

    titleEl.innerText = title;
    descEl.innerText = desc || '';
    lucide.createIcons();
}

// ── PDF reading: uploaded files and links to PDFs ──────────────────────
const PDF_MAX_BYTES = 25 * 1024 * 1024;
const PDF_BAD_TITLE = /^(untitled|microsoft word|document\d*|slide\d*|powerpoint|presentation|new document)\b|\.(docx?|pptx?|indd|tex|pdf|rtf)\s*$/i;
const PDF_BAD_AUTHOR = /^(admin|administrator|user|owner|pc|unknown|microsoft|adobe|author|default|windows user|scanner|canon|hp|xerox|office|ghostscript)\b|[\\@]/i;
const MONTHS_RE = 'January|February|March|April|May|June|July|August|September|October|November|December';

function looksLikePdfUrl(urlStr) {
    try {
        const u = new URL(/^https?:\/\//i.test(urlStr) ? urlStr : `https://${urlStr}`);
        return /\.pdf$/i.test(u.pathname) || /(^|\/)pdf(\/|$)/i.test(u.pathname) || /[?&](?:format|type|output|file)=pdf\b/i.test(u.search);
    } catch (e) {
        return false;
    }
}

async function fetchPdfBytes(url) {
    const enc = encodeURIComponent(url);
    const attempt = async endpoint => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        try {
            const resp = await fetch(endpoint, { signal: controller.signal });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            if ((+resp.headers.get('content-length') || 0) > PDF_MAX_BYTES) throw new Error('too-large');
            const buf = await resp.arrayBuffer();
            if (buf.byteLength > PDF_MAX_BYTES) throw new Error('too-large');
            const head = new Uint8Array(buf.slice(0, 1024));
            let s = '';
            head.forEach(b => { s += String.fromCharCode(b); });
            if (!s.includes('%PDF-')) throw new Error('not-pdf');
            return buf;
        } finally {
            clearTimeout(timer);
        }
    };
    const routes = [url];
    if (METADATA_PROXY_URL) routes.push(`${METADATA_PROXY_URL}${METADATA_PROXY_URL.includes('?') ? '&' : '?'}url=${enc}`);
    routes.push(`https://corsproxy.io/?url=${enc}`, `https://api.allorigins.win/raw?url=${enc}`, `https://api.codetabs.com/v1/proxy?quest=${enc}`);
    return Promise.any(routes.map(attempt));
}

// The text that is set in the largest type on page 1 is almost always the document title.
function pdfLargestText(items) {
    const real = items.filter(it => it.str && it.str.trim().length > 1 && it.transform);
    if (!real.length) return '';
    const heights = real.map(it => Math.abs(it.transform[3] || it.height || 0)).filter(Boolean).sort((a, b) => a - b);
    const max = heights[heights.length - 1];
    const median = heights[Math.floor(heights.length / 2)];
    if (!max || max < median * 1.15) return '';
    const big = real.filter(it => Math.abs(it.transform[3] || it.height || 0) >= max - 0.6);
    const lines = [];
    big.forEach(it => {
        const y = Math.round(it.transform[5]);
        const line = lines.find(l => Math.abs(l.y - y) <= 3);
        if (line) line.parts.push(it.str); else lines.push({ y, parts: [it.str] });
    });
    lines.sort((a, b) => b.y - a.y);
    return lines.slice(0, 3).map(l => l.parts.join(' ').replace(/\s+/g, ' ').trim()).join(' ').slice(0, 220);
}

async function readPdfDocument(arrayBuffer) {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const metadata = await pdf.getMetadata().catch(() => ({}));
    const info = (metadata && metadata.info) || {};
    let firstPage = '', later = '', titleGuess = '';
    const pages = Math.min(pdf.numPages, 3);
    for (let i = 1; i <= pages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map(item => item.str).join(' ');
        if (i === 1) { firstPage = pageText; titleGuess = pdfLargestText(content.items); }
        else later += ' ' + pageText;
    }
    return { info, firstPage, later, titleGuess, numPages: pdf.numPages };
}

function pdfPlausibleYear(n) {
    const y = parseInt(n, 10);
    return y >= 1900 && y <= new Date().getFullYear() + 1;
}

function pdfGuessYear(info, text) {
    const labelled = text.match(new RegExp(`(?:©|\\(c\\)|copyright|published|issued|updated|revised)[^0-9]{0,40}(?:(?:${MONTHS_RE})\\s+(?:\\d{1,2},?\\s+)?)?((?:19|20)\\d{2})`, 'i'))
        || text.match(new RegExp(`(?:${MONTHS_RE})\\s+(?:\\d{1,2},?\\s+)?((?:19|20)\\d{2})`));
    if (labelled && pdfPlausibleYear(labelled[1])) return { year: labelled[1], found: true };
    for (const key of ['CreationDate', 'ModDate']) {
        const m = info[key] && String(info[key]).match(/D:(\d{4})/);
        if (m && pdfPlausibleYear(m[1])) return { year: m[1], found: false };
    }
    const any = text.match(/\b((?:19|20)\d{2})\b/);
    return any && pdfPlausibleYear(any[1]) ? { year: any[1], found: false } : { year: '', found: false };
}

// Fills the form from what the PDF itself tells us (no DOI available). Returns the status to show.
function populateFromPdfHeuristics(doc, label, sourceUrl) {
    const { info, firstPage, later, titleGuess } = doc;
    const cleanInfoTitle = info.Title && info.Title.trim() && !PDF_BAD_TITLE.test(info.Title.trim()) ? info.Title.trim() : '';
    const filenameTitle = label.replace(/\.pdf$/i, '').replace(/[-_+]+/g, ' ').trim();
    let titleFrom = 'guess';
    let title = cleanInfoTitle;
    if (title) titleFrom = 'found';
    else if (titleGuess && !PDF_BAD_TITLE.test(titleGuess)) { title = titleGuess; titleFrom = 'found'; }
    else {
        const line = firstPage.split(/\s{2,}|\n/).map(l => l.trim()).find(l => l.length > 8 && !/^(volume|issue|page|issn|isbn|http|www|copyright|\d)/i.test(l));
        title = line ? line.slice(0, 150) : filenameTitle;
    }
    if (title === title.toUpperCase() && /[A-Z]{4}/.test(title)) title = title.toLowerCase();

    let host = null;
    try { host = sourceUrl ? new URL(sourceUrl).hostname : null; } catch (e) { host = null; }
    const orgName = host && host.includes('.') ? (knownOrganizationName(host) || (isInstitutionalHost(host) ? mapDomainToSiteName(host) : '')) : '';
    const siteName = host && host.includes('.') ? mapDomainToSiteName(host) : '';
    const infoAuthor = info.Author && info.Author.trim() && !PDF_BAD_AUTHOR.test(info.Author.trim()) && info.Author.trim().length < 120 ? info.Author.trim() : '';
    const author = infoAuthor || orgName;
    const authorFrom = infoAuthor ? 'found' : (orgName ? 'guess' : 'missing');
    const dateGuess = pdfGuessYear(info, `${firstPage} ${later}`);

    setCiteTypeFromSource('report');
    document.getElementById('cite-title').value = toSentenceCase(title, [orgName, siteName].filter(Boolean));
    document.getElementById('cite-authors').value = author;
    document.getElementById('cite-year').value = dateGuess.year;
    if (document.getElementById('cite-monthday')) document.getElementById('cite-monthday').value = '';
    const publisher = (orgName && author.toLowerCase() === orgName.toLowerCase()) ? '' : (orgName || siteName || '');
    document.getElementById('cite-source').value = publisher;
    document.getElementById('cite-doi-url').value = sourceUrl ? cleanUrlForCitation(new URL(sourceUrl)) : '';
    clearFieldProvenance();
    updateCitationPreview();
    applyFieldProvenance({
        'cite-title': titleFrom,
        'cite-authors': authorFrom,
        'cite-year': dateGuess.year ? (dateGuess.found ? 'found' : 'guess') : 'missing',
        'cite-source': publisher ? 'guess' : 'missing',
        'cite-doi-url': sourceUrl ? 'found' : 'missing'
    });
    const gaps = [];
    if (!author) gaps.push('author');
    if (!dateGuess.year) gaps.push('date');
    return {
        state: 'warning',
        title: sourceUrl ? 'PDF read from the link' : 'PDF analyzed (no DOI found)',
        desc: `Title, author and date were taken from the PDF itself${gaps.length ? `; no ${gaps.join(' or ')} was found` : ''}. Check the amber and red fields, which are guesses or missing.`
    };
}

// Reads a PDF (from a file or downloaded from a link) and fills the form. Returns { state, title, desc }.
async function processPdfData(arrayBuffer, label, sourceUrl) {
    if (typeof pdfjsLib === 'undefined') {
        return { state: 'error', title: 'PDF parser unavailable', desc: 'PDF.js did not load. Check your network connection and reload the page.' };
    }
    let doc;
    try {
        doc = await readPdfDocument(arrayBuffer);
    } catch (err) {
        console.error('PDF parsing error:', err);
        return { state: 'error', title: 'Could not read PDF', desc: 'The PDF is damaged, password-protected, or only contains scanned images without text.' };
    }
    const infoText = Object.values(doc.info || {}).filter(v => typeof v === 'string').join(' ');
    const candidates = [
        { doi: extractDoiFromText(doc.firstPage), trusted: true },
        { doi: extractDoiFromText(infoText), trusted: true },
        { doi: extractDoiFromText(doc.later), trusted: false }
    ].filter(c => c.doi);
    for (const c of candidates) {
        setCitationStatus('loading', 'DOI found in the PDF', `Found DOI ${c.doi}. Asking Crossref for the verified record...`);
        // A DOI from the later pages is often just a cited work, so it must match the document's own title.
        const resolved = await resolveDoiMetadata(c.doi);
        if (!resolved) continue;
        if (!c.trusted && doc.titleGuess) {
            const got = document.getElementById('cite-title').value;
            if (titleSimilarity(got, doc.titleGuess) < 0.4) continue;
        }
        return { state: 'success', title: 'Verified via Crossref', desc: `Complete metadata from DOI ${c.doi} found in "${label}".` };
    }
    return populateFromPdfHeuristics(doc, label, sourceUrl);
}

function clearCitationFieldsQuiet() {
    ['cite-title', 'cite-authors', 'cite-year', 'cite-monthday', 'cite-source', 'cite-volume', 'cite-issue', 'cite-pages', 'cite-doi-url'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    resetExtraCitationFields();
    clearFieldProvenance();
}

async function processPdfFiles(fileList) {
    const files = [...fileList];
    const pdfs = files.filter(f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
    const skipped = files.length - pdfs.length;
    if (!pdfs.length) {
        setCitationStatus('error', 'Unsupported file', 'Please upload PDF documents (.pdf).');
        return;
    }
    const results = [];
    for (let i = 0; i < pdfs.length; i++) {
        const file = pdfs[i];
        setCitationStatus('loading', pdfs.length > 1 ? `Reading PDF ${i + 1} of ${pdfs.length}` : 'Analyzing PDF...', `Reading ${file.name} and scanning for bibliographic data...`);
        await nextFrame(20);
        activeBatchId = null;
        clearCitationFieldsQuiet();
        let status;
        try {
            if (file.size > PDF_MAX_BYTES) status = { state: 'error', title: 'PDF too large', desc: 'Files over 25 MB are not read in the browser.' };
            else status = await processPdfData(await file.arrayBuffer(), file.name, '');
        } catch (e) {
            status = { state: 'error', title: 'Could not read PDF', desc: e.message };
        }
        results.push(status);
        recordBatchEntry(file.name, status);
    }
    const ok = results.filter(r => r.state !== 'error').length;
    if (pdfs.length === 1) {
        setCitationStatus(results[0].state, results[0].title, results[0].desc);
        if (results[0].state !== 'error') showToast('Citation generated from PDF!');
    } else {
        const verified = results.filter(r => r.state === 'success').length;
        setCitationStatus(ok === pdfs.length ? 'success' : 'warning', `Read ${ok} of ${pdfs.length} PDFs`,
            `${verified} verified through a DOI, ${ok - verified} built from the PDF text and properties${skipped ? `; ${skipped} non-PDF file${skipped === 1 ? '' : 's'} skipped` : ''}. Review each entry below, then add them all to the bibliography.`);
        showToast(`Generated ${ok} citation${ok === 1 ? '' : 's'}.`);
    }
}

// A link to a PDF: download it, then read it the same way as an uploaded file.
async function resolvePdfUrl(urlStr) {
    let parsed;
    try {
        parsed = new URL(/^https?:\/\//i.test(urlStr) ? urlStr : `https://${urlStr}`);
    } catch (e) {
        return false;
    }
    setCitationStatus('loading', 'Downloading the PDF...', `Fetching ${parsed.hostname} so its title, authors and DOI can be read.`);
    let bytes;
    try {
        bytes = await fetchPdfBytes(parsed.href);
    } catch (e) {
        return false;
    }
    const status = await processPdfData(bytes, parsed.pathname.split('/').pop() || parsed.hostname, parsed.href);
    setCitationStatus(status.state, status.title, status.desc);
    if (status.state !== 'error') showToast('Citation generated from the PDF link!');
    return status.state !== 'error';
}

const LINK_TOKEN = /^(?:https?:\/\/\S+|www\.\S+|(?:doi:\s*)?10\.\d{4,9}\/\S+)$/i;

async function handleResolveUrl() {
    const input = document.getElementById('citation-url-input').value.trim();
    if (!input) {
        setCitationStatus('error', 'Empty Input', 'Please enter a web link or DOI to generate a citation.');
        return;
    }

    const tokens = input.split(/[\s,;]+/).filter(Boolean);
    const isBatch = tokens.length > 1 && tokens.every(tok => LINK_TOKEN.test(tok));
    const btn = document.getElementById('btn-resolve-url');
    if (btn) btn.disabled = true;
    activeBatchId = null;

    try {
        if (!isBatch) {
            setCitationStatus('loading', 'Resolving Reference...', 'Searching academic registries and web metadata...');
            await resolveWebOrDoi(input);
            return;
        }
        let ok = 0;
        for (let i = 0; i < tokens.length; i++) {
            setCitationStatus('loading', `Resolving link ${i + 1} of ${tokens.length}`, tokens[i]);
            await nextFrame(20);
            activeBatchId = null;
            clearCitationFieldsQuiet();
            try { await resolveWebOrDoi(tokens[i]); } catch (e) { setCitationStatus('error', 'Could not resolve', e.message); }
            if (lastCitationStatus.state !== 'error') ok++;
            recordBatchEntry(tokens[i], lastCitationStatus);
        }
        setCitationStatus(ok === tokens.length ? 'success' : 'warning', `Resolved ${ok} of ${tokens.length} links`, 'Review each entry in the list below, then add them all to the bibliography.');
        showToast(`Generated ${ok} citation${ok === 1 ? '' : 's'}.`);
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function resolveWebOrDoi(input) {
    // 1. Direct or embedded DOI
    const doi = extractDoiFromText(input);
    if (doi) {
        setCitationStatus('loading', 'Querying Registry...', `Found DOI: ${doi}. Contacting Crossref...`);
        const ok = await resolveDoiMetadata(doi);
        if (ok) {
            setCitationStatus('success', 'Verified via Academic DOI Registry', `Successfully fetched bibliographic data for ${doi}.`);
            showToast('Citation generated from DOI!');
            return;
        }
    }

    // 2. arXiv identifier or link
    const arxivMatch = input.match(/arxiv\.org\/(?:abs|pdf)\/([0-9]+\.[0-9]+)/i) || input.match(/\barxiv:\s*([0-9]+\.[0-9]+)/i);
    if (arxivMatch) {
        const arxivDoi = `10.48550/arXiv.${arxivMatch[1]}`;
        const ok = await resolveDoiMetadata(arxivDoi);
        if (ok) {
            setCitationStatus('success', 'Verified via arXiv Preprint Registry', `Successfully retrieved preprint metadata for arXiv:${arxivMatch[1]}.`);
            showToast('Citation generated from arXiv!');
            return;
        }
    }

    // 3a. YouTube video via oEmbed
    if (await resolveYouTubeUrl(input)) return;

    // 3b. Social media post (X, Instagram, Facebook, TikTok, Reddit, LinkedIn, Threads, Bluesky)
    if (await resolveSocialUrl(input)) return;

    // 3. Wikipedia article
    const wikiMatch = input.match(/wikipedia\.org\/wiki\/([^#?&]+)/i);
    if (wikiMatch) {
        const articleSlug = decodeURIComponent(wikiMatch[1]);
        try {
            const resp = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(articleSlug)}`);
            if (resp.ok) {
                const data = await resp.json();
                setCiteTypeFromSource('webpage');
                document.getElementById('cite-title').value = toSentenceCase(data.title || articleSlug.replace(/_/g, ' '));
                document.getElementById('cite-authors').value = '';
                document.getElementById('cite-year').value = new Date().getFullYear().toString();
                document.getElementById('cite-monthday').value = '';
                document.getElementById('cite-source').value = 'Wikipedia';
                document.getElementById('cite-doi-url').value = input;
                updateCitationPreview();
                setCitationStatus('success', 'Wikipedia Page Resolved', `Retrieved summary for "${data.title}". In APA 7, Wikipedia entries use the article title in place of author.`);
                showToast('Citation generated from Wikipedia!');
                return;
            }
        } catch (e) {
            console.warn('Wikipedia API fetch failed', e);
        }
    }

    // 4. A link straight to a PDF: read the PDF itself rather than the site around it.
    if (looksLikePdfUrl(input) && await resolvePdfUrl(input)) return;

    // 5. General webpage via URL parsing & metadata fetch attempt
    const pdfFallback = looksLikePdfUrl(input);
    await resolveGeneralWebUrl(input);
    if (pdfFallback && lastCitationStatus.state !== 'error') {
        setCitationStatus('warning', 'PDF link: built from the address only', 'The PDF could not be downloaded here (the site blocks outside access or is too large), so its contents were not read. The title, author and date come from the link. Download the PDF and use "Upload PDF" for a complete citation.');
    }
}

async function resolveDoiMetadata(doi) {
    const cleanDoi = doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').trim();

    // 1. Crossref
    try {
        const resp = await fetch(`https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}`, {
            headers: { 'Accept': 'application/json' }
        });
        if (resp.ok) {
            const json = await resp.json();
            const msg = json.message;
            if (msg) {
                populateFromCrossref(msg, cleanDoi);
                return true;
            }
        }
    } catch (e) {
        console.warn('Crossref request failed:', e);
    }

    // 2. Datacite fallback
    try {
        const resp = await fetch(`https://api.datacite.org/dois/${encodeURIComponent(cleanDoi)}`);
        if (resp.ok) {
            const json = await resp.json();
            const attrs = json.data && json.data.attributes;
            if (attrs) {
                populateFromDatacite(attrs, cleanDoi);
                return true;
            }
        }
    } catch (e) {
        console.warn('Datacite request failed:', e);
    }

    return false;
}

function populateFromCrossref(msg, cleanDoi) {
    setCiteTypeFromSource(inferCrossrefSourceType(msg));

    const rawTitle = Array.isArray(msg.title) ? msg.title[0] : (msg.title || '');
    document.getElementById('cite-title').value = toSentenceCase(rawTitle);

    if (Array.isArray(msg.author) && msg.author.length > 0) {
        document.getElementById('cite-authors').value = formatAuthorsApa(msg.author);
    } else {
        document.getElementById('cite-authors').value = msg.publisher || '';
    }

    let year = '';
    const dateParts = (msg.issued && msg.issued['date-parts'] && msg.issued['date-parts'][0]) ||
                      (msg.created && msg.created['date-parts'] && msg.created['date-parts'][0]);
    if (dateParts && dateParts[0]) {
        year = dateParts[0].toString();
    }
    document.getElementById('cite-year').value = year;

    const containerRaw = Array.isArray(msg['container-title']) ? msg['container-title'][0] : (msg['container-title'] || '');
    const citeType = document.getElementById('cite-type').value;
    if (citeType === 'chapter') {
        document.getElementById('cite-container').value = toSentenceCase(containerRaw || '');
        document.getElementById('cite-editors').value = Array.isArray(msg.editor) && msg.editor.length ? formatAuthorsApa(msg.editor) : '';
        document.getElementById('cite-source').value = msg.publisher || '';
    } else if (citeType === 'thesis') {
        const inst = Array.isArray(msg.institution) && msg.institution[0] ? msg.institution[0].name : '';
        document.getElementById('cite-source').value = inst || msg.publisher || '';
    } else if (citeType === 'journal') {
        document.getElementById('cite-source').value = (containerRaw || msg.publisher) ? toTitleCase(containerRaw || msg.publisher) : '';
    } else {
        document.getElementById('cite-source').value = containerRaw || msg.publisher || '';
    }
    const editionNumber = parseInt(msg['edition-number'], 10);
    if (['book', 'chapter'].includes(citeType) && editionNumber > 1) document.getElementById('cite-edition').value = String(editionNumber);

    document.getElementById('cite-volume').value = msg.volume || '';
    document.getElementById('cite-issue').value = msg.issue || '';
    document.getElementById('cite-pages').value = msg.page ? msg.page.replace('-', '–') : '';

    document.getElementById('cite-doi-url').value = `https://doi.org/${cleanDoi}`;

    updateCitationPreview();
    applyFieldProvenance({});
}

function populateFromDatacite(attrs, cleanDoi) {
    const resourceType = ((attrs.types && (attrs.types.resourceTypeGeneral || attrs.types.resourceType)) || '').toLowerCase();
    const isArticle = resourceType.includes('article') || resourceType.includes('journal');
    const dataciteType = isArticle ? 'journal' : resourceType.includes('dataset') ? 'dataset'
        : resourceType.includes('software') ? 'software' : resourceType.includes('dissertation') ? 'thesis' : 'report';
    setCiteTypeFromSource(dataciteType);

    const title = attrs.titles && attrs.titles[0] ? attrs.titles[0].title : '';
    document.getElementById('cite-title').value = toSentenceCase(title);

    if (Array.isArray(attrs.creators) && attrs.creators.length > 0) {
        document.getElementById('cite-authors').value = formatAuthorsApa(attrs.creators);
    } else {
        document.getElementById('cite-authors').value = attrs.publisher || '';
    }

    document.getElementById('cite-year').value = attrs.publicationYear ? attrs.publicationYear.toString() : '';
    document.getElementById('cite-source').value = (attrs.publisher && attrs.publisher.name) || attrs.publisher || 'arXiv';
    if (['dataset', 'software'].includes(dataciteType) && attrs.version) document.getElementById('cite-edition').value = `Version ${attrs.version}`;
    document.getElementById('cite-volume').value = '';
    document.getElementById('cite-issue').value = '';
    document.getElementById('cite-pages').value = '';
    document.getElementById('cite-doi-url').value = `https://doi.org/${cleanDoi}`;

    updateCitationPreview();
    applyFieldProvenance({});
}

// Optional self-hosted metadata proxy (see worker/README.md). Set window.APA_METADATA_PROXY
// before this script runs, or edit this constant, to route page fetches through it first.
const METADATA_PROXY_URL = (typeof window !== 'undefined' && window.APA_METADATA_PROXY) || '';
const PROVENANCE_FIELDS = ['cite-title', 'cite-authors', 'cite-year', 'cite-source', 'cite-doi-url'];

function clearFieldProvenance() {
    PROVENANCE_FIELDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('prov-found', 'prov-guess', 'prov-missing');
    });
    const legend = document.getElementById('citation-prov-legend');
    if (legend) legend.classList.add('hidden');
}

// states maps a field id to 'found' | 'guess'; empty required fields are shown as missing.
function applyFieldProvenance(states) {
    clearFieldProvenance();
    PROVENANCE_FIELDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const hasValue = !!el.value.trim();
        if (!hasValue && !['cite-authors', 'cite-year', 'cite-title'].includes(id)) return;
        el.classList.add(`prov-${hasValue ? (states[id] || 'found') : 'missing'}`);
    });
    const legend = document.getElementById('citation-prov-legend');
    if (legend) legend.classList.remove('hidden');
}

// Looks a page title up in Crossref and returns a DOI only for a near-exact title match.
async function findDoiByTitle(title, authorHint) {
    if (!title || title.split(/\s+/).length < 4) return null;
    try {
        const query = `query.bibliographic=${encodeURIComponent(title)}${authorHint ? '&query.author=' + encodeURIComponent(authorHint) : ''}&rows=3&select=DOI,title`;
        const resp = await fetch(`https://api.crossref.org/works?${query}`);
        if (!resp.ok) return null;
        const items = ((await resp.json()).message || {}).items || [];
        const hit = items.find(it => titleSimilarity(title, (it.title || [])[0]) >= 0.85);
        return hit ? hit.DOI : null;
    } catch (e) {
        return null;
    }
}

async function fetchWaybackHtml(url, attempt) {
    try {
        const resp = await fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`);
        if (!resp.ok) return null;
        const snap = ((await resp.json()).archived_snapshots || {}).closest;
        if (!snap || !snap.available) return null;
        const rawUrl = snap.url.replace(/^http:/, 'https:').replace(/\/web\/(\d+)\//, '/web/$1id_/');
        const enc = encodeURIComponent(rawUrl);
        return await Promise.any([
            attempt(rawUrl, r => r.text()),
            attempt(`https://api.allorigins.win/get?url=${enc}`, async r => (await r.json()).contents),
            attempt(`https://corsproxy.io/?url=${enc}`, r => r.text())
        ]);
    } catch (e) {
        return null;
    }
}

// Fetches JSON that browsers usually cannot read cross-origin: directly first, then through public proxies.
async function fetchJson(url) {
    const attempt = async (endpoint, unwrap) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 7000);
        try {
            const resp = await fetch(endpoint, { signal: controller.signal });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            return await unwrap(resp);
        } finally {
            clearTimeout(timer);
        }
    };
    const enc = encodeURIComponent(url);
    return Promise.any([
        attempt(url, r => r.json()),
        attempt(`https://api.allorigins.win/get?url=${enc}`, async r => JSON.parse((await r.json()).contents)),
        attempt(`https://corsproxy.io/?url=${enc}`, r => r.json())
    ]);
}

function htmlToPlainText(html) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    return doc.body.textContent || '';
}

async function resolveSocialUrl(input) {
    const info = parseSocialUrl(input);
    if (!info) return false;
    setCitationStatus('loading', `Reading ${info.platform} post...`, 'Looking for the author, date and post text...');

    let name = '', handle = info.handle, text = '', date = { year: '', monthDay: '' };
    let dateFromApi = false;
    const fetched = { name: false, text: false };
    try {
        if (info.key === 'bluesky') {
            const uri = `at://${info.handle}/app.bsky.feed.post/${info.postId}`;
            const json = await fetchJson(`https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=0`);
            const post = parseBlueskyThread(json);
            if (post) { name = post.name; handle = post.handle || handle; text = post.text; date = post.date; dateFromApi = !!date.year; }
        } else if (info.key === 'x') {
            const json = await fetchJson(`https://publish.twitter.com/oembed?url=${encodeURIComponent(info.url)}&omit_script=1&dnt=true`);
            const doc = new DOMParser().parseFromString(json.html || '', 'text/html');
            name = json.author_name || '';
            text = doc.querySelector('p') ? doc.querySelector('p').textContent : '';
            const anchors = [...doc.querySelectorAll('a')];
            const dateText = anchors.length ? anchors[anchors.length - 1].textContent : '';
            date = parseDateParts(dateText);
            dateFromApi = !!date.year;
            if (json.author_url) handle = json.author_url.split('/').filter(Boolean).pop() || handle;
        } else if (info.key === 'tiktok') {
            const json = await fetchJson(`https://www.tiktok.com/oembed?url=${encodeURIComponent(info.url)}`);
            name = json.author_name || ''; text = json.title || '';
            handle = json.author_unique_id || handle;
        } else if (info.key === 'reddit') {
            const json = await fetchJson(`https://www.reddit.com/comments/${encodeURIComponent(info.postId)}.json?raw_json=1&limit=1`);
            const post = parseRedditJson(json);
            if (post) { name = post.author; text = post.title; date = post.date; dateFromApi = !!date.year; }
        } else {
            const html = await fetchPageHtml(info.url);
            const meta = html ? parseHtmlMetadata(html, new URL(info.url).hostname) : null;
            const doc = html ? new DOMParser().parseFromString(html, 'text/html') : null;
            const og = prop => { const el = doc && doc.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`); return el ? (el.getAttribute('content') || '') : ''; };
            const insta = info.key === 'instagram' ? parseInstagramDescription(og('og:description')) : null;
            if (insta) { handle = insta.handle; text = insta.text; date = insta.date; dateFromApi = !!date.year; }
            else if (meta) { text = og('og:description') || meta.title; if (meta.year) { date = { year: meta.year, monthDay: meta.monthDay }; dateFromApi = true; } }
            name = meta && meta.author ? meta.author : (/^(.+?)\s+(?:on|\|)\s+/i.exec(og('og:title')) || [])[1] || '';
            if (info.key === 'reddit') name = '';
        }
    } catch (e) {
        console.warn('Social post lookup failed:', e);
    }

    name = String(name || '').trim();
    text = truncateWords(cleanSocialText(text || (info.title ? info.title : '')), 20);
    fetched.name = !!name;
    fetched.text = !!text;
    const idDate = (!date.year && info.postId) ? dateFromSocialId(info.key, info.postId) : { year: '', monthDay: '' };
    const finalDate = date.year ? date : idDate;

    setCiteTypeFromSource('social');
    document.getElementById('cite-title').value = text;
    document.getElementById('cite-authors').value = info.key === 'reddit' ? (name || '') : socialAuthor(name, handle);
    document.getElementById('cite-year').value = finalDate.year;
    document.getElementById('cite-monthday').value = finalDate.monthDay;
    document.getElementById('cite-source').value = info.platform;
    document.getElementById('cite-descriptor').value = info.descriptor;
    document.getElementById('cite-doi-url').value = info.url;
    updateCitationPreview();
    applyFieldProvenance({
        'cite-title': fetched.text ? 'found' : 'guess',
        'cite-authors': fetched.name ? 'found' : 'guess',
        'cite-year': dateFromApi ? 'found' : 'guess',
        'cite-source': 'found',
        'cite-doi-url': 'found'
    });

    const notes = [];
    if (!fetched.text) notes.push('add the first 20 words of the post as the title');
    if (!fetched.name) notes.push(`confirm the author's name${handle ? ` (only the handle @${handle} came from the link)` : ''}`);
    if (!dateFromApi) notes.push(finalDate.year ? 'check the date (it was worked out from the post ID and is in UTC, so it can be a day off)' : 'add the date');
    if (info.key !== 'reddit') notes.push('fill in "Attached media" if the post has an image, video or link preview, and describe any emoji in brackets');
    const complete = fetched.text && fetched.name && dateFromApi;
    setCitationStatus(complete ? 'success' : 'warning', `${info.platform} Post Recognized`,
        complete ? 'Found the author, date and text. Check the details below.' : `Please ${notes.join('; ')}.`);
    showToast('Social media citation generated!');
    return true;
}

async function resolveYouTubeUrl(input) {
    const video = parseYouTubeUrl(input);
    if (!video) return false;
    let data;
    try {
        const resp = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(video.url)}&format=json`);
        if (!resp.ok) return false;
        data = await resp.json();
    } catch (e) {
        return false;
    }

    // oEmbed has no upload date, so read it from the watch page (through the proxy when needed).
    setCitationStatus('loading', 'YouTube Video Found', 'Looking for the upload date...');
    let date = { year: '', monthDay: '' };
    try {
        const html = await fetchPageHtml(video.url);
        if (html) date = parseYouTubeUploadDate(html);
    } catch (e) { /* the date stays empty and is flagged below */ }

    const channel = String(data.author_name || '').trim();
    const author = youtubeAuthor(channel);
    setCiteTypeFromSource('video');
    document.getElementById('cite-title').value = toSentenceCase(data.title || '', [channel]);
    document.getElementById('cite-authors').value = author.field;
    document.getElementById('cite-year').value = date.year;
    document.getElementById('cite-monthday').value = date.monthDay;
    document.getElementById('cite-source').value = 'YouTube';
    document.getElementById('cite-doi-url').value = video.url;
    updateCitationPreview();
    applyFieldProvenance({ 'cite-title': 'found', 'cite-authors': 'found', 'cite-year': date.year ? 'found' : 'guess' });

    const notes = [];
    if (!date.year) notes.push('add the upload date shown under the video (year, then month and day)');
    notes.push(author.person
        ? `"${channel}" was formatted as a person's name; if it is a channel or organization, type the channel name in braces, e.g. {${channel}}`
        : `the channel name "${channel}" is used as the author (APA uses the uploader); if the uploader is a person, enter Last, F.`);
    setCitationStatus(date.year ? 'success' : 'warning', 'YouTube Video Found',
        `${date.year ? 'Found the title, uploader and upload date. ' : 'Found the title and uploader. '}Please ${notes.join('; ')}.`);
    showToast('Video citation generated!');
    return true;
}

async function fetchPageHtml(url) {
    lastFetchFailures = [];
    const attempt = async (endpoint, unwrap) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7000);
        try {
            const resp = await fetch(endpoint, { signal: controller.signal });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const html = await unwrap(resp);
            if (!html || !/<(html|head|meta|title)/i.test(html)) throw new Error('No HTML');
            if (looksLikeBlockPage(html)) throw new Error('blocked-page');
            return html;
        } catch (err) {
            lastFetchFailures.push(err);
            throw err;
        } finally {
            clearTimeout(timeoutId);
        }
    };
    const enc = encodeURIComponent(url);
    if (METADATA_PROXY_URL) {
        try {
            return await attempt(`${METADATA_PROXY_URL}${METADATA_PROXY_URL.includes('?') ? '&' : '?'}url=${enc}`, r => r.text());
        } catch (e) { /* fall through to public routes */ }
    }
    try {
        return await Promise.any([
            attempt(url, r => r.text()),
            attempt(`https://api.allorigins.win/get?url=${enc}`, async r => (await r.json()).contents),
            attempt(`https://corsproxy.io/?url=${enc}`, r => r.text()),
            attempt(`https://api.codetabs.com/v1/proxy?quest=${enc}`, r => r.text())
        ]);
    } catch (e) {
        return fetchWaybackHtml(url, attempt);
    }
}

async function resolveGeneralWebUrl(urlStr) {
    let parsedUrl;
    try {
        parsedUrl = new URL(/^https?:\/\//i.test(urlStr) ? urlStr : `https://${urlStr}`);
    } catch (e) {
        setCitationStatus('error', 'Invalid Web Address', 'Please check that the URL is formatted correctly (e.g. https://example.com/article).');
        return;
    }

    const domainName = mapDomainToSiteName(parsedUrl.hostname);
    if (isLaudatoSiUrl(parsedUrl)) {
        populateLaudatoSiCitation(parsedUrl.href);
        setCitationStatus('success', 'Laudato si’ Document Recognized', 'Recognized as Pope Francis’ 2015 encyclical and applied the APA religious-document format.');
        showToast('Laudato si’ citation generated.');
        return;
    }

    const titleCandidate = deriveTitleFromUrlPath(parsedUrl.pathname);
    let dateParts = { year: '', monthDay: '' };
    const pathDate = parsedUrl.pathname.match(/\/((?:19|20)\d{2})[\/-](\d{1,2})[\/-](\d{1,2})(?=\/|$|-)/);
    if (pathDate) {
        dateParts = parseDateParts(`${pathDate[1]}-${pathDate[2]}-${pathDate[3]}`);
    } else {
        const yearOnly = parsedUrl.pathname.match(/\/((?:19|20)\d{2})(?=\/|$)/);
        if (yearOnly) dateParts.year = yearOnly[1];
    }

    const html = await fetchPageHtml(parsedUrl.href);
    const meta = html ? parseHtmlMetadata(html, parsedUrl.hostname) : null;

    if (meta && meta.doi && /^10\./.test(meta.doi)) {
        if (await resolveDoiMetadata(meta.doi)) {
            setCitationStatus('success', 'DOI Found in Webpage', `Identified DOI ${meta.doi} from webpage metadata.`);
            showToast('Citation generated via webpage DOI!');
            return;
        }
    }

    if (meta && meta.title && !isNewsHost(parsedUrl.hostname) && !meta.journal) {
        const titleDoi = await findDoiByTitle(meta.title, (meta.author || '').split(/;\s*/)[0]);
        if (titleDoi && await resolveDoiMetadata(titleDoi)) {
            setCitationStatus('success', 'Matched in Crossref', `The page title matched a published work (DOI ${titleDoi}). Check it is the right paper before using it.`);
            showToast('Citation matched via Crossref!');
            return;
        }
    }

    let citeUrl = cleanUrlForCitation(parsedUrl);
    if (meta && meta.canonical) {
        try {
            const canonical = new URL(meta.canonical, parsedUrl.href);
            if (canonical.hostname === parsedUrl.hostname) citeUrl = cleanUrlForCitation(canonical);
        } catch (e) { /* keep original */ }
    }

    const siteName = (meta && meta.siteName) || domainName;
    const institutional = isInstitutionalHost(parsedUrl.hostname);
    const isPdf = /\.pdf$/i.test(parsedUrl.pathname);
    const isJournalPage = !!(meta && meta.journal);
    const type = isJournalPage ? 'journal' : (isPdf ? 'report' : (isNewsHost(parsedUrl.hostname) ? 'article' : 'webpage'));

    setCiteTypeFromSource(type);

    const isHomePage = parsedUrl.pathname === '/' || parsedUrl.pathname === '';
    const rawTitle = (meta && meta.title) || titleCandidate || (isHomePage && siteName ? siteName : (domainName ? `${domainName} home page` : 'Webpage'));
    const orgName = knownOrganizationName(parsedUrl.hostname);
    const orgAuthor = !isJournalPage && institutional ? (orgName || siteName) : '';
    const authors = (meta && meta.author) || orgAuthor;
    const authorIsOrgGuess = !(meta && meta.author) && !!orgAuthor;
    const year = (meta && meta.year) || dateParts.year;
    const monthDay = (meta && meta.year) ? meta.monthDay : dateParts.monthDay;

    document.getElementById('cite-title').value = toSentenceCase(rawTitle, [siteName, ...(authors ? authors.split(/[;,]\s*/) : [])]);
    document.getElementById('cite-authors').value = authors;
    document.getElementById('cite-year').value = year;
    document.getElementById('cite-monthday').value = monthDay;
    const sourceDuplicatesAuthor = authorIsOrgGuess && authors.toLowerCase().startsWith(siteName.toLowerCase());
    document.getElementById('cite-source').value = isJournalPage ? toTitleCase(meta.journal) : (sourceDuplicatesAuthor ? '' : siteName);
    document.getElementById('cite-volume').value = isJournalPage ? meta.volume : '';
    document.getElementById('cite-issue').value = isJournalPage ? meta.issue : '';
    document.getElementById('cite-pages').value = isJournalPage ? meta.pages : '';
    document.getElementById('cite-doi-url').value = citeUrl;
    updateCitationPreview();
    applyFieldProvenance({
        'cite-title': meta && meta.title ? 'found' : 'guess',
        'cite-authors': meta && meta.author ? 'found' : 'guess',
        'cite-year': meta && meta.year ? 'found' : 'guess',
        'cite-source': meta && meta.siteName ? 'found' : 'guess',
        'cite-doi-url': 'found'
    });

    const missing = [];
    if (!authors) missing.push('author');
    if (!year) missing.push('date');
    if (meta) {
        const note = missing.length
            ? `Extracted details from "${siteName}". No ${missing.join(' or ')} found; the entry uses ${authors ? '(n.d.)' : 'the title in the author position'} per APA. Please verify.`
            : `Extracted details from "${siteName}". Review and verify details.`;
        setCitationStatus(missing.length ? 'warning' : 'success', 'Webpage Metadata Extracted', note);
        showToast('Web citation generated!');
    } else {
        setCitationStatus('warning', 'URL Analyzed', `${describeFetchFailure()} The title and site came from the link itself${orgAuthor ? ' and the author is the organization behind the site' : ''}. Please review the author, date and title fields.`);
        showToast('Citation template generated from link.');
    }
}

function populateLaudatoSiCitation(url) {
    setCiteTypeFromSource('religious');
    document.getElementById('cite-title').value = 'Laudato si\': On care for our common home';
    document.getElementById('cite-authors').value = 'Francis, P.';
    document.getElementById('cite-year').value = '2015';
    document.getElementById('cite-monthday').value = '';
    document.getElementById('cite-source').value = 'Vatican Press';
    document.getElementById('cite-volume').value = '';
    document.getElementById('cite-issue').value = '';
    document.getElementById('cite-pages').value = '';
    document.getElementById('cite-doi-url').value = url;
    updateCitationPreview();
}

const EXTRA_CITE_FIELDS = ['cite-container', 'cite-editors', 'cite-edition', 'cite-translator', 'cite-descriptor', 'cite-media'];

function resetExtraCitationFields() {
    EXTRA_CITE_FIELDS.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const on = document.getElementById('cite-retrieved-on');
    if (on) on.checked = false;
}

function setCiteTypeFromSource(type) {
    resetExtraCitationFields();
    document.getElementById('cite-type').value = type;
    handleCiteTypeChange();
}

const CITE_TYPE_CONFIG = {
    journal:   { source: 'Journal Name (Title Case)', fields: ['volume', 'issue', 'pages'] },
    book:      { source: 'Publisher Name', fields: ['edition', 'translator'], edition: 'Edition (e.g. 2nd)' },
    chapter:   { source: 'Publisher Name', fields: ['container', 'editors', 'edition', 'pages'], container: 'Book Title', edition: 'Edition (optional, e.g. 2nd)' },
    webpage:   { source: 'Website / Organization Name', fields: ['monthday', 'retrieved'] },
    article:   { source: 'Publication / Blog Name (italicized)', fields: ['monthday'] },
    video:     { source: 'Platform (e.g. YouTube)', fields: ['monthday', 'descriptor'] },
    report:    { source: 'Publisher / Sponsoring Organization', fields: ['edition', 'descriptor'], edition: 'Report number (e.g. No. 12)' },
    religious: { source: 'Publisher / Religious Institution', fields: ['descriptor'] },
    thesis:    { source: 'University', fields: ['descriptor'] },
    dataset:   { source: 'Publisher / Repository', fields: ['edition', 'descriptor'], edition: 'Version (e.g. Version 2.1)' },
    software:  { source: 'Publisher / Developer', fields: ['edition', 'descriptor'], edition: 'Version (e.g. Version 2.1)' },
    podcast:   { source: 'Publisher / Network', fields: ['container', 'edition', 'monthday', 'descriptor'], container: 'Podcast Name', edition: 'Episode (e.g. No. 12)' },
    social:    { source: 'Platform (e.g. X, Instagram)', fields: ['monthday', 'media', 'descriptor'] }
};

function handleCiteTypeChange() {
    const type = document.getElementById('cite-type').value;
    const cfg = CITE_TYPE_CONFIG[type] || CITE_TYPE_CONFIG.report;
    const show = (id, on, display) => { const el = document.getElementById(id); if (el) el.style.display = on ? (display || 'block') : 'none'; };

    ['volume', 'issue', 'pages'].forEach(f => show(`cite-wrap-${f}`, cfg.fields.includes(f)));
    show('cite-journal-meta-wrapper', ['volume', 'issue', 'pages'].some(f => cfg.fields.includes(f)), 'grid');
    show('cite-monthday-wrapper', cfg.fields.includes('monthday'));
    ['container', 'editors', 'edition', 'translator', 'descriptor', 'media'].forEach(f => show(`cite-wrap-${f}`, cfg.fields.includes(f)));
    show('cite-wrap-retrieved', cfg.fields.includes('retrieved'), 'flex');
    const anyExtra = ['container', 'editors', 'media'].some(f => cfg.fields.includes(f));
    show('cite-extra-fields', anyExtra || ['edition', 'translator', 'descriptor', 'retrieved'].some(f => cfg.fields.includes(f)), 'grid');
    // Rarely needed options stay folded away unless they already hold a value.
    const optional = ['edition', 'translator', 'descriptor', 'retrieved'];
    show('cite-more-options', optional.some(f => cfg.fields.includes(f)), 'block');
    const more = document.getElementById('cite-more-options');
    if (more) {
        const filled = ['cite-edition', 'cite-translator', 'cite-descriptor'].some(id => (document.getElementById(id) || {}).value)
            || (document.getElementById('cite-retrieved-on') || {}).checked;
        more.open = !!filled;
    }

    const sourceLabel = document.getElementById('cite-source-label');
    if (sourceLabel) sourceLabel.innerText = cfg.source;
    const containerLabel = document.getElementById('cite-container-label');
    if (containerLabel) containerLabel.innerText = cfg.container || 'Container Title';
    const editionLabel = document.getElementById('cite-edition-label');
    if (editionLabel) editionLabel.innerText = cfg.edition || 'Edition';
    const descriptorEl = document.getElementById('cite-descriptor');
    if (descriptorEl) descriptorEl.placeholder = DEFAULT_DESCRIPTORS[type] || 'e.g. Report';
    const retrievedDate = document.getElementById('cite-retrieved-date');
    if (retrievedDate && !retrievedDate.value) retrievedDate.value = formatLongDate(new Date());

    updateCitationPreview();
}

function autoApplySentenceCaseToTitle() {
    const titleEl = document.getElementById('cite-title');
    if (titleEl && titleEl.value.trim()) {
        titleEl.value = toSentenceCase(titleEl.value);
        updateCitationPreview();
        showToast('Applied APA sentence case to title.');
    }
}

function updateCitationPreview() {
    const type = document.getElementById('cite-type').value;
    const title = document.getElementById('cite-title').value.trim();
    const authorsRaw = document.getElementById('cite-authors').value.trim();
    const year = document.getElementById('cite-year').value.trim();
    const monthDay = document.getElementById('cite-monthday') ? document.getElementById('cite-monthday').value.trim() : '';
    const source = document.getElementById('cite-source').value.trim();
    const volume = document.getElementById('cite-volume') ? document.getElementById('cite-volume').value.trim() : '';
    const issue = document.getElementById('cite-issue') ? document.getElementById('cite-issue').value.trim() : '';
    const pages = document.getElementById('cite-pages') ? document.getElementById('cite-pages').value.trim() : '';
    const doiUrl = document.getElementById('cite-doi-url').value.trim();

    const val = id => (document.getElementById(id) ? document.getElementById(id).value.trim() : '');
    const doiMatch = doiUrl.match(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)?(10\.\d{4,9}\/\S+)$/i);

    const item = {
        type,
        title,
        authors: parseAuthorsInput(authorsRaw),
        year,
        monthDay,
        source,
        volume,
        issue,
        pages,
        container: val('cite-container'),
        editors: val('cite-editors'),
        edition: val('cite-edition'),
        translator: val('cite-translator'),
        descriptor: val('cite-descriptor'),
        media: val('cite-media'),
        keepCase: type === 'social',
        retrieved: document.getElementById('cite-retrieved-on') && document.getElementById('cite-retrieved-on').checked && CITE_TYPE_CONFIG[type].fields.includes('retrieved') ? val('cite-retrieved-date') : '',
        doi: doiMatch ? `https://doi.org/${doiMatch[1]}` : '',
        url: doiMatch ? '' : (/^(?:www\.)\S+$/i.test(doiUrl) ? `https://${doiUrl}` : doiUrl)
    };

    const isEmptyForm = !title && !authorsRaw && !year && !source && !doiUrl;
    const formatted = isEmptyForm ? { html: '', plain: '', marked: '' } : generateApaReference(item);
    currentCitationPlain = formatted.plain;
    currentCitationMarked = formatted.marked;

    const refEl = document.getElementById('prev-citation-reference');
    if (refEl) {
        refEl.innerHTML = formatted.html || '<span style="color:#94a3b8">Paste a link or DOI on the left, or upload a PDF, and your reference will appear here.</span>';
    }

    const inText = isEmptyForm ? { parenthetical: '—', narrative: '—' } : formatInTextCitation(item.authors, year);
    const parentheticalEl = document.getElementById('prev-citation-parenthetical');
    const narrativeEl = document.getElementById('prev-citation-narrative');
    if (parentheticalEl) parentheticalEl.innerText = inText.parenthetical;
    if (narrativeEl) narrativeEl.innerText = inText.narrative;
    syncActiveBatchEntry();
}

function copyInTextCitation(type) {
    const el = type === 'parenthetical'
        ? document.getElementById('prev-citation-parenthetical')
        : document.getElementById('prev-citation-narrative');
    if (!el) return;

    const text = el.innerText;
    navigator.clipboard.writeText(text).then(() => {
        showToast(`Copied ${type} citation: ${text}`);
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast(`Copied ${type} citation: ${text}`);
    });
}

// ── Batch list (several PDFs or links at once) ────────────────────────
let citationBatch = [];
let activeBatchId = null;
let batchSeq = 0;
const CITE_FORM_IDS = ['cite-type', 'cite-title', 'cite-authors', 'cite-year', 'cite-monthday', 'cite-source', 'cite-volume', 'cite-issue', 'cite-pages', 'cite-doi-url', ...EXTRA_CITE_FIELDS, 'cite-retrieved-date'];

function captureCitationForm() {
    const snap = {};
    CITE_FORM_IDS.forEach(id => { const el = document.getElementById(id); if (el) snap[id] = el.value; });
    const on = document.getElementById('cite-retrieved-on');
    snap.retrievedOn = !!(on && on.checked);
    return snap;
}

function restoreCitationForm(snap) {
    document.getElementById('cite-type').value = snap['cite-type'] || 'report';
    handleCiteTypeChange();
    CITE_FORM_IDS.forEach(id => { const el = document.getElementById(id); if (el && id !== 'cite-type' && id in snap) el.value = snap[id]; });
    const on = document.getElementById('cite-retrieved-on');
    if (on) on.checked = !!snap.retrievedOn;
    clearFieldProvenance();
    updateCitationPreview();
}

function recordBatchEntry(label, status) {
    const id = ++batchSeq;
    citationBatch.push({ id, label, state: status.state || 'warning', statusTitle: status.title || '', snap: captureCitationForm(), marked: currentCitationMarked, plain: currentCitationPlain });
    activeBatchId = id;
    renderCitationBatch();
}

function syncActiveBatchEntry() {
    if (activeBatchId === null) return;
    const entry = citationBatch.find(e => e.id === activeBatchId);
    if (!entry) return;
    entry.snap = captureCitationForm();
    entry.marked = currentCitationMarked;
    entry.plain = currentCitationPlain;
    const el = document.querySelector(`[data-batch-text="${entry.id}"]`);
    if (el) el.innerText = entry.plain || '(empty citation)';
}

function renderCitationBatch() {
    const host = document.getElementById('citation-batch');
    if (!host) return;
    if (!citationBatch.length) { host.classList.add('hidden'); host.innerHTML = ''; return; }
    host.classList.remove('hidden');
    const dot = s => s === 'success' ? 'bg-emerald-500' : s === 'error' ? 'bg-rose-500' : 'bg-amber-500';
    host.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-2">
            <h4 class="text-xs font-extrabold uppercase tracking-widest text-slate-500">Your citations (${citationBatch.length})</h4>
            <div class="flex gap-2">
                <button type="button" data-batch-act="addall" class="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-2 rounded-lg">Add all to bibliography</button>
                <button type="button" data-batch-act="clear" class="text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200 px-3 py-2 rounded-lg">Clear list</button>
            </div>
        </div>
        <ul class="space-y-2">${citationBatch.map(e => `
            <li class="rounded-xl border ${e.id === activeBatchId ? 'border-indigo-400 bg-indigo-50/40' : 'border-slate-200 bg-white'} p-3" data-batch-id="${e.id}">
                <div class="flex items-start gap-2">
                    <span class="mt-1.5 w-2 h-2 rounded-full shrink-0 ${dot(e.state)}" title="${escapeHtml(e.statusTitle)}"></span>
                    <div class="min-w-0 flex-1">
                        <p class="text-[11px] font-semibold text-slate-500 truncate">${escapeHtml(e.label)}</p>
                        <p class="text-xs text-slate-800 break-words" data-batch-text="${e.id}">${escapeHtml(e.plain || '(no citation could be built)')}</p>
                    </div>
                </div>
                <div class="flex gap-2 mt-2 pl-4">
                    <button type="button" data-batch-act="edit" class="text-[11px] font-semibold text-indigo-700 hover:underline">Edit</button>
                    <button type="button" data-batch-act="add" class="text-[11px] font-semibold text-indigo-700 hover:underline">Add to bibliography</button>
                    <button type="button" data-batch-act="remove" class="text-[11px] font-semibold text-rose-600 hover:underline">Remove</button>
                </div>
            </li>`).join('')}
        </ul>`;
}

function initCitationBatch() {
    const host = document.getElementById('citation-batch');
    if (!host) return;
    host.addEventListener('click', ev => {
        const btn = ev.target.closest('[data-batch-act]');
        if (!btn) return;
        const row = btn.closest('[data-batch-id]');
        const entry = row && citationBatch.find(e => e.id === +row.dataset.batchId);
        const act = btn.dataset.batchAct;
        if (act === 'clear') { citationBatch = []; activeBatchId = null; renderCitationBatch(); return; }
        if (act === 'addall') {
            addEntriesToBibliography(citationBatch.filter(e => e.state !== 'error' && (e.marked || e.plain)).map(e => e.marked || e.plain));
            return;
        }
        if (!entry) return;
        if (act === 'remove') {
            citationBatch = citationBatch.filter(e => e.id !== entry.id);
            if (activeBatchId === entry.id) activeBatchId = null;
            renderCitationBatch();
        } else if (act === 'edit') {
            activeBatchId = entry.id;
            restoreCitationForm(entry.snap);
            renderCitationBatch();
            setCitationStatus(entry.state === 'error' ? 'error' : 'warning', `Editing: ${entry.label}`, 'Changes you make in the form below update this entry.');
        } else if (act === 'add') {
            addEntriesToBibliography([entry.marked || entry.plain]);
        }
    });
}

// Adds references to the bibliography text, shows the result right away, and says how many are there now.
function addEntriesToBibliography(entries) {
    const list = entries.filter(Boolean);
    if (!list.length) {
        showToast('Generate or edit a citation first.');
        return;
    }
    const bibInput = document.getElementById('bibliography-input');
    let existing = bibInput.value.trim();
    // The built-in sample is a placeholder, not the user's work, so replace it rather than mix with it.
    if (bibInputIsSample || existing === BIB_SAMPLE_TEXT.trim()) existing = '';
    const have = new Set(parseBibliographyEntries(existing).map(e => stripItalicMarkers(e).replace(/\s+/g, ' ').toLowerCase()));
    const fresh = [];
    let duplicates = 0;
    list.forEach(e => {
        const key = stripItalicMarkers(e).replace(/\s+/g, ' ').trim().toLowerCase();
        if (have.has(key)) { duplicates++; return; }
        have.add(key);
        fresh.push(e);
    });
    bibInput.value = [existing, ...fresh].filter(Boolean).join('\n\n');
    bibInputIsSample = false;
    const total = formatBibliography({ quiet: true });

    const msg = fresh.length
        ? `Added ${fresh.length} reference${fresh.length === 1 ? '' : 's'} to the bibliography (${total} in total)${duplicates ? `; ${duplicates} already there` : ''}.`
        : 'That reference is already in the bibliography.';
    showToast(msg);
    const note = document.getElementById('citation-added-note');
    if (note) {
        note.classList.remove('hidden');
        note.querySelector('[data-note-text]').innerText = `${msg} `;
    }
    const batchNote = document.getElementById('citation-batch-note');
    if (batchNote) {
        batchNote.classList.remove('hidden');
        batchNote.querySelector('[data-note-text]').innerText = `${msg} `;
    }
}

function addCitationToBibliography() {
    if (!currentCitationPlain) {
        showToast('Generate or edit a citation first.');
        return;
    }
    addEntriesToBibliography([currentCitationMarked || currentCitationPlain]);
}

function resetCitationForm() {
    activeBatchId = null;
    renderCitationBatch();
    document.getElementById('cite-title').value = '';
    document.getElementById('cite-authors').value = '';
    document.getElementById('cite-year').value = '';
    if (document.getElementById('cite-monthday')) document.getElementById('cite-monthday').value = '';
    document.getElementById('cite-source').value = '';
    if (document.getElementById('cite-volume')) document.getElementById('cite-volume').value = '';
    if (document.getElementById('cite-issue')) document.getElementById('cite-issue').value = '';
    if (document.getElementById('cite-pages')) document.getElementById('cite-pages').value = '';
    document.getElementById('cite-doi-url').value = '';
    document.getElementById('citation-url-input').value = '';
    resetExtraCitationFields();
    clearFieldProvenance();
    setCitationStatus(null);
    updateCitationPreview();
    showToast('Citation form cleared.');
}

function loadSampleCitation(key, showToastFlag = true) {
    const s = sampleCitations[key];
    if (!s) return;
    activeBatchId = null;
    clearFieldProvenance();

    setCiteTypeFromSource(s.type);
    document.getElementById('cite-title').value = s.title;
    document.getElementById('cite-authors').value = s.authors;
    document.getElementById('cite-year').value = s.year;
    if (s.monthDay && document.getElementById('cite-monthday')) {
        document.getElementById('cite-monthday').value = s.monthDay;
    }
    document.getElementById('cite-source').value = s.source;
    if (document.getElementById('cite-volume')) document.getElementById('cite-volume').value = s.volume || '';
    if (document.getElementById('cite-issue')) document.getElementById('cite-issue').value = s.issue || '';
    if (document.getElementById('cite-pages')) document.getElementById('cite-pages').value = s.pages || '';
    document.getElementById('cite-doi-url').value = s.doiUrl;

    if (key === 'nature') document.getElementById('citation-url-input').value = '10.1038/s41586-020-2649-2';
    if (key === 'arxiv') document.getElementById('citation-url-input').value = 'https://arxiv.org/abs/2301.07041';
    if (key === 'who') document.getElementById('citation-url-input').value = 'https://www.who.int/news-room/fact-sheets/detail/mental-health-strengthening-our-response';

    setCitationStatus('success', s.status.title, s.status.desc);
    updateCitationPreview();
    if (showToastFlag) {
        showToast(`Loaded ${s.source} sample citation.`);
    }
}
