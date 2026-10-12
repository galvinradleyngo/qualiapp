// Reference parser: turns a pasted APA-style reference into structured fields and rebuilds it with the
// citation generator, so punctuation, capitalization and italics come from one consistent source.
// Pure text logic (no DOM). Falls back to the original text whenever parsing is uncertain or would
// change any wording.

const INITIALS_RE = /^(?:\p{Lu}\.[\s\-]?)+$|^\p{Lu}{1,3}$/u;
const PUBLISHER_WORDS_RE = /\b(?:Inc|Press|Publishers?|Publishing|Books|Ltd|LLC|Verlag)\b/i;

// A short phrase whose content words are all capitalized (World Health Organization, Plato, UNICEF).
function looksLikeOrganizationName(name) {
    const words = name.split(/\s+/).filter(Boolean);
    if (!words.length || words.length > 7) return false;
    return words.filter(w => !/^(?:of|for|and|the|in|on|de|la|&)$/i.test(w)).every(w => /^[\p{Lu}0-9@]/u.test(w));
}

function parseAuthorBlock(rawBlock) {
    let block = stripItalicMarkers(rawBlock).replace(/\s+/g, ' ').trim();
    // Podcast hosts: "Glass, I. (Host)." The label is regenerated for podcasts, so just remember it.
    const hostMatch = block.match(/\s*\((?:Hosts?)\)\.?$/i);
    if (hostMatch) {
        const inner = parseAuthorBlock(block.slice(0, hostMatch.index));
        return inner.ok ? { ...inner, hostLabel: true } : inner;
    }
    if (!block) return { ok: true, authors: [] };
    // Long list: "A, B., ... Z, Y." (the last author follows an ellipsis).
    const ellipsis = block.split(/,\s*(?:\.\.\.|…|\. \. \.)\s*/);
    if (ellipsis.length === 2) {
        const head = parseAuthorBlock(ellipsis[0]);
        const last = parseAuthorBlock(ellipsis[1]);
        if (!head.ok || !last.ok || last.authors.length !== 1 || !last.authors[0].family || head.authors.length < 2) {
            return { ok: false, reason: 'unusual long author list' };
        }
        return { ok: true, authors: [...head.authors, { ...last.authors[0], afterEllipsis: true }] };
    }
    if (/\.\.\.|…/.test(block)) return { ok: false, reason: 'long author list with an ellipsis' };
    if (/\[@[^\]]+\]/.test(block)) return { ok: true, authors: [{ name: block.replace(/\.$/, '') }] };

    const tokens = block.split(/,\s*(?:&\s*)?|\s+&\s+/).map(t => t.trim()).filter(Boolean);
    if (!tokens.some(t => INITIALS_RE.test(t))) {
        const name = block.replace(/\.$/, '');
        if (isCorporateAuthor(name) || looksLikeOrganizationName(name)) return { ok: true, authors: [{ name }] };
        return { ok: false, reason: 'could not tell whether the first part is an author or a title' };
    }
    const authors = [];
    for (let i = 0; i < tokens.length; i += 2) {
        const family = tokens[i];
        const given = tokens[i + 1];
        if (!given || INITIALS_RE.test(family) || !INITIALS_RE.test(given)) return { ok: false, reason: 'unusual author formatting' };
        const person = { family, given };
        if (/^(?:Jr|Sr|II|III|IV)\.?$/i.test(tokens[i + 2] || '')) {
            person.suffix = tokens[i + 2].replace(/^(jr|sr)$/i, m => `${m[0].toUpperCase()}${m[1].toLowerCase()}.`);
            i += 1;
        }
        authors.push(person);
    }
    return { ok: true, authors };
}

function parseEditorNames(raw) {
    const people = raw.split(/,\s*(?:&\s*)?|\s+&\s+/).map(t => t.trim()).filter(Boolean).map(name => {
        const m = name.match(/^((?:\p{Lu}\.[\s\-]?)+)\s*(.+)$/u);
        return m ? { family: m[2].trim(), given: m[1].trim() } : { name };
    });
    return personsToEditorString(people);
}

// Peels trailing [descriptor] and (edition/report number) pieces off a title sentence.
function splitTitleSentence(sentence) {
    let core = sentence.trim().replace(/\.$/, '');
    const brackets = [];
    const parens = [];
    for (;;) {
        const m = core.match(/\s*(\[[^\]]*\]|\([^()]*\))$/);
        if (!m) break;
        const piece = m[1];
        if (piece.startsWith('[')) brackets.unshift(piece.slice(1, -1));
        else if (NON_ITALIC_TITLE_TAIL.test(piece)) parens.unshift(piece.slice(1, -1));
        else break;
        core = core.slice(0, core.length - m[0].length);
    }
    return { core, brackets, parens };
}

function parseReferenceFields(entry) {
    const result = parseReferenceFieldsInner(entry);
    // "(Host)" is only meaningful for podcast episodes; anywhere else the entry is left as typed.
    if (result.ok && result.item.hostLabel && result.item.type !== 'podcast') return { ok: false, reason: 'unexpected (Host) label' };
    return result;
}

function parseReferenceFieldsInner(entry) {
    const original = String(entry || '').replace(/\s+/g, ' ').trim();
    const hasMarkers = original.includes('*');
    let text = original;
    const fail = reason => ({ ok: false, reason });

    let doi = '', url = '', retrieved = '';
    let m = text.match(/\s+Retrieved\s+(.+?),?\s+from\s+(https?:\/\/\S+)$/i);
    if (m) {
        retrieved = m[1];
        url = m[2];
        text = text.slice(0, m.index);
    } else if ((m = text.match(/\s+(https?:\/\/\S+)$/))) {
        if (/^https?:\/\/(?:dx\.)?doi\.org\//i.test(m[1])) doi = m[1]; else url = m[1];
        text = text.slice(0, m.index);
    }

    const d = text.match(/^(.*?)\s*\((\d{4}[a-z]?|n\.d\.(?:-[a-z])?)(?:,\s*([A-Z][a-z]+(?:\s+\d{1,2}(?:[–-]\d{1,2})?)?))?\)\.?\s*(.*)$/);
    if (!d) return fail('no (year) found');
    const blockRaw = d[1].trim();
    const year = d[2];
    const monthDay = d[3] || '';
    let after = d[4].trim();

    // No author: an italic title sits where the author would be.
    let authors = [];
    let hostLabel = false;
    let noAuthorTitle = null;
    if (/^\*[^*]+\*\.?$/.test(blockRaw)) {
        noAuthorTitle = blockRaw.replace(/\.$/, '');
    } else {
        const parsedAuthors = parseAuthorBlock(blockRaw);
        if (!parsedAuthors.ok) return fail(parsedAuthors.reason);
        authors = parsedAuthors.authors;
        hostLabel = !!parsedAuthors.hostLabel;
    }

    let titleSentence;
    let remainder;
    if (noAuthorTitle) {
        titleSentence = noAuthorTitle;
        remainder = after;
    } else {
        const end = findFirstSentenceEnd(after);
        titleSentence = after.slice(0, end).trim();
        remainder = after.slice(end).trim();
        if (!remainder) {
            // Pasted text often has a lowercase journal name ("Title. journal of x, 12(3), 4-9.").
            const lowerJournal = after.match(/^(.+?[.?!])\s+(\p{Ll}[\p{L}\s&:'’\-]*?,\s*\d+[A-Za-z]?(?:\(\d+[A-Za-z\-–]*\))?(?:,\s*[^,]+?)?\.?)$/u);
            if (lowerJournal) {
                titleSentence = lowerJournal[1].trim();
                remainder = lowerJournal[2].trim();
            }
        }
    }
    if (!titleSentence) return fail('no title found');

    const { core, brackets, parens } = splitTitleSentence(titleSentence);
    const titleItalic = /^\*.+\*$/.test(core);
    const title = stripItalicMarkers(core).trim();
    const plainRemainder = () => stripItalicMarkers(remainder).replace(/\.$/, '').trim();

    // keepCase: rebuilding fixes punctuation and italics but never rewrites the capitalization the author typed
    // (sentence-case problems are flagged separately with a one-click fix).
    const item = { type: 'report', keepCase: true, title, authors, year, monthDay: '', source: '', volume: '', issue: '', pages: '', container: '', editors: '',
        edition: '', translator: '', descriptor: '', doi, url, retrieved, hostLabel };

    const paren = parens[0] || '';
    // Two brackets mean [attached media] [kind of post]; otherwise the single bracket names the type.
    const bracket = brackets[brackets.length - 1] || '';
    const media = brackets.length > 1 ? brackets[0] : '';

    // 1. Chapter in an edited book
    const chapter = remainder.match(/^In\s+(.+?)\s*\((Eds?)\.\),?\s+(.+?)(?:\s+\(([^)]*)\))?\.(?:\s+(.*))?$/);
    if (chapter && !bracket) {
        item.type = 'chapter';
        item.editors = parseEditorNames(stripItalicMarkers(chapter[1]));
        item.container = stripItalicMarkers(chapter[3]).trim();
        const info = chapter[4] || '';
        const pm = info.match(/(?:^|,\s*)pp?\.\s*(.+)$/);
        item.pages = pm ? pm[1] : '';
        item.edition = (pm ? info.slice(0, pm.index) : info).replace(/,\s*$/, '').trim();
        item.source = stripItalicMarkers(chapter[5] || '').replace(/\.$/, '').trim();
        if (titleItalic && hasMarkers) return fail('chapter title is italic');
        return { ok: true, item, hasMarkers };
    }

    // 2. Types announced by a [descriptor]
    if (bracket) {
        if (brackets.length === 2) {
            Object.assign(item, { type: 'social', descriptor: bracket, media, monthDay, source: plainRemainder() });
            item.keepCase = true;
            return { ok: true, item, hasMarkers };
        }
        const thesis = bracket.match(/^((?:Doctoral dissertation|Master['’]s thesis|[^,]*(?:thesis|dissertation)[^,]*)),\s*(.+)$/i);
        if (thesis) {
            Object.assign(item, { type: 'thesis', descriptor: thesis[1], source: thesis[2].trim() });
        } else if (/^Data set$/i.test(bracket)) {
            item.type = 'dataset';
        } else if (/^Computer software$/i.test(bracket)) {
            item.type = 'software';
        } else if (/^Video$/i.test(bracket)) {
            item.type = 'video';
        } else if (/^Audio podcast episode$/i.test(bracket)) {
            item.type = 'podcast';
        } else if (/^Encyclical$/i.test(bracket)) {
            item.type = 'religious';
        } else if (/^(?:Social media post|Post|Tweet|Status update|Photograph|Facebook post|Instagram (?:post|photograph|video)|LinkedIn post|Online forum post)$/i.test(bracket) && /\[@[^\]]+\]|^@/.test(blockRaw) || /^(?:Social media post|Online forum post)$/i.test(bracket)) {
            item.type = 'social';
            item.descriptor = bracket;
        } else {
            item.descriptor = bracket;
        }
        if (!['thesis', 'report', 'social'].includes(item.type)) item.descriptor = '';
        if (item.type === 'podcast') {
            const pod = stripItalicMarkers(remainder).match(/^In\s+(.+?)\.\s*(.*)$/);
            if (pod) { item.container = pod[1].trim(); item.source = pod[2].replace(/\.$/, '').trim(); }
            else item.source = plainRemainder();
        } else if (item.type !== 'thesis') {
            item.source = plainRemainder();
        }
        item.edition = paren.replace(/;.*$/, '').trim();
        item.monthDay = monthDay;
        return { ok: true, item, hasMarkers };
    }

    // 3. Periodical: Title. Journal, volume(issue), pages.
    const journal = !titleItalic && remainder
        ? stripItalicMarkers(remainder).match(/^(.+?),\s*(\d+[A-Za-z]?)(?:\((\d+[A-Za-z\-–]*)\))?(?:,\s*(.+?))?\.?$/)
        : null;
    if (journal && !PUBLISHER_WORDS_RE.test(journal[1]) && !noAuthorTitle) {
        Object.assign(item, { type: 'journal', source: journal[1].trim(), volume: journal[2], issue: journal[3] || '', pages: journal[4] || '' });
        return { ok: true, item, hasMarkers };
    }

    // 4. News / magazine / blog article: plain title, italic publication (needs the user's italic markers).
    const italicRemainder = remainder.match(/^\*([^*]+)\*\.?$/);
    if (hasMarkers && !titleItalic && italicRemainder && !noAuthorTitle) {
        Object.assign(item, { type: 'article', source: italicRemainder[1].trim(), monthDay });
        return { ok: true, item, hasMarkers };
    }

    // 4b. Plain text from a news or blog site: the URL tells us the publication is a periodical.
    let newsSite = false;
    if (!hasMarkers && url && !doi && remainder && !noAuthorTitle && typeof isNewsHost === 'function') {
        try { newsSite = isNewsHost(new URL(url).hostname); } catch (e) { newsSite = false; }
    }
    if (newsSite && !titleItalic) {
        Object.assign(item, { type: 'article', source: plainRemainder(), monthDay });
        return { ok: true, item, hasMarkers };
    }

    // 5. Stand-alone work: Title. Publisher / website.
    item.source = plainRemainder();
    const editionPart = paren.split(';')[0].trim();
    const translatorPart = (paren.split(';')[1] || '').trim();
    const transMatch = (editionPart.match(/,\s*Trans\.$/) ? editionPart : translatorPart).match(/^(.+),\s*Trans\.$/);
    if (transMatch) {
        item.translator = transMatch[1].trim();
        item.edition = editionPart.match(/,\s*Trans\.$/) ? '' : editionPart;
    } else {
        item.edition = editionPart;
    }
    item.type = item.translator || /\bed\.$/i.test(item.edition) ? 'book' : (monthDay ? 'webpage' : 'report');
    item.monthDay = monthDay;
    return { ok: true, item, hasMarkers };
}

function referenceWordSignature(text) {
    return (stripItalicMarkers(text).toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter(w => w !== 'and').sort().join(' ');
}

// Returns { rebuilt, text, reason }. The rebuilt text is used only when it keeps every word of the original.
function rebuildReference(entry) {
    const parsed = parseReferenceFields(entry);
    if (!parsed.ok) return { rebuilt: false, text: entry, reason: parsed.reason };
    const text = generateApaReference(parsed.item).marked;
    if (referenceWordSignature(text) !== referenceWordSignature(entry)) {
        return { rebuilt: false, text: entry, reason: 'rebuilding would change the wording' };
    }
    return { rebuilt: true, text };
}
