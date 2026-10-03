import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupChoices, matchOption } from '../extension/lib/choices.js';

const cb = (id, label, extra = {}) => ({ id, kind: 'checkbox', label, options: [], sensitive: false, required: false, ...extra });
const text = (id, label) => ({ id, kind: 'text', label, options: [] });

test('Yes / No checkboxes become one question with two options', () => {
  const out = groupChoices([
    text('a', 'Family Name'),
    cb('y', 'Have you ever been issued an "alien crewman" visa?: Select Yes'),
    cb('n', 'Have you ever been issued an "alien crewman" visa?: Select No'),
    text('b', 'City'),
  ]);
  assert.deepEqual(out.map((f) => f.id), ['a', 'y', 'b']);
  assert.equal(out[1].kind, 'radio');
  assert.equal(out[1].label, 'Have you ever been issued an "alien crewman" visa?');
  assert.deepEqual(out[1].options, ['Yes', 'No']);
  assert.deepEqual(out[1].members.map((m) => m.id), ['y', 'n']);
});

test('long heading paths are cut down to the question', () => {
  const out = groupChoices([
    cb('m', 'Part 1. Information About You (Person applying for lawful permanent residence) 6. Sex. Select Male'),
    cb('f', 'Part 1. Information About You (Person applying for lawful permanent residence) 6. Sex. Select Female'),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].label, 'Sex');
  assert.deepEqual(out[0].options, ['Male', 'Female']);
});

test('lone checkboxes, "all that apply", private fields and different questions are left alone', () => {
  const lone = [cb('c', 'I have read and agree to the consent')];
  assert.deepEqual(groupChoices(lone), lone);
  const many = [cb('a', 'Which apply? Select all that apply. Select Cat'), cb('b', 'Which apply? Select all that apply. Select Dog')];
  assert.equal(groupChoices(many).length, 2);
  const different = [cb('a', 'Are you married?: Select Yes'), cb('b', 'Are you a student?: Select Yes')];
  assert.equal(groupChoices(different).length, 2);
  const same = [cb('a', 'Q: Select Yes'), cb('b', 'Q: Select Yes')]; // identical options cannot be told apart
  assert.equal(groupChoices(same).length, 2);
});

test('the chosen option is matched loosely', () => {
  assert.equal(matchOption(['Yes', 'No'], 'no'), 1);
  assert.equal(matchOption(['Yes', 'No'], 'Yes, I have'), 0);
  assert.equal(matchOption(['Male', 'Female'], 'female'), 1);
  assert.equal(matchOption(['Yes', 'No'], 'maybe'), -1);
  assert.equal(matchOption(['Sí', 'No'], 'si'), 0);
});
