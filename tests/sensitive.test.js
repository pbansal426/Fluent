import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../extension/lib/sensitive.js';

const field = (over) => ({ kind: 'text', inputType: 'text', label: '', name: '', htmlId: '', placeholder: '', autocomplete: '', maxLength: 0, ...over });

test('flags identity and financial numbers by label', () => {
  for (const label of [
    'Social Security Number',
    "a Employee's social security number",
    'a Núm. de seguro social del empleado',
    'b Núm. de identificación del empleador (EIN)',
    'Número de pasaporte',
    'Contraseña',
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
  for (const label of [
    'First name',
    'Phone number',
    'Date of birth',
    'Street address',
    'Occupation',
    'Shipping option',
    'Opinion',
    'Email address',
    'Spinal injury?',
    '3 Social security wages',
    '4 Social security tax withheld',
    '3 Salarios para el seguro social',
    '4 Impuesto del seguro social retenido',
    'e Primer nombre e inicial',
  ]) {
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

test('Spanish identity numbers on immigration forms are private', () => {
  for (const label of ['Número de Registro de Extranjero (Número A), si lo tiene', 'Número de pasaporte o documento de viaje', 'Número de Seguro Social de EE. UU. (si tiene uno)', 'Número de cuenta en línea de USCIS, si lo tiene']) {
    assert.equal(classify(field({ label })).sensitive, true, label);
  }
  for (const label of ['Ciudad o pueblo de nacimiento', 'País de nacimiento', 'Fecha de nacimiento', 'Número de apartamento, suite o piso', 'Fecha de vencimiento del pasaporte', 'País que emitió el pasaporte', 'Passport expiration date', 'Country that issued the passport', 'Driver license state']) {
    assert.equal(classify(field({ label })).sensitive, false, label);
  }
});
