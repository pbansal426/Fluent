// tests/agent-milestones.test.js
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
          label: `ES:${f.label}`,
          explanation: 'exp',
          question: `¿${f.label}?`,
          options: (f.options || []).map((o) => `ES:${o}`),
          section: f.section ? `ES:${f.section}` : '',
          english: f.label,
        })),
      };
    },
    chat: async ({ messages }) => {
      log.llmMessages.push(messages);
      return turns.shift() || { content: '', toolCalls: [] };
    },
  };
  const agent = new Agent({ llm, page, ui, userLang: 'Spanish' });
  return { agent, log, dom, llm, ui };
}

const fill = (...pairs) => ({
  content: '',
  toolCalls: [{ name: 'fill_fields', args: { values: pairs.map(([field_id, value]) => ({ field_id, value })) } }],
});

test('Agent tracks milestones, spoken + visual document hints, and emits review summary when done', async () => {
  const fields = [
    { ...base, id: 'f1', kind: 'text', label: 'First name', section: 'Personal', required: true },
    { ...base, id: 'f2', kind: 'text', label: 'Insurance Group Number', section: 'Insurance', required: true },
  ];
  const { agent, log, dom } = createTestRig(fields, [fill(['f1', 'Ana']), fill(['f2', 'GRP777'])]);

  await agent.start();
  const m1 = agent.getCurrentMilestone();
  assert.equal(m1.index, 1);
  assert.equal(m1.total, 2);
  assert.equal(log.prompts.at(-1).milestone.index, 1);
  assert.equal(log.prompts.at(-1).documentHint, null);

  await agent.handleUser('Ana');
  assert.equal(agent.current.id, 'f2');
  const m2 = agent.getCurrentMilestone();
  assert.equal(m2.index, 2);
  assert.ok(log.prompts.at(-1).documentHint);
  assert.equal(log.prompts.at(-1).documentHint.id, 'insurance_group');
  assert.match(log.said.at(-1), /GRP|Group/i);

  await agent.handleUser('GRP777');
  assert.equal(agent.mode, 'done');
  const review = log.prompts.at(-1).review;
  assert.ok(Array.isArray(review));
  assert.equal(review.length, 2);
  assert.equal(review[0].shownValue, 'Ana');
  assert.equal(review[1].shownValue, 'GRP777');

  // Editing a field from the review card jumps straight back to that field
  await agent.editField('f1');
  assert.equal(agent.mode, 'listen');
  assert.equal(agent.current.id, 'f1');
  assert.equal(dom.get('f1'), 'Ana');
});

test('Agent performs metacognitive spelling confirmation on homophone names (including full names) and resolves on next turn', async () => {
  const fields = [
    { ...base, id: 'f1', kind: 'text', label: 'Full legal name', section: 'Personal', required: true },
    { ...base, id: 'f2', kind: 'text', label: 'City', section: 'Personal', required: true },
  ];
  const { agent, log, dom } = createTestRig(fields, [fill(['f1', 'Bryan Lopez'])]);

  await agent.start();
  await agent.handleUser('Bryan Lopez', { alts: ['Brian Lopez'] });

  // Should NOT have written to DOM yet; should have asked the confirmation prompt
  assert.equal(dom.has('f1'), false);
  assert.equal(agent.current.id, 'f1');
  assert.match(log.said.at(-1), /Bryan.*Brian/i);

  // Next turn: user says "con I" -> resolved in code to "Brian Lopez" without needing another LLM tool call!
  await agent.handleUser('con I');
  assert.equal(dom.get('f1'), 'Brian Lopez');
  assert.equal(agent.current.id, 'f2');
});

test('Agent.fromSchema runs headlessly without a DOM and setUserLanguage preserves filled progress', async () => {
  const schema = {
    title: 'Phone Intake',
    sections: [
      {
        id: 'sec1',
        title: 'Caller',
        fields: [
          { id: 'caller_name', label: 'First name', kind: 'text', required: true },
          { id: 'caller_city', label: 'City', kind: 'text', required: true },
        ],
      },
    ],
  };
  const { llm, ui } = createTestRig([], [fill(['caller_name', 'Elena'])]);
  const { agent, session } = Agent.fromSchema(schema, { llm, ui, userLang: 'Spanish' });

  await agent.start();
  await agent.handleUser('Elena');
  assert.equal(session.getValue('caller_name'), 'Elena');
  assert.equal(agent.current.id, 'caller_city');

  await agent.setUserLanguage('English');
  assert.equal(agent.userLang, 'English');
  assert.equal(session.getValue('caller_name'), 'Elena');
  assert.equal(agent.current.id, 'caller_city');
});

test('Agent clears stale pendingConfirm if user skips field, and refreshes review summary on language switch in done mode', async () => {
  const fields = [
    { ...base, id: 'f1', kind: 'text', label: 'First name', section: 'Personal', required: false },
    { ...base, id: 'f2', kind: 'text', label: 'City', section: 'Personal', required: true },
  ];
  const { agent, log, dom } = createTestRig(fields, [fill(['f1', 'Bryan']), fill(['f2', 'Austin']), fill(['f1', 'Maria'])]);

  await agent.start();
  await agent.handleUser('Bryan', { alts: ['Brian'] });
  assert.ok(agent.pendingConfirm);

  // User decides to skip f1 instead of confirming
  await agent.handleUser('skip');
  assert.equal(agent.pendingConfirm, null);
  assert.equal(agent.current.id, 'f2');

  await agent.handleUser('Austin');
  // Wraps back to f1? Wait: f1 was skipped, so nextField() returns null and mode becomes 'done'
  assert.equal(agent.mode, 'done');

  // If user edits f1 from review or jumps back, pendingConfirm must not be active
  await agent.editField('f1');
  assert.equal(agent.pendingConfirm, null);
  await agent.handleUser('Maria');
  assert.equal(dom.get('f1'), 'Maria');
  assert.equal(agent.mode, 'done');

  // Switch language while in done mode
  await agent.setUserLanguage('English');
  assert.equal(agent.mode, 'done');
  assert.equal(log.prompts.at(-1).review.length, 2);
});

test('Agent.fromSchema synchronizes grouped checkbox choices back to milestone completion', async () => {
  const schema = {
    title: 'Eligibility Check',
    sections: [
      {
        id: 'elig',
        title: 'Eligibility',
        fields: [
          { id: 'c_yes', label: 'Are you over 18?: Select Yes', kind: 'checkbox', required: true },
          { id: 'c_no', label: 'Are you over 18?: Select No', kind: 'checkbox', required: true },
        ],
      },
    ],
  };
  const { llm, ui } = createTestRig([], []);
  const { agent, session } = Agent.fromSchema(schema, { llm, ui, userLang: 'English' });

  await agent.start();
  assert.equal(agent.fields.length, 1);
  assert.equal(agent.getCurrentMilestone().completed, false);

  await agent.handleUser('yes');
  assert.equal(agent.mode, 'done');
  assert.equal(agent.getMilestones()[0].completed, true);
  assert.equal(session.getValue('c_yes'), 'true');
  assert.equal(session.getValue('c_no'), 'false');
});

test('Agent appends pre-flight document checklist heads-up to overview if form requires documents', async () => {
  const fields = [
    { ...base, id: 'f1', kind: 'text', label: 'First name', section: 'Personal', required: true },
    { ...base, id: 'f2', kind: 'text', label: 'Insurance Group Number', section: 'Insurance', required: true },
    { ...base, id: 'f3', kind: 'text', label: 'Employer Identification Number (EIN)', section: 'Tax', required: true },
  ];
  const { agent, log } = createTestRig(fields, []);

  await agent.start();
  // Overview message is spoken after greeting
  assert.ok(log.said.length >= 2);
  const overviewSpoken = log.said[1];
  assert.match(overviewSpoken, /Tarjeta de Seguro Médico/i);
  assert.match(overviewSpoken, /Formulario W-2/i);
  assert.match(overviewSpoken, /podemos omitirlo por ahora/i);
});

test('Agent.fromSchema automatically translates phrases for non-English userLang in start()', async () => {
  const schema = {
    title: 'Clinic Intake',
    sections: [
      {
        id: 'sec1',
        title: 'Info',
        fields: [{ id: 'name', label: 'Full name', kind: 'text' }],
      },
    ],
  };
  const said = [];
  const ui = { say: async (t) => void said.push(t), prompt: () => {}, filled: () => {}, status: () => {}, error: () => {} };
  const llm = {
    chatJson: async ({ messages }) => {
      // Check if this is the translatePhrases call
      if (messages[0].content.includes('Translate the values of this JSON object into Vietnamese')) {
        return { greeting: 'Xin chào, tôi là Fluent.' };
      }
      return {
        form_language: 'English',
        fields: [{ id: 'name', label: 'Họ và tên', explanation: '', question: 'Họ và tên của bạn là gì?', options: [], section: '', english: 'Full name' }],
      };
    },
    chat: async () => ({ content: '', toolCalls: [] }),
  };

  const { agent } = Agent.fromSchema(schema, { llm, ui, userLang: 'Vietnamese' });
  await agent.start();

  assert.equal(said[0], 'Xin chào, tôi là Fluent.');
  assert.equal(agent.phrases.greeting, 'Xin chào, tôi là Fluent.');
});

