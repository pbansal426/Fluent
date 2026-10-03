import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../extension/content/listen.js', import.meta.url), 'utf8');

test('page recognition cancellation and errors settle without onend', async () => {
  let rec;
  const window = { SpeechRecognition: class { constructor() { rec = this; } start() {} abort() {} } };
  runInNewContext(source, { window, setTimeout, clearTimeout });
  const F = window.__fluent;
  const cancelled = F.listen('en-US');
  F.stopListening();
  assert.equal((await cancelled).text, '');
  const failed = F.listen('en-US');
  rec.onerror({ error: 'network' });
  assert.equal((await failed).error, 'network');
});
