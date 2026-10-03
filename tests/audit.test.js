import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateValue, spokenEmail } from '../extension/lib/audit.js';

const f = (label, extra = {}) => ({ id: 'x', kind: 'text', label, options: [], ...extra });

test('the owner\'s screenshot: a placeholder email is rejected, a real one is normalised', () => {
  const email = f('Email address');
  const said = 'my first name dot last name at outlook.com';
  assert.equal(validateValue(email, 'my first name dot last name at outlook.com', said).ok, false);
  assert.equal(validateValue(email, 'firstname.lastname@outlook.com', said).ok, false);
  assert.deepEqual(validateValue(email, 'maria dot lopez at gmail dot com', 'maria dot lopez at gmail dot com'), { ok: true, value: 'maria.lopez@gmail.com' });
  assert.equal(validateValue(email, 'maria punto lopez arroba gmail punto com', '').value, 'maria.lopez@gmail.com');
  assert.equal(validateValue(email, 'maria@gmail', '').phrase, 'invalid_email');
  assert.equal(spokenEmail('maria underscore lopez at yahoo dot com'), 'maria_lopez@yahoo.com');
});

test('phone numbers need real digits', () => {
  const phone = f("Employee's Telephone Number");
  assert.equal(validateValue(phone, '217 555 0198', '').ok, true);
  assert.equal(validateValue(phone, '+1 (217) 555-0198', '').ok, true);
  assert.equal(validateValue(phone, '555', '').phrase, 'invalid_phone');
  assert.equal(validateValue(phone, 'call me tomorrow', '').ok, false);
});

test('postal codes and names', () => {
  assert.equal(validateValue(f('ZIP Code'), '61801', '').ok, true);
  assert.equal(validateValue(f('ZIP Code'), 'Urbana', '').ok, false);
  const first = f('Legal first name');
  assert.equal(validateValue(first, 'María Elena', '').ok, true);
  assert.equal(validateValue(first, "O'Brien-Smith Jr.", '').ok, true);
  assert.equal(validateValue(first, 'my first name', '').ok, false);
  assert.equal(validateValue(first, 'Maria 3', '').ok, false);
  assert.equal(validateValue(f('Street address'), '742 Green Street', '').ok, true); // not a name field
});

test('the whole sentence copied into a short field is not an answer, but long text fields may keep it', () => {
  const said = 'i work as a cook in a restaurant downtown';
  assert.equal(validateValue(f('Occupation'), said, said).phrase, 'invalid_echo');
  assert.equal(validateValue(f('Occupation'), 'Cook', said).ok, true);
  assert.equal(validateValue(f('Reason for visit', { kind: 'textarea', long: true }), said, said).ok, true);
  assert.equal(validateValue(f('Occupation'), 'Cook', 'cook').ok, true);
});

test('a hedge is not an answer to a choice, and scale words become digits', () => {
  const yesno = f('Have you ever used another name?', { kind: 'radio' });
  assert.equal(validateValue(yesno, 'Yes', 'maybe').phrase, 'invalid_unsure');
  assert.equal(validateValue(yesno, 'Yes', 'creo que sí').phrase, 'invalid_unsure');
  assert.equal(validateValue(yesno, 'No', 'no, never').ok, true);
  assert.equal(validateValue(f('Occupation'), 'maybe', 'maybe').ok, true); // only choices are guarded
  assert.equal(validateValue(f('Wages'), '1 million', '1 million').value, '1000000');
  assert.equal(validateValue(f('Wages'), '$2.5 mil', '').value, '2500');
  assert.equal(validateValue(f('Wages'), '3k dollars', '').value, '3000');
  assert.equal(validateValue(f('Wages'), 'about a million', '').value, 'about a million'); // not a plain number: left alone
});

test('one letter is only an answer for an initial', () => {
  assert.equal(validateValue(f('Legal first name'), 'G', 'the one that starts with G').phrase, 'invalid_letter');
  assert.equal(validateValue(f('Middle Initial'), 'E', 'E').ok, true);
  assert.equal(validateValue(f('Middle Initial'), 'E', 'my initial is E').ok, true);
});

test('choices, dates and checkboxes are left to their own matching', () => {
  for (const kind of ['checkbox', 'radio', 'select', 'date']) assert.equal(validateValue(f('Email address', { kind }), 'yes', '').ok, true);
});
