// Tiny static server for manual testing: node tests/serve.js [port]
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.docx': 'application/octet-stream', '.json': 'application/json' };
http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/__save/')) { // test helper: save a posted file into tests/out/
    const name = path.basename(decodeURIComponent(req.url.slice(8)));
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => { fs.mkdirSync(path.join(root, 'tests', 'out'), { recursive: true }); fs.writeFileSync(path.join(root, 'tests', 'out', name), Buffer.concat(chunks)); res.writeHead(200); res.end('saved'); });
    return;
  }
  const file = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => { if (err) { res.writeHead(404); return res.end('not found'); } res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); res.end(data); });
}).listen(+process.argv[2] || 8765, () => console.log('serving', root));
