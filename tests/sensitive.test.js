import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../extension/lib/sensitive.js';

const field = (over) => ({ kind: 'text', inputType: 'text', label: '', name: '', htmlId: '', placeholder: '', autocomplete: '', maxLength: 0, ...over });

test('flags identity and financial numbers by label', () => {
  for (const label of [
    'Social Security Number',
    'SSN',
    'Passport number',
    "Driver's License Number",
    'Drivers licence no.',
    'Card number',
    'CVV',
    'Bank routing number',
    'Account number',
    'Taxpayer ID',
    'Alien Registration Number',
    'Member ID number',
    "Mother's maiden name",
    'Password',
  ]) {
    assert.equal(classify(field({ label })).sensitive, true, label);
  }
});

test('flags by name, id, type and autocomplete even when the label is vague', () => {
  assert.equal(classify(field({ label: 'Number', name: 'applicant_ssn' })).sensitive, true);
  assert.equal(classify(field({ label: 'Number', htmlId: 'passportNumber' })).sensitive, true);
  assert.equal(classify(field({ label: 'Secret', inputType: 'password' })).sensitive, true);
  assert.equal(classify(field({ label: 'Number', autocomplete: 'cc-number' })).sensitive, true);
});

test('leaves ordinary fields to voice', () => {
  for (const label of ['First name', 'Phone number', 'Date of birth', 'Street address', 'Occupation', 'Shipping option', 'Opinion', 'Email address', 'Spinal injury?']) {
    const c = classify(field({ label }));
    assert.equal(c.sensitive, false, label);
    assert.equal(c.long, false, label);
  }
});

test('long fields are typed', () => {
  assert.equal(classify(field({ kind: 'textarea', label: 'Reason for visit' })).long, true);
  assert.equal(classify(field({ label: 'Describe', maxLength: 500 })).long, true);
  assert.equal(classify(field({ label: 'ZIP', maxLength: 10 })).long, false);
});
