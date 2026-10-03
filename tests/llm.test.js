import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, stripThink, parseJsonLoose, strictify } from '../extension/lib/llm.js';

const ok = (message) => ({ ok: true, json: async () => ({ choices: [{ message }] }) });
const bad = (status, text = 'unsupported') => ({ ok: false, status, text: async () => text });

test('stripThink removes reasoning blocks', () => {
  assert.equal(stripThink('<think>hmm</think>Hola'), 'Hola');
  assert.equal(stripThink('leaked reasoning</think>\nHola'), 'Hola');
  assert.equal(stripThink(null), '');
});

test('parseJsonLoose handles fences and surrounding prose', () => {
  assert.deepEqual(parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonLoose('Sure! {"a":{"b":2}} hope that helps'), { a: { b: 2 } });
  assert.equal(parseJsonLoose('no json here'), null);
});

test('chat returns parsed tool calls and sends reasoning_effort none', async () => {
  const sent = [];
  const llm = createClient({
    baseUrl: 'http://x/v1/',
    model: 'm',
    fetchImpl: async (url, init) => {
      sent.push({ url, body: JSON.parse(init.body) });
      return ok({ content: '', tool_calls: [{ function: { name: 'fill_fields', arguments: '{"values":[{"field_id":"f1","value":"Ana"}]}' } }] });
    },
  });
  const res = await llm.chat({ messages: [], tools: [{}], toolChoice: 'required' });
  assert.equal(sent[0].url, 'http://x/v1/chat/completions');
  assert.equal(sent[0].body.reasoning_effort, 'none');
  assert.equal(sent[0].body.tool_choice, 'required');
  assert.deepEqual(res.toolCalls, [{ name: 'fill_fields', args: { values: [{ field_id: 'f1', value: 'Ana' }] } }]);
});

test('tool calls written into the text are recovered, debris is never returned as speech', async () => {
  const tools = [{ function: { name: 'fill_fields' } }, { function: { name: 'ask_user' } }];
  const reply = (content) => createClient({ baseUrl: 'http://x/v1', model: 'm', fetchImpl: async () => ok({ content }) }).chat({ messages: [], tools });

  const leaked = await reply('fill_fields{values:[{field_id:<|"|>f5<|"|>,value:<|"|>Maria<|"|>},{field_id:<|"|>f6<|"|>,value:<|"|>Lopez<|"|>}]}');
  assert.equal(leaked.content, '');
  assert.deepEqual(leaked.toolCalls, [{ name: 'fill_fields', args: { values: [{ field_id: 'f5', value: 'Maria' }, { field_id: 'f6', value: 'Lopez' }] } }]);

  const json = await reply('{"name": "ask_user", "arguments": {"message": "Which state?"}}');
  assert.deepEqual(json.toolCalls, [{ name: 'ask_user', args: { message: 'Which state?' } }]);

  assert.deepEqual(await reply('<|tool_call|>fill_fields{broken'), { content: '', toolCalls: [] });
  assert.equal((await reply('It is your legal first name.')).content, 'It is your legal first name.');
});

test('drops parameters the server rejects, and remembers', async () => {
  const bodies = [];
  const llm = createClient({
    baseUrl: 'http://x/v1',
    model: 'm',
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      bodies.push(body);
      return body.reasoning_effort ? bad(400) : ok({ content: 'hi' });
    },
  });
  assert.equal((await llm.chat({ messages: [] })).content, 'hi');
  await llm.chat({ messages: [] });
  assert.equal(bodies.length, 3);
  assert.equal(bodies[2].reasoning_effort, undefined);
});

test('unreachable endpoint gives a clear error', async () => {
  const llm = createClient({ baseUrl: 'http://x/v1', model: 'm', fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(() => llm.chat({ messages: [] }), (e) => e.kind === 'unreachable');
});

test('chatJson retries once on unparseable output', async () => {
  let n = 0;
  const llm = createClient({ baseUrl: 'http://x/v1', model: 'm', fetchImpl: async () => ok({ content: n++ ? '{"a":1}' : 'oops' }) });
  assert.deepEqual(await llm.chatJson({ messages: [] }), { a: 1 });
});

test('a pasted API key with invisible characters is cleaned before it is sent', async () => {
  let sent;
  const llm = createClient({ baseUrl: 'http://x/v1', model: 'm', apiKey: '\u200bsk-or-abc123\u200b ', fetchImpl: async (url, init) => { sent = init.headers.Authorization; return ok({ content: 'hi' }); } });
  await llm.chat({ messages: [] });
  assert.equal(sent, 'Bearer sk-or-abc123');
});

test('one network blip is retried quietly; a second one is reported', async () => {
  let calls = 0;
  const flaky = createClient({ baseUrl: 'http://x/v1', model: 'm', fetchImpl: async () => { calls++; if (calls === 1) throw new TypeError('Failed to fetch'); return ok({ content: 'hola' }); } });
  assert.equal((await flaky.chat({ messages: [] })).content, 'hola');
  assert.equal(calls, 2);
  const down = createClient({ baseUrl: 'http://x/v1', model: 'm', fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(down.chat({ messages: [] }), (e) => e.kind === 'unreachable');
});

test('strictify adds additionalProperties:false to every object in a schema', () => {
  const fmt = { type: 'json_schema', json_schema: { name: 'x', strict: true, schema: { type: 'object', properties: { a: { type: 'array', items: { type: 'object', properties: { b: { type: 'string' } }, required: ['b'] } } }, required: ['a'] } } };
  const out = strictify(fmt).json_schema.schema;
  assert.equal(out.additionalProperties, false);
  assert.equal(out.properties.a.items.additionalProperties, false);
  assert.equal(fmt.json_schema.schema.additionalProperties, undefined); // the original is untouched
});

test('chatJson survives prose, truncation and a rejected structured-output setting', async () => {
  const calls = [];
  const replies = [
    { content: 'Sure! Here is what you asked for, but no JSON.' }, // prose
    { content: '{"fields": [{"id": "f1"', finish: 'length' }, // cut off
    { content: '{"ok": true}' },
  ];
  const llm = createClient({
    baseUrl: 'http://x/v1', model: 'm',
    fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body);
      calls.push(body);
      const r = replies.shift();
      return { ok: true, json: async () => ({ choices: [{ finish_reason: r.finish || 'stop', message: { content: r.content } }] }) };
    },
  });
  const out = await llm.chatJson({ messages: [{ role: 'user', content: 'x' }], responseFormat: { type: 'json_schema', json_schema: { name: 'n', strict: true, schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] } } }, maxTokens: 1000 });
  assert.deepEqual(out, { ok: true });
  assert.equal(calls.length, 3);
  assert.match(calls[1].messages.at(-1).content, /only the JSON object/); // reminded after prose
  assert.equal(calls[2].max_tokens, 2000); // given more room after being cut off
  assert.equal(calls[0].response_format.json_schema.schema.additionalProperties, false);
});

test('a hopeless reply is reported with what the model said, for the log', async () => {
  const llm = createClient({ baseUrl: 'http://x/v1', model: 'm', fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'I cannot do that.' } }] }) }) });
  await assert.rejects(llm.chatJson({ messages: [] }), (e) => e.kind === 'bad_json' && /cannot do that/.test(e.raw));
});
