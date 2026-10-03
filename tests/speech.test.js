import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSpeech } from '../extension/lib/speech.js';

test('cancel releases speech even when Chrome never emits onend', async () => {
  let spoke;
  globalThis.speechSynthesis = { getVoices: () => [{ lang: 'zz' }], cancel() {}, speak: () => { spoke = true; } };
  globalThis.SpeechSynthesisUtterance = class {};
  try {
    const speech = createSpeech();
    const pending = speech.speak('A question.', 'en-US');
    await Promise.resolve();
    assert.equal(spoke, true);
    speech.stopSpeaking();
    await pending;
  } finally { delete globalThis.speechSynthesis; delete globalThis.SpeechSynthesisUtterance; }
});

test('cancel releases recognition without onend; stale results cannot become an answer', async () => {
  globalThis.SpeechRecognition = class { start() {} abort() {} };
  try {
    const speech = createSpeech();
    const pending = speech.listen('en-US');
    speech.stopListening();
    assert.equal(await pending, '');
  } finally { delete globalThis.SpeechRecognition; }
});

test('recognition that never fires events times out', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let aborted = false;
  globalThis.SpeechRecognition = class { start() {} abort() { aborted = true; } };
  try {
    const pending = createSpeech().listen('en-US');
    const rejected = assert.rejects(pending, /timeout/);
    t.mock.timers.tick(20000);
    await rejected;
    assert.equal(aborted, true);
  } finally { delete globalThis.SpeechRecognition; }
});
