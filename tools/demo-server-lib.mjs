// The demo server, safe to put on a public link (a tunnel, a host):
//  - serves only the demo, the panel, the PDF viewer and the sample forms (never logs, source control, notes);
//  - forwards AI requests only to known AI providers; the owner's local LM Studio is reachable from this machine only;
//  - can use a shared OpenRouter key kept in an environment variable, pinned to one model with a reply-length cap,
//    behind a per-visitor and a daily rate limit, so visitors need no key and the key never reaches a browser;
//  - writes the development log only for requests from this machine, never for visitors.
import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { appendFileSync, mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.pdf': 'application/pdf', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

export const SAMPLE_NAMES = {
  'i-485.pdf': 'Form I-485 (green card)', 'i-9.pdf': 'Form I-9', 'i-765.pdf': 'Form I-765', 'i-130.pdf': 'Form I-130',
  'fw2.pdf': 'W-2 (English)', 'fw2_es.pdf': 'W-2 (Spanish)', 'fw4sp.pdf': 'W-4 (Spanish)', 'clinica-familiar-es.pdf': 'Clinic intake (Spanish PDF)',
};

// Where AI requests may go. Everything else is refused, so the forwarder cannot be used to reach other sites.
export const AI_HOSTS = new Set(['openrouter.ai', 'api.openai.com', 'api.anthropic.com', 'generativelanguage.googleapis.com', 'api.groq.com', 'api.x.ai']);
const LOCAL_AI = /^http:\/\/(localhost|127\.0\.0\.1):1234\//;
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const MAX_BODY = 1_000_000;

export function createDemoServer({ root, env = process.env, fetchImpl = (...a) => fetch(...a), now = () => Date.now() } = {}) {
  const sharedKey = String(env.OPENROUTER_API_KEY || '').replace(/[^\x21-\x7e]/g, ''); // printable ASCII only
  const sharedModel = env.DEMO_MODEL || 'openai/gpt-4o-mini';
  const maxTokens = Number(env.DEMO_MAX_TOKENS) || 3000;
  const perWindow = Number(env.DEMO_RATE_PER_5MIN) || 80; // requests per visitor per 5 minutes
  const perDay = Number(env.DEMO_RATE_PER_DAY) || 600; // requests per visitor per day
  const globalDay = Number(env.DEMO_RATE_GLOBAL_DAY) || 5000; // all visitors together
  const logDir = join(root, 'logs');
  const hits = new Map(); // visitor -> request times
  let globalHits = [];

  // Requests that reach us through a tunnel arrive from 127.0.0.1 too, but carry forwarding headers.
  const forwarded = (req) => req.headers['x-forwarded-for'] || req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || req.headers.forwarded || req.headers['x-forwarded-host'];
  const isLocal = (req) => LOOPBACK.has(req.socket.remoteAddress) && !forwarded(req) && /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.headers.host || '');
  const visitor = (req) => String(forwarded(req) || req.socket.remoteAddress).split(',')[0].trim();

  function rateLimited(id) {
    const t = now();
    const mine = (hits.get(id) || []).filter((x) => t - x < 86_400_000);
    globalHits = globalHits.filter((x) => t - x < 86_400_000);
    if (mine.length >= perDay || globalHits.length >= globalDay || mine.filter((x) => t - x < 300_000).length >= perWindow) return true;
    mine.push(t);
    globalHits.push(t);
    hits.set(id, mine);
    return false;
  }

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
    let target;
    try { target = new URL(String(req.headers['x-target-url'] || '')); } catch { return res.writeHead(400).end('bad target'); }
    const ok = (target.protocol === 'https:' && AI_HOSTS.has(target.hostname)) || (local && LOCAL_AI.test(target.href));
    if (!ok) return res.writeHead(403).end('That address is not allowed.');

    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (!['host', 'origin', 'referer', 'x-target-url', 'x-target-method', 'content-length', 'connection', 'accept-encoding', 'cookie', 'x-forwarded-for', 'x-real-ip', 'cf-connecting-ip', 'forwarded', 'x-forwarded-host', 'x-forwarded-proto'].includes(k) && !k.startsWith('sec-')) headers[k] = v;
    }
    const method = req.headers['x-target-method'] || 'POST';
    let payload = ['GET', 'HEAD'].includes(method) ? undefined : body;

    // A visitor without a key of their own uses the shared one: limited, pinned to one model, replies capped.
    if (headers.authorization) headers.authorization = String(headers.authorization).replace(/[^\x20-\x7e]/g, '');
    const ownKey = /^Bearer\s+\S{8,}/.test(String(headers.authorization || ''));
    if (!local && target.hostname === 'openrouter.ai' && !ownKey) {
      if (!sharedKey) return res.writeHead(503).end('No shared key is set up on this server.');
      if (rateLimited(visitor(req))) return res.writeHead(429, { 'content-type': 'text/plain' }).end('The demo is busy right now. Please try again in a few minutes.');
      headers.authorization = `Bearer ${sharedKey}`;
      if (payload && /\/chat\/completions$/.test(target.pathname)) {
        try {
          const json = JSON.parse(payload.toString('utf8'));
          json.model = sharedModel;
          json.max_tokens = Math.min(Number(json.max_tokens) || maxTokens, maxTokens);
          payload = Buffer.from(JSON.stringify(json));
        } catch { return res.writeHead(400).end('bad body'); }
      }
    }
    try {
      const upstream = await fetchImpl(target.href, { method, headers, body: payload });
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
      if (url.pathname === '/log' && req.method === 'POST') {
        const body = (await readBody(req).catch(() => Buffer.alloc(0))).toString('utf8').slice(0, 50_000);
        if (isLocal(req) && body) {
          mkdirSync(logDir, { recursive: true });
          appendFileSync(join(logDir, 'fluent.log'), `${body.replace(/\n/g, ' ')}\n`); // visitors' conversations are never stored
        }
        return res.writeHead(204).end();
      }
      if (url.pathname === '/config.json') {
        return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ sharedKey: !!sharedKey, local: isLocal(req), model: sharedModel }));
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
