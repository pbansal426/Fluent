import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceDetector } from '../extension/lib/live.js';

const run = (d, levels, step = 40) => levels.map((l, i) => d.feed(l, i * step));

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

test('a noisy room raises the bar; low sensitivity needs louder speech', () => {
  const noisy = createVoiceDetector({ holdMs: 200 });
  for (let i = 0; i < 200; i++) noisy.feed(0.05, i * 40); // steady room noise
  assert.equal(run(noisy, Array(10).fill(0.06), 40).some(Boolean), false);
  const low = createVoiceDetector({ holdMs: 200, sensitivity: 'low' });
  assert.equal(run(low, Array(10).fill(0.04)).some(Boolean), false);
  const high = createVoiceDetector({ holdMs: 200, sensitivity: 'high' });
  assert.equal(run(high, Array(10).fill(0.04)).some(Boolean), true);
});
