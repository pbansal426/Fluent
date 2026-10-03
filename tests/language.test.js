import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectLanguage, language } from '../extension/lib/language.js';
import { Agent } from '../extension/lib/agent.js';

test('page language metadata precedes model detection', async () => {
  const llm = { chatJson: () => { throw new Error('must not call the model'); } };
  assert.deepEqual(await detectLanguage(llm, { pageLang: 'es-MX' }), { code: 'es', name: 'Spanish' });
  assert.equal(language('German').code, 'de');
  assert.equal(language('und'), null);
});

test('PDF metadata is checked against labels, including stale English metadata in Spanish W-2', async () => {
  let request;
  const detected = await detectLanguage({ chatJson: async (r) => { request = r; return { language: 'Spanish' }; } },
    { pdfLang: 'en-US', pageLang: '', fields: [{ label: 'Apellido', options: [] }] });
  assert.equal(detected.name, 'Spanish');
  assert.match(request.messages[1].content, /English/);
  assert.match(request.messages[1].content, /Apellido/);
});

test('without metadata detection uses labels only, never field values', async () => {
  let sent;
  const llm = { chatJson: async (request) => { sent = JSON.stringify(request); return { language: 'Spanish' }; } };
  assert.equal((await detectLanguage(llm, { fields: [{ label: 'Apellido', options: [], value: '123-45-6789' }] })).name, 'Spanish');
  assert.equal(sent.includes('123-45-6789'), false);
  assert.match(sent, /Apellido/);
});

test('same language assists without translation calls or badges', async () => {
  let applies = 0, shown;
  const agent = new Agent({
    userLang: 'English',
    llm: { chatJson: () => { throw new Error('translation is unnecessary'); } },
    page: { scan: async () => ({ pageLang: 'en-US', fields: [{ id: 'f1', kind: 'text', label: 'First name', options: [] }] }), apply: async () => { applies++; }, highlight: async () => {} },
    ui: { language: (...args) => { shown = args; }, status() {}, prompt() {}, say: async () => {} },
  });
  await agent.start();
  await agent.translating;
  assert.deepEqual(shown, ['English', true]);
  assert.equal(applies, 0);
  assert.equal(agent.mode, 'listen');
});
