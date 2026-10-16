// tests/panel-ui.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderMilestoneText,
  generateDocumentHintHtml,
  generateBilingualReviewHtml,
} from '../extension/panel/review-card.js';

test('renderMilestoneText formats current section and remaining field count', () => {
  const m = { index: 2, total: 4, title: 'Contact Details', remainingCount: 3, completed: false };
  assert.equal(renderMilestoneText(m, 'en'), 'Part 2 of 4: Contact Details · 3 left');
  assert.equal(renderMilestoneText(m, 'es'), 'Parte 2 de 4: Contact Details · faltan 3');
  assert.equal(renderMilestoneText(null, 'en'), '');
});

test('generateDocumentHintHtml renders annotated sample card with escaped text', () => {
  const hint = {
    id: 'insurance_group',
    cardTitle: 'Health Insurance Card',
    whereToLook: 'Look next to "GRP".',
    highlightZone: 'bottom-left',
    sampleCode: 'GRP: 748291',
  };
  const html = generateDocumentHintHtml(hint);
  assert.match(html, /Health Insurance Card/);
  assert.match(html, /GRP: 748291/);
  assert.match(html, /data-zone="bottom-left"/);
  assert.equal(generateDocumentHintHtml(null), '');
});

test('generateBilingualReviewHtml renders side-by-side items with edit buttons and masks private values', () => {
  const items = [
    {
      id: 'f1',
      label: 'Nombre legal',
      originalLabel: 'Legal Name',
      value: 'Maria Lopez',
      shownValue: 'Maria Lopez',
      section: 'Personal',
      sensitive: false,
    },
    {
      id: 'f2',
      label: 'Número de Seguro Social',
      originalLabel: 'Social Security Number',
      value: '999-88-7777',
      shownValue: '',
      section: 'Personal',
      sensitive: true,
    },
  ];

  const html = generateBilingualReviewHtml(items, 'es');
  assert.match(html, /Maria Lopez/);
  assert.match(html, /Nombre legal/);
  assert.match(html, /Legal Name/);
  assert.match(html, /data-edit-field="f1"/);
  assert.match(html, /escrito por usted, privado/);
  assert.doesNotMatch(html, /999-88-7777/);
  assert.match(html, /data-edit-field="f2"/);
});
