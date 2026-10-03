import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectProvider, pickModel } from '../extension/lib/providers.js';

test('keys are recognised by their prefix, specific prefixes before plain sk-', () => {
  assert.equal(detectProvider('sk-ant-api03-abc').id, 'anthropic');
  assert.equal(detectProvider('sk-or-v1-abc').id, 'openrouter');
  assert.equal(detectProvider('sk-proj-abc').id, 'openai');
  assert.equal(detectProvider('sk-abc').id, 'openai');
  assert.equal(detectProvider('gsk_abc').id, 'groq');
  assert.equal(detectProvider('AIzaSyABC').id, 'gemini');
  assert.equal(detectProvider('xai-abc').id, 'xai');
  assert.equal(detectProvider('  sk-abc  ').id, 'openai'); // pasted with spaces
  assert.equal(detectProvider('hello'), null);
  assert.equal(detectProvider(''), null);
});

test('the model is chosen from what the provider actually lists', () => {
  const openai = detectProvider('sk-abc');
  assert.equal(pickModel(openai, ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1-mini', 'o3']), 'gpt-4.1-mini');
  assert.equal(pickModel(openai, ['o3', 'gpt-4o']), 'gpt-4o');
  assert.equal(pickModel(openai, ['something-new']), 'something-new');
  const router = detectProvider('sk-or-v1-abc');
  assert.equal(router.baseUrl, 'https://openrouter.ai/api/v1');
  assert.equal(pickModel(router, ['meta-llama/llama-3.3-70b-instruct', 'openai/gpt-4o-mini', 'openai/gpt-4.1-mini']), 'openai/gpt-4.1-mini');
  assert.equal(pickModel(router, ['meta-llama/llama-3.3-70b-instruct', 'google/gemini-2.5-flash']), 'google/gemini-2.5-flash');
  assert.equal(pickModel(router, ['mistralai/mistral-small']), 'mistralai/mistral-small'); // nothing preferred: the first listed
  const claude = detectProvider('sk-ant-x');
  assert.equal(pickModel(claude, ['claude-sonnet-5-5', 'claude-haiku-4-5-20251001']), 'claude-haiku-4-5-20251001');
  const gemini = detectProvider('AIzaX');
  assert.equal(pickModel(gemini, ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro']), 'gemini-2.5-flash');
  assert.equal(pickModel(gemini, []), '');
});
