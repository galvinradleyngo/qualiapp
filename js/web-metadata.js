// Web metadata helpers: URL, site-name and page-metadata logic used by the citation generator.

function extractDoiFromText(text) {
    if (!text) return null;
    const match = text.match(/\b(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+[A-Za-z0-9])/i);
    if (!match) return null;
    return match[1].replace(/[.,;:)\]]+$/, '');
}

function inferCrossrefSourceType(msg) {
    const crossrefType = (msg.type || '').toLowerCase();
    const container = Array.isArray(msg['container-title']) ? msg['container-title'][0] : msg['container-title'];

    if (crossrefType === 'book' || crossrefType === 'monograph') return 'book';
    if (crossrefType === 'book-chapter' || crossrefType === 'book-part' || crossrefType === 'reference-entry') return 'chapter';
    if (crossrefType === 'dissertation') return 'thesis';
    if (crossrefType === 'dataset') return 'dataset';
    if (crossrefType === 'journal-article' || crossrefType === 'proceedings-article' ||
        crossrefType === 'journal' || container || msg.volume || msg.issue || msg.page) {
        return 'journal';
    }
    if (crossrefType === 'report' || crossrefType === 'posted-content' || crossrefType === 'standard') {
        return 'report';
    }
    return 'webpage';
}

function cleanAuthorName(name) {
    const n = (name || '').replace(/\s+/g, ' ').trim();
    if (!n || /^@/.test(n) || /^https?:\/\//i.test(n) || n.length > 80) return '';
    if (/^(staff|admin|administrator|editor|editors|the editors|editorial team|team|unknown|guest)$/i.test(n)) return '';
    return n.replace(/^by\s+/i, '');
}

function registrableLabel(hostname) {
    const parts = hostname.replace(/^www\./i, '').toLowerCase().split('.');
    if (parts.length <= 2) return parts[0];
    const tld = parts[parts.length - 1];
    const sld = parts[parts.length - 2];
    return (tld.length === 2 && ['co', 'com', 'org', 'gov', 'edu', 'ac', 'net'].includes(sld)) ? parts[parts.length - 3] : sld;
}

function isInstitutionalHost(hostname) {
    return isKnownInstitutionalSite(hostname) || /\.(gov|edu|int|mil)(\.[a-z]{2})?$/i.test(hostname);
}

const NEWS_HOSTS = ['nytimes.com', 'washingtonpost.com', 'bbc.com', 'bbc.co.uk', 'theguardian.com', 'theverge.com', 'wired.com', 'reuters.com', 'apnews.com', 'statnews.com', 'cnn.com', 'npr.org', 'forbes.com', 'bloomberg.com', 'theatlantic.com', 'newyorker.com', 'time.com', 'usatoday.com', 'latimes.com', 'aljazeera.com', 'vox.com', 'slate.com', 'medium.com'];

function isNewsHost(hostname) {
    const host = hostname.replace(/^www\./i, '').toLowerCase();
    return NEWS_HOSTS.some(h => host === h || host.endsWith('.' + h));
}

function cleanUrlForCitation(url) {
    const copy = new URL(url.href);
    [...copy.searchParams.keys()].forEach(key => {
        if (/^(utm_.*|fbclid|gclid|mc_[a-z]+|igshid|ref|ref_src|cmpid|ocid|source|campaign)$/i.test(key)) copy.searchParams.delete(key);
    });
    copy.hash = '';
    return copy.href;
}

function stripSiteFromTitle(title, siteName, hostname) {
    const t = (title || '').replace(/\s+/g, ' ').trim();
    const parts = t.split(/\s+[|–—·»]\s+|\s+-\s+/);
    if (parts.length < 2) return t;
    const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const siteKeys = [siteName, registrableLabel(hostname || '')].filter(Boolean).map(norm);
    const kept = parts.filter(p => {
        const k = norm(p);
        return !siteKeys.some(s => s && (k === s || (k.length > 2 && (s.includes(k) || k.includes(s)) && p.split(' ').length <= 4)));
    });
    if (kept.length && kept.length < parts.length) return kept.join(' - ');
    const last = parts[parts.length - 1];
    if (parts.length === 2 && last.split(' ').length <= 3 && parts[0].split(' ').length >= 3) return parts[0];
    return t;
}

function collectJsonLd(doc) {
    const nodes = [];
    doc.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
        try {
            const walk = v => {
                if (Array.isArray(v)) return v.forEach(walk);
                if (v && typeof v === 'object') {
                    nodes.push(v);
                    if (v['@graph']) walk(v['@graph']);
                }
            };
            walk(JSON.parse(script.textContent));
        } catch (e) { /* ignore malformed JSON-LD */ }
    });
    return nodes;
}

// Records why page fetches failed so the UI can explain it instead of just saying "blocked".
let lastFetchFailures = [];

function describeFetchFailure() {
    const reasons = lastFetchFailures.map(f => f.message || '');
    const status = reasons.map(r => (r.match(/HTTP (\d{3})/) || [])[1]).filter(Boolean);
    if (status.some(c => ['401', '403', '429', '451'].includes(c)) || reasons.some(r => /blocked-page/.test(r))) {
        return 'The site refused automated access (it blocks bots and proxies).';
    }
    if (status.includes('404') || status.includes('410')) return 'The page was not found (HTTP 404). Check the link.';
    if (status.some(c => c.startsWith('5'))) return 'The site or the proxy returned a server error.';
    if (reasons.some(r => /abort|timed? ?out/i.test(r))) return 'The site took too long to respond.';
    if (reasons.some(r => /No HTML/.test(r))) return 'The link does not point to a normal web page (it may be a file or app).';
    return 'The page could not be reached from the browser (network or proxy blocked).';
}

function looksLikeBlockPage(html) {
    const title = ((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').trim();
    return /^(access denied|forbidden|403|just a moment|attention required|are you a robot|robot check|blocked|error|request blocked|pardon our interruption)/i.test(title)
        || /(captcha|cf-browser-verification|enable javascript and cookies to continue)/i.test(html.slice(0, 4000)) && html.length < 8000;
}

function isLaudatoSiUrl(url) {
    const value = `${url.hostname}${url.pathname}`.toLowerCase();
    return value.includes('laudato-si') || value.includes('laudato_si') || value.includes('laudato%20si');
}

// Legal/author names APA expects for well-known organization sites (site name is shown separately).
const KNOWN_ORGANIZATIONS = {
    'apple.com': 'Apple Inc.',
    'microsoft.com': 'Microsoft Corporation',
    'google.com': 'Google LLC',
    'amazon.com': 'Amazon.com, Inc.',
    'ibm.com': 'IBM Corporation',
    'nasa.gov': 'National Aeronautics and Space Administration',
    'unicef.org': 'UNICEF'
};

function knownOrganizationName(hostname) {
    const host = hostname.replace(/^www\./i, '').toLowerCase();
    const key = Object.keys(KNOWN_ORGANIZATIONS).find(k => host === k || host.endsWith('.' + k));
    return key ? KNOWN_ORGANIZATIONS[key] : '';
}

function isKnownInstitutionalSite(hostname) {
    const host = hostname.replace(/^www\./i, '').toLowerCase();
    return ['apple.com', 'microsoft.com', 'google.com', 'amazon.com', 'ibm.com', 'who.int', 'cdc.gov', 'nih.gov', 'apa.org', 'vatican.va', 'un.org', 'worldbank.org'].includes(host);
}

function mapDomainToSiteName(hostname) {
    const cleanHost = hostname.replace(/^www\./i, '').toLowerCase();
    const domainMap = {
        'who.int': 'World Health Organization',
        'cdc.gov': 'Centers for Disease Control and Prevention',
        'nih.gov': 'National Institutes of Health',
        'apa.org': 'American Psychological Association',
        'nature.com': 'Nature',
        'sciencemag.org': 'Science',
        'science.org': 'Science',
        'nytimes.com': 'The New York Times',
        'washingtonpost.com': 'The Washington Post',
        'bbc.com': 'BBC News',
        'bbc.co.uk': 'BBC News',
        'theguardian.com': 'The Guardian',
        'theverge.com': 'The Verge',
        'wired.com': 'Wired',
        'pewresearch.org': 'Pew Research Center',
        'worldbank.org': 'World Bank',
        'un.org': 'United Nations',
        'reuters.com': 'Reuters',
        'apnews.com': 'Associated Press',
        'statnews.com': 'STAT News',
        'apple.com': 'Apple',
        'microsoft.com': 'Microsoft',
        'google.com': 'Google',
        'amazon.com': 'Amazon',
        'ibm.com': 'IBM',
        'cnn.com': 'CNN',
        'npr.org': 'NPR',
        'forbes.com': 'Forbes',
        'bloomberg.com': 'Bloomberg',
        'theatlantic.com': 'The Atlantic',
        'newyorker.com': 'The New Yorker',
        'time.com': 'Time',
        'usatoday.com': 'USA Today',
        'latimes.com': 'Los Angeles Times',
        'aljazeera.com': 'Al Jazeera',
        'medium.com': 'Medium',
        'wikipedia.org': 'Wikipedia',
        'nasa.gov': 'National Aeronautics and Space Administration',
        'unesco.org': 'United Nations Educational, Scientific and Cultural Organization',
        'unicef.org': 'UNICEF'
    };
    if (domainMap[cleanHost]) return domainMap[cleanHost];
    const suffixKey = Object.keys(domainMap).find(k => cleanHost.endsWith('.' + k));
    if (suffixKey) return domainMap[suffixKey];

    const namePart = registrableLabel(cleanHost) || cleanHost;
    return namePart.split(/[-_]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function deriveTitleFromUrlPath(pathname) {
    let segments = pathname.split('/').filter(Boolean).map(s => {
        try { return decodeURIComponent(s); } catch (e) { return s; }
    });
    // Skip trailing IDs, dates and language/index segments that make poor titles.
    while (segments.length && /^(\d+|[0-9a-f]{8,}|index(\.\w+)?|default(\.\w+)?|amp|[a-z]{2}(-[a-z]{2})?)$/i.test(segments[segments.length - 1].replace(/\.(html?|php|aspx?|jsp|pdf)$/i, ''))) {
        segments.pop();
    }
    if (!segments.length) return '';
    const clean = segments[segments.length - 1]
        .replace(/\.(html?|php|aspx?|jsp|pdf)$/i, '')
        .replace(/[-_+]+/g, ' ')
        .replace(/\s+\d{5,}$/, '')
        .trim();
    return clean.length > 3 ? clean : '';
}

function parseHtmlMetadata(htmlString, hostname) {
    try {
        const doc = new DOMParser().parseFromString(htmlString, 'text/html');
        const metaAll = (names) => {
            const out = [];
            names.forEach(name => {
                doc.querySelectorAll(`meta[name="${name}" i], meta[property="${name}" i], meta[itemprop="${name}" i]`).forEach(el => {
                    const c = (el.getAttribute('content') || '').trim();
                    if (c) out.push(c);
                });
            });
            return out;
        };
        const getMeta = names => metaAll(names)[0] || '';

        const ld = collectJsonLd(doc);
        const ldArticle = ld.find(n => /Article|BlogPosting|NewsArticle|Report|WebPage|ScholarlyArticle/i.test([].concat(n['@type'] || []).join(' '))) || {};
        const nameOf = v => (Array.isArray(v) ? v.map(nameOf).filter(Boolean) : (v && typeof v === 'object' ? [v.name] : [v])).flat().filter(Boolean);

        const siteName = getMeta(['og:site_name', 'application-name', 'publisher'])
            || nameOf(ldArticle.publisher)[0] || nameOf((ld.find(n => n['@type'] === 'WebSite') || {}).name)[0] || '';
        const journal = getMeta(['citation_journal_title', 'prism.publicationName']);

        let authors = metaAll(['citation_author', 'dc.creator', 'dcterms.creator', 'parsely-author', 'sailthru.author']);
        if (!authors.length) authors = metaAll(['author', 'article:author']).filter(a => !/^https?:/i.test(a));
        if (!authors.length) authors = nameOf(ldArticle.author);
        authors = [...new Set(authors.map(cleanAuthorName).filter(Boolean))];

        const rawTitle = getMeta(['citation_title', 'dc.title', 'og:title', 'twitter:title']) || ldArticle.headline
            || (doc.querySelector('h1') ? doc.querySelector('h1').textContent : '') || doc.title || '';
        const title = stripSiteFromTitle(rawTitle, siteName, hostname);

        let dateStr = getMeta(['citation_publication_date', 'citation_date', 'citation_online_date', 'article:published_time', 'datepublished', 'dc.date.issued', 'dc.date', 'dcterms.created', 'pubdate', 'publish-date', 'parsely-pub-date', 'sailthru.date', 'date'])
            || ldArticle.datePublished || '';
        if (!dateStr) {
            const timeEl = doc.querySelector('time[datetime]');
            if (timeEl) dateStr = timeEl.getAttribute('datetime');
        }
        const { year, monthDay } = parseDateParts(dateStr);

        const canonicalEl = doc.querySelector('link[rel="canonical"]');
        const firstPage = getMeta(['citation_firstpage']);
        const lastPage = getMeta(['citation_lastpage']);

        return {
            title,
            author: authors.join('; '),
            siteName,
            journal,
            volume: getMeta(['citation_volume']),
            issue: getMeta(['citation_issue']),
            pages: firstPage ? (lastPage && lastPage !== firstPage ? `${firstPage}–${lastPage}` : firstPage) : '',
            doi: getMeta(['citation_doi', 'dc.identifier', 'prism.doi']).replace(/^doi:\s*/i, ''),
            year,
            monthDay,
            canonical: canonicalEl ? canonicalEl.getAttribute('href') : ''
        };
    } catch (e) {
        return null;
    }
}

// ── Social media posts ──────────────────────────────────────────────────────
// Recognizes post links from the main platforms and works out what the link itself reveals
// (platform, account handle, post id, even an approximate date from the id).
const SOCIAL_PLATFORMS = {
    x: { platform: 'X', descriptor: 'Post', hosts: ['x.com', 'twitter.com', 'mobile.twitter.com'] },
    instagram: { platform: 'Instagram', descriptor: 'Photograph', hosts: ['instagram.com'] },
    facebook: { platform: 'Facebook', descriptor: 'Status update', hosts: ['facebook.com', 'm.facebook.com', 'fb.com'] },
    tiktok: { platform: 'TikTok', descriptor: 'Video', hosts: ['tiktok.com'] },
    reddit: { platform: 'Reddit', descriptor: 'Online forum post', hosts: ['reddit.com', 'old.reddit.com'] },
    linkedin: { platform: 'LinkedIn', descriptor: 'Post', hosts: ['linkedin.com'] },
    threads: { platform: 'Threads', descriptor: 'Post', hosts: ['threads.net', 'threads.com'] },
    bluesky: { platform: 'Bluesky', descriptor: 'Post', hosts: ['bsky.app'] }
};

function parseSocialUrl(urlStr) {
    let url;
    try { url = new URL(/^https?:\/\//i.test(urlStr) ? urlStr : `https://${urlStr}`); } catch (e) { return null; }
    const host = url.hostname.replace(/^www\./i, '').toLowerCase();
    const key = Object.keys(SOCIAL_PLATFORMS).find(k => SOCIAL_PLATFORMS[k].hosts.includes(host));
    if (!key) return null;
    const parts = url.pathname.split('/').filter(Boolean).map(p => { try { return decodeURIComponent(p); } catch (e) { return p; } });
    let handle = '', postId = '', title = '';
    const at = i => (parts[i] || '').replace(/^@/, '');

    if (key === 'x') {
        const i = parts.indexOf('status');
        if (i < 1 || /^(?:i|web|intent)$/i.test(parts[0])) return null;
        handle = at(0); postId = (parts[i + 1] || '').replace(/\D/g, '');
    } else if (key === 'instagram') {
        const i = parts.findIndex(p => /^(?:p|reel|reels|tv)$/i.test(p));
        if (i < 0) return null;
        handle = i > 0 ? at(0) : ''; postId = parts[i + 1] || '';
    } else if (key === 'facebook') {
        const i = parts.findIndex(p => /^(?:posts|videos|photos|reel)$/i.test(p));
        if (i < 0 && !/permalink|story\.php/.test(url.pathname)) return null;
        handle = i > 0 && !/^(?:groups|watch|permalink\.php|story\.php)$/i.test(parts[0]) ? at(0) : ''; postId = (parts[i + 1] || url.searchParams.get('story_fbid') || '');
    } else if (key === 'tiktok') {
        const i = parts.indexOf('video');
        if (i < 1 || !parts[0].startsWith('@')) return null;
        handle = at(0); postId = (parts[i + 1] || '').replace(/\D/g, '');
    } else if (key === 'reddit') {
        const i = parts.indexOf('comments');
        if (i < 0) return null;
        postId = parts[i + 1] || ''; title = (parts[i + 2] || '').replace(/_/g, ' ');
    } else if (key === 'linkedin') {
        const i = parts.indexOf('posts');
        if (i < 0 || !parts[i + 1]) return null;
        handle = parts[i + 1].split('_')[0]; postId = (parts[i + 1].match(/activity-(\d+)/) || [])[1] || '';
    } else if (key === 'threads') {
        const i = parts.indexOf('post');
        if (i < 1 || !parts[0].startsWith('@')) return null;
        handle = at(0); postId = parts[i + 1] || '';
    } else if (key === 'bluesky') {
        const i = parts.indexOf('post');
        if (parts[0] !== 'profile' || i < 2) return null;
        handle = parts[1]; postId = parts[i + 1] || '';
    }
    // Keep the address clean: no tracking parameters, no fragment (Facebook needs its id parameters).
    const clean = new URL(url.href);
    clean.hash = '';
    if (key !== 'facebook') clean.search = '';
    // APA's second bracket names the kind of content: [Photograph] or [Video] on Instagram, [Status update], [Photograph] or [Video] on Facebook.
    let descriptor = SOCIAL_PLATFORMS[key].descriptor;
    if (key === 'instagram' && parts.some(p => /^(?:reel|reels|tv)$/i.test(p))) descriptor = 'Video';
    if (key === 'facebook' && parts.some(p => /^(?:videos|reel)$/i.test(p))) descriptor = 'Video';
    if (key === 'facebook' && parts.includes('photos')) descriptor = 'Photograph';
    return { key, ...SOCIAL_PLATFORMS[key], descriptor, handle, postId, title, url: clean.href.replace(/\/$/, '') };
}

// Twitter/X, TikTok and Instagram ids embed the posting time, which gives a date even when the page cannot be read.
// The date is in UTC, so it can differ by a day from the poster's local date: callers mark it as a guess.
function dateFromSocialId(key, postId) {
    try {
        let ms;
        if (key === 'x' && /^\d{15,20}$/.test(postId)) ms = Number((BigInt(postId) >> 22n) + 1288834974657n);
        else if (key === 'tiktok' && /^\d{15,20}$/.test(postId)) ms = Number(BigInt(postId) >> 32n) * 1000;
        else if (key === 'instagram' && /^[A-Za-z0-9_-]{8,12}$/.test(postId)) {
            const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
            let id = 0n;
            for (const ch of postId) id = id * 64n + BigInt(alphabet.indexOf(ch));
            ms = Number((id >> 23n) + 1314220021721n);
        } else return { year: '', monthDay: '' };
        const d = new Date(ms);
        if (isNaN(d) || d.getUTCFullYear() < 2005 || d.getTime() > Date.now() + 86400000) return { year: '', monthDay: '' };
        return { year: String(d.getUTCFullYear()), monthDay: `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}` };
    } catch (e) {
        return { year: '', monthDay: '' };
    }
}

function truncateWords(text, count = 20) {
    const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    return words.slice(0, count).join(' ');
}

function cleanSocialText(text) {
    return String(text || '')
        .replace(/https?:\/\/t\.co\/\w+/g, '')
        .replace(/pic\.(?:twitter|x)\.com\/\w+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// "Doe, J. [@janedoe]" for people, "NASA [@NASA]" for organizations, "@handle" when only the handle is known.
function socialAuthor(displayName, handle) {
    const h = String(handle || '').replace(/^@/, '').trim();
    const name = String(displayName || '').replace(/\s+/g, ' ').trim();
    if (!name) return h ? `@${h}` : '';
    const tag = h ? ` [@${h}]` : '';
    const words = name.split(' ');
    const looksLikePerson = words.length >= 2 && words.length <= 4
        && words.every(w => /^\p{Lu}[\p{L}'’.\-]*$/u.test(w)) && !isCorporateAuthor(name);
    if (looksLikePerson) {
        const family = words[words.length - 1];
        const initials = words.slice(0, -1).map(w => `${w[0].toUpperCase()}.`).join(' ');
        return `${family}, ${initials}${tag}`;
    }
    return `${name}${tag}`;
}

// Instagram's og:description reads: 1,234 likes, 5 comments - username on March 5, 2024: "caption".
function parseInstagramDescription(desc) {
    const m = String(desc || '').match(/-\s*([\w.]+)\s+on\s+([A-Z][a-z]+\s+\d{1,2},\s+\d{4}):\s*["“]([\s\S]*?)["”]\.?\s*$/);
    if (!m) return null;
    return { handle: m[1], date: parseDateParts(m[2]), text: m[3] };
}

function parseRedditJson(json) {
    const post = json && json[0] && json[0].data && json[0].data.children && json[0].data.children[0] && json[0].data.children[0].data;
    if (!post) return null;
    const d = post.created_utc ? new Date(post.created_utc * 1000) : null;
    return {
        author: post.author && post.author !== '[deleted]' ? post.author : '',
        title: post.title || '',
        subreddit: post.subreddit || '',
        date: d ? { year: String(d.getUTCFullYear()), monthDay: `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}` } : { year: '', monthDay: '' }
    };
}

function parseBlueskyThread(json) {
    const post = json && json.thread && json.thread.post;
    if (!post || !post.record) return null;
    return {
        name: (post.author && post.author.displayName) || '',
        handle: (post.author && post.author.handle) || '',
        text: post.record.text || '',
        date: parseDateParts(post.record.createdAt || '')
    };
}

// ── YouTube ─────────────────────────────────────────────────────────────────
// Video id from watch, short, shorts, embed, live and youtu.be links; null for channels and playlists.
function parseYouTubeUrl(urlStr) {
    let url;
    try { url = new URL(/^https?:\/\//i.test(urlStr) ? urlStr : `https://${urlStr}`); } catch (e) { return null; }
    const host = url.hostname.replace(/^www\.|^m\./i, '').toLowerCase();
    if (host !== 'youtube.com' && host !== 'youtu.be' && host !== 'youtube-nocookie.com') return null;
    const parts = url.pathname.split('/').filter(Boolean);
    let id = '';
    if (host === 'youtu.be') id = parts[0] || '';
    else if (parts[0] === 'watch') id = url.searchParams.get('v') || '';
    else if (['shorts', 'embed', 'live', 'v'].includes(parts[0])) id = parts[1] || '';
    if (!/^[\w-]{11}$/.test(id)) return null;
    return { id, short: parts[0] === 'shorts', url: `https://www.youtube.com/watch?v=${id}` };
}

// The watch page carries the upload date in several places; take the first that parses.
function parseYouTubeUploadDate(html) {
    const text = String(html || '');
    const patterns = [
        /<meta[^>]+itemprop=["']datePublished["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+itemprop=["']uploadDate["'][^>]+content=["']([^"']+)["']/i,
        /"uploadDate"\s*:\s*"([^"]+)"/,
        /"datePublished"\s*:\s*"([^"]+)"/,
        /"publishDate"\s*:\s*"([^"]+)"/
    ];
    for (const re of patterns) {
        const m = text.match(re);
        if (m) {
            const parts = parseDateParts(m[1]);
            if (parts.year) return parts;
        }
    }
    return { year: '', monthDay: '' };
}

// APA lists the uploader: a person's name inverted (Rober, M.), a channel or organization as written (TED).
// A two or three word capitalized name is treated as a person, which can misjudge brand channels; the status note says so.
function youtubeAuthor(channelName) {
    const name = String(channelName || '').replace(/\s+/g, ' ').trim();
    if (!name) return { text: '', field: '', person: false };
    const formatted = socialAuthor(name, '');
    const person = formatted !== name;
    // A multi-word group name is wrapped in braces in the form so it is never split into "Noah, T. D. S."
    const field = !person && /\s/.test(name) && !isCorporateAuthor(name) ? `{${name}}` : formatted;
    return { text: formatted, field, person };
}
