// Runs tests/corpus.json (tricky things people actually say, each with the expected outcome) through the real
// agent and the real model, and prints a pass/fail table. Needs the AI endpoint (LM Studio) running.
//   node tools/run-corpus.mjs                 all cases
//   node tools/run-corpus.mjs email phone     only cases whose id starts with one of these
//   MODEL=google/gemma-4-26b-a4b-qat node tools/run-corpus.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createClient } from '../extension/lib/llm.js';
import { Agent } from '../extension/lib/agent.js';

const corpus = JSON.parse(readFileSync(new URL('../tests/corpus.json', import.meta.url), 'utf8'));
const only = process.argv.slice(2);
const base = { inputType: 'text', name: '', htmlId: '', autocomplete: '', placeholder: '', helpText: '', required: false, maxLength: 0, options: [], value: '', section: '' };
const model = process.env.MODEL || 'google/gemma-4-e4b';
const baseUrl = process.env.BASE_URL || 'http://localhost:1234/v1';
const apiKey = process.env.API_KEY || '';

function fieldsFor(key) {
  const def = corpus.fields[key];
  if (def.pair) {
    // A Yes / No question drawn as two checkboxes, the way government PDFs do it.
    return [
      { ...base, id: `${key}:yes`, kind: 'checkbox', label: `${def.pair}: Select Yes` },
      { ...base, id: `${key}:no`, kind: 'checkbox', label: `${def.pair}: Select No` },
    ];
  }
  return [{ ...base, id: key, ...def }];
}

async function runCase(c) {
  const keys = c.fields || [c.field];
  const fields = [...keys.flatMap(fieldsFor), { ...base, id: 'after', kind: 'text', label: 'Occupation notes' }];
  const dom = new Map();
  const said = [];
  const sent = [];
  const page = {
    scan: async () => ({ fields: structuredClone(fields), texts: [], pageLang: 'en', title: 'Test form' }),
    apply: async () => ({ ok: true }),
    highlight: async () => ({ ok: true }),
    focus: async () => ({ ok: true }),
    fill: async (id, value) => {
      const f = fields.find((x) => x.id === id);
      if (f.options?.length && value !== '' && !f.options.includes(value)) return { ok: false };
      if (value === '') dom.delete(id);
      else dom.set(id, value);
      return { ok: true, value };
    },
    read: async (id) => ({ ok: true, value: dom.get(id) || '' }),
  };
  const real = createClient({ baseUrl, model, apiKey, disableThinking: true });
  const llm = {
    chat: (o) => (sent.push(JSON.stringify(o.messages)), real.chat(o)),
    chatJson: (o) => (sent.push(JSON.stringify(o.messages)), real.chatJson(o)),
  };
  const ui = { say: async (t) => void said.push(t), prompt() {}, filled() {}, status() {}, language() {}, log() {}, error: (e) => said.push(`ERROR ${e.message}`) };
  const agent = new Agent({ llm, page, ui, userLang: c.lang || 'English' });
  const t0 = Date.now();
  await agent.start();
  await agent.translating;
  const before = said.length;
  for (const text of c.say) await agent.handleUser(text);
  const replies = said.slice(before);
  const valueOf = (key) => (corpus.fields[key].pair ? (dom.get(`${key}:yes`) === 'true' ? 'Yes' : dom.get(`${key}:no`) === 'true' ? 'No' : '') : String(dom.get(key) ?? ''));
  const expected = c.fills || { [c.field]: c.fill };
  const problems = [];
  const written = [];
  for (const [key, want] of Object.entries(expected)) {
    const value = valueOf(key);
    written.push(`${key}=${value || '(nothing)'}`);
    if (want === null) { if (value) problems.push(`${key}: wrote "${value}" but should have written nothing`); }
    else if (want !== undefined && !new RegExp(want, 'i').test(value)) problems.push(`${key}: wrote "${value}" which does not match /${want}/`);
  }
  const value = written.join(', ');
  const spoken = replies.filter((r) => !/^Got it\./i.test(r)).join(' | ');
  if (c.reply && !new RegExp(c.reply, 'i').test(spoken)) problems.push('gave no reply');
  if (c.noReply && new RegExp(c.noReply, 'i').test(spoken)) problems.push(`unhelpful reply: ${spoken}`);
  if (c.neverSent && sent.some((m) => m.includes(c.neverSent))) problems.push(`sent "${c.neverSent}" to the model`);
  if (c.noFillElsewhere) {
    // nothing may land in fields the case did not ask about (the trailing dummy field included)
    const stray = [...dom.keys()].filter((k) => !keys.some((key) => k === key || k.startsWith(`${key}:`)));
    if (stray.length) problems.push(`wrote into other fields: ${stray.join(', ')}`);
  }
  return { id: c.id, ok: !problems.length, problems, value, replies: spoken, ms: Date.now() - t0 };
}

const cases = corpus.cases.filter((c) => !only.length || only.some((p) => c.id.startsWith(p)));
const results = [];
for (const c of cases) {
  let r;
  try {
    r = await runCase(c);
  } catch (e) {
    r = { id: c.id, ok: false, problems: [`crashed: ${e.message}`], value: '', replies: '', ms: 0 };
  }
  results.push(r);
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(28)} ${String(r.ms).padStart(5)} ms  ${r.ok ? `${r.value || '(nothing written)'}` : r.problems.join('; ')}${!r.ok && r.replies ? `\n        replies: ${r.replies.slice(0, 200)}` : ''}`);
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed with ${model}`);
mkdirSync(new URL('../logs/', import.meta.url), { recursive: true });
writeFileSync(new URL('../logs/corpus-last.json', import.meta.url), JSON.stringify({ model, results }, null, 1));
process.exit(failed.length ? 1 : 0);
