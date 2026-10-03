// The rules for forwarding an AI request, shared by the local demo server and the hosted (Vercel) function, so the same
// protections apply everywhere:
//  - only known AI providers are reachable (and the owner's LM Studio, from the owner's own machine only);
//  - a visitor without a key of their own uses the shared key: pinned to one model, replies capped, rate limited;
//  - the shared key is only ever added here, on the server.

export const AI_HOSTS = new Set(['openrouter.ai', 'api.openai.com', 'api.anthropic.com', 'generativelanguage.googleapis.com', 'api.groq.com', 'api.x.ai']);
export const LOCAL_AI = /^http:\/\/(localhost|127\.0\.0\.1):1234\//;

// An API key is plain printable ASCII. Invisible characters that come along when it is copied from a web page make every
// request fail, so they are always removed.
export const cleanKey = (key) => String(key || '').replace(/[^\x21-\x7e]/g, '');

// Per-visitor and overall limits on use of the shared key. In memory: fine for one server, a soft limit on a serverless host
// (where the spending cap on the key is the real backstop).
export function createLimiter(env = {}, now = () => Date.now()) {
  const perWindow = Number(env.DEMO_RATE_PER_5MIN) || 80;
  const perDay = Number(env.DEMO_RATE_PER_DAY) || 600;
  const globalDay = Number(env.DEMO_RATE_GLOBAL_DAY) || 5000;
  const hits = new Map();
  let globalHits = [];
  return (id) => {
    const t = now();
    const mine = (hits.get(id) || []).filter((x) => t - x < 86_400_000);
    globalHits = globalHits.filter((x) => t - x < 86_400_000);
    if (mine.length >= perDay || globalHits.length >= globalDay || mine.filter((x) => t - x < 300_000).length >= perWindow) return true;
    mine.push(t);
    globalHits.push(t);
    hits.set(id, mine);
    return false;
  };
}

const DROP_HEADERS = new Set(['host', 'origin', 'referer', 'x-target-url', 'x-target-method', 'content-length', 'connection', 'accept-encoding', 'cookie', 'x-forwarded-for', 'x-real-ip', 'cf-connecting-ip', 'forwarded', 'x-forwarded-host', 'x-forwarded-proto', 'x-vercel-forwarded-for', 'x-vercel-id', 'x-vercel-deployment-url']);

// Decides what to send upstream. Returns { refuse: { status, text } } or { url, init }.
//   request: { target (string), method, headers (lowercase), body (Buffer|undefined), local (bool), visitor (string) }
//   config:  { sharedKey, sharedModel, maxTokens, limited(id) -> bool }
export function buildUpstream(request, config) {
  let target;
  try { target = new URL(String(request.target || '')); } catch { return { refuse: { status: 400, text: 'bad target' } }; }
  const allowed = (target.protocol === 'https:' && AI_HOSTS.has(target.hostname)) || (request.local && LOCAL_AI.test(target.href));
  if (!allowed) return { refuse: { status: 403, text: 'That address is not allowed.' } };

  const headers = {};
  for (const [k, v] of Object.entries(request.headers || {})) if (!DROP_HEADERS.has(k) && !k.startsWith('sec-')) headers[k] = v;
  if (headers.authorization) headers.authorization = String(headers.authorization).replace(/[^\x20-\x7e]/g, '');
  const method = request.method || 'POST';
  let payload = ['GET', 'HEAD'].includes(method) ? undefined : request.body;

  const ownKey = /^Bearer\s+\S{8,}/.test(String(headers.authorization || ''));
  if (!request.local && target.hostname === 'openrouter.ai' && !ownKey) {
    if (!config.sharedKey) return { refuse: { status: 503, text: 'No shared key is set up on this server.' } };
    if (config.limited(request.visitor)) return { refuse: { status: 429, text: 'The demo is busy right now. Please try again in a few minutes.' } };
    headers.authorization = `Bearer ${config.sharedKey}`;
    if (payload && /\/chat\/completions$/.test(target.pathname)) {
      try {
        const json = JSON.parse(payload.toString('utf8'));
        json.model = config.sharedModel;
        json.max_tokens = Math.min(Number(json.max_tokens) || config.maxTokens, config.maxTokens);
        payload = Buffer.from(JSON.stringify(json));
      } catch { return { refuse: { status: 400, text: 'bad body' } }; }
    }
  }
  return { url: target.href, init: { method, headers, body: payload } };
}
