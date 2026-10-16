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

test('MetacognitiveResolver normalizes spelled words (including NATO phonetics and accents) and spoken emails', () => {
  const resolver = new MetacognitiveResolver();

  assert.equal(resolver.normalizeSpelledWord('S M I T H'), 'Smith');
  assert.equal(resolver.normalizeSpelledWord('B as in Boy, R, Y, A, N'), 'Bryan');
  assert.equal(resolver.normalizeSpelledWord('J O S É'), 'José');
  assert.equal(resolver.normalizeEmail('john dot doe at gmail dot com'), 'john.doe@gmail.com');
  assert.equal(resolver.normalizeEmail('maria underscore lopez at yahoo dot com'), 'maria_lopez@yahoo.com');

  const emailField = { id: 'email', label: 'Email address', kind: 'text', inputType: 'email' };
  const emailRes = resolver.assessSpelling(emailField, 'john dot doe at gmail dot com', { said: 'john dot doe at gmail dot com' });
  assert.equal(emailRes.needsConfirmation, false);
  assert.equal(emailRes.value, 'john.doe@gmail.com');
});

test('MetacognitiveResolver handles multi-word full names and preserves surnames upon confirmation', () => {
  const resolver = new MetacognitiveResolver();
  const fullField = { id: 'full_name', label: 'Full legal name', kind: 'text' };

  const res = resolver.assessSpelling(fullField, 'Bryan Lopez', { said: 'Bryan Lopez', alternatives: ['Brian Lopez'], lang: 'en' });
  assert.equal(res.needsConfirmation, true);
  assert.deepEqual(res.options, ['Bryan Lopez', 'Brian Lopez']);

  const resolved = resolver.resolveConfirmation(
    { fieldId: 'full_name', candidate: 'Bryan Lopez', options: res.options, baseOptions: res.baseOptions },
    'with an I'
  );
  assert.deepEqual(resolved, { resolved: true, value: 'Brian Lopez' });

  // Also detects homophones in middle or last name position of a multi-word name
  const resMiddle = resolver.assessSpelling(fullField, 'Maria Sara Lopez', { said: 'Maria Sara Lopez', alternatives: ['Maria Sarah Lopez'], lang: 'es' });
  assert.equal(resMiddle.needsConfirmation, true);
  assert.deepEqual(resMiddle.options, ['Maria Sarah Lopez', 'Maria Sara Lopez']);
  const resolvedMiddle = resolver.resolveConfirmation(
    { fieldId: 'full_name', candidate: 'Maria Sara Lopez', options: resMiddle.options, baseOptions: resMiddle.baseOptions },
    'con H'
  );
  assert.deepEqual(resolvedMiddle, { resolved: true, value: 'Maria Sarah Lopez' });
});

test('MetacognitiveResolver detects -teen vs -ty acoustic number ambiguities and resolves them', () => {
  const resolver = new MetacognitiveResolver();
  const ageField = { id: 'age', label: 'Age', kind: 'text' };
  const addressField = { id: 'address', label: 'Street address', kind: 'text' };

  // 14 vs 40 when alternatives contains counterpart
  const res14 = resolver.assessSpelling(ageField, '14', { said: '14', alternatives: ['40'], lang: 'en' });
  assert.equal(res14.needsConfirmation, true);
  assert.equal(res14.variantType, 'number_split');
  assert.deepEqual(res14.options, ['14', '40']);
  assert.match(res14.prompt, /14 or 40/i);

  // 15 vs 50 in Spanish street address
  const resStreetEs = resolver.assessSpelling(addressField, '15 Calle Mayor', { said: '15 Calle Mayor', alternatives: ['50 Calle Mayor'], lang: 'es' });
  assert.equal(resStreetEs.needsConfirmation, true);
  assert.deepEqual(resStreetEs.options, ['15 Calle Mayor', '50 Calle Mayor']);
  assert.match(resStreetEs.prompt, /15 o 50/i);

  // Skips confirmation if user already disambiguated ("14, one four")
  const disambiguated = resolver.assessSpelling(ageField, '14', { said: '14, one four', alternatives: ['40'], lang: 'en' });
  assert.equal(disambiguated.needsConfirmation, false);
  assert.equal(disambiguated.value, '14');

  // Resolves follow-up confirmations
  const pendingStreet = { fieldId: 'address', candidate: '14 Elm St', options: ['14 Elm St', '40 Elm St'] };
  assert.deepEqual(resolver.resolveConfirmation(pendingStreet, '40'), { resolved: true, value: '40 Elm St' });
  assert.deepEqual(resolver.resolveConfirmation(pendingStreet, 'forty'), { resolved: true, value: '40 Elm St' });
  assert.deepEqual(resolver.resolveConfirmation(pendingStreet, 'four zero'), { resolved: true, value: '40 Elm St' });
  assert.deepEqual(resolver.resolveConfirmation(pendingStreet, 'fourteen'), { resolved: true, value: '14 Elm St' });
  assert.deepEqual(resolver.resolveConfirmation(pendingStreet, 'the second one'), { resolved: true, value: '40 Elm St' });
});

