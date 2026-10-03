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

test('same language gets simple questions and descriptions, but no translation badges', async () => {
  let applies = 0, shown, calls = 0, sentToPage;
  const said = [];
  const agent = new Agent({
    userLang: 'English',
    llm: { chatJson: async ({ messages }) => { if (/what this form is/.test(messages[0].content)) return { overview: 'This is a short form about you.' }; calls++; assert.match(messages[0].content, /already in English/); return { form_language: 'English', fields: [{ id: 'f1', label: 'Simplified label', explanation: 'Your first name.', question: 'What is your first name?', options: [], section: '', english: 'First name' }] }; } },
    page: { scan: async () => ({ pageLang: 'en-US', fields: [{ id: 'f1', kind: 'text', label: 'First name', options: [] }] }), apply: async (a) => { applies++; sentToPage = a; }, highlight: async () => {} },
    ui: { language: (...args) => { shown = args; }, status() {}, prompt() {}, say: async (t) => void said.push(t) },
  });
  await agent.start();
  await agent.translating;
  assert.deepEqual(shown, ['English', true]);
  // the page only gets the plain-language description of each field, flagged so it is not shown as a translation
  assert.equal(applies, 1);
  assert.equal(sentToPage.fields.every((f) => f.hintOnly === true && f.explanation), true);
  assert.equal(calls, 1);
  assert.equal(agent.tr(agent.fields[0]).label, 'First name'); // the form's own label is kept
  assert.match(said.at(-1), /^What is your first name\?/);
  assert.equal(agent.mode, 'listen');
});

test('the first messages are the greeting, then a plain-language overview of the form, then the first question', async () => {
  const said = [];
  let prompt = '';
  const agent = new Agent({
    userLang: 'Spanish',
    llm: {
      chatJson: async ({ messages }) => {
        if (/what this form is/.test(messages[0].content)) { prompt = messages[0].content; return { overview: 'Este formulario sirve para pedir la residencia. Lo haremos paso a paso.' }; }
        return { form_language: 'English', fields: [{ id: 'f1', label: 'Apellido', explanation: 'Su apellido.', question: '¿Cuál es su apellido?', options: [], section: '', english: 'Family name' }] };
      },
    },
    page: { scan: async () => ({ pageLang: 'en-US', title: 'Form I-485, Application to Register Permanent Residence', fields: [{ id: 'f1', kind: 'text', label: 'Family name', options: [] }] }), apply: async () => {}, highlight: async () => {} },
    ui: { language() {}, status() {}, prompt() {}, say: async (t) => void said.push(t) },
  });
  await agent.start();
  assert.equal(said[0], agent.phrases.greeting);
  assert.match(said[1], /^Este formulario sirve para pedir la residencia/);
  assert.match(said[2], /Apellido|apellido/);
  assert.match(prompt, /Form I-485, Application to Register Permanent Residence/);
  assert.match(prompt, /Spanish/);
});

test('a failing overview never blocks the first question', async () => {
  const said = [];
  const agent = new Agent({
    userLang: 'Spanish',
    llm: { chatJson: async ({ messages }) => { if (/what this form is/.test(messages[0].content)) throw new Error('model down'); return { form_language: 'English', fields: [] }; } },
    page: { scan: async () => ({ pageLang: 'en-US', fields: [{ id: 'f1', kind: 'text', label: 'Family name', options: [] }] }), apply: async () => {}, highlight: async () => {} },
    ui: { language() {}, status() {}, prompt() {}, say: async (t) => void said.push(t) },
  });
  await agent.start();
  assert.equal(said.length, 2); // greeting and the first question
  assert.equal(agent.mode, 'listen');
});
