import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { createDemoServer } from '../tools/demo-server-lib.mjs';

let root;
let calls;
const upstream = async (url, init) => {
  calls.push({ url, init });
  return { status: 200, headers: { get: () => 'application/json' }, arrayBuffer: async () => Buffer.from('{"ok":true}') };
};

before(() => {
  root = mkdtempSync(join(tmpdir(), 'fluent-demo-'));
  for (const [path, text] of Object.entries({
    'demo/app/index.html': '<html>demo</html>', 'extension/panel/panel.html': '<html>panel</html>', 'tests/e2e.html': 'test page',
    'logs/fluent.log': 'SECRET conversation', '.git/config': 'secret repo', 'docs/HANDOFF.md': 'internal notes', 'package.json': '{}',
    'tools/demo-server.mjs': 'source', 'fw2_es.pdf': 'pdf', 'secret.pdf': 'not a sample', '.env': 'KEY=1',
  })) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
});
after(() => rmSync(root, { recursive: true, force: true }));

// Start a server, send one request, return { status, body }. `via` = 'local' or 'tunnel' (forwarding headers, as cloudflared adds).
async function ask(env, { method = 'GET', path = '/', via = 'local', headers = {}, body } = {}) {
  const server = createDemoServer({ root, env, fetchImpl: upstream });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  try {
    return await new Promise((resolve, reject) => {
      const tunnel = via === 'tunnel' ? { host: 'demo-abc.trycloudflare.com', 'x-forwarded-for': '203.0.113.7' } : { host: `127.0.0.1:${port}` };
      const req = http.request({ host: '127.0.0.1', port, method, path, headers: { ...tunnel, ...headers } }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });
      req.on('error', reject);
      if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
      req.end();
    });
  } finally {
    server.close();
  }
}
const forward = (target, extra = {}) => ({ method: 'POST', path: '/proxy', ...extra, headers: { 'x-target-url': target, 'content-type': 'application/json', ...extra.headers } });
const chat = (model = 'anthropic/claude-opus-9', max_tokens = 100000) => ({ model, max_tokens, messages: [{ role: 'user', content: 'hi' }] });

test('only the demo, the panel, the viewer and the sample forms are ever served', async () => {
  for (const via of ['local', 'tunnel']) {
    assert.equal((await ask({}, { path: '/demo/app/index.html', via })).status, 200);
    assert.equal((await ask({}, { path: '/extension/panel/panel.html', via })).status, 200);
    assert.equal((await ask({}, { path: '/fw2_es.pdf', via })).status, 200); // a listed sample
    for (const path of ['/logs/fluent.log', '/.git/config', '/docs/HANDOFF.md', '/package.json', '/tools/demo-server.mjs', ...(via === 'tunnel' ? ['/secret.pdf'] : []), '/.env', '/demo/../logs/fluent.log', '/%2e%2e/logs/fluent.log']) {
      const r = await ask({}, { path, via });
      assert.equal(r.status, 404, `${via} ${path}`);
      assert.doesNotMatch(r.body, /SECRET|secret repo|internal notes/);
    }
  }
  assert.equal((await ask({}, { path: '/secret.pdf', via: 'local' })).status, 200); // any PDF in the folder: this machine only (testing)
  assert.equal((await ask({}, { path: '/subdir/x.pdf', via: 'local' })).status, 404); // but only at the top level
  assert.equal((await ask({}, { path: '/tests/e2e.html', via: 'local' })).status, 200); // test pages: this machine only
  assert.equal((await ask({}, { path: '/tests/e2e.html', via: 'tunnel' })).status, 404);
  assert.equal((await ask({}, { path: '/', via: 'tunnel' })).status, 302);
});

test('the AI forwarder only reaches known AI providers; LM Studio only from this machine', async () => {
  calls = [];
  assert.equal((await ask({}, forward('https://evil.example/steal', { body: '{}' }))).status, 403);
  assert.equal((await ask({}, forward('http://169.254.169.254/latest/meta-data', { body: '{}' }))).status, 403);
  assert.equal((await ask({}, forward('http://localhost:22/', { body: '{}' }))).status, 403);
  assert.equal((await ask({}, forward('https://openrouter.ai.evil.example/api/v1/chat/completions', { body: '{}' }))).status, 403);
  assert.equal(calls.length, 0);
  assert.equal((await ask({}, forward('http://localhost:1234/v1/chat/completions', { body: '{}' }))).status, 200); // the owner's LM Studio
  assert.equal((await ask({}, forward('http://localhost:1234/v1/chat/completions', { via: 'tunnel', body: '{}' }))).status, 403); // not for visitors
  assert.equal(calls.length, 1);
});

test('visitors use the shared key, pinned to one model with a reply cap; the key is never sent to them', async () => {
  calls = [];
  const env = { OPENROUTER_API_KEY: 'sk-or-SHARED-SECRET', DEMO_MODEL: 'openai/gpt-4o-mini', DEMO_MAX_TOKENS: '3000' };
  const r = await ask(env, forward('https://openrouter.ai/api/v1/chat/completions', { via: 'tunnel', body: chat() }));
  assert.equal(r.status, 200);
  assert.doesNotMatch(r.body, /SHARED-SECRET/);
  const sent = calls.at(-1);
  assert.equal(sent.init.headers.authorization, 'Bearer sk-or-SHARED-SECRET');
  const payload = JSON.parse(sent.init.body.toString());
  assert.equal(payload.model, 'openai/gpt-4o-mini'); // the visitor asked for an expensive model
  assert.equal(payload.max_tokens, 3000);
  assert.equal(sent.init.headers['x-forwarded-for'], undefined); // visitor details are not passed on
});

test('a visitor with a key of their own is passed through untouched and not rate-limited', async () => {
  calls = [];
  const env = { OPENROUTER_API_KEY: 'sk-or-SHARED-SECRET', DEMO_RATE_PER_5MIN: '1' };
  for (let i = 0; i < 4; i++) {
    const r = await ask(env, forward('https://openrouter.ai/api/v1/chat/completions', { via: 'tunnel', headers: { authorization: 'Bearer sk-or-visitors-own-key' }, body: chat('some/model', 50) }));
    assert.equal(r.status, 200);
  }
  const sent = calls.at(-1);
  assert.equal(sent.init.headers.authorization, 'Bearer sk-or-visitors-own-key');
  assert.equal(JSON.parse(sent.init.body.toString()).model, 'some/model');
});

test('the shared key is rate limited per visitor, and a missing key says so', async () => {
  const env = { OPENROUTER_API_KEY: 'sk-or-SHARED-SECRET', DEMO_RATE_PER_5MIN: '3' };
  // one server so the counter persists across requests
  const server = createDemoServer({ root, env, fetchImpl: upstream });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  const post = () => new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/proxy', headers: { host: 'x.example', 'x-forwarded-for': '198.51.100.9', 'x-target-url': 'https://openrouter.ai/api/v1/chat/completions' } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.end(JSON.stringify(chat()));
  });
  const statuses = [];
  for (let i = 0; i < 5; i++) statuses.push(await post());
  server.close();
  assert.deepEqual(statuses, [200, 200, 200, 429, 429]);
  assert.equal((await ask({}, forward('https://openrouter.ai/api/v1/chat/completions', { via: 'tunnel', body: chat() }))).status, 503);
});

test('a key pasted with invisible characters (a zero-width space from a web page) still works', async () => {
  calls = [];
  const env = { OPENROUTER_API_KEY: '\u200bsk-or-REAL-KEY\u00a0\n' };
  const r = await ask(env, forward('https://openrouter.ai/api/v1/chat/completions', { via: 'tunnel', body: chat() }));
  assert.equal(r.status, 200);
  assert.equal(calls.at(-1).init.headers.authorization, 'Bearer sk-or-REAL-KEY');
  // and a visitor's own key with the same problem is cleaned before it is forwarded
  const own = await ask(env, forward('https://openrouter.ai/api/v1/chat/completions', { via: 'tunnel', headers: { authorization: 'Bearer sk-or-visitor-key-1234' }, body: chat('x/y', 10) }));
  assert.equal(own.status, 200);
});

test('the shared key can be saved once in a private file; it is used but never served', async () => {
  const keyFile = join(root, '.openrouter-key');
  writeFileSync(keyFile, '\u200bsk-or-FROM-FILE\n');
  try {
    calls = [];
    const r = await ask({}, forward('https://openrouter.ai/api/v1/chat/completions', { via: 'tunnel', body: chat() }));
    assert.equal(r.status, 200);
    assert.equal(calls.at(-1).init.headers.authorization, 'Bearer sk-or-FROM-FILE');
    const config = JSON.parse((await ask({}, { path: '/config.json', via: 'tunnel' })).body);
    assert.equal(config.sharedKey, true);
    for (const via of ['local', 'tunnel']) {
      const leak = await ask({}, { path: '/.openrouter-key', via });
      assert.equal(leak.status, 404);
      assert.doesNotMatch(leak.body, /FROM-FILE/);
    }
    // an environment key wins over the file
    await ask({ OPENROUTER_API_KEY: 'sk-or-FROM-ENV' }, forward('https://openrouter.ai/api/v1/chat/completions', { via: 'tunnel', body: chat() }));
    assert.equal(calls.at(-1).init.headers.authorization, 'Bearer sk-or-FROM-ENV');
  } finally {
    rmSync(keyFile, { force: true });
  }
});

test('visitors\' conversations are never logged; this machine\'s are', async () => {
  const log = join(root, 'logs', 'fluent.log');
  const before = readFileSync(log, 'utf8');
  await ask({}, { method: 'POST', path: '/log', via: 'tunnel', body: '{"event":"say","text":"visitor secret"}' });
  assert.equal(readFileSync(log, 'utf8'), before);
  await ask({}, { method: 'POST', path: '/log', via: 'local', body: '{"event":"say","text":"owner entry"}' });
  assert.match(readFileSync(log, 'utf8'), /owner entry/);
});

test('the page learns whether it is local and whether a shared key exists', async () => {
  const env = { OPENROUTER_API_KEY: 'sk-or-x', DEMO_MODEL: 'openai/gpt-4o-mini' };
  assert.deepEqual(JSON.parse((await ask(env, { path: '/config.json', via: 'tunnel' })).body), { sharedKey: true, local: false, model: 'openai/gpt-4o-mini' });
  assert.deepEqual(JSON.parse((await ask({}, { path: '/config.json', via: 'local' })).body), { sharedKey: false, local: true, model: 'openai/gpt-4o-mini' });
  assert.equal((await ask(env, { path: '/config.json', via: 'tunnel' })).body.includes('sk-or-x'), false);
});
