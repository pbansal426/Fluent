// tests/agent-conversational-warmth.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Agent } from '../extension/lib/agent.js';
import { looksLikeSkip } from '../extension/lib/audit.js';
import { getDocumentHint, getRequiredDocumentsSummary } from '../extension/lib/form-session.js';

const base = { inputType: 'text', name: '', htmlId: '', autocomplete: '', placeholder: '', helpText: '', required: false, maxLength: 0, options: [], value: '' };

function createTestRig(fields, turns = []) {
  const dom = new Map();
  const log = { said: [], llmMessages: [] };
  const page = {
    scan: async () => ({ fields: structuredClone(fields), texts: [], pageLang: 'en' }),
    apply: async () => ({ ok: true }),
    highlight: async () => ({ ok: true }),
    focus: async () => ({ ok: true }),
    fill: async (id, value) => (dom.set(id, value), { ok: true, value }),
    read: async (id) => ({ ok: true, value: dom.get(id) || '' }),
  };
  const ui = { say: async (t) => void log.said.push(t), prompt: () => {}, filled: () => {}, status: () => {}, error: () => {} };
  const llm = {
    chatJson: async ({ messages }) => {
      const input = JSON.parse(messages[1].content);
      if (!Array.isArray(input)) return { overview: 'Form.' };
      return { form_language: 'English', fields: input.map((f) => ({ id: f.id, label: f.label, explanation: '', question: `What is your ${f.label.toLowerCase()}?`, options: [], section: f.section || '', english: f.label })) };
    },
    chat: async ({ messages }) => (log.llmMessages.push(messages), turns.shift() || { content: '', toolCalls: [] }),
  };
  return { agent: new Agent({ llm, page, ui, userLang: 'English' }), log, dom };
}

test('looksLikeSkip recognizes Spanish and English "no answer" phrases', () => {
  for (const s of ['ninguno', 'Ninguna', 'ningún', 'nada', 'no tengo eso', 'nothing', "we don't have"]) {
    assert.equal(looksLikeSkip(s), true, s);
  }
  assert.equal(looksLikeSkip('Maria'), false);
});

test('document hints cover passport, I-94 and driver license in English and Spanish', () => {
  const cases = [
    [{ label: 'Passport Number' }, 'passport_number'],
    [{ label: 'Número de pasaporte' }, 'passport_number'],
    [{ label: 'Form I-94 Arrival Record number' }, 'form_i94'],
    [{ label: 'Registro de llegada I-94' }, 'form_i94'],
    [{ label: "Driver's License Number" }, 'drivers_license'],
    [{ label: 'Licencia de conducir' }, 'drivers_license'],
  ];
  for (const [field, id] of cases) {
    for (const lang of ['English', 'Spanish']) {
      const hint = getDocumentHint(field, lang);
      assert.equal(hint?.id, id, `${field.label} (${lang})`);
      assert.ok(hint.cardTitle && hint.whereToLook);
    }
  }
  const summary = getRequiredDocumentsSummary([{ label: 'Passport Number' }, { label: 'Passport number (again)' }, { label: "Driver's License" }, { label: 'I-94 number' }]);
  assert.deepEqual(summary.map((s) => s.id).sort(), ['drivers_license', 'form_i94', 'passport_number']);
});

test('Agent turn fills the current field with the final value of an intra-utterance self-correction', async () => {
  const fields = [
    { ...base, id: 'f1', kind: 'text', label: 'First name', section: 'Personal' },
    { ...base, id: 'f2', kind: 'text', label: 'Phone', section: 'Personal' },
  ];
  const { agent, log, dom } = createTestRig(fields, [
    { content: '', toolCalls: [{ name: 'fill_fields', args: { values: [{ field_id: 'f1', value: 'Ana' }] } }] },
    { content: '', toolCalls: [{ name: 'fill_fields', args: { values: [{ field_id: 'f2', value: '555-9898' }] } }] },
  ]);
  await agent.start();
  await agent.handleUser('Ana');
  await agent.handleUser('555-1212, wait, actually 555-9898');
  assert.equal(dom.get('f2'), '555-9898');
  assert.equal(dom.get('f1'), 'Ana');
  const system = log.llmMessages.at(-1)[0].content;
  assert.match(system, /same (sentence|utterance|breath)/i);
});

test('turn prompt asks for warmth and tolerates filler words', async () => {
  const fields = [{ ...base, id: 'f1', kind: 'text', label: 'First name', section: 'Personal' }];
  const { agent, log } = createTestRig(fields, [{ content: 'ok', toolCalls: [{ name: 'ask_user', args: { message: 'ok' } }] }]);
  await agent.start();
  await agent.handleUser('um');
  const system = log.llmMessages.at(-1)[0].content;
  assert.match(system, /empath/i);
  assert.match(system, /\b(um|uh|filler)\b/i);
});

test('Agent turn calls skip_field when the user says "Ninguna" or "No tengo"', async () => {
  for (const said of ['Ninguna', 'No tengo']) {
    const fields = [
      { ...base, id: 'f1', kind: 'text', label: 'Middle name', section: 'Personal' },
      { ...base, id: 'f2', kind: 'text', label: 'Last name', section: 'Personal' },
    ];
    const { agent } = createTestRig(fields, [{ content: '', toolCalls: [{ name: 'skip_field', args: { field_id: 'f1' } }] }]);
    await agent.start();
    await agent.handleUser(said);
    assert.ok(agent.skipped.has('f1'), said);
    assert.equal(agent.current.id, 'f2');
  }
});
