import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FormSession, getDocumentHint, buildReviewItems, getRequiredDocumentsSummary } from '../extension/lib/form-session.js';

test('FormSession.fromSchema builds milestones and tracks completion accurately', () => {
  const schema = {
    title: 'Clinic Intake',
    sections: [
      {
        id: 'personal',
        title: 'Personal Info',
        fields: [
          { id: 'first_name', label: 'First Name', kind: 'text', required: true },
          { id: 'last_name', label: 'Last Name', kind: 'text', required: true },
          { id: 'dob', label: 'Date of Birth', kind: 'date', required: true },
        ],
      },
      {
        id: 'contact',
        title: 'Contact Details',
        fields: [
          { id: 'phone', label: 'Phone Number', kind: 'text', inputType: 'tel' },
          { id: 'email', label: 'Email Address', kind: 'text', inputType: 'email' },
        ],
      },
    ],
  };

  const session = FormSession.fromSchema(schema);
  assert.equal(session.getFields().length, 5);

  const initialMilestones = session.getMilestones();
  assert.equal(initialMilestones.length, 2);
  assert.equal(initialMilestones[0].title, 'Personal Info');
  assert.equal(initialMilestones[0].index, 1);
  assert.equal(initialMilestones[0].total, 2);
  assert.equal(initialMilestones[0].remainingCount, 3);
  assert.equal(initialMilestones[0].completed, false);

  const active = session.getCurrentMilestone('last_name');
  assert.equal(active.id, 'personal');
  assert.equal(active.index, 1);

  session.setValue('first_name', 'Elena');
  session.setValue('last_name', 'Rostova');
  session.setValue('dob', '1990-05-12');

  const updated = session.getMilestones();
  assert.equal(updated[0].completed, true);
  assert.equal(updated[0].remainingCount, 0);
  assert.equal(session.isComplete(), true);
});

test('FormSession.fromDOM groups fields by section or heading prefix into milestones', () => {
  const fields = [
    { id: 'f1', label: 'First Name', section: 'Patient' },
    { id: 'f2', label: 'Last Name', section: 'Patient' },
    { id: 'f3', label: 'Employer: Company Name', section: '' },
    { id: 'f4', label: 'Employer: Phone', section: '' },
  ];

  const session = FormSession.fromDOM(fields);
  const milestones = session.getMilestones();
  assert.equal(milestones.length, 2);
  assert.equal(milestones[0].title, 'Patient');
  assert.deepEqual(milestones[0].fieldIds, ['f1', 'f2']);
  assert.equal(milestones[1].title, 'Employer');
  assert.deepEqual(milestones[1].fieldIds, ['f3', 'f4']);
});

test('getDocumentHint returns visual card metadata for obscure document numbers and null for plain fields', () => {
  const groupHint = getDocumentHint({ label: 'Insurance Group Number' }, 'English');
  assert.ok(groupHint);
  assert.equal(groupHint.id, 'insurance_group');
  assert.match(groupHint.whereToLook, /GRP|Group/i);

  const groupHintEs = getDocumentHint({ label: 'Group Number' }, 'Spanish');
  assert.ok(groupHintEs);
  assert.match(groupHintEs.whereToLook, /tarjeta de seguro|GRP/i);

  const aNumHint = getDocumentHint({ label: 'Alien Registration Number (A-Number)' }, 'English');
  assert.ok(aNumHint);
  assert.equal(aNumHint.id, 'alien_number');
  assert.match(aNumHint.sampleCode, /^A-\d+/);

  const plainHint = getDocumentHint({ label: 'First Name' }, 'English');
  assert.equal(plainHint, null);
});

test('buildReviewItems creates bilingual review entries and masks sensitive fields', () => {
  const fields = [
    { id: 'f1', label: 'First name', kind: 'text', section: 'Personal', options: [] },
    { id: 'f2', label: 'Marital status', kind: 'select', section: 'Personal', options: ['Single', 'Married'] },
    { id: 'f3', label: 'Social Security Number', kind: 'text', section: 'Personal', sensitive: true, options: [] },
  ];
  const values = new Map([
    ['f1', 'María'],
    ['f2', 'Married'],
  ]);
  const filled = new Set(['f1', 'f2', 'f3']);
  const translations = new Map([
    ['f1', { label: 'Nombre', options: [], section: 'Personal' }],
    ['f2', { label: 'Estado civil', options: ['Soltera', 'Casada'], section: 'Personal' }],
    ['f3', { label: 'Número de Seguro Social', options: [], section: 'Personal' }],
  ]);

  const review = buildReviewItems({
    fields,
    values,
    filled,
    translations,
    typedPrivateLabel: 'typed by you, kept private',
  });

  assert.equal(review.length, 3);
  assert.deepEqual(review[0], {
    id: 'f1',
    label: 'Nombre',
    originalLabel: 'First name',
    value: 'María',
    shownValue: 'María',
    section: 'Personal',
    sensitive: false,
  });
  assert.equal(review[1].shownValue, 'Casada');
  assert.equal(review[1].value, 'Married');
  assert.equal(review[2].sensitive, true);
  assert.equal(review[2].value, '');
  assert.equal(review[2].shownValue, 'typed by you, kept private');
});

test('FormSession.markSkipped enforces state exclusivity and toPageAdapter supports headless/telephony sessions', async () => {
  const session = FormSession.fromSchema({
    title: 'Phone Intake',
    sections: [
      {
        id: 'sec1',
        title: 'Caller Info',
        fields: [
          { id: 'name', label: 'Caller Name', kind: 'text', required: true },
          { id: 'plan', label: 'Plan Tier', kind: 'select', options: ['Basic', 'Plus'] },
        ],
      },
    ],
  });

  const page = session.toPageAdapter();
  const scanned = await page.scan();
  assert.equal(scanned.fields.length, 2);

  const filled = await page.fill('name', 'Elena');
  assert.equal(filled.ok, true);
  assert.equal((await page.read('name')).value, 'Elena');

  const badOpt = await page.fill('plan', 'Invalid');
  assert.equal(badOpt.ok, false);

  const goodOpt = await page.fill('plan', 'Plus');
  assert.equal(goodOpt.ok, true);

  session.markSkipped('name');
  assert.equal(session.getValue('name'), null);
  assert.equal(session.isComplete(), false);
});

test('getRequiredDocumentsSummary deduplicates document hints across form fields and localizes', () => {
  const fields = [
    { id: 'f1', label: 'First Name' },
    { id: 'f2', label: 'Health Insurance Group Number' },
    { id: 'f3', label: 'Rx Group No' }, // duplicate insurance_group hint
    { id: 'f4', label: 'Alien Registration Number (A-Number)' },
  ];

  const docsEn = getRequiredDocumentsSummary(fields, 'English');
  assert.equal(docsEn.length, 2);
  assert.equal(docsEn[0].id, 'insurance_group');
  assert.equal(docsEn[0].cardTitle, 'Health Insurance Card');
  assert.equal(docsEn[1].id, 'alien_number');
  assert.equal(docsEn[1].cardTitle, 'USCIS Green Card / Work Permit');

  const docsEs = getRequiredDocumentsSummary(fields, 'Spanish');
  assert.equal(docsEs.length, 2);
  assert.equal(docsEs[0].cardTitle, 'Tarjeta de Seguro Médico');
  assert.equal(docsEs[1].cardTitle, 'Tarjeta de Residencia / Permiso (USCIS)');

  assert.deepEqual(getRequiredDocumentsSummary([], 'English'), []);
});

test('buildReviewItems includes skipped fields with skipped: true and localized skippedLabel', () => {
  const fields = [
    { id: 'f1', label: 'First name', kind: 'text', section: 'Personal', options: [] },
    { id: 'f2', label: 'Middle name', kind: 'text', section: 'Personal', options: [] },
  ];
  const values = new Map([['f1', 'Maria']]);
  const filled = new Set(['f1']);
  const skipped = new Set(['f2']);
  const translations = new Map([
    ['f1', { label: 'Nombre', options: [], section: 'Personal' }],
    ['f2', { label: 'Segundo nombre', options: [], section: 'Personal' }],
  ]);

  const review = buildReviewItems({
    fields,
    values,
    filled,
    skipped,
    translations,
    skippedLabel: 'omitido',
  });

  assert.equal(review.length, 2);
  assert.equal(review[0].id, 'f1');
  assert.equal(review[0].shownValue, 'Maria');
  assert.equal(review[0].skipped, undefined);

  assert.equal(review[1].id, 'f2');
  assert.equal(review[1].label, 'Segundo nombre');
  assert.equal(review[1].shownValue, 'omitido');
  assert.equal(review[1].skipped, true);
});

test('FormSession.fromSchema supports flat fields list without sections', () => {
  const schema = {
    title: 'Flat Form',
    fields: [
      { id: 'f1', label: 'First Name', kind: 'text' },
      { id: 'f2', label: 'Last Name', kind: 'text' },
    ],
  };
  const session = FormSession.fromSchema(schema);
  assert.equal(session.getFields().length, 2);
  assert.equal(session.getField('f1').label, 'First Name');
  assert.equal(session.getMilestones().length, 1);
});

