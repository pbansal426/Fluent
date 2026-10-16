// tests/agent-conversational.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Agent } from '../extension/lib/agent.js';

const base = { inputType: 'text', name: '', htmlId: '', autocomplete: '', placeholder: '', helpText: '', required: false, maxLength: 0, options: [], value: '' };

function createTestRig(fields, turns = []) {
  const dom = new Map();
  const log = { said: [], prompts: [], filled: [], llmMessages: [], errors: [] };
  const page = {
    scan: async () => ({ fields: structuredClone(fields), texts: [], pageLang: 'en' }),
    apply: async () => ({ ok: true }),
    highlight: async () => ({ ok: true }),
    focus: async () => ({ ok: true }),
    fill: async (id, value) => {
      const f = fields.find((x) => x.id === id);
      if (!f) return { ok: false };
      if (value === '') return dom.delete(id), { ok: true, value: '' };
      if (f.options?.length && !f.options.includes(value)) return { ok: false };
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
      if (!Array.isArray(input)) return { overview: 'Patient registration form.' };
      return {
        form_language: 'English',
        fields: input.map((f) => ({
          id: f.id,
          label: f.label,
          explanation: '',
          question: `What is your ${f.label.toLowerCase()}?`,
          options: f.options || [],
          section: f.section || '',
          english: f.label,
        })),
      };
    },
    chat: async ({ messages }) => {
      log.llmMessages.push(messages);
      return turns.shift() || { content: '', toolCalls: [] };
    },
  };
  const agent = new Agent({ llm, page, ui, userLang: 'English' });
  return { agent, log, dom };
}

const fill = (...pairs) => ({
  content: '',
  toolCalls: [{ name: 'fill_fields', args: { values: pairs.map(([field_id, value]) => ({ field_id, value })) } }],
});

test('Agent turn does NOT double-prompt when asking for spelling confirmation', async () => {
  const fields = [
    { ...base, id: 'f1', kind: 'text', label: 'First name', section: 'Personal', required: true },
    { ...base, id: 'f2', kind: 'text', label: 'Last name', section: 'Personal', required: true },
  ];
  const { agent, log } = createTestRig(fields, [fill(['f1', 'Bryan'])]);

  await agent.start();
  log.said.length = 0; // reset greeting and first question

  await agent.handleUser('Bryan', { alts: ['Brian'] });

  // Must ONLY ask the confirmation question, and NOT append the original question right after it!
  assert.equal(log.said.length, 1);
  assert.match(log.said[0], /Bryan with a Y or Brian with an I/i);
  assert.doesNotMatch(log.said[0], /What is your first name/i);
});

test('Agent turn fills non-ambiguous fields when one field needs spelling confirmation', async () => {
  const fields = [
    { ...base, id: 'f1', kind: 'text', label: 'First name', section: 'Personal', required: true },
    { ...base, id: 'f2', kind: 'text', label: 'Last name', section: 'Personal', required: true },
    { ...base, id: 'f3', kind: 'text', label: 'Date of birth', section: 'Personal', required: true },
  ];
  // User answered both First name (Bryan) and Last name (Lopez)
  const { agent, log, dom } = createTestRig(fields, [fill(['f1', 'Bryan'], ['f2', 'Lopez'])]);

  await agent.start();
  log.said.length = 0;

  await agent.handleUser('My name is Bryan Lopez', { alts: ['Brian Lopez'] });

  // f2 (Lopez) must be filled immediately
  assert.equal(dom.get('f2'), 'Lopez');
  // f1 (Bryan) must be pending confirmation
  assert.equal(dom.has('f1'), false);
  assert.equal(agent.pendingConfirm.fieldId, 'f1');

  // Next turn: user confirms "with a Y"
  await agent.handleUser('with a Y');
  assert.equal(dom.get('f1'), 'Bryan');
  // Both f1 and f2 are now filled, so it should advance to f3 (Date of birth)
  assert.equal(agent.current.id, 'f3');
});
