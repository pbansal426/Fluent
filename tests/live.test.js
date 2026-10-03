import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceDetector } from '../extension/lib/live.js';

const run = (d, levels, start = 0, step = 40) => levels.map((l, i) => d.feed(l, start + i * step));

test('sustained loud sound counts as talking, a short blip does not', () => {
  const d = createVoiceDetector({ holdMs: 200 });
  const quiet = Array(20).fill(0.005);
  assert.equal(run(d, [...quiet, 0.2, 0.005, 0.005]).some(Boolean), false); // a click
  assert.equal(run(createVoiceDetector({ holdMs: 200 }), [...quiet, ...Array(10).fill(0.2)]).some(Boolean), true);
});

test('fires once per stretch of talking, then again after a pause', () => {
  const d = createVoiceDetector({ holdMs: 200 });
  const out = run(d, [...Array(5).fill(0.005), ...Array(12).fill(0.2), ...Array(5).fill(0.005), ...Array(12).fill(0.2)]);
  assert.equal(out.filter(Boolean).length, 2);
});

test('a noisy room raises the bar', () => {
  const noisy = createVoiceDetector({ holdMs: 200 });
  for (let i = 0; i < 200; i++) noisy.feed(0.05, i * 40); // steady room noise
  assert.equal(run(noisy, Array(10).fill(0.06), 9000).some(Boolean), false);
});

test("the assistant's own echo does not interrupt it, but a clearly louder user does", () => {
  const speakers = createVoiceDetector({ holdMs: 200, learnMs: 600 });
  speakers.arm(0);
  // 0.1 of echo for two seconds: learned during the first 600 ms, then ignored
  assert.equal(run(speakers, Array(50).fill(0.1)).some(Boolean), false);
  const user = createVoiceDetector({ holdMs: 200, learnMs: 600 });
  user.arm(0);
  const out = run(user, [...Array(20).fill(0.1), ...Array(15).fill(0.35)]); // user speaks over the echo
  assert.equal(out.some(Boolean), true);
});

test('with headphones (no echo) quiet speech still interrupts', () => {
  const d = createVoiceDetector({ holdMs: 200, learnMs: 600 });
  d.arm(0);
  assert.equal(run(d, [...Array(16).fill(0.004), ...Array(12).fill(0.06)]).some(Boolean), true);
});

test('desensitize makes a borderline voice stop triggering', () => {
  const d = createVoiceDetector({ holdMs: 200, learnMs: 0 });
  d.arm(0);
  assert.equal(run(d, Array(10).fill(0.04)).some(Boolean), true);
  d.disarm();
  d.desensitize();
  d.desensitize();
  d.arm(1000);
  assert.equal(run(d, Array(10).fill(0.04), 1000).some(Boolean), false);
});
