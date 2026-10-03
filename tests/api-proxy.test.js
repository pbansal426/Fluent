import { test } from 'node:test';
import assert from 'node:assert/strict';

// The hosted function reads its key from the environment when it loads, so set the environment first.
process.env.OPENROUTER_API_KEY = '​sk-or-HOSTED-SECRET\n';
process.env.DEMO_MODEL = 'openai/gpt-4o-mini';
process.env.DEMO_RATE_PER_5MIN = '3';
const { default: handler } = await import('../api/proxy.js');

let upstream;
globalThis.fetch = async (url, init) => {
  upstream = { url, init };
  return { status: 200, headers: { get: () => 'application/json' }, arrayBuffer: async () => Buffer.from('{"choices":[]}') };
};

// What Vercel hands a function: Node request / response objects (and a JSON body it has already parsed).
function call({ method = 'POST', headers = {}, body, ip = '203.0.113.5' } = {}) {
  const req = { method, headers: { 'x-forwarded-for': ip, 'content-type': 'application/json', ...headers }, body, socket: { remoteAddress: '10.0.0.1' } };
  const out = { status: 0, headers: {}, body: '' };
  const res = {
    status(n) { out.status = n; return res; },
    setHeader(k, v) { out.headers[k] = v; return res; },
    send(b) { out.body = Buffer.isBuffer(b) ? b.toString() : String(b); return res; },
    end() { return res; },
  };
  return handler(req, res).then(() => out);
}
const chat = { model: 'anthropic/claude-opus-9', max_tokens: 99999, messages: [{ role: 'user', content: 'hi' }] };
const openrouter = { 'x-target-url': 'https://openrouter.ai/api/v1/chat/completions' };

test('hosted function: the shared key from the environment is added, the model pinned, the reply capped', async () => {
  upstream = undefined;
  const out = await call({ headers: openrouter, body: chat, ip: '198.51.100.1' });
  assert.equal(out.status, 200);
  assert.equal(upstream.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(upstream.init.headers.authorization, 'Bearer sk-or-HOSTED-SECRET'); // invisible characters removed
  const sent = JSON.parse(upstream.init.body.toString());
  assert.equal(sent.model, 'openai/gpt-4o-mini');
  assert.equal(sent.max_tokens, 3000);
  assert.doesNotMatch(out.body, /HOSTED-SECRET/);
  assert.equal(upstream.init.headers['x-forwarded-for'], undefined);
});

test('hosted function: other sites, LM Studio and non-POST requests are refused', async () => {
  upstream = undefined;
  assert.equal((await call({ headers: { 'x-target-url': 'https://evil.example/' }, body: chat })).status, 403);
  assert.equal((await call({ headers: { 'x-target-url': 'http://localhost:1234/v1/models' }, body: chat })).status, 403);
  assert.equal((await call({ headers: { 'x-target-url': 'http://169.254.169.254/' }, body: chat })).status, 403);
  assert.equal((await call({ method: 'GET', headers: openrouter })).status, 405);
  assert.equal(upstream, undefined); // nothing was forwarded
});

test('hosted function: a visitor with their own key passes through, and the shared key is rate limited per visitor', async () => {
  const own = await call({ headers: { ...openrouter, authorization: 'Bearer sk-or-visitor-own-key-99' }, body: { ...chat, model: 'some/model' }, ip: '192.0.2.10' });
  assert.equal(own.status, 200);
  assert.equal(upstream.init.headers.authorization, 'Bearer sk-or-visitor-own-key-99');
  assert.equal(JSON.parse(upstream.init.body.toString()).model, 'some/model');
  const statuses = [];
  for (let i = 0; i < 5; i++) statuses.push((await call({ headers: openrouter, body: chat, ip: '192.0.2.77' })).status);
  assert.deepEqual(statuses, [200, 200, 200, 429, 429]);
});
