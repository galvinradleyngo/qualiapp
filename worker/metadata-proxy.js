// Cloudflare Worker: fetches a web page server-side so the APA Studio app can read
// its metadata. Only the websites listed in ALLOWED_ORIGINS may use it from a browser.
// Usage from the app: https://<your-worker>.workers.dev/?url=https%3A%2F%2Fexample.com%2Farticle

// Address of the app (scheme + domain only, no path, no trailing slash). Add more with commas.
const ALLOWED_ORIGINS = ['https://galvinradleyngo.github.io'];

const MAX_BYTES = 1_500_000;      // HTML pages
const MAX_PDF_BYTES = 25_000_000; // PDF documents

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      'Vary': 'Origin',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    };

    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return new Response('Origin not allowed', { status: 403, headers: cors });
    }
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const target = new URL(request.url).searchParams.get('url');
    let url;
    try {
      url = new URL(target);
    } catch (e) {
      return new Response('Missing or invalid url parameter', { status: 400, headers: cors });
    }
    if (!/^https?:$/.test(url.protocol) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/i.test(url.hostname)) {
      return new Response('Blocked address', { status: 400, headers: cors });
    }

    try {
      const upstream = await fetch(url.href, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; APAStudioBot/1.0)',
          'Accept': 'text/html,application/xhtml+xml,application/pdf',
        },
        cf: { cacheTtl: 3600, cacheEverything: true },
      });
      const type = upstream.headers.get('content-type') || '';
      const isPdf = /pdf/i.test(type);
      if (!isPdf && !/html|xml/i.test(type)) {
        return new Response(`Unsupported content type: ${type}`, { status: 415, headers: cors });
      }
      const limit = isPdf ? MAX_PDF_BYTES : MAX_BYTES;
      const reader = upstream.body.getReader();
      const chunks = [];
      let size = 0;
      while (size < limit) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        size += value.length;
      }
      reader.cancel().catch(() => {});
      const body = new Blob(chunks);
      return new Response(body, {
        status: 200,
        headers: { ...cors, 'Content-Type': isPdf ? 'application/pdf' : 'text/html; charset=utf-8', 'X-Final-Url': upstream.url },
      });
    } catch (e) {
      return new Response('Fetch failed', { status: 502, headers: cors });
    }
  },
};
