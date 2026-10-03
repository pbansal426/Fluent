// The demo server: serves the repo (the demo page, the panel, the PDF viewer, sample forms), forwards AI requests so
// a normal web page can reach LM Studio or a cloud API without CORS trouble, and collects the development log.
//   node tools/demo-server.mjs          then open  http://localhost:8765/demo/app/
//   PORT=8780 node tools/demo-server.mjs
import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { appendFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extname, join, normalize } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT) || 8765;
const logDir = join(root, 'logs');
mkdirSync(logDir, { recursive: true });

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.pdf': 'application/pdf', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

const SAMPLE_NAMES = {
  'i-485.pdf': 'Form I-485 (green card)', 'i-9.pdf': 'Form I-9', 'i-765.pdf': 'Form I-765', 'i-130.pdf': 'Form I-130',
  'fw2.pdf': 'W-2 (English)', 'fw2_es.pdf': 'W-2 (Spanish)',
};

async function samples() {
  const out = [];
  for (const f of await readdir(root)) if (SAMPLE_NAMES[f]) out.push({ name: SAMPLE_NAMES[f], url: `/${f}` });
  out.push({ name: 'Clinic intake (web form)', url: '/demo/intake.html' });
  return out;
}

// POST /proxy with header x-target-url: forwards the request and returns the answer.
async function proxy(req, res) {
  const target = req.headers['x-target-url'];
  if (!/^https?:\/\//i.test(target || '')) return res.writeHead(400).end('x-target-url missing');
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!['host', 'origin', 'referer', 'x-target-url', 'content-length', 'connection', 'accept-encoding', 'sec-fetch-mode', 'sec-fetch-site', 'sec-fetch-dest'].includes(k)) headers[k] = v;
  }
  try {
    const upstream = await fetch(target, { method: req.headers['x-target-method'] || 'POST', headers, body: ['GET', 'HEAD'].includes(req.headers['x-target-method']) ? undefined : Buffer.concat(chunks) });
    const body = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') || 'application/octet-stream' }).end(body);
  } catch (e) {
    res.writeHead(502, { 'content-type': 'text/plain' }).end(`proxy: ${e.message}`);
  }
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/proxy') return proxy(req, res);
    if (url.pathname === '/log' && req.method === 'POST') {
      let body = '';
      for await (const c of req) body += c;
      appendFileSync(join(logDir, 'fluent.log'), `${body.replace(/\n/g, ' ')}\n`);
      return res.writeHead(204).end();
    }
    if (url.pathname === '/samples.json') return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(await samples()));
    let path = normalize(decodeURIComponent(url.pathname));
    if (path.includes('..')) return res.writeHead(403).end();
    let file = join(root, path);
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  }
}).listen(port, () => console.log(`Fluent demo: http://localhost:${port}/demo/app/`));
