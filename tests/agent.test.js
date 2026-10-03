import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Agent } from '../extension/lib/agent.js';

const base = { inputType: 'text', name: '', htmlId: '', autocomplete: '', placeholder: '', helpText: '', required: false, maxLength: 0, options: [], value: '' };
const FIELDS = [
  { ...base, id: 'f1', kind: 'text', label: 'First name', required: true },
  { ...base, id: 'f2', kind: 'select', label: 'Marital status', options: ['Single', 'Married'] },
  { ...base, id: 'f3', kind: 'text', label: 'Social Security Number' },
  { ...base, id: 'f4', kind: 'textarea', label: 'Reason for visit', required: true },
];

function setup(turns) {
  const dom = new Map();
  const log = { said: [], prompts: [], filled: [], llmMessages: [], errors: [] };
  const page = {
    scan: async () => ({ fields: structuredClone(FIELDS), texts: [] }),
    apply: async () => ({ ok: true }),
    highlight: async () => ({ ok: true }),
    focus: async () => ({ ok: true }),
    fill: async (id, value) => {
      const f = FIELDS.find((x) => x.id === id);
      if (f.options.length && !f.options.includes(value)) return { ok: false };
      dom.set(id, value);
      return { ok: true, value };
    },
    read: async (id) => ({ ok: true, value: dom.get(id) || '' }),
  };
  const ui = {
    say: async (t) => void log.said.push(t),
    prompt: (s) => log.prompts.push(s),
    filled: (items) => log.filled.push(...items),
    status: () => {},
    error: (e) => log.errors.push(e),
  };
  const llm = {
    chatJson: async ({ messages }) => {
      const input = JSON.parse(messages[1].content);
      return { form_language: 'English', fields: input.map((f) => ({ id: f.id, label: `ES:${f.label}`, explanation: 'exp', options: f.options.map((o) => `ES:${o}`) })) };
    },
    chat: async ({ messages }) => {
      log.llmMessages.push(messages);
      return turns.shift() || { content: '', toolCalls: [] };
    },
  };
  const agent = new Agent({ llm, page, ui, userLang: 'Spanish' });
  return { agent, log, dom };
}

const fill = (...pairs) => ({ content: '', toolCalls: [{ name: 'fill_fields', args: { values: pairs.map(([field_id, value]) => ({ field_id, value })) } }] });

test('asks the first field in the user language after greeting', async () => {
  const { agent, log } = setup([]);
  await agent.start();
  assert.equal(log.said.length, 2);
  assert.match(log.said[1], /^ES:First name\. exp/);
  assert.equal(agent.mode, 'listen');
});

test('one answer can fill several fields, then the private field is typed', async () => {
  const { agent, log, dom } = setup([fill(['f1', 'María'], ['f2', 'Married'])]);
  await agent.start();
  await agent.handleUser('Me llamo María y estoy casada');
  assert.equal(dom.get('f1'), 'María');
  assert.equal(dom.get('f2'), 'Married');
  assert.match(log.said.at(-2), /ES:Marital status: ES:Married/); // read back in the user's language
  assert.equal(agent.current.id, 'f3');
  assert.equal(agent.mode, 'type');
  assert.equal(log.prompts.at(-1).canTranslate, false);
});

test('private values never reach the model and cannot be filled by it', async () => {
  const { agent, log, dom } = setup([fill(['f1', 'Ana'], ['f2', 'Single']), fill(['f3', '123-45-6789']), { content: '', toolCalls: [{ name: 'ask_user', args: { message: 'ok' } }] }]);
  await agent.start();
  await agent.handleUser('Ana, soltera');
  await agent.handleUser('uno dos tres');
  assert.equal(dom.has('f3'), false);
  assert.equal(agent.current.id, 'f3');

  dom.set('f3', '123-45-6789'); // the user types it on the page
  await agent.continueTyped();
  assert.equal(agent.current.id, 'f4');
  await agent.handleUser('¿qué es esto?');
  const sent = JSON.stringify(log.llmMessages);
  assert.equal(sent.includes('123-45-6789'), false);
  assert.match(JSON.stringify(log.llmMessages.at(-1)[0]), /\\"private\\":true/);
});

test('invalid option is not filled and the question stays', async () => {
  const { agent, log, dom } = setup([fill(['f1', 'Ana']), fill(['f2', 'Complicated'])]);
  await agent.start();
  await agent.handleUser('Ana');
  await agent.handleUser('es complicado');
  assert.equal(dom.has('f2'), false);
  assert.equal(agent.current.id, 'f2');
  assert.equal(log.said.at(-1), agent.phrases.not_understood);
});

test('skip, required typed field, and finishing', async () => {
  const { agent, log, dom } = setup([fill(['f1', 'Ana']), { content: '', toolCalls: [{ name: 'skip_field', args: { field_id: 'f2' } }] }]);
  await agent.start();
  await agent.handleUser('Ana');
  await agent.handleUser('saltar');
  assert.equal(agent.current.id, 'f3');
  await agent.continueTyped(); // optional and empty -> skipped
  assert.equal(agent.current.id, 'f4');
  assert.equal(log.prompts.at(-1).canTranslate, true);
  await agent.continueTyped(); // required and empty -> stays
  assert.equal(agent.current.id, 'f4');
  assert.equal(log.said.at(-1), agent.phrases.empty_required);
  dom.set('f4', 'Dolor de cabeza');
  await agent.continueTyped();
  assert.equal(agent.mode, 'done');
  assert.equal(log.said.at(-1), agent.phrases.done);
});

test('plain text from the model is spoken as a reply', async () => {
  const { agent, log } = setup([{ content: 'Es su nombre legal.', toolCalls: [] }]);
  await agent.start();
  await agent.handleUser('¿qué significa?');
  assert.equal(log.said.at(-1), 'Es su nombre legal.');
  assert.equal(agent.current.id, 'f1');
});
