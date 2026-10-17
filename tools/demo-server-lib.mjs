// The demo server, safe to put on a public link (a tunnel, a host):
//  - serves only the demo, the panel, the PDF viewer and the sample forms (never logs, source control, notes);
//  - forwards AI requests only to known AI providers; the owner's local LM Studio is reachable from this machine only;
//  - can use a shared OpenRouter key kept in an environment variable, pinned to one model with a reply-length cap,
//    behind a per-visitor and a daily rate limit, so visitors need no key and the key never reaches a browser;
//  - writes the development log only for requests from this machine, never for visitors.
import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { spawn } from 'node:child_process';
import { AI_HOSTS, cleanKey, createLimiter, buildUpstream } from './proxy-core.mjs';

export { AI_HOSTS };

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.pdf': 'application/pdf', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

export const SAMPLE_NAMES = {
  'i-485.pdf': 'Form I-485 (green card)', 'i-9.pdf': 'Form I-9', 'i-765.pdf': 'Form I-765', 'i-130.pdf': 'Form I-130',
  'fw2.pdf': 'W-2 (English)', 'fw2_es.pdf': 'W-2 (Spanish)', 'fw4sp.pdf': 'W-4 (Spanish)', 'clinica-familiar-es.pdf': 'Clinic intake (Spanish PDF)',
};

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const MAX_BODY = 1_000_000;

export function createDemoServer({ root, env = process.env, fetchImpl = (...a) => fetch(...a), now = () => Date.now(), ttsImpl } = {}) {
  // The shared key lives on the server only: in the environment, or saved once in the private file .openrouter-key
  // next to the project (never served, never committed). Printable ASCII only, so pasted invisible characters cannot break it.
  const keyFromFile = (() => { try { return readFileSync(join(root, '.openrouter-key'), 'utf8'); } catch { return ''; } })();
  const sharedKey = cleanKey(env.OPENROUTER_API_KEY || keyFromFile);
  const sharedModel = env.DEMO_MODEL || 'openai/gpt-4o-mini';
  const maxTokens = Number(env.DEMO_MAX_TOKENS) || 3000;
  const logDir = join(root, 'logs');
  const limited = createLimiter(env, now);
  const speechCache = new Map();

  async function synthesizeSpeech(text, voice = 'es-US-PalomaNeural') {
    const key = `${voice}:${text}`;
    if (speechCache.has(key)) return speechCache.get(key);
    if (ttsImpl) {
      const res = await ttsImpl(text, voice);
      speechCache.set(key, res);
      return res;
    }
    return new Promise((resolve, reject) => {
      const p = spawn('uvx', ['edge-tts', '--voice', voice, '--text', text, '--write-media', '-']);
      const chunks = [];
      let errBuf = '';
      p.stdout.on('data', (c) => chunks.push(c));
      p.stderr.on('data', (c) => { errBuf += c.toString(); });
      p.on('error', reject);
      p.on('close', (code) => {
        if (code !== 0) return reject(new Error(`edge-tts exited with code ${code}: ${errBuf.slice(0, 200)}`));
        const buf = Buffer.concat(chunks);
        if (speechCache.size > 300) speechCache.clear();
        speechCache.set(key, buf);
        resolve(buf);
      });
    });
  }

  // Requests that reach us through a tunnel arrive from 127.0.0.1 too, but carry forwarding headers.
  const forwarded = (req) => req.headers['x-forwarded-for'] || req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || req.headers.forwarded || req.headers['x-forwarded-host'];
  const isLocal = (req) => LOOPBACK.has(req.socket.remoteAddress) && !forwarded(req) && /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.headers.host || '');
  const visitor = (req) => String(forwarded(req) || req.socket.remoteAddress).split(',')[0].trim();

  async function readBody(req) {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > MAX_BODY) throw Object.assign(new Error('too large'), { status: 413 });
      chunks.push(c);
    }
    return Buffer.concat(chunks);
  }

  async function proxy(req, res) {
    const local = isLocal(req);
    let body;
    try { body = await readBody(req); } catch (e) { return res.writeHead(e.status || 400).end(e.message); }
    const plan = buildUpstream(
      { target: req.headers['x-target-url'], method: req.headers['x-target-method'] || 'POST', headers: req.headers, body, local, visitor: visitor(req) },
      { sharedKey, sharedModel, maxTokens, limited },
    );
    if (plan.refuse) return res.writeHead(plan.refuse.status, { 'content-type': 'text/plain' }).end(plan.refuse.text);
    try {
      const upstream = await fetchImpl(plan.url, plan.init);
      const out = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') || 'application/octet-stream' }).end(out);
    } catch (e) {
      res.writeHead(502, { 'content-type': 'text/plain' }).end(`proxy: ${e.message}`);
    }
  }

  async function samples() {
    const out = [];
    for (const f of await readdir(root)) if (SAMPLE_NAMES[f]) out.push({ name: SAMPLE_NAMES[f], url: `/${f}` });
    out.push({ name: 'Clinic intake (web form)', url: '/demo/intake.html' });
    out.push({ name: 'Clinic intake (Spanish)', url: '/demo/intake-es.html' });
    out.push({ name: 'I-485 part 1 (Spanish)', url: '/demo/i485-es.html' });
    out.push({ name: 'Phone call intake (Simulator)', url: '/demo/phone-intake.html' });
    return out;
  }

  // Only these paths are ever served.
  const servable = (path, local) =>
    !path.split('/').some((seg) => seg.startsWith('.')) &&
    (path.startsWith('/demo/') || path.startsWith('/extension/') || (path.startsWith('/') && SAMPLE_NAMES[path.slice(1)] !== undefined) || (local && path.startsWith('/tests/')));

  return createServer(async (req, res) => {
    try {
      res.setHeader('x-content-type-options', 'nosniff');
      const url = new URL(req.url, 'http://x');
      if (url.pathname === '/proxy') return await proxy(req, res);
      if (url.pathname === '/audio/speech' && req.method === 'POST') {
        const raw = await readBody(req);
        let parsed = {};
        try { parsed = JSON.parse(raw.toString('utf8')); } catch {}
        const text = String(parsed.input || '').trim();
        if (!text) return res.writeHead(400, { 'content-type': 'text/plain' }).end('input required');
        const voice = String(parsed.voice || 'es-US-PalomaNeural').trim();
        try {
          const audio = await synthesizeSpeech(text, voice);
          return res.writeHead(200, {
            'content-type': 'audio/mpeg',
            'cache-control': 'public, max-age=86400',
            'content-length': audio.length,
          }).end(audio);
        } catch (e) {
          return res.writeHead(500, { 'content-type': 'text/plain' }).end(`tts error: ${e.message}`);
        }
      }
      if (url.pathname === '/log' && req.method === 'POST') {
        const body = (await readBody(req).catch(() => Buffer.alloc(0))).toString('utf8').slice(0, 50_000);
        if (isLocal(req) && body) {
          mkdirSync(logDir, { recursive: true });
          appendFileSync(join(logDir, 'fluent.log'), `${body.replace(/\n/g, ' ')}\n`); // visitors' conversations are never stored
        }
        return res.writeHead(204).end();
      }
      if (url.pathname === '/config.json') {
        return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ sharedKey: !!sharedKey, local: isLocal(req), model: sharedModel, neuralSpeech: true }));
      }
      if (url.pathname === '/samples.json') return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(await samples()));
      if (url.pathname === '/') return res.writeHead(302, { location: '/demo/app/' }).end();
      const path = normalize(decodeURIComponent(url.pathname));
      if (path.includes('..') || !servable(path, isLocal(req))) return res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      let file = join(root, path);
      if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
      const data = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(data);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    }
  });
}
