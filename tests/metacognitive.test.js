import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MetacognitiveResolver } from '../extension/lib/metacognitive.js';

test('MetacognitiveResolver detects common name homophones and prompts for confirmation', () => {
  const resolver = new MetacognitiveResolver();
  const field = { id: 'first_name', label: 'Legal first name', kind: 'text' };

  const resBryan = resolver.assessSpelling(field, 'Bryan', { said: 'Bryan', alternatives: ['Brian'], lang: 'en' });
  assert.equal(resBryan.needsConfirmation, true);
  assert.equal(resBryan.variantType, 'name_split');
  assert.deepEqual(resBryan.options, ['Bryan', 'Brian']);
  assert.match(resBryan.prompt, /with a Y or (?:Brian with )?an I/i);

  const resSaraEs = resolver.assessSpelling(field, 'Sara', { said: 'Sara', alternatives: ['Sarah'], lang: 'es' });
  assert.equal(resSaraEs.needsConfirmation, true);
  assert.match(resSaraEs.prompt, /con H o sin H/i);

  const resUnambiguous = resolver.assessSpelling(field, 'Maria', { said: 'Maria', alternatives: [], lang: 'en' });
  assert.equal(resUnambiguous.needsConfirmation, false);
  assert.equal(resUnambiguous.value, 'Maria');
});

test('MetacognitiveResolver skips confirmation when user already disambiguated in the same utterance', () => {
  const resolver = new MetacognitiveResolver();
  const field = { id: 'first_name', label: 'First name', kind: 'text' };

  const explicitY = resolver.assessSpelling(field, 'Brian', { said: 'Bryan with a Y', alternatives: ['Brian'], lang: 'en' });
  assert.equal(explicitY.needsConfirmation, false);
  assert.equal(explicitY.value, 'Bryan');

  const explicitNoH = resolver.assessSpelling(field, 'Sarah', { said: 'Sara without an H', alternatives: ['Sarah'], lang: 'en' });
  assert.equal(explicitNoH.needsConfirmation, false);
  assert.equal(explicitNoH.value, 'Sara');
});

test('MetacognitiveResolver resolves follow-up confirmation replies cleanly', () => {
  const resolver = new MetacognitiveResolver();

  const bryanPending = { fieldId: 'f1', candidate: 'Bryan', options: ['Bryan', 'Brian'] };
  assert.deepEqual(resolver.resolveConfirmation(bryanPending, 'with an I'), { resolved: true, value: 'Brian' });
  assert.deepEqual(resolver.resolveConfirmation(bryanPending, 'con Y'), { resolved: true, value: 'Bryan' });
  assert.deepEqual(resolver.resolveConfirmation(bryanPending, 'B R I A N'), { resolved: true, value: 'Brian' });

  const saraPending = { fieldId: 'f1', candidate: 'Sara', options: ['Sarah', 'Sara'] };
  assert.deepEqual(resolver.resolveConfirmation(saraPending, 'with an H'), { resolved: true, value: 'Sarah' });
  assert.deepEqual(resolver.resolveConfirmation(saraPending, 'without an H'), { resolved: true, value: 'Sara' });
  assert.deepEqual(resolver.resolveConfirmation(saraPending, 'sin h'), { resolved: true, value: 'Sara' });
});

test('MetacognitiveResolver normalizes spelled words (including NATO phonetics) and spoken emails', () => {
  const resolver = new MetacognitiveResolver();

  assert.equal(resolver.normalizeSpelledWord('S M I T H'), 'Smith');
  assert.equal(resolver.normalizeSpelledWord('B as in Boy, R, Y, A, N'), 'Bryan');
  assert.equal(resolver.normalizeEmail('john dot doe at gmail dot com'), 'john.doe@gmail.com');
  assert.equal(resolver.normalizeEmail('maria underscore lopez at yahoo dot com'), 'maria_lopez@yahoo.com');
});
