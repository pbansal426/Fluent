import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSpeech, pickVoice, spokenText, splitSentences } from '../extension/lib/speech.js';
import { createNeuralTts, pickNeuralVoice } from '../extension/lib/neural-tts.js';

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

test('the most natural installed voice is chosen and novelty voices never are', () => {
  const voices = [
    { name: 'Albert', lang: 'en-US' },
    { name: 'Fred', lang: 'en-US' },
    { name: 'Samantha', lang: 'en-US' },
    { name: 'Zoe (Premium)', lang: 'en-US' },
    { name: 'Google US English', lang: 'en-US', localService: false },
    { name: 'Monica', lang: 'es-ES' },
    { name: 'Google español de Estados Unidos', lang: 'es-US', localService: false },
  ];
  assert.equal(pickVoice(voices, 'en-US').name, 'Zoe (Premium)');
  assert.equal(pickVoice(voices, 'es-US').name, 'Google español de Estados Unidos');
  assert.equal(pickVoice([{ name: 'Albert', lang: 'en-US' }], 'en-US'), null);
  assert.equal(pickVoice(voices, 'ja-JP'), null);
});

test('markup and symbols are not read aloud', () => {
  assert.equal(spokenText('**Got it.**  Name \u2192 Maria \u2014 done'), 'Got it. Name, Maria, done');
});

test('neural voice plays sentence by sentence, prefetches ahead, stops on interrupt and falls back on failure', async () => {
  const requested = [];
  const played = [];
  globalThis.URL.createObjectURL = (b) => `blob:${b.text}`;
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    requested.push(body.input);
    assert.match(url, /\/audio\/speech$/);
    assert.equal(init.headers.Authorization, 'Bearer KEY');
    return { ok: true, blob: async () => ({ text: body.input }) };
  };
  const audioFactory = (url) => {
    const a = { url, pause() { a.paused = true; }, play: async () => { played.push(url); setTimeout(() => a.onended?.(), 0); } };
    return a;
  };
  const tts = createNeuralTts({ apiKey: 'KEY', fetchImpl, audioFactory });
  await tts.speak('First. Second. Third.', 'en-US');
  assert.deepEqual(played, ['blob:First.', 'blob:Second.', 'blob:Third.']);
  assert.deepEqual(requested, ['First.', 'Second.', 'Third.']);

  // an interrupt stops further clips
  played.length = 0;
  let stopped = false;
  const audioStop = (url) => ({ url, pause() {}, play: async () => { played.push(url); stopped = true; setTimeout(() => {}, 0); } });
  const tts2 = createNeuralTts({ apiKey: 'KEY', fetchImpl, audioFactory: (u) => { const a = audioStop(u); setTimeout(() => a.onended?.(), 0); return a; } });
  await tts2.speak('One. Two.', 'en-US', () => stopped);
  assert.equal(played.length, 1);

  // a failing service rejects, and speech.js then falls back to the browser voice
  const failing = createNeuralTts({ apiKey: 'KEY', fetchImpl: async () => ({ ok: false, status: 401 }), audioFactory });
  await assert.rejects(failing.speak('Hello.', 'en-US'), /401/);
  let browserSpoke = false;
  globalThis.speechSynthesis = { getVoices: () => [{ lang: 'en-US', name: 'Test' }], cancel() {}, speak: (u) => { browserSpoke = true; setTimeout(() => u.onend?.(), 0); } };
  globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  try {
    const speech = createSpeech();
    speech.setNeural(failing);
    const warn = console.warn; console.warn = () => {};
    await speech.speak('Hello there.', 'en-US');
    console.warn = warn;
    assert.equal(browserSpoke, true);
    assert.equal(speech.neural, false); // fell back for the rest of the session
  } finally { delete globalThis.speechSynthesis; delete globalThis.SpeechSynthesisUtterance; }
});

test('splitSentences avoids breaking on abbreviations, box numbers and decimals', () => {
  assert.deepEqual(splitSentences('a Núm. de seguro social del empleado. Esta respuesta es privada.'), [
    'a Núm. de seguro social del empleado.',
    'Esta respuesta es privada.',
  ]);
  assert.deepEqual(splitSentences('Please send to Dr. Watson on 5th Ave. in New York. Next question: what is your name?'), [
    'Please send to Dr. Watson on 5th Ave. in New York.',
    'Next question: what is your name?',
  ]);
  assert.deepEqual(splitSentences('Look at Box b. Enter your EIN.'), [
    'Look at Box b. Enter your EIN.',
  ]);
  assert.deepEqual(splitSentences('The total is $12.50 today. Can you pay now?'), [
    'The total is $12.50 today.',
    'Can you pay now?',
  ]);
});

test('spokenText expands ISO dates into natural spoken words', () => {
  assert.equal(spokenText('Date of birth: 1990-05-05', 'en'), 'Date of birth: May 5th, 1990');
  assert.equal(spokenText('Fecha: 1990-05-05', 'es'), 'Fecha: 5 de mayo de 1990');
});

test('spokenText expands street abbreviations and acronym phonetics', () => {
  assert.equal(spokenText('123 Elm St. Apt. 4B', 'en'), '123 Elm Street Apartment 4B');
  assert.equal(spokenText('123 Calle Norte Apt. 4B', 'es'), '123 Calle Norte Apartamento 4B');
  assert.equal(spokenText('Enter your SSN and EIN', 'en'), 'Enter your S-S-N and E-I-N');
});

test('pickNeuralVoice selects appropriate high-fidelity neural voices per language', () => {
  assert.equal(pickNeuralVoice('es'), 'es-US-PalomaNeural');
  assert.equal(pickNeuralVoice('es-MX'), 'es-US-PalomaNeural');
  assert.equal(pickNeuralVoice('en'), 'en-US-AvaMultilingualNeural');
  assert.equal(pickNeuralVoice('en-US'), 'en-US-AvaMultilingualNeural');
  assert.equal(pickNeuralVoice('hi'), 'hi-IN-SwaraNeural');
  assert.equal(pickNeuralVoice('zh'), 'zh-CN-XiaoxiaoNeural');
  assert.equal(pickNeuralVoice('unknown'), 'en-US-AvaMultilingualNeural');
});

test('createNeuralTts propagates language voice to audio endpoint', async () => {
  let requestedVoice = null;
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    requestedVoice = body.voice;
    return { ok: true, blob: async () => ({ text: body.input }) };
  };
  const audioFactory = (url) => {
    const a = {
      url,
      pause() {},
      play: async () => { setTimeout(() => a.onended?.(), 0); },
    };
    return a;
  };
  const tts = createNeuralTts({ fetchImpl, audioFactory });
  await tts.speak('Hola, ¿cómo estás?', 'es');
  assert.equal(requestedVoice, 'es-US-PalomaNeural');

  await tts.speak('Hello, how can I help?', 'en');
  assert.equal(requestedVoice, 'en-US-AvaMultilingualNeural');
});


