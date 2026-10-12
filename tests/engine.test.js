// Run: node tests/engine.test.js   (pure Node, no browser)
// Loads the DOM-free reference engine and parser and checks parse-and-rebuild behaviour.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({ console, URL });
for (const f of ['reference-engine.js', 'reference-parser.js', 'web-metadata.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
}
const run = (expr, vars = {}) => { Object.assign(ctx, { __v: vars }); return vm.runInContext(expr, ctx); };
const gen = item => run('generateApaReference(__v.item).marked', { item });
const rebuild = text => run('rebuildReference(__v.text)', { text });

let failures = 0;
const check = (name, fn) => { try { fn(); console.log('ok  -', name); } catch (e) { failures++; console.log('FAIL-', name, '\n     ', e.message); } };
const strip = t => t.replace(/\*/g, '');


// Countries, nationalities and multi-word place names keep their capitals when a title is converted to sentence case.
const sentence = s => run('toSentenceCase(__v.s)', { s });
check('sentence case keeps countries, nationalities and multi-word places capitalized', () => {
  assert.strictEqual(sentence('Education In The Philippines: A Study Of Filipino Learners'), 'Education in the Philippines: A study of Filipino learners');
  assert.strictEqual(sentence('Sleep Patterns Among Students In The United States And New Zealand'), 'Sleep patterns among students in the United States and New Zealand');
  assert.strictEqual(sentence('Mental Health In Southeast Asia And Latin America'), 'Mental health in Southeast Asia and Latin America');
  assert.strictEqual(sentence('Teaching In Indonesia, Vietnam And South Korea'), 'Teaching in Indonesia, Vietnam and South Korea');
  assert.strictEqual(sentence('The Philippine Education System In Metro Manila'), 'The Philippine education system in Metro Manila');
});
check('ordinary words that sit inside place names are still lowercased elsewhere', () => {
  assert.strictEqual(sentence('New Methods For South Region Analysis'), 'New methods for south region analysis');
});
check('a four-digit issue number is not treated as a year when formatting', () => {
  const entry = 'Harris, C. R., Millman, K. J., & van der Walt, S. J. (2020). Array programming with NumPy. *Nature*, *585*(7825), 357\u2013362. https://doi.org/10.1038/s41586-020-2649-2';
  const fixed = run('applyBibliographyAutoFix(__v.e, { rebuild: true }).fixed', { e: entry });
  assert.strictEqual(fixed, entry);
});

// One item per source type. Each must survive generate -> (plain text) -> parse -> generate unchanged.
const base = { year: '2024', monthDay: '', url: '', doi: '', retrieved: '' };
const corpus = {
  journal: { ...base, type: 'journal', title: 'Sleep and memory', authors: [{ family: 'Doe', given: 'J. A.' }, { family: 'Roe', given: 'R.' }], source: 'Journal of Sleep Research', volume: '12', issue: '3', pages: '45-67', doi: '10.1/x' },
  'journal brand case': { ...base, type: 'journal', title: 'Gene editing today', authors: [{ family: 'Doe', given: 'J.' }], source: 'eLife', volume: '9', pages: 'e123', doi: '10.1/y' },
  book: { ...base, type: 'book', title: 'The republic', authors: [{ name: 'Plato' }], edition: '2', translator: 'B. Jowett', source: 'Dover' },
  'book with question title': { ...base, type: 'book', title: 'Is it working?', authors: [{ family: 'Lee', given: 'S.' }], source: 'Penguin' },
  chapter: { ...base, type: 'chapter', title: 'Memory and aging', authors: [{ family: 'Jones', given: 'K.' }], container: 'Handbook of cognitive aging', editors: 'Lee, R., & Kim, P.', pages: '10-30', edition: '2nd', source: 'Academic Press' },
  report: { ...base, type: 'report', title: 'Mental health: Strengthening our response', authors: [{ name: 'World Health Organization' }], url: 'https://www.who.int/x', source: '' },
  webpage: { ...base, monthDay: 'March 5', type: 'webpage', title: 'Our story', authors: [{ name: 'Apple Inc.' }], source: 'Apple Newsroom', url: 'https://apple.com/a' },
  'webpage with retrieval date': { ...base, type: 'webpage', title: 'Live dashboard', authors: [{ name: 'Agency Office' }], source: 'Agency Site', url: 'https://a.gov/d', retrieved: 'October 3, 2026' },
  thesis: { ...base, type: 'thesis', title: 'Learning in crisis', authors: [{ family: 'Cruz', given: 'M.' }], source: 'Ateneo de Manila University', url: 'https://x.org/1' },
  dataset: { ...base, type: 'dataset', title: 'Survey responses', authors: [{ family: 'Cruz', given: 'M.' }], edition: 'Version 2.1', source: 'Zenodo', doi: '10.5281/zenodo.1' },
  software: { ...base, type: 'software', title: 'Analysis toolkit', authors: [{ name: 'Acme Labs Inc.' }], edition: 'Version 3', source: 'GitHub', url: 'https://github.com/a/b' },
  video: { ...base, monthDay: 'May 3', type: 'video', title: 'Sleep tips', authors: [{ name: 'Sleep Channel Group' }], source: 'YouTube', url: 'https://youtube.com/watch?v=1' },
  podcast: { ...base, monthDay: 'May 3', type: 'podcast', title: 'Sleep science', authors: [{ family: 'Lee', given: 'S.' }], edition: 'No. 12', container: 'Mind Matters', source: 'Radio One', url: 'https://r.org/12' },
  social: { ...base, monthDay: 'June 1', type: 'social', title: 'Big news today', authors: [{ name: 'Jane Doe [@janedoe]' }], source: 'X', url: 'https://x.com/p/1' },
  religious: { ...base, year: '2015', type: 'religious', title: "Laudato si': On care for our common home", authors: [{ family: 'Francis', given: 'P.' }], source: 'Vatican Press', url: 'https://vatican.va/x' },
  'year suffix': { ...base, year: '2020a', type: 'book', title: 'Apples in spring', authors: [{ family: 'Doe', given: 'J.' }], source: 'Press' },
  'no date': { ...base, year: '', type: 'book', title: 'Old manuscript', authors: [{ family: 'Doe', given: 'J.' }], source: 'Press' }
};
for (const [name, item] of Object.entries(corpus)) {
  const marked = gen(item);
  check(`round trip (italic markers kept): ${name}`, () => {
    const r = rebuild(marked);
    assert.ok(r.rebuilt, `${r.reason}: ${marked}`);
    assert.strictEqual(r.text, marked);
  });
  check(`round trip (pasted as plain text): ${name}`, () => {
    const r = rebuild(strip(marked));
    assert.ok(r.rebuilt, `${r.reason}: ${strip(marked)}`);
    assert.strictEqual(r.text, marked);
  });
}
// News/blog articles need the user's italic markers: plain text cannot reveal which part is the publication.
check('round trip with markers: news article and no-author work', () => {
  const article = gen({ ...base, monthDay: 'March 5', type: 'article', title: 'Why sleep matters', authors: [{ family: 'Doe', given: 'J.' }], source: 'The Guardian', url: 'https://g.com/a' });
  assert.strictEqual(rebuild(article).text, article);
  const noAuthor = gen({ ...base, type: 'report', title: 'Untitled guidance', authors: [], source: 'Some Agency', url: 'https://a.gov/g' });
  assert.strictEqual(rebuild(noAuthor).text, noAuthor);
});
check('rebuilding is idempotent', () => {
  for (const item of Object.values(corpus)) {
    const once = rebuild(gen(item)).text;
    assert.strictEqual(rebuild(once).text, once);
  }
});

// Messy pasted references are standardized...
const messy = [
  ['title-case article title, missing italics', 'Smith, J.A. & Lee, R.T. (2021). Learning Analytics In Blended Classrooms. journal of educational computing, 35(2), 145-162. https://doi.org/10.1000/xyz123',
    'Smith, J. A., & Lee, R. T. (2021). Learning Analytics In Blended Classrooms. *Journal of Educational Computing*, *35*(2), 145–162. https://doi.org/10.1000/xyz123'],
  ['capitalization of the title is kept as typed', 'Brown, B. (2012). Daring Greatly: How The Courage To Be Vulnerable. Gotham Books.',
    'Brown, B. (2012). *Daring Greatly: How The Courage To Be Vulnerable*. Gotham Books.'],
  ['sentence-case titles with proper nouns are not damaged', 'American Psychological Association. (2020). Publication manual of the American Psychological Association (7th ed.). https://doi.org/10.1037/0000165-000',
    'American Psychological Association. (2020). *Publication manual of the American Psychological Association* (7th ed.). https://doi.org/10.1037/0000165-000'],
  ['dated with month and day is recognized (no bogus n.d.)', 'Centers for Disease Control and Prevention. (2021, March 5). COVID-19 vaccine safety. https://www.cdc.gov/vaccines',
    'Centers for Disease Control and Prevention. (2021, March 5). *COVID-19 vaccine safety*. https://www.cdc.gov/vaccines']
];
for (const [name, input, expected] of messy) {
  check(`standardizes: ${name}`, () => {
    const fixed = run('applyBibliographyAutoFix(__v.t, { rebuild: true }).fixed', { t: input });
    assert.strictEqual(fixed, expected);
  });
}
// ...and uncertain ones are left alone, with a reason.
for (const [name, input] of [
  ['unknown author/title ambiguity', 'The effects of sleep. (2020). Some Press.'],
  ['no year', 'Doe, J. Untitled notes. Press.'],
  ['wording would change', 'Apple. (2024). *Apple*. Apple. https://apple.com']
]) {
  check(`left as typed: ${name}`, () => {
    const r = rebuild(input);
    assert.strictEqual(r.rebuilt, false);
    assert.strictEqual(r.text, input);
    assert.ok(r.reason);
  });
}
check('rebuild never drops or adds words (fuzz over the corpus with mangled spacing and case)', () => {
  for (const item of Object.values(corpus)) {
    const mangled = strip(gen(item)).replace(/\. /g, '.  ').replace(/^(\w)/, c => c.toLowerCase());
    const r = rebuild(mangled);
    if (r.rebuilt) assert.strictEqual(run('referenceWordSignature(__v.a)', { a: r.text }), run('referenceWordSignature(__v.a)', { a: mangled }));
  }
});

// Author edge cases that used to be left as typed.
check('suffix (Jr.) and hyphenated initials round-trip', () => {
  const input = 'Smith, J. A., Jr., & Martin, J.-P. (2020). Names. Press.';
  const r = rebuild(input);
  assert.ok(r.rebuilt, r.reason);
  assert.strictEqual(r.text, 'Smith, J. A., Jr., & Martin, J.-P. (2020). *Names*. Press.');
  assert.strictEqual(rebuild(r.text).text, r.text);
});
check('long author list with an ellipsis round-trips (19 authors, ellipsis, last author)', () => {
  const names = Array.from({ length: 19 }, (_, i) => `Author${String.fromCharCode(65 + i)}, A.`);
  const input = `${names.join(', ')}, ... Final, Z. (2020). Big team science. Press.`;
  const r = rebuild(input);
  assert.ok(r.rebuilt, r.reason);
  assert.strictEqual(r.text, `${names.join(', ')}, ... Final, Z. (2020). *Big team science*. Press.`);
  assert.strictEqual(rebuild(r.text).text, r.text);
});
check('plain-text news article is recognized from the URL', () => {
  const r = rebuild('Doe, J. (2024, March 5). Why sleep matters. The New York Times. https://www.nytimes.com/x');
  assert.ok(r.rebuilt, r.reason);
  assert.strictEqual(r.text, 'Doe, J. (2024, March 5). Why sleep matters. *The New York Times*. https://www.nytimes.com/x');
  const blog = rebuild('Doe, J. (2024). A normal report. Some Agency. https://agency.gov/r');
  assert.strictEqual(blog.text, 'Doe, J. (2024). *A normal report*. Some Agency. https://agency.gov/r');
});
check('citation-form author input accepts hyphenated initials', () => {
  assert.strictEqual(run("formatAuthorsApa(parseAuthorsInput('Martin, J.-P., & Lee, R.'))"), 'Martin, J.-P., & Lee, R.');
});

// ── Social media links ──────────────────────────────────────────────────────
check('social links: platform, handle and post id come from the URL', () => {
  const j = expr => JSON.parse(run(`JSON.stringify(${expr})`));
  const x = j("parseSocialUrl('https://twitter.com/NASA/status/1766000000000000000?s=20&t=abc')");
  assert.strictEqual(x.key, 'x'); assert.strictEqual(x.handle, 'NASA'); assert.strictEqual(x.postId, '1766000000000000000');
  assert.strictEqual(x.url, 'https://twitter.com/NASA/status/1766000000000000000');
  const ig = j("parseSocialUrl('https://www.instagram.com/janedoe/p/C3xAbCdEfGh/?igsh=1')");
  assert.strictEqual(ig.key, 'instagram'); assert.strictEqual(ig.handle, 'janedoe'); assert.strictEqual(ig.postId, 'C3xAbCdEfGh');
  const tt = j("parseSocialUrl('https://www.tiktok.com/@some.user/video/7340000000000000000')");
  assert.strictEqual(tt.handle, 'some.user'); assert.strictEqual(tt.descriptor, 'Video');
  const rd = j("parseSocialUrl('https://www.reddit.com/r/psychology/comments/abc123/why_we_sleep_matters/')");
  assert.strictEqual(rd.postId, 'abc123'); assert.strictEqual(rd.title, 'why we sleep matters'); assert.strictEqual(rd.descriptor, 'Online forum post');
  const bs = j("parseSocialUrl('https://bsky.app/profile/jane.bsky.social/post/3kabc')");
  assert.strictEqual(bs.handle, 'jane.bsky.social'); assert.strictEqual(bs.postId, '3kabc');
  const li = j("parseSocialUrl('https://www.linkedin.com/posts/jane-doe_hello-world-activity-7123456789012345678-AbCd')");
  assert.strictEqual(li.handle, 'jane-doe');
  assert.strictEqual(run("parseSocialUrl('https://example.com/status/1')"), null);
  assert.strictEqual(run("parseSocialUrl('https://x.com/home')"), null);
});
check('social links: dates recovered from post ids (UTC) and rejected when implausible', () => {
  // Build ids the way the platforms do, then decode them.
  const xId = run("String((BigInt(Date.UTC(2024, 2, 5, 12, 0, 0) - 1288834974657)) << 22n)");
  assert.strictEqual(run('JSON.stringify(dateFromSocialId("x", __v.id))', { id: xId }), JSON.stringify({ year: '2024', monthDay: 'March 5' }));
  const tId = run("String(BigInt(Math.floor(Date.UTC(2023, 10, 20, 8, 0, 0) / 1000)) << 32n)");
  assert.strictEqual(run('JSON.stringify(dateFromSocialId("tiktok", __v.id))', { id: tId }), JSON.stringify({ year: '2023', monthDay: 'November 20' }));
  const igCode = run(`(() => { const a='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'; let id=(BigInt(Date.UTC(2022,5,9,10,0,0)-1314220021721)<<23n); let s=''; while(id>0n){s=a[Number(id%64n)]+s; id/=64n;} return s; })()`);
  assert.strictEqual(run('JSON.stringify(dateFromSocialId("instagram", __v.id))', { id: igCode }), JSON.stringify({ year: '2022', monthDay: 'June 9' }));
  assert.strictEqual(run('JSON.stringify(dateFromSocialId("x", "123"))'), JSON.stringify({ year: '', monthDay: '' }));
});
check('social author formatting: people, organizations, handle only', () => {
  assert.strictEqual(run("socialAuthor('Jane Doe', '@janedoe')"), 'Doe, J. [@janedoe]');
  assert.strictEqual(run("socialAuthor('Mary Ann Smith', 'mas')"), 'Smith, M. A. [@mas]');
  assert.strictEqual(run("socialAuthor('NASA', 'NASA')"), 'NASA [@NASA]');
  assert.strictEqual(run("socialAuthor('World Health Organization', 'WHO')"), 'World Health Organization [@WHO]');
  assert.strictEqual(run("socialAuthor('', 'janedoe')"), '@janedoe');
});
check('social post text: first 20 words, tracking links removed', () => {
  const text = Array.from({ length: 30 }, (_, i) => `w${i + 1}`).join(' ');
  assert.strictEqual(run('truncateWords(__v.t, 20)', { t: text }).split(' ').length, 20);
  assert.strictEqual(run("cleanSocialText('Big news https://t.co/AbC123 today pic.twitter.com/xyz')"), 'Big news today');
});
check('social metadata parsers (Instagram description, Reddit JSON, Bluesky thread)', () => {
  const insta = JSON.parse(run('JSON.stringify(parseInstagramDescription(__v.d))', { d: '1,234 likes, 56 comments - janedoe on March 5, 2024: "Lovely day at the beach #sun".' }));
  assert.strictEqual(insta.handle, 'janedoe'); assert.strictEqual(insta.text, 'Lovely day at the beach #sun'); assert.strictEqual(insta.date.year, '2024');
  const reddit = JSON.parse(run('JSON.stringify(parseRedditJson(__v.j))', { j: [{ data: { children: [{ data: { author: 'sleepy_user', title: 'Why we sleep', subreddit: 'psychology', created_utc: Date.UTC(2024, 2, 5, 12) / 1000 } }] } }] }));
  assert.deepStrictEqual([reddit.author, reddit.title, reddit.date.monthDay], ['sleepy_user', 'Why we sleep', 'March 5']);
  const bsky = JSON.parse(run('JSON.stringify(parseBlueskyThread(__v.j))', { j: { thread: { post: { author: { displayName: 'Jane Doe', handle: 'jane.bsky.social' }, record: { text: 'Hello sky', createdAt: '2024-03-05T10:00:00.000Z' } } } } }));
  assert.deepStrictEqual([bsky.name, bsky.handle, bsky.text, bsky.date.monthDay], ['Jane Doe', 'jane.bsky.social', 'Hello sky', 'March 5']);
});
check('social reference: generated, parsed back and cited by surname', () => {
  const marked = gen({ type: 'social', keepCase: true, title: 'Lovely day at the beach #sun', authors: [{ name: 'Doe, J. [@janedoe]' }], year: '2024', monthDay: 'March 5', source: 'Instagram', descriptor: 'Photograph', url: 'https://www.instagram.com/p/C3xAbCdEfGh' });
  assert.strictEqual(marked, 'Doe, J. [@janedoe]. (2024, March 5). *Lovely day at the beach #sun* [Photograph]. Instagram. https://www.instagram.com/p/C3xAbCdEfGh');
  const r = rebuild(strip(marked));
  assert.ok(r.rebuilt, r.reason);
  assert.strictEqual(r.text, marked);
  assert.strictEqual(run("formatInTextCitation([{ name: 'Doe, J. [@janedoe]' }], '2024').parenthetical"), '(Doe, 2024)');
  const handleOnly = gen({ type: 'social', keepCase: true, title: 'Hello', authors: [{ name: '@janedoe' }], year: '2024', monthDay: 'March 5', source: 'X', descriptor: 'Post', url: 'https://x.com/janedoe/status/1' });
  assert.ok(rebuild(strip(handleOnly)).rebuilt);
  assert.strictEqual(run("generateApaReference({ type: 'social', keepCase: true, title: 'WOW #Win ALL CAPS', authors: [], year: '2024', source: 'X' }).marked").includes('WOW #Win ALL CAPS'), true);
});

check('organization names with words like Library or Museum stay as one author', () => {
  for (const name of ['Acme Library', 'City Museum', 'Open Science Network']) {
    assert.strictEqual(run('JSON.stringify(parseAuthorsInput(__v.n))', { n: name }), JSON.stringify([{ name }]));
  }
  assert.strictEqual(run("JSON.stringify(parseAuthorsInput('Jane Doe'))"), JSON.stringify([{ family: 'Doe', given: 'Jane' }]));
});

// ── APA 7: podcast hosts ────────────────────────────────────────────────────
check('APA 7: podcast authors are labelled (Host) / (Hosts) and round-trip', () => {
  const one = gen({ type: 'podcast', year: '2024', monthDay: 'May 3', title: 'Sleep science', authors: [{ family: 'Lee', given: 'S.' }], edition: 'No. 12', container: 'Mind Matters', source: 'Radio One', url: 'https://r.org/12' });
  assert.strictEqual(one, 'Lee, S. (Host). (2024, May 3). *Sleep science* (No. 12) [Audio podcast episode]. In *Mind Matters*. Radio One. https://r.org/12');
  assert.strictEqual(rebuild(one).text, one);
  const two = gen({ type: 'podcast', year: '2024', monthDay: 'May 3', title: 'Sleep science', authors: [{ family: 'Lee', given: 'S.' }, { family: 'Roe', given: 'R.' }], container: 'Mind Matters', source: 'Radio One' });
  assert.ok(two.startsWith('Lee, S., & Roe, R. (Hosts). (2024, May 3).'), two);
  assert.ok(rebuild(strip(two)).rebuilt);
  assert.strictEqual(rebuild('Lee, S. (Host). (2020). A book. Press.').rebuilt, false);
});

// ── APA 7 alignment for social media posts ──────────────────────────────────
check('APA 7: media bracket comes first, then the kind of post (X, Instagram, Facebook)', () => {
  const social = (extra) => gen({ type: 'social', keepCase: true, year: '2024', monthDay: 'March 5', ...extra });
  assert.strictEqual(
    social({ title: 'Big news today for sleep research', authors: [{ name: 'Doe, J. [@janedoe]' }], media: 'Thumbnail with link attached', descriptor: 'Post', source: 'X', url: 'https://x.com/janedoe/status/1' }),
    'Doe, J. [@janedoe]. (2024, March 5). *Big news today for sleep research* [Thumbnail with link attached] [Post]. X. https://x.com/janedoe/status/1');
  assert.strictEqual(
    social({ title: 'Lovely day at the beach #sun', authors: [{ name: 'Doe, J. [@janedoe]' }], descriptor: 'Photograph', source: 'Instagram', url: 'https://www.instagram.com/p/C3x' }),
    'Doe, J. [@janedoe]. (2024, March 5). *Lovely day at the beach #sun* [Photograph]. Instagram. https://www.instagram.com/p/C3x');
  assert.strictEqual(
    social({ title: 'Open house this Saturday', authors: [{ name: 'Acme Library' }], media: 'Image attached', descriptor: 'Status update', source: 'Facebook', url: 'https://www.facebook.com/acme/posts/1' }),
    'Acme Library. (2024, March 5). *Open house this Saturday* [Image attached] [Status update]. Facebook. https://www.facebook.com/acme/posts/1');
  // default format bracket is [Post]
  assert.ok(social({ title: 'Hi', authors: [{ name: '@janedoe' }], source: 'X', url: 'https://x.com/a/status/1' }).includes('*Hi* [Post]. X.'));
});
check('APA 7: the post is reproduced as written (capitalization, hashtags, final period, emoji)', () => {
  const out = gen({ type: 'social', keepCase: true, year: '2024', monthDay: 'March 5', title: 'NEW study: sleep > coffee! #Sleep 😴 Read more.', authors: [{ name: 'Doe, J. [@janedoe]' }], descriptor: 'Post', source: 'X', url: 'https://x.com/a/status/1' });
  assert.ok(out.includes('*NEW study: sleep > coffee! #Sleep 😴 Read more.* [Post]'), out);
});
check('APA 7: two-bracket social references parse back and rebuild unchanged', () => {
  const ref = 'Acme Library. (2024, March 5). *Open house this Saturday* [Image attached] [Status update]. Facebook. https://www.facebook.com/acme/posts/1';
  const r = rebuild(ref);
  assert.ok(r.rebuilt, r.reason);
  assert.strictEqual(r.text, ref);
  const plain = rebuild(strip(ref));
  assert.ok(plain.rebuilt, plain.reason);
  assert.strictEqual(plain.text, ref);
});
check('APA 7: Instagram reels and Facebook videos are [Video], photos stay [Photograph]', () => {
  const d = u => JSON.parse(run(`JSON.stringify(parseSocialUrl(__v.u))`, { u })).descriptor;
  assert.strictEqual(d('https://www.instagram.com/p/C3xAbCdEfGh/'), 'Photograph');
  assert.strictEqual(d('https://www.instagram.com/reel/C3xAbCdEfGh/'), 'Video');
  assert.strictEqual(d('https://www.facebook.com/acme/posts/123'), 'Status update');
  assert.strictEqual(d('https://www.facebook.com/acme/videos/123'), 'Video');
  assert.strictEqual(d('https://x.com/janedoe/status/1766000000000000000'), 'Post');
  assert.strictEqual(d('https://www.tiktok.com/@a/video/7340000000000000000'), 'Video');
});

// ── YouTube ─────────────────────────────────────────────────────────────────
check('YouTube: video ids from every link style, nothing for channels and playlists', () => {
  const id = u => run('JSON.stringify(parseYouTubeUrl(__v.u))', { u });
  const ok = 'dQw4w9WgXcQ';
  for (const u of [`https://www.youtube.com/watch?v=${ok}&t=30s`, `https://youtu.be/${ok}?si=abc`, `https://m.youtube.com/watch?v=${ok}`, `https://www.youtube.com/shorts/${ok}`, `https://www.youtube.com/embed/${ok}`, `https://www.youtube.com/live/${ok}`, `youtube.com/watch?v=${ok}`]) {
    const r = JSON.parse(id(u));
    assert.strictEqual(r.id, ok, u); assert.strictEqual(r.url, `https://www.youtube.com/watch?v=${ok}`);
  }
  assert.strictEqual(id('https://www.youtube.com/@TED'), 'null');
  assert.strictEqual(id('https://www.youtube.com/playlist?list=PL123'), 'null');
  assert.strictEqual(id('https://www.youtube.com/watch?v=short'), 'null');
});
check('YouTube: upload date read from itemprop, JSON-LD or embedded JSON (no timezone shift)', () => {
  const d = html => JSON.parse(run('JSON.stringify(parseYouTubeUploadDate(__v.h))', { h: html }));
  assert.deepStrictEqual(d('<meta itemprop="datePublished" content="2024-03-05T08:00:00-08:00">'), { year: '2024', monthDay: 'March 5' });
  assert.deepStrictEqual(d('{"uploadDate":"2012-06-29T23:30:00-07:00"}'), { year: '2012', monthDay: 'June 29' });
  assert.deepStrictEqual(d('"publishDate":"2020-01-09"'), { year: '2020', monthDay: 'January 9' });
  assert.deepStrictEqual(d('<html>nothing here</html>'), { year: '', monthDay: '' });
});
check('YouTube: uploader formatted as a person or kept as a channel', () => {
  const a = n => JSON.parse(run('JSON.stringify(youtubeAuthor(__v.n))', { n }));
  assert.deepStrictEqual(a('Mark Rober'), { text: 'Rober, M.', field: 'Rober, M.', person: true });
  assert.deepStrictEqual(a('TED'), { text: 'TED', field: 'TED', person: false });
  assert.deepStrictEqual(a('Khan Academy'), { text: 'Khan Academy', field: 'Khan Academy', person: false });
  assert.deepStrictEqual(a('The Daily Show with Trevor Noah'), { text: 'The Daily Show with Trevor Noah', field: '{The Daily Show with Trevor Noah}', person: false });
  assert.strictEqual(run("JSON.stringify(parseAuthorsInput('{Crash Course}'))"), JSON.stringify([{ name: 'Crash Course' }]));
  assert.strictEqual(run("generateApaReference({ type: 'video', year: '2012', monthDay: 'June 29', title: 'Listening to shame', authors: parseAuthorsInput('{The Daily Show with Trevor Noah}'), source: 'YouTube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }).marked"),
    'The Daily Show with Trevor Noah. (2012, June 29). *Listening to shame* [Video]. YouTube. https://www.youtube.com/watch?v=dQw4w9WgXcQ');
});

// Existing pure helpers also run without a browser.
check('engine: sentence case, page ranges, suffixes, BibTeX', () => {
  assert.strictEqual(run("toSentenceCase('Climate Change In Manila And The Philippines')"), 'Climate change in Manila and the Philippines');
  assert.strictEqual(run("normalizePageRanges('Doe, J. (2020). T. J, 3(2), 45-67. https://x.org/a-1-22')"), 'Doe, J. (2020). T. J, 3(2), 45–67. https://x.org/a-1-22');
  assert.strictEqual(run("JSON.stringify(assignYearSuffixes(['Doe, J. (2020). Zebras. P.', 'Doe, J. (2020). Apples. P.']).entries)"), JSON.stringify(['Doe, J. (2020a). Apples. P.', 'Doe, J. (2020b). Zebras. P.']));
  assert.strictEqual(run("parseBibtexEntries('@article{k, author={Doe, Jane}, title={T}, journal={J}, year={2020}}').length"), 1);
});

if (failures) { console.log(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall passed');
