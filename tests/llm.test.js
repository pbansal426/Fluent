import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, stripThink, parseJsonLoose } from '../extension/lib/llm.js';

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
