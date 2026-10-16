// tests/speech-vad.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceDetector, detectHesitation } from '../extension/lib/live.js';
import { createSpeech } from '../extension/lib/speech.js';

test('createVoiceDetector dynamically adjusts silenceMs for hesitant vs assertive speakers', () => {
  const detector = createVoiceDetector({ silenceMs: 600 });
  assert.equal(detector.silenceMs, 600);

  const hesitantMs = detector.setAdaptivePause({ hesitant: true });
  assert.equal(hesitantMs, 1800);
  assert.equal(detector.silenceMs, 1800);

  const normalMs = detector.setAdaptivePause({ hesitant: false });
  assert.equal(normalMs, 500);
  assert.equal(detector.silenceMs, 500);
});

test('detectHesitation spots trailing fillers, conjunctions, and thinking pauses in English and Spanish', () => {
  assert.equal(detectHesitation('404 Elm Street, um'), true);
  assert.equal(detectHesitation('My address is... let me see'), true);
  assert.equal(detectHesitation('Mi dirección es este...'), true);
  assert.equal(detectHesitation('404 Elm Street'), false);
  assert.equal(detectHesitation('Maria Lopez'), false);
});

test('speech.duckSpeaking immediately stops synthesis on user vocalization', async () => {
  let cancelled = false;
  globalThis.speechSynthesis = {
    getVoices: () => [{ lang: 'en-US', name: 'Samantha' }],
    cancel: () => { cancelled = true; },
    speak: () => {},
  };
  globalThis.SpeechSynthesisUtterance = class {};
  try {
    const speech = createSpeech();
    const p = speech.speak('Please tell me your full street address.', 'en-US');
    await Promise.resolve();
    speech.duckSpeaking();
    await p;
    assert.equal(cancelled, true);
  } finally {
    delete globalThis.speechSynthesis;
    delete globalThis.SpeechSynthesisUtterance;
  }
});
