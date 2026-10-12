// Reference engine: pure text logic (no DOM) for APA reference parsing, italics, formatting, citation generation and BibTeX/RIS parsing. Safe to unit-test in Node.

// ── Reference italics engine ───────────────────────────────────────────
// Italics inside a reference string are carried as *asterisk* markers.
// Generated citations always carry them; pasted references without markers
// get them inferred from APA structure by inferItalicMarkers().
function escapeHtml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function stripItalicMarkers(text) {
    return String(text || '').replace(/\*/g, '');
}

function markersToHtml(marked) {
    return escapeHtml(marked).replace(/\*([^*]+)\*/g, '<i>$1</i>');
}

const REFERENCE_ABBREVIATIONS = new Set(['et al', 'ed', 'eds', 'vol', 'no', 'pp', 'p', 'jr', 'sr', 'dr', 'st', 'inc', 'ltd', 'co', 'corp', 'rev', 'trans', 'u.s', 'e.g', 'i.e', 'vs', 'suppl', 'ch']);

// Index just past the first sentence-ending period that is not an initial or abbreviation.
function findFirstSentenceEnd(text) {
    const re = /[.?!]/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        const idx = m.index;
        const after = text.slice(idx + 1);
        // A closing italic marker may sit right after the punctuation, and a journal name may start
        // with a brand-style lowercase letter (eLife, iScience).
        const star = after.startsWith('*') ? 1 : 0;
        const rest = after.slice(star);
        if (rest && !/^\s+\*?(?:[A-Z0-9“"'\[(¿¡]|[a-z]+[A-Z])/.test(rest)) continue;
        if (!rest) return text.length;
        if (m[0] === '.') {
            const word = (text.slice(0, idx).match(/([A-Za-z.]+)$/) || ['', ''])[1];
            if (/^[A-Z]$/.test(word) || /(^|\.)[A-Z]$/.test(word)) continue;
            if (REFERENCE_ABBREVIATIONS.has(word.toLowerCase())) continue;
        }
        return idx + 1 + star;
    }
    return text.length;
}

const NON_ITALIC_TITLE_TAIL = /^\s*(?:\[[^\]]*\]|\((?:\d+(?:st|nd|rd|th)\s+ed\.|rev\.\s*ed\.|Version\s[^)]*|[^)]*(?:\bed\.|\bNo\.|\bVol\.|\bpp?\.|Report)[^)]*)\))/i;

// Wraps the work title in markers, leaving trailing [descriptors] and (edition) outside.
function italicizeTitleSentence(sentence) {
    let core = sentence;
    let tail = '';
    for (;;) {
        const m = core.match(/\s*(\[[^\]]*\]|\([^()]*\))\.?$/);
        if (!m || !NON_ITALIC_TITLE_TAIL.test(m[0])) break;
        tail = core.slice(core.length - m[0].length) + tail;
        core = core.slice(0, core.length - m[0].length);
    }
    let end = '';
    if (/\.$/.test(core) && !tail) { core = core.slice(0, -1); end = '.'; }
    if (!core.trim()) return sentence;
    return `*${core}*${tail}${end}`;
}

function inferItalicMarkers(reference) {
    const ref = String(reference || '').trim();
    if (!ref || ref.includes('*')) return ref;

    const dateMatch = ref.match(/^(.*?\((?:\d{4}[a-z]?|n\.d\.)(?:,\s*[A-Za-z]+(?:\s+\d{1,2}(?:[–-]\d{1,2})?)?)?\)\.)\s+(.+)$/);
    if (!dateMatch) return ref;

    const head = dateMatch[1];
    let rest = dateMatch[2];

    let locator = '';
    const locMatch = rest.match(/(?:\s+(?:https?:\/\/\S+|doi:\s*\S+|10\.\d{4,9}\/\S+))+$/i);
    if (locMatch) {
        locator = locMatch[0];
        rest = rest.slice(0, rest.length - locator.length);
    }
    if (!rest) return ref;

    // Edited-book chapter: Chapter title. In A. Editor (Ed.), *Book title* (pp. 1–10). Publisher.
    const chapter = rest.match(/^(.*?\bIn\s+.+?\(Eds?\.\),?\s+)(.+?)((?:\s*\((?:pp?\.|\d+(?:st|nd|rd|th)\s+ed\.|[^)]*Vol\.)[^)]*\))*\.)(.*)$/);
    if (chapter) {
        return `${head} ${chapter[1]}*${chapter[2].trim()}*${chapter[3]}${chapter[4]}${locator}`;
    }

    const titleEnd = findFirstSentenceEnd(rest);
    const titleSentence = rest.slice(0, titleEnd);
    const remainder = rest.slice(titleEnd);

    // Periodical: Title. *Journal*, *12*(3), 45–67.
    const periodical = remainder.match(/^(\s+)([^,]+(?:,\s*[^,\d][^,]*)*?),\s*(\d+)(\([^)]+\))?((?:,\s*[^,]+?)?)\.?\s*$/);
    if (periodical && remainder.trim() && !/^\s*(?:https?:)/i.test(remainder)) {
        const tail = remainder.trim().endsWith('.') ? '.' : '';
        const journalName = periodical[2].trim();
        if (journalName.length > 1 && !/\b(?:Inc|Press|Publishers?|Books|Ltd)\b/i.test(journalName)) {
            return `${head} ${titleSentence}${periodical[1]}*${journalName}*, *${periodical[3]}*${periodical[4] || ''}${periodical[5] || ''}${tail}${locator}`;
        }
    }

    // Periodical without volume: Title. *Newspaper*, p. A1 handled as plain work below.
    // Standalone work (book, report, webpage, dataset…): *Title*. Publisher.
    return `${head} ${italicizeTitleSentence(titleSentence)}${remainder}${locator}`;
}

function referenceToHtml(reference) {
    return markersToHtml(inferItalicMarkers(reference));
}
// ── End reference italics engine ───────────────────────────────────────

function normalizeReferenceEntry(entry) {
    return entry
        .replace(/^\s*(?:\d+[\.)]\s+|[-*•]\s+)/, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function looksLikeNewReference(line) {
    const candidate = stripItalicMarkers(normalizeReferenceEntry(line));
    return /^[A-Z][A-Za-z'\-]+,\s*(?:[A-Z]\.|\()/i.test(candidate);
}

function parseBibliographyEntries(rawText) {
    const normalized = rawText.replace(/\r\n/g, '\n').trim();
    if (!normalized) {
        return [];
    }

    const blocks = normalized.split(/\n\s*\n+/).map(block => block.trim()).filter(Boolean);
    const entries = [];

    if (blocks.length > 1) {
        blocks.forEach(block => {
            const entry = normalizeReferenceEntry(block.replace(/\n+/g, ' '));
            if (entry) {
                entries.push(entry);
            }
        });
        return entries;
    }

    const lines = normalized.split('\n').map(line => line.trim()).filter(Boolean);
    let currentEntry = '';

    lines.forEach(line => {
        const cleanedLine = normalizeReferenceEntry(line);
        if (!cleanedLine) {
            return;
        }

        if (!currentEntry) {
            currentEntry = cleanedLine;
            return;
        }

        if (looksLikeNewReference(cleanedLine)) {
            entries.push(currentEntry);
            currentEntry = cleanedLine;
        } else {
            currentEntry += ` ${cleanedLine}`;
        }
    });

    if (currentEntry) {
        entries.push(currentEntry);
    }

    return entries;
}

function extractFirstAuthorSurname(reference) {
    const cleaned = stripItalicMarkers(normalizeReferenceEntry(reference));
    const surnameMatch = cleaned.match(/^([A-Za-z'\-]+)/);
    return surnameMatch ? surnameMatch[1].toLowerCase() : cleaned.toLowerCase();
}

function extractReferenceYear(reference) {
    const yearMatch = reference.match(/\((\d{4}|n\.d\.)[a-z]?(?:-[a-z])?(?:,[^)]*)?\)/i);
    if (!yearMatch) {
        return Number.MAX_SAFE_INTEGER;
    }

    const yearText = yearMatch[1].toLowerCase();
    return yearText === 'n.d.' ? 0 : parseInt(yearText, 10);
}

function sortBibliographyEntries(entries) {
    return [...entries].sort((a, b) => {
        const authorCompare = extractFirstAuthorSurname(a).localeCompare(extractFirstAuthorSurname(b));
        if (authorCompare !== 0) {
            return authorCompare;
        }

        const yearCompare = extractReferenceYear(a) - extractReferenceYear(b);
        if (yearCompare !== 0) {
            return yearCompare;
        }

        return a.localeCompare(b);
    });
}

function toNameCase(namePart) {
    return namePart
        .split('-')
        .map(chunk => chunk ? chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase() : chunk)
        .join('-');
}

function normalizeSimplePersonName(fullName) {
    const tokens = fullName.trim().split(/\s+/).filter(Boolean);
    if (tokens.length !== 2) {
        return null;
    }

    const [firstRaw, lastRaw] = tokens;
    if (!/^[A-Za-z'\-]+$/.test(firstRaw) || !/^[A-Za-z'\-]+$/.test(lastRaw)) {
        return null;
    }

    const firstName = toNameCase(firstRaw);
    const lastName = toNameCase(lastRaw);
    return `${lastName}, ${firstName}`;
}

function formatApaAuthorList(authors) {
    if (authors.length === 1) {
        return authors[0];
    }

    if (authors.length === 2) {
        return `${authors[0]}, & ${authors[1]}`;
    }

    return `${authors.slice(0, -1).join(', ')}, & ${authors[authors.length - 1]}`;
}

function normalizeAmbiguousAuthorList(lead) {
    if (!lead) {
        return null;
    }

    if (/\bet\s+al\.?/i.test(lead) || /\b[A-Z]\./.test(lead)) {
        return null;
    }

    const unifiedLead = lead.replace(/\s+(?:and|&)\s+/ig, ', ');
    const rawAuthors = unifiedLead.split(',').map(part => part.trim()).filter(Boolean);
    if (rawAuthors.length === 0) {
        return null;
    }

    const normalizedAuthors = rawAuthors.map(normalizeSimplePersonName);
    if (normalizedAuthors.some(author => !author)) {
        return null;
    }

    return formatApaAuthorList(normalizedAuthors);
}

function normalizeAmbiguousLeadAuthor(reference) {
    const yearMatch = reference.match(/\(\s*(?:\d{4}|n\.d\.)\s*[a-z]?\s*\)/i);
    if (!yearMatch || yearMatch.index === undefined) {
        return { fixed: reference, notes: [] };
    }

    const lead = reference.slice(0, yearMatch.index).trim();
    const remainder = reference.slice(yearMatch.index).trimStart();

    const correctedLead = normalizeAmbiguousAuthorList(lead);
    if (!correctedLead) {
        return { fixed: reference, notes: [] };
    }

    const fixed = `${correctedLead} ${remainder}`.replace(/\s+/g, ' ').trim();

    if (fixed === reference) {
        return { fixed: reference, notes: [] };
    }

    return {
        fixed,
        notes: [`Author name order corrected: "${lead}" -> "${correctedLead}".`]
    };
}

function moveAuthorSegmentToFront(reference) {
    const notes = [];
    const authorListPattern = /([A-Z][A-Za-z'\-]+,\s+[A-Z][A-Za-z'.\-]+(?:\s+[A-Z][A-Za-z'.\-]+)?(?:,\s*&\s*[A-Z][A-Za-z'\-]+,\s+[A-Z][A-Za-z'.\-]+(?:\s+[A-Z][A-Za-z'.\-]+)?)*)/;
    const leadingAuthor = reference.match(new RegExp(`^${authorListPattern.source}`));
    if (leadingAuthor) {
        return { fixed: reference, notes };
    }

    const foundAuthor = reference.match(authorListPattern);
    if (!foundAuthor || foundAuthor.index === undefined) {
        return { fixed: reference, notes };
    }

    const authorText = foundAuthor[0].trim();
    const before = reference.slice(0, foundAuthor.index).trimEnd().replace(/[\s,;:]+$/g, '');
    const after = reference.slice(foundAuthor.index + authorText.length).trimStart().replace(/^[,;:]+\s*/g, '');
    const remainder = `${before}${before && after ? '. ' : ''}${after}`.trim();
    const fixed = `${authorText}. ${remainder}`.replace(/\s+/g, ' ').trim();

    if (fixed !== reference) {
        notes.push(`Author block moved to front: "${authorText}".`);
    }

    return { fixed, notes };
}

function ensureDateExists(reference) {
    if (/\((?:\d{4}|n\.d\.)[a-z]?(?:-[a-z])?(?:,[^)]*)?\)/i.test(reference)) {
        return { fixed: reference, notes: [] };
    }

    const notes = [];
    const leadingAuthorPattern = /^([A-Z][A-Za-z'\-]+,\s+[A-Z][A-Za-z'.\-]+(?:\s+[A-Z][A-Za-z'.\-]+)?(?:,\s*&\s*[A-Z][A-Za-z'\-]+,\s+[A-Z][A-Za-z'.\-]+(?:\s+[A-Z][A-Za-z'.\-]+)?)*)\.?\s*(.*)$/;
    const authorMatch = reference.match(leadingAuthorPattern);

    if (authorMatch) {
        const authorText = authorMatch[1].trim();
        const remainder = (authorMatch[2] || '').replace(/^[.\s]+/, '').trim();
        const fixed = remainder
            ? `${authorText}. (n.d.). ${remainder}`
            : `${authorText}. (n.d.).`;
        notes.push('No date found; inserted (n.d.).');
        return { fixed: fixed.replace(/\s+/g, ' ').trim(), notes };
    }

    const fallback = `(n.d.). ${reference}`.replace(/\s+/g, ' ').trim();
    notes.push('No date found; inserted (n.d.).');
    return { fixed: fallback, notes };
}

function normalizeDoiAndUrlFormatting(reference) {
    let fixed = reference;

    fixed = fixed.replace(/https?:\/\/(?:dx\.)?doi\.org\/(10\.\S+)/ig, (match, doiPart) => {
        const cleanedDoi = doiPart.replace(/[.,;:]+$/g, '');
        return `https://doi.org/${cleanedDoi}`;
    });

    fixed = fixed.replace(/\bdoi\s*:\s*(10\.\S+)/ig, (match, doiPart) => {
        const cleanedDoi = doiPart.replace(/[.,;:]+$/g, '');
        return `https://doi.org/${cleanedDoi}`;
    });

    fixed = fixed.replace(/\bdoi\s+(10\.\S+)/ig, (match, doiPart) => {
        const cleanedDoi = doiPart.replace(/[.,;:]+$/g, '');
        return `https://doi.org/${cleanedDoi}`;
    });

    fixed = fixed.replace(/(https?:\/\/\S+?)([.,;:])(?=\s|$)/ig, '$1');
    fixed = fixed.replace(/(https?:\/\/\S+)\.$/ig, '$1');

    return fixed;
}

function normalizeYearAndInitialsFormatting(reference) {
    let fixed = reference;

    fixed = fixed.replace(/\s+([,.;:])/g, '$1');
    fixed = fixed.replace(/,\s*/g, ', ');
    fixed = fixed.replace(/\s*&\s*/g, ' & ');

    fixed = fixed.replace(/\(\s*(\d{4}|n\.d\.)\s*\)/ig, '($1)');
    // Only the date block gets a period. A 4-digit issue number such as 585(7825) is not a year.
    fixed = fixed.replace(/(\((?:(?:1[5-9]|20)\d\d|n\.d\.)[a-z]?(?:-[a-z])?(?:,[^)]*)?\))(?!\.)/i, (m, block, offset) => (/[\w*]$/.test(fixed.slice(0, offset)) ? m : block + '.'));

    fixed = fixed.replace(/([A-Z])\s*\.\s*([A-Z])\s*\./g, '$1. $2.');
    fixed = fixed.replace(/([A-Z])\s+\./g, '$1.');

    fixed = fixed.replace(/\s+/g, ' ').trim();
    return fixed;
}

function applyBibliographyAutoFix(reference, options = {}) {
    let fixed = normalizeReferenceEntry(reference);
    const notes = [];

    const authorNormalization = normalizeAmbiguousLeadAuthor(fixed);
    fixed = authorNormalization.fixed;
    notes.push(...authorNormalization.notes);

    const authorRelocation = moveAuthorSegmentToFront(fixed);
    fixed = authorRelocation.fixed;
    notes.push(...authorRelocation.notes);

    const dateInsertion = ensureDateExists(fixed);
    fixed = dateInsertion.fixed;
    notes.push(...dateInsertion.notes);

    fixed = normalizeYearAndInitialsFormatting(fixed);
    const withDashes = normalizePageRanges(fixed);
    if (withDashes !== fixed) notes.push('Converted a page-range hyphen to an en dash.');
    fixed = withDashes;
    fixed = normalizeDoiAndUrlFormatting(fixed);
    fixed = fixed.replace(/\s+/g, ' ').trim();

    if (options.rebuild) {
        const rebuilt = rebuildReference(fixed);
        const label = fixed.replace(/\*/g, '').slice(0, 40);
        if (rebuilt.rebuilt && rebuilt.text !== fixed) {
            notes.push(`Rebuilt "${label}…" from its parsed parts (punctuation, capitalization, italics).`);
            fixed = rebuilt.text;
        } else if (!rebuilt.rebuilt) {
            notes.push(`Kept "${label}…" as typed: ${rebuilt.reason}.`);
        }
    }

    return { fixed, notes };
}

const SENTENCE_CASE_ISSUE = 'Title may not be in sentence case (APA 7 for works in references).';

function isLikelySentenceCase(titleText) {
    const trimmed = (titleText || '').trim();
    if (!trimmed) {
        return true;
    }

    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
        return true;
    }

    const interiorWords = words.slice(1);
    let capitalizedCount = 0;
    interiorWords.forEach(word => {
        const plain = word.replace(/^["'([{]+|[\])}',.:;!?]+$/g, '');
        if (/^[A-Z][a-z]/.test(plain)) {
            capitalizedCount += 1;
        }
    });

    if (interiorWords.length < 3) {
        return true;
    }

    return capitalizedCount / interiorWords.length < 0.4;
}

function analyzeReferenceIssues(reference) {
    const issues = [];
    const cleaned = stripItalicMarkers(normalizeReferenceEntry(reference));

    if (!/^[A-Z][A-Za-z'\-]+,\s*[A-Z]/.test(cleaned)) {
        issues.push('Author name may not follow APA format (Surname, Initials).');
    }

    if (!/\((\d{4}|n\.d\.)[a-z]?(?:-[a-z])?(?:,[^)]*)?\)/i.test(cleaned)) {
        issues.push('Missing or invalid date block (e.g., (2023) or (n.d.)).');
    }

    if (!/[.!?]\s+[A-Z][^.!?]+\.\s+[A-Z]/.test(cleaned)) {
        issues.push('Could not clearly detect article/chapter title and source segment punctuation.');
    }

    const doiMatch = cleaned.match(/(?:https?:\/\/)?(?:dx\.)?doi\.org\/(10\.\S+)/i) || cleaned.match(/\bdoi:\s*(10\.\S+)/i);
    const hasUrl = /https?:\/\/\S+/i.test(cleaned);
    if (doiMatch) {
        if (!/https:\/\/doi\.org\/10\.\S+/i.test(cleaned)) {
            issues.push('DOI should use APA format: https://doi.org/10.xxxx/xxxxx');
        }
    } else if (hasUrl) {
        if (!/https?:\/\/\S+/i.test(cleaned)) {
            issues.push('URL appears malformed.');
        }
    } else {
        issues.push('No DOI/URL detected. Verify whether one is required for this source.');
    }

    const titleSourceMatch = cleaned.match(/\((?:\d{4}|n\.d\.)[a-z]?(?:-[a-z])?(?:,[^)]*)?\)\.\s+(.+?)\.\s+(.+)/i);
    if (titleSourceMatch) {
        const candidateTitle = titleSourceMatch[1].trim();
        if (!isLikelySentenceCase(candidateTitle)) {
            issues.push(SENTENCE_CASE_ISSUE);
        }

        const sourceSegment = titleSourceMatch[2].trim();
        if (!/[0-9]/.test(sourceSegment) && !hasUrl && !doiMatch) {
            issues.push('Source details may be incomplete (journal/book/publisher/volume/pages).');
        }
    } else {
        issues.push('Could not validate title casing and source structure confidently.');
    }

    return issues;
}

// ── Page ranges, year suffixes and one-click fixes ─────────────────────
function normalizePageRanges(reference) {
    return reference.split(/(https?:\/\/\S+)/).map((part, i) => {
        if (i % 2 === 1) return part;
        return part.replace(/((?:,\s*|\bpp?\.\s*))(\d+)\s*[-‐‑‒]\s*(\d+)(?=[).,;\s]|$)/g, '$1$2–$3');
    }).join('');
}

function referenceAuthorBlock(entry) {
    const text = stripItalicMarkers(entry);
    const m = text.match(/^(.*?)\s*\((?:\d{4}[a-z]?|n\.d\.(?:-[a-z])?)(?:,[^)]*)?\)/i);
    return m ? m[1].trim() : '';
}

function referenceTitleSortKey(entry) {
    const m = stripItalicMarkers(entry).match(/\)\.\s*(.*)$/);
    return (m ? m[1] : entry).replace(/^(?:a|an|the)\s+/i, '').toLowerCase();
}

// Entries by the same author(s) in the same year get a, b, c suffixes ordered by title (APA 7).
function assignYearSuffixes(entries) {
    const result = [...entries];
    const notes = [];
    const groups = new Map();
    result.forEach((entry, idx) => {
        const m = entry.match(/\((\d{4}|n\.d\.)(?:-?[a-z])?((?:,[^)]*)?)\)/i);
        const author = referenceAuthorBlock(entry);
        if (!m || !author) return;
        const key = `${author.toLowerCase()}|${m[1].toLowerCase()}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(idx);
    });
    groups.forEach(indexes => {
        if (indexes.length < 2) return;
        const ordered = [...indexes].sort((a, b) => referenceTitleSortKey(result[a]).localeCompare(referenceTitleSortKey(result[b])));
        const updated = ordered.map((idx, n) => {
            const letter = String.fromCharCode(97 + n);
            return result[idx].replace(/\((\d{4}|n\.d\.)(?:-?[a-z])?((?:,[^)]*)?)\)/i, (m, year, rest) => `(${/^n\.d\.$/i.test(year) ? `${year}-${letter}` : `${year}${letter}`}${rest})`);
        });
        const slots = [...indexes].sort((a, b) => a - b);
        const changed = updated.some((u, n) => u !== result[ordered[n]]);
        updated.forEach((u, n) => { result[slots[n]] = u; });
        if (changed) notes.push(`Added a/b year suffixes for ${referenceAuthorBlock(updated[0]).slice(0, 40)} (${(updated[0].match(/\((\d{4}|n\.d\.)/i) || [])[1]}).`);
    });
    return { entries: result, notes };
}

function sentenceCaseEntry(entry) {
    const m = entry.match(/(\((?:\d{4}|n\.d\.)[a-z]?(?:-[a-z])?(?:,[^)]*)?\)\.\s+)(.+?)(\.\s+|\.$)/);
    if (!m) return entry;
    const raw = m[2];
    const fixed = toSentenceCase(raw.replace(/\*/g, ''));
    const wrapped = raw.startsWith('*') ? `*${fixed}${raw.endsWith('*') ? '*' : ''}` : fixed;
    return entry.slice(0, m.index) + m[1] + wrapped + entry.slice(m.index + m[1].length + raw.length);
}

// ── In-text citation vs reference list check ───────────────────────────
const CITATION_YEAR = '(?:\\d{4}[a-z]?|n\\.d\\.)';

function extractInTextCitations(text) {
    const body = text.split(/\n\s*References\s*\n/i)[0];
    const cites = [];
    const add = (name, year) => {
        const cleaned = name.replace(/\s+et\s+al\.?$/i, '').split(/\s+(?:&|and)\s+/)[0].replace(/^[("'“]+|["'”]+$/g, '').trim();
        if (cleaned && /[A-Za-z]/.test(cleaned)) cites.push({ name: cleaned, year });
    };
    body.replace(/\(([^()]*?)\)/g, (m, inner) => {
        inner.split(';').forEach(part => {
            const p = part.trim().replace(/^(?:see also|see|e\.g\.,?|cf\.|but see|as cited in|also)\s+/i, '');
            const mm = p.match(new RegExp(`^(.+?),?\\s+(${CITATION_YEAR})(?:[,\\s\\-–]|$)`));
            if (mm && !/^\d/.test(mm[1])) add(mm[1], mm[2]);
        });
        return m;
    });
    const narrative = new RegExp(`([A-Z][\\p{L}'’\\-]+)(?:\\s+(?:and|&)\\s+[A-Z][\\p{L}'’\\-]+|\\s+et\\s+al\\.?)?(?:['’]s)?\\s*\\((${CITATION_YEAR})(?:[,\\s][^)]*)?\\)`, 'gu');
    let m;
    while ((m = narrative.exec(body)) !== null) add(m[1], m[2]);
    return cites;
}

function citationMatchesReference(cite, ref) {
    const name = cite.name.toLowerCase();
    const block = ref.author.toLowerCase();
    const first = block.split(',')[0].trim();
    const personal = /^[^,]+,\s*[A-Z]\./.test(ref.author);
    const nameOk = first === name || first.startsWith(name) || name.startsWith(first)
        || (!personal && new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(block));
    if (!nameOk) return false;
    const cy = cite.year.toLowerCase();
    const ry = ref.year.toLowerCase();
    if (cy === 'n.d.') return /^n\.d\./.test(ry);
    return ry.startsWith(cy.slice(0, 4)) && (!/[a-z]$/.test(cy) || ry === cy);
}

// ── BibTeX / RIS import ────────────────────────────────────────────────
function cleanImportedText(value) {
    return String(value || '').replace(/[{}]/g, '').replace(/\\&/g, '&').replace(/\s*--+\s*/g, '–').replace(/\s+/g, ' ').trim();
}

function personFromName(raw) {
    const token = String(raw || '').trim();
    if (/^\{.*\}$/.test(token)) return { name: cleanImportedText(token) };
    const cleaned = cleanImportedText(token);
    if (!cleaned) return null;
    if (cleaned.includes(',')) {
        const [family, given] = cleaned.split(/,\s*(.*)/);
        return { family: family.trim(), given: (given || '').trim() };
    }
    const parts = cleaned.split(' ');
    return parts.length > 1 ? { family: parts.pop(), given: parts.join(' ') } : { name: cleaned };
}

// "J. A." stays "J. A."; "Jean-Paul" or "J.-P." becomes "J.-P." (APA keeps the hyphen).
function initialsFromGiven(given) {
    return String(given || '').split(/\s+/).filter(Boolean)
        .map(token => token.split('-').filter(Boolean).map(p => p.charAt(0).toUpperCase() + '.').join('-')).join(' ');
}

function personsToEditorString(people) {
    return people.map(p => {
        if (p.name) return p.name;
        const initials = initialsFromGiven(p.given);
        return initials ? `${p.family}, ${initials}` : p.family;
    }).join('; ');
}

function bracedWords(raw) {
    const words = [];
    String(raw || '').replace(/\{([^{}]+)\}/g, (m, inner) => { words.push(inner); return m; });
    return words;
}

function parseBibtexEntries(text) {
    const entries = [];
    const head = /@(\w+)\s*\{\s*([^,\s]*)\s*,/g;
    let m;
    while ((m = head.exec(text)) !== null) {
        const type = m[1].toLowerCase();
        if (['comment', 'string', 'preamble'].includes(type)) continue;
        let i = head.lastIndex;
        const fields = {};
        while (i < text.length) {
            while (i < text.length && /[\s,]/.test(text[i])) i++;
            if (text[i] === '}' || i >= text.length) break;
            const name = (text.slice(i).match(/^[\w\-]+/) || [''])[0];
            if (!name) break;
            i += name.length;
            while (/\s/.test(text[i])) i++;
            if (text[i] !== '=') break;
            i++;
            while (/\s/.test(text[i])) i++;
            let value = '';
            if (text[i] === '{') {
                let depth = 0, start = i;
                for (; i < text.length; i++) {
                    if (text[i] === '{') depth++;
                    else if (text[i] === '}' && --depth === 0) { i++; break; }
                }
                value = text.slice(start + 1, i - 1);
            } else if (text[i] === '"') {
                let start = ++i;
                while (i < text.length && !(text[i] === '"' && text[i - 1] !== '\\')) i++;
                value = text.slice(start, i++);
            } else {
                let start = i;
                while (i < text.length && !/[,}]/.test(text[i])) i++;
                value = text.slice(start, i).trim();
            }
            fields[name.toLowerCase()] = value;
        }
        head.lastIndex = i;
        entries.push({ type, fields });
    }
    return entries.map(({ type, fields: f }) => {
        const people = v => (v ? v.split(/\s+and\s+/i).map(personFromName).filter(Boolean) : []);
        const typeMap = { article: 'journal', book: 'book', inbook: 'chapter', incollection: 'chapter', inproceedings: 'chapter', conference: 'chapter',
            phdthesis: 'thesis', mastersthesis: 'thesis', techreport: 'report', report: 'report', software: 'software', dataset: 'dataset',
            misc: 'webpage', online: 'webpage', electronic: 'webpage', www: 'webpage' };
        const itemType = typeMap[type] || 'report';
        const year = (f.year || (f.date || '').slice(0, 4) || '').replace(/\D/g, '').slice(0, 4);
        const source = itemType === 'journal' ? (f.journal || f.journaltitle)
            : itemType === 'thesis' ? f.school
            : (f.publisher || f.institution || f.organization || f.howpublished || '');
        return {
            type: itemType, title: cleanImportedText(f.title), preserve: bracedWords(f.title), authors: people(f.author), year,
            source: cleanImportedText(source), volume: cleanImportedText(f.volume), issue: cleanImportedText(f.number || f.issue),
            pages: cleanImportedText(f.pages), doi: cleanImportedText(f.doi), url: f.doi ? '' : cleanImportedText(f.url),
            container: cleanImportedText(f.booktitle), editors: personsToEditorString(people(f.editor)),
            edition: cleanImportedText(f.edition), descriptor: type === 'mastersthesis' ? "Master's thesis" : ''
        };
    });
}

function parseRisEntries(text) {
    const records = [];
    let cur = null;
    text.split(/\r?\n/).forEach(line => {
        const m = line.match(/^([A-Z][A-Z0-9])\s{2}-\s?(.*)$/);
        if (!m) return;
        const [, tag, value] = m;
        if (tag === 'TY') cur = { TY: value.trim(), AU: [], ED: [] };
        else if (tag === 'ER') { if (cur) records.push(cur); cur = null; }
        else if (cur) {
            if (tag === 'AU' || tag === 'A1') cur.AU.push(value);
            else if (tag === 'A2' || tag === 'ED') cur.ED.push(value);
            else if (!cur[tag]) cur[tag] = value.trim();
        }
    });
    if (cur) records.push(cur);
    const typeMap = { JOUR: 'journal', BOOK: 'book', CHAP: 'chapter', CONF: 'chapter', CPAPER: 'chapter', THES: 'thesis', RPRT: 'report',
        ELEC: 'webpage', WEB: 'webpage', DATA: 'dataset', COMP: 'software', VIDEO: 'video', PCAST: 'podcast' };
    return records.map(r => {
        const itemType = typeMap[r.TY] || 'report';
        const container = r.T2 || r.JO || r.JF || r.JA || r.BT || '';
        return {
            type: itemType, title: cleanImportedText(r.TI || r.T1), authors: r.AU.map(personFromName).filter(Boolean),
            year: ((r.PY || r.Y1 || r.DA || '').match(/\d{4}/) || [''])[0],
            source: cleanImportedText(itemType === 'journal' ? container : (r.PB || (itemType === 'thesis' ? r.PB : ''))),
            volume: cleanImportedText(r.VL), issue: cleanImportedText(r.IS),
            pages: cleanImportedText(r.SP ? (r.EP ? `${r.SP}-${r.EP}` : r.SP) : ''), doi: cleanImportedText(r.DO),
            url: r.DO ? '' : cleanImportedText(r.UR), container: itemType === 'journal' ? '' : cleanImportedText(container),
            editors: personsToEditorString(r.ED.map(personFromName).filter(Boolean)), edition: cleanImportedText(r.ET), descriptor: ''
        };
    });
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function parseDateParts(str) {
    const value = (str || '').trim();
    if (!value) return { year: '', monthDay: '' };
    const iso = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (iso && +iso[2] >= 1 && +iso[2] <= 12) {
        return { year: iso[1], monthDay: `${MONTH_NAMES[+iso[2] - 1]} ${+iso[3]}` };
    }
    if (/^\d{4}$/.test(value)) return { year: value, monthDay: '' };
    const d = new Date(value);
    if (!isNaN(d.getTime()) && d.getFullYear() > 1800) {
        return { year: String(d.getFullYear()), monthDay: `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}` };
    }
    const yearOnly = value.match(/\b(19\d{2}|20\d{2})\b/);
    return { year: yearOnly ? yearOnly[1] : '', monthDay: '' };
}

function titleSimilarity(a, b) {
    const tokens = t => new Set(String(t || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2));
    const A = tokens(a), B = tokens(b);
    if (!A.size || !B.size) return 0;
    let shared = 0;
    A.forEach(w => { if (B.has(w)) shared++; });
    return shared / Math.max(A.size, B.size);
}

const SENTENCE_CASE_PROPER_NOUNS = [
    // Calendar
    'January', 'February', 'March', 'April', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
    // Countries (one-word names; multi-word names are in SENTENCE_CASE_PHRASES)
    'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Argentina', 'Armenia', 'Australia', 'Austria', 'Azerbaijan', 'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan', 'Bolivia', 'Bosnia', 'Botswana', 'Brazil', 'Brunei', 'Bulgaria', 'Burkina', 'Burundi', 'Cambodia', 'Cameroon', 'Canada', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros', 'Congo', 'Croatia', 'Cuba', 'Cyprus', 'Czechia', 'Denmark', 'Djibouti', 'Dominica', 'Ecuador', 'Egypt', 'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia', 'Fiji', 'Finland', 'France', 'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Grenada', 'Guatemala', 'Guinea', 'Guyana', 'Haiti', 'Honduras', 'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy', 'Jamaica', 'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kiribati', 'Kosovo', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein', 'Lithuania', 'Luxembourg', 'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta', 'Mauritania', 'Mauritius', 'Mexico', 'Micronesia', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar', 'Namibia', 'Nauru', 'Nepal', 'Netherlands', 'Nicaragua', 'Niger', 'Nigeria', 'Norway', 'Oman', 'Pakistan', 'Palau', 'Palestine', 'Panama', 'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal', 'Qatar', 'Romania', 'Russia', 'Rwanda', 'Samoa', 'Senegal', 'Serbia', 'Seychelles', 'Singapore', 'Slovakia', 'Slovenia', 'Somalia', 'Spain', 'Sudan', 'Suriname', 'Sweden', 'Switzerland', 'Syria', 'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Togo', 'Tonga', 'Tunisia', 'Turkey', 'Turkmenistan', 'Tuvalu', 'Uganda', 'Ukraine', 'Uruguay', 'Uzbekistan', 'Vanuatu', 'Vatican', 'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe', 'Scotland', 'Wales', 'England', 'Greenland', 'Macau', 'Timor-Leste',
    // Regions, continents and places
    'Africa', 'Asia', 'Europe', 'America', 'Americas', 'Oceania', 'Antarctica', 'Arctic', 'Caribbean', 'Pacific', 'Atlantic', 'Mediterranean', 'ASEAN', 'Mindanao', 'Luzon', 'Visayas', 'Palawan', 'Mindoro', 'Samar', 'Leyte', 'Bohol', 'Siquijor', 'Mindanao', 'Balkans', 'Scandinavia', 'Polynesia', 'Melanesia', 'Himalayas', 'Amazon', 'Sahara',
    // Cities
    'Manila', 'Quezon', 'Makati', 'Cebu', 'Davao', 'Baguio', 'Tokyo', 'Osaka', 'Kyoto', 'Beijing', 'Shanghai', 'Seoul', 'Bangkok', 'Jakarta', 'Hanoi', 'Delhi', 'Mumbai', 'Kolkata', 'Dhaka', 'Karachi', 'Tehran', 'Baghdad', 'Cairo', 'Lagos', 'Nairobi', 'Johannesburg', 'London', 'Paris', 'Berlin', 'Madrid', 'Rome', 'Vienna', 'Moscow', 'Toronto', 'Chicago', 'Boston', 'Sydney', 'Melbourne', 'Auckland', 'Washington', 'California', 'Texas', 'Florida', 'Hawaii', 'Ontario', 'Quebec',
    // Nationalities and languages
    'English', 'Spanish', 'French', 'German', 'Chinese', 'Japanese', 'Korean', 'Filipino', 'Philippine', 'Tagalog', 'Cebuano', 'Ilocano', 'Hiligaynon', 'Waray', 'Bikol', 'Kapampangan', 'Mandarin', 'Cantonese', 'Hindi', 'Urdu', 'Bengali', 'Arabic', 'Hebrew', 'Persian', 'Turkish', 'Swahili', 'Italian', 'Portuguese', 'Dutch', 'Swedish', 'Norwegian', 'Danish', 'Finnish', 'Polish', 'Russian', 'Ukrainian', 'Greek', 'Irish', 'Scottish', 'Welsh', 'Swiss', 'Austrian', 'Belgian', 'Czech', 'Hungarian', 'Romanian', 'American', 'European', 'Asian', 'African', 'Australian', 'Canadian', 'British', 'Indian', 'Pakistani', 'Bangladeshi', 'Nepali', 'Indonesian', 'Malaysian', 'Singaporean', 'Thai', 'Vietnamese', 'Cambodian', 'Burmese', 'Iranian', 'Iraqi', 'Israeli', 'Saudi', 'Egyptian', 'Nigerian', 'Kenyan', 'Ghanaian', 'Ethiopian', 'South', 'Mexican', 'Brazilian', 'Argentine', 'Argentinian', 'Chilean', 'Colombian', 'Peruvian', 'Cuban', 'Latino', 'Latina', 'Latinx', 'Hispanic', 'Indigenous', 'Aboriginal', 'Maori',
    // Organizations, brands, religions
    'Google', 'Facebook', 'Instagram', 'TikTok', 'YouTube', 'Twitter', 'Wikipedia', 'Internet', 'Zoom', 'Microsoft', 'Apple', 'Amazon', 'God', 'Christian', 'Christianity', 'Catholic', 'Islam', 'Islamic', 'Muslim', 'Buddhist', 'Buddhism', 'Hindu', 'Hinduism', 'Jewish', 'Judaism', 'Protestant', 'Bible', 'Quran'
].filter(w => w !== 'South');

const SENTENCE_CASE_PHRASES = [
    'United States', 'United States of America', 'United Kingdom', 'United Arab Emirates', 'United Nations', 'European Union', 'New Zealand', 'New York', 'New Delhi', 'New Jersey', 'New England',
    'South Korea', 'North Korea', 'South Africa', 'South Sudan', 'Saudi Arabia', 'Sri Lanka', 'Hong Kong', 'Costa Rica', 'Puerto Rico', 'El Salvador', 'Papua New Guinea', 'Czech Republic', 'Dominican Republic', 'Central African Republic', 'Ivory Coast', 'Cape Verde', 'East Timor', 'Burkina Faso', 'Sierra Leone', 'Equatorial Guinea', 'Trinidad and Tobago', 'Antigua and Barbuda', 'Bosnia and Herzegovina', 'Solomon Islands', 'Marshall Islands', 'Cook Islands',
    'Southeast Asia', 'South Asia', 'East Asia', 'Central Asia', 'Western Asia', 'Middle East', 'North America', 'South America', 'Latin America', 'Central America', 'Sub-Saharan Africa', 'North Africa', 'West Africa', 'East Africa', 'Eastern Europe', 'Western Europe', 'Pacific Islands', 'Asia Pacific', 'Asia-Pacific',
    'Metro Manila', 'Quezon City', 'Cebu City', 'Davao City', 'Makati City', 'Mandaluyong City', 'Pasig City', 'Taguig City', 'Los Angeles', 'San Francisco', 'San Diego', 'Las Vegas', 'Kuala Lumpur', 'Ho Chi Minh City', 'Rio de Janeiro', 'Buenos Aires', 'Mexico City', 'Cape Town', 'Tel Aviv', 'Abu Dhabi', 'World Health Organization', 'World Bank', 'World War I', 'World War II', 'Southern Cross', 'Ateneo de Manila University', 'University of the Philippines'
];

function toSentenceCase(text, preserve) {
    if (!text) return '';
    const keepWords = new Map();
    SENTENCE_CASE_PROPER_NOUNS.forEach(w => keepWords.set(w.toLowerCase(), w));
    (preserve || []).forEach(phrase => String(phrase || '').split(/\s+/).forEach(w => {
        const cleaned = w.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
        if (cleaned.length > 2 && /^[A-Z]/.test(cleaned)) keepWords.set(cleaned.toLowerCase(), cleaned);
    }));
    const str = text.trim();
    // Multi-word proper nouns ("United States", "New Zealand") keep their capitals as a block.
    const phraseRanges = [];
    SENTENCE_CASE_PHRASES.forEach(phrase => {
        const re = new RegExp(`(^|[^A-Za-z])(${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')})(?![A-Za-z])`, 'gi');
        let m;
        while ((m = re.exec(str))) phraseRanges.push({ start: m.index + m[1].length, end: m.index + m[1].length + m[2].length, text: phrase });
    });
    const acronyms = new Set(['ASEAN', 'DNA', 'RNA', 'HIV', 'AIDS', 'COVID', 'COVID-19', 'AI', 'ML', 'USA', 'UK', 'EU', 'UN', 'WHO', 'CDC', 'NIH', 'APA', 'IEEE', 'ACM', 'MRI', 'FMRI', 'EEG', 'CT', 'PCR', 'IQ']);

    const words = str.split(/\s+/).filter(Boolean);
    if (words.length === 0) return '';

    const letters = str.replace(/[^A-Za-z]/g, '');
    const isAllUpper = letters.length > 3 && letters === letters.toUpperCase();

    // Short function words (and, of, in…) are lowercase in both styles, so judge only longer words.
    const interiorWords = words.slice(1).filter(w => w.replace(/[^a-zA-Z]/g, '').length > 3);
    let capitalizedCount = 0;
    interiorWords.forEach(w => {
        const plain = w.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '');
        if (/^[A-Z]/.test(plain)) capitalizedCount++;
    });
    const isTitleCase = interiorWords.length > 0 && (capitalizedCount / interiorWords.length) > 0.55;
    const shouldNormalizeCase = isAllUpper || isTitleCase;

    return str.replace(/([A-Za-z0-9'’\-]+)/g, (match, word, offset) => {
        const inPhrase = phraseRanges.find(r => offset >= r.start && offset + word.length <= r.end);
        if (inPhrase) {
            // Rebuild the matching slice of the canonical phrase, word by word, whatever spacing the input had.
            const index = str.slice(inPhrase.start, offset).split(/\s+/).length - 1;
            const canon = inPhrase.text.split(' ')[index];
            if (canon && canon.toLowerCase() === word.toLowerCase()) return canon;
        }
        const cleanUpper = word.toUpperCase();
        if (acronyms.has(cleanUpper)) {
            return cleanUpper;
        }

        if (keepWords.has(word.toLowerCase()) && word.length > 2) {
            return keepWords.get(word.toLowerCase());
        }

        const before = str.slice(0, offset);
        const isStart = offset === 0;
        const isAfterColonOrPunct = /[:\.\?!—–-]\s*$/.test(before);

        if (isStart || isAfterColonOrPunct) {
            return word.charAt(0).toUpperCase() + (isAllUpper ? word.slice(1).toLowerCase() : word.slice(1));
        }

        if (shouldNormalizeCase) {
            if (/[a-z]/.test(word) && /[A-Z]/.test(word.slice(1))) {
                return word;
            }
            return word.toLowerCase();
        }

        return word;
    });
}

function toTitleCase(text) {
    if (!text) return '';
    const minorWords = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'so', 'yet', 'at', 'by', 'in', 'of', 'on', 'to', 'up', 'as', 'via', 'with']);
    const words = text.trim().split(/\s+/);
    return words.map((w, idx) => {
        const clean = w.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '').toLowerCase();
        const isFirst = idx === 0;
        const isLast = idx === words.length - 1;
        const prevEndsWithColon = idx > 0 && /[:\.\?!]$/.test(words[idx - 1]);

        if (w.length >= 2 && w === w.toUpperCase() && /^[A-Z0-9]+$/.test(w)) {
            return w;
        }

        if (isFirst || isLast || prevEndsWithColon || !minorWords.has(clean)) {
            return w.charAt(0).toUpperCase() + w.slice(1);
        }
        return w.toLowerCase();
    }).join(' ');
}

function isCorporateAuthor(name) {
    return /\b(organization|department|ministry|institute|association|agency|commission|committee|university|college|corporation|center|centre|foundation|group|council|team|society|office|bureau|press|gov|inc|llc|ltd|plc|gmbh|corp|company|unicef|unesco|library|libraries|museum|hospital|clinic|school|schools|academy|club|network|studio|studios|media|bank|lab|labs|laboratory|project|initiative|alliance|coalition|federation|union|league|board|authority|administration|service|services|partnership|trust|fund|program|programme|forum|consortium|collective|magazine|news|radio|television|publishing|publications?|observatory|society|ministry|government|municipality|city|county|state|national|international|global)\b/i.test(name);
}

function parseAuthorsInput(raw) {
    if (!raw) return [];
    const trimmed = raw.trim();
    if (/\[@[^\]]+\]/.test(trimmed)) return [{ name: trimmed }];
    // {Crash Course}: braces mark an organization or channel name that must not be turned into "Course, C."
    const literal = trimmed.match(/^\{([^{}]+)\}$/);
    if (literal) return [{ name: literal[1].trim() }];
    if (isCorporateAuthor(trimmed) && !trimmed.includes('&') && !trimmed.includes(';')) {
        return [{ name: trimmed }];
    }

    const normalized = trimmed.replace(/\s+(?:&|and)\s+/g, ', ');
    const parts = normalized.split(/[,;]\s*/).map(p => p.trim()).filter(Boolean);
    const authors = [];
    let i = 0;
    while (i < parts.length) {
        const p1 = parts[i];
        const p2 = parts[i + 1];
        if (p2 && /^[A-Z](?:\.?-?[A-Z])*\.?$/i.test(p2.replace(/\s+/g, ''))) {
            authors.push({ family: p1, given: p2 });
            i += 2;
        } else if (p1.includes(' ') && !p1.includes(',')) {
            const nameTokens = p1.split(/\s+/);
            const family = nameTokens.pop();
            const given = nameTokens.join(' ');
            authors.push({ family, given });
            i += 1;
        } else {
            authors.push(p1);
            i += 1;
        }
    }
    return authors;
}

function formatAuthorsApa(authors) {
    if (!authors || !authors.length) return '';
    const parsed = authors.map(a => {
        if (typeof a === 'string') {
            const parts = a.trim().split(',');
            if (parts.length >= 2) {
                return `${parts[0].trim()}, ${parts[1].trim()}`;
            }
            const nameParts = a.trim().split(/\s+/);
            if (nameParts.length >= 2) {
                const family = nameParts.pop();
                const initials = nameParts.map(n => n.charAt(0).toUpperCase() + '.').join(' ');
                return `${family}, ${initials}`;
            }
            return a.trim();
        }
        if (a.name) return a.name;
        const family = a.family || a.familyName || '';
        const initials = initialsFromGiven(a.given || a.givenName || '');
        const suffix = a.suffix ? `, ${a.suffix}` : '';
        return initials ? `${family}, ${initials}${suffix}` : family;
    }).filter(Boolean);

    // Parsed long lists: the last author follows an ellipsis ("A, B., ... Z, Y.").
    const ellipsisIndex = authors.findIndex(a => a && a.afterEllipsis);
    if (ellipsisIndex > 0 && parsed.length === authors.length) {
        return `${parsed.slice(0, ellipsisIndex).join(', ')}, ... ${parsed[ellipsisIndex]}`;
    }

    if (!parsed.length) return '';
    if (parsed.length === 1) return parsed[0];
    if (parsed.length === 2) return `${parsed[0]}, & ${parsed[1]}`;
    if (parsed.length <= 20) {
        return `${parsed.slice(0, -1).join(', ')}, & ${parsed[parsed.length - 1]}`;
    }
    return `${parsed.slice(0, 19).join(', ')}, ... ${parsed[parsed.length - 1]}`;
}

function formatInTextCitation(authors, year) {
    const yr = year || 'n.d.';
    if (!authors || !authors.length) {
        return {
            parenthetical: `("Title", ${yr})`,
            narrative: `"Title" (${yr})`
        };
    }
    const surnames = authors.map(a => {
        if (typeof a === 'string') {
            return a.split(',')[0].trim().split(/\s+/).pop();
        }
        if (a.name) {
            // "Doe, J. [@janedoe]" (a social account) is cited by surname: (Doe, 2024)
            const name = a.name.replace(/\s*\[@[^\]]+\]/, '').trim();
            return /^[^,]+,\s*\p{Lu}\./u.test(name) ? name.split(',')[0].trim() : name;
        }
        return a.family || a.familyName || 'Author';
    }).filter(Boolean);

    if (!surnames.length) {
        return { parenthetical: `("Title", ${yr})`, narrative: `"Title" (${yr})` };
    }
    if (surnames.length === 1) {
        return {
            parenthetical: `(${surnames[0]}, ${yr})`,
            narrative: `${surnames[0]} (${yr})`
        };
    }
    if (surnames.length === 2) {
        return {
            parenthetical: `(${surnames[0]} & ${surnames[1]}, ${yr})`,
            narrative: `${surnames[0]} and ${surnames[1]} (${yr})`
        };
    }
    return {
        parenthetical: `(${surnames[0]} et al., ${yr})`,
        narrative: `${surnames[0]} et al. (${yr})`
    };
}

function formatEditorsApa(raw) {
    const names = parseAuthorsInput(raw).map(a => {
        if (typeof a === 'string') return a;
        if (a.name) return a.name;
        const initials = initialsFromGiven(a.given);
        return initials ? `${initials} ${a.family}` : a.family;
    }).filter(Boolean);
    if (!names.length) return { text: '', count: 0 };
    const text = names.length === 1 ? names[0]
        : names.length === 2 ? `${names[0]} & ${names[1]}`
        : `${names.slice(0, -1).join(', ')}, & ${names[names.length - 1]}`;
    return { text, count: names.length };
}

function ordinalSuffix(n) {
    const v = n % 100;
    if (v >= 11 && v <= 13) return `${n}th`;
    return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th'}`;
}

function normalizeEdition(raw) {
    const e = (raw || '').replace(/\*/g, '').trim();
    if (!e) return '';
    if (/^\d+$/.test(e)) return `${ordinalSuffix(parseInt(e, 10))} ed.`;
    if (/^\d+(st|nd|rd|th)$/i.test(e)) return `${e.toLowerCase()} ed.`;
    if (/^rev(ised)?\.?(\s*ed\.?)?$/i.test(e)) return 'Rev. ed.';
    return e;
}

// Journal names with internal capitals (eLife, PLoS ONE, iScience) keep the spelling the user typed.
const BRAND_CASE_RE = /[a-z][A-Z]/;

function generateApaReference(item) {
    const clean = v => stripItalicMarkers(v || '').trim();
    const type = item.type;
    const authorsStr = formatAuthorsApa(item.authors);
    let dateStr = '(n.d.).';
    if (item.year) {
        const showMonthDay = item.monthDay && ['webpage', 'article', 'video', 'podcast', 'social'].includes(type);
        dateStr = showMonthDay ? `(${clean(item.year)}, ${clean(item.monthDay)}).` : `(${clean(item.year)}).`;
    }

    const typedTitle = clean(item.title) || 'Untitled document';
    // A post's own wording, capitalization and punctuation are reproduced exactly (APA 7), so its final period stays.
    const title = (item.keepCase ? typedTitle : toSentenceCase(typedTitle, item.preserve)).replace(type === 'social' ? /^$/ : /\.+$/, '');
    const endsInQuestion = /[?!]$/.test(title);
    const siteName = clean(item.source);
    const doiUrl = item.doi
        ? (item.doi.startsWith('http') ? item.doi : `https://doi.org/${item.doi.replace(/^doi:\s*/i, '')}`)
        : (item.url || '');
    const retrieved = clean(item.retrieved);
    const locator = doiUrl ? (retrieved && !item.doi ? ` Retrieved ${retrieved}, from ${doiUrl}` : ` ${doiUrl}`) : '';

    // Stand-alone works are italic; parts of a larger container (articles, chapters) are not.
    const italicTitle = !['journal', 'article', 'chapter'].includes(type);
    const edition = normalizeEdition(item.edition);
    const translator = clean(item.translator);
    const parenParts = [];
    if (['book', 'report', 'dataset', 'software', 'podcast'].includes(type) && edition) parenParts.push(edition);
    if (type === 'book' && translator) parenParts.push(`${translator}, Trans.`);
    const parenStr = parenParts.length ? `(${parenParts.join('; ')})` : '';

    const descText = clean(item.descriptor).replace(/^\[|\]$/g, '') || DEFAULT_DESCRIPTORS[type] || '';
    // Social posts take two brackets: the attached media first, then the kind of post (APA 7).
    const mediaText = type === 'social' ? clean(item.media).replace(/^\[|\]$/g, '') : '';
    let bracketStr = '';
    if (descText) bracketStr = type === 'thesis' && siteName ? `[${descText}, ${siteName}]` : `[${descText}]`;
    if (mediaText) bracketStr = `[${mediaText}]${bracketStr ? ' ' + bracketStr : ''}`;

    const titleCore = italicTitle ? `*${title}*` : title;
    const tail = [parenStr, bracketStr].filter(Boolean).join(' ');
    const titleSeg = tail ? `${titleCore} ${tail}.` : (endsInQuestion || (type === 'social' && /[.]$/.test(title)) ? titleCore : `${titleCore}.`);

    // APA 7 marks podcast hosts: "Glass, I. (Host)." / "Glass, I., & Lee, S. (Hosts)."
    const hostCount = type === 'podcast' ? (item.authors || []).filter(a => typeof a === 'string' || a.family).length : 0;
    const authorsLabel = hostCount && authorsStr ? `${authorsStr.replace(/\.$/, '')}${/\.$/.test(authorsStr) ? '.' : ''} (${hostCount > 1 ? 'Hosts' : 'Host'})` : authorsStr;
    const head = authorsLabel
        ? `${authorsLabel}${/\.$/.test(authorsLabel) ? '' : '.'} ${dateStr} ${titleSeg}`
        : `${titleSeg} ${dateStr}`;

    let container = '';
    if (type === 'journal') {
        const journalTitle = siteName ? (BRAND_CASE_RE.test(siteName) ? siteName : toTitleCase(siteName)) : '';
        container = journalTitle ? `*${journalTitle}*` : '';
        const volume = clean(item.volume);
        const issue = clean(item.issue);
        const pages = clean(item.pages).replace(/(\w)\s*[-‐‑‒]\s*(\w)/g, '$1–$2');
        if (volume) container += `${container ? ', ' : ''}*${volume}*`;
        if (issue) container += `(${issue})`;
        if (pages) container += `${container ? ', ' : ''}${pages}`;
        if (container) container += '.';
    } else if (type === 'article') {
        container = siteName ? `*${siteName}*.` : '';
    } else if (type === 'chapter') {
        const editors = formatEditorsApa(clean(item.editors));
        const bookTitle = (item.keepCase ? clean(item.container) : toSentenceCase(clean(item.container))).replace(/\.+$/, '');
        const pages = clean(item.pages).replace(/(\w)\s*[-‐‑‒]\s*(\w)/g, '$1–$2');
        const info = [edition, pages ? `${/[–,]/.test(pages) ? 'pp.' : 'p.'} ${pages}` : ''].filter(Boolean).join(', ');
        let inPart = 'In';
        if (editors.text) inPart += ` ${editors.text} (${editors.count > 1 ? 'Eds.' : 'Ed.'}),`;
        if (bookTitle) inPart += ` *${bookTitle}*`;
        if (info) inPart += ` (${info})`;
        const inClause = editors.text || bookTitle ? `${inPart.replace(/,$/, '')}.` : '';
        container = `${inClause}${siteName ? `${inClause ? ' ' : ''}${siteName.replace(/\.+$/, '')}.` : ''}`;
    } else if (type === 'podcast') {
        const show = clean(item.container);
        container = `${show ? `In *${show}*.` : ''}${siteName ? ` ${siteName.replace(/\.+$/, '')}.` : ''}`.trim();
    } else if (type === 'thesis') {
        container = '';
    } else if (siteName) {
        // Publisher / website name; omitted when it is already the author.
        const sameAsAuthor = authorsStr && siteName.toLowerCase() === authorsStr.replace(/\.$/, '').toLowerCase();
        if (!sameAsAuthor) container = `${siteName.replace(/\.+$/, '')}.`;
    }

    const marked = `${head}${container ? ' ' + container : ''}${locator}`.replace(/\s+/g, ' ').trim();
    return {
        html: markersToHtml(marked),
        plain: stripItalicMarkers(marked),
        marked
    };
}
const DEFAULT_DESCRIPTORS = {
    religious: 'Encyclical', video: 'Video', thesis: 'Doctoral dissertation', dataset: 'Data set',
    software: 'Computer software', podcast: 'Audio podcast episode', social: 'Post'
};

function formatLongDate(d) {
    return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
