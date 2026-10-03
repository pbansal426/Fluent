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
    scan: async () => ({ fields: structuredClone(FIELDS), texts: [], pageLang: 'en' }),
    apply: async () => ({ ok: true }),
    highlight: async () => ({ ok: true }),
    focus: async () => ({ ok: true }),
    fill: async (id, value) => {
      const f = FIELDS.find((x) => x.id === id);
      if (value === '') return dom.delete(id), { ok: true, value: '' };
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

test('interpret only: a number the user never said is not written', async () => {
  const { agent, log, dom } = setup([fill(['f1', '555-0199']), fill(['f1', '1998-03-03']), fill(['f1', '52000'])]);
  await agent.start();
  await agent.handleUser('my number is 555 0142'); // the model made up different digits
  assert.equal(dom.has('f1'), false);
  assert.equal(log.said.at(-1), agent.phrases.not_understood);
  await agent.handleUser('3 de marzo de 1998'); // reformatting what was said is interpreting
  assert.equal(dom.get('f1'), '1998-03-03');
  await agent.handleUser('fifty two thousand'); // no digits to compare: trusted
  assert.equal(dom.get('f1'), '52000');
});

test('plain text from the model is spoken as a reply', async () => {
  const { agent, log } = setup([{ content: 'Es su nombre legal.', toolCalls: [] }]);
  await agent.start();
  await agent.handleUser('¿qué significa?');
  assert.equal(log.said.at(-1), 'Es su nombre legal.');
  assert.equal(agent.current.id, 'f1');
});

const nav = (action, field_id) => ({ content: '', toolCalls: [{ name: 'navigate', args: { action, field_id } }] });
const copyFrom = (field_id, copy_from) => ({ content: '', toolCalls: [{ name: 'fill_fields', args: { values: [{ field_id, copy_from }] } }] });

test('back and goto re-ask an earlier field; the answer replaces the old one', async () => {
  const { agent, log, dom } = setup([fill(['f1', 'Ana'], ['f2', 'Single']), nav('back'), fill(['f2', 'Married'])]);
  await agent.start();
  await agent.handleUser('Ana, soltera');
  assert.equal(agent.current.id, 'f3');
  await agent.handleUser('espera, vuelve');
  assert.equal(agent.current.id, 'f2');
  assert.match(log.said.at(-1), /ES:Marital status/);
  await agent.handleUser('casada');
  assert.equal(dom.get('f2'), 'Married');
  assert.equal(agent.current.id, 'f3'); // carries on after the corrected field
});

test('goto jumps to any field, then the skipped one is picked up again', async () => {
  const { agent, dom } = setup([nav('goto', 'f2'), fill(['f2', 'Single'])]);
  await agent.start();
  await agent.handleUser('primero el estado civil');
  assert.equal(agent.current.id, 'f2');
  await agent.handleUser('soltera');
  assert.equal(dom.get('f2'), 'Single');
  assert.equal(agent.current.id, 'f3');
  agent.filled.add('f3'); agent.filled.add('f4');
  await agent.advance();
  assert.equal(agent.current.id, 'f1'); // wraps round to what was left behind
});

test('back at the first question says so', async () => {
  const { agent, log } = setup([nav('back')]);
  await agent.start();
  await agent.handleUser('atrás');
  assert.equal(log.said.at(-2), agent.phrases.first_question);
  assert.equal(agent.current.id, 'f1');
});

test('clear empties a field and asks it again', async () => {
  const { agent, log, dom } = setup([fill(['f1', 'Ana']), nav('clear', 'f1'), fill(['f1', 'Eva'])]);
  await agent.start();
  await agent.handleUser('Ana');
  assert.equal(dom.get('f1'), 'Ana');
  await agent.handleUser('borra mi nombre');
  assert.equal(dom.has('f1'), false);
  assert.equal(agent.filled.has('f1'), false);
  assert.match(log.said.find((t) => t.startsWith(agent.phrases.cleared)), /ES:First name/);
  assert.equal(agent.current.id, 'f2'); // the open question is repeated, not changed
  await agent.handleUser('Eva, ahora sí');
  assert.equal(dom.get('f1'), 'Eva');
});

test('remaining lists what is left; readback hides private values', async () => {
  const { agent, log, dom } = setup([fill(['f1', 'Ana']), nav('remaining'), nav('readback')]);
  await agent.start();
  await agent.handleUser('Ana');
  await agent.handleUser('¿qué falta?');
  const left = log.said.find((t) => t.startsWith(agent.phrases.remaining));
  assert.match(left, /ES:Marital status.*ES:Social Security Number.*ES:Reason for visit/);
  assert.doesNotMatch(left, /First name/);
  await agent.handleUser('skip'); // marital status -> the private field comes up
  assert.equal(agent.current.id, 'f3');
  dom.set('f3', '123-45-6789');
  await agent.continueTyped();
  await agent.handleUser('léeme lo que llevo');
  const read = log.said.find((t) => t.includes('Ana') && t.includes(agent.phrases.typed_private));
  assert.match(read, /ES:First name: Ana/);
  assert.doesNotMatch(JSON.stringify(log.said), /123-45-6789/);
});

test('skip_section skips the rest of a section only', async () => {
  const sectioned = FIELDS.map((f, i) => ({ ...f, section: i < 3 ? 'Patient' : 'Visit' }));
  const { agent } = setup([nav('skip_section')]);
  agent.page.scan = async () => ({ fields: structuredClone(sectioned), texts: [], pageLang: 'en' });
  await agent.start();
  await agent.handleUser('salta esta sección');
  assert.deepEqual([...agent.skipped].sort(), ['f1', 'f2', 'f3']);
  assert.equal(agent.current.id, 'f4');
});

test('copy_from repeats a nonprivate answer; private and empty sources are refused', async () => {
  const { agent, log, dom } = setup([fill(['f1', 'Ana']), copyFrom('f4', 'f1'), copyFrom('f4', 'f3'), copyFrom('f2', 'f4')]);
  await agent.start();
  await agent.handleUser('Ana');
  await agent.handleUser('en el motivo pon lo mismo que mi nombre');
  assert.equal(dom.get('f4'), 'Ana');
  dom.delete('f4'); agent.filled.delete('f4'); agent.values.delete('f4');
  await agent.handleUser('copia el número de seguro');
  assert.equal(dom.has('f4'), false);
  await agent.handleUser('copia el motivo'); // the source is empty now
  assert.equal(dom.has('f2'), false);
  assert.ok(log.said.includes(agent.phrases.copied_nothing));
});

test('private numbers in pasted text never reach the model', async () => {
  const { agent, log, dom } = setup([fill(['f1', 'Ana'])]);
  await agent.start();
  await agent.handleUser('Me llamo Ana, mi seguro social es 123-45-6789 y mi tarjeta 4111 1111 1111 1111');
  assert.equal(JSON.stringify(log.llmMessages).includes('123-45-6789'), false);
  assert.equal(JSON.stringify(log.llmMessages).includes('4111'), false);
  assert.equal(dom.get('f1'), 'Ana');
  assert.ok(log.said.includes(agent.phrases.redacted));
});

test('a value containing a redacted placeholder is never written', async () => {
  const { agent, dom } = setup([fill(['f1', 'Ana [private]'])]);
  await agent.start();
  await agent.handleUser('Ana 123-45-6789');
  assert.equal(dom.has('f1'), false);
});

test('private value typed in chat goes straight to the field, never to the model or the log', async () => {
  const { agent, log, dom } = setup([fill(['f1', 'Ana'], ['f2', 'Single'])]);
  await agent.start();
  await agent.handleUser('Ana, soltera');
  assert.equal(agent.current.id, 'f3');
  assert.equal(await agent.submitPrivate('123-45-6789'), true);
  assert.equal(dom.get('f3'), '123-45-6789');
  assert.equal(agent.filled.has('f3'), true);
  assert.equal(agent.values.has('f3'), false);
  assert.ok(log.said.includes(agent.phrases.private_saved));
  assert.equal(agent.current.id, 'f4');
  assert.equal(JSON.stringify(log).includes('123-45-6789'), false);
  assert.equal(await agent.submitPrivate('nope'), false); // not a private field any more
});
