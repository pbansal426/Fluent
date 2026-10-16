// tests/panel-ui.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderMilestoneText,
  renderMilestoneHtml,
  generateInBubbleChipsHtml,
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
  assert.match(html, /data-action="print-review"/);
  assert.match(html, /data-action="new-session"/);
  assert.match(html, /data-action="export-json"/);
});

test('generateBilingualReviewHtml renders skipped items with Answer button and localized action buttons', () => {
  const items = [
    {
      id: 'f1',
      label: 'Middle name',
      originalLabel: 'Middle name',
      value: '',
      shownValue: 'skipped',
      section: 'Personal',
      sensitive: false,
      skipped: true,
    },
  ];

  const htmlEn = generateBilingualReviewHtml(items, 'en');
  assert.match(htmlEn, /is-skipped/);
  assert.match(htmlEn, />Answer</);
  assert.match(htmlEn, /Print \/ Save Bilingual Summary/);
  assert.match(htmlEn, /Start New Session/);
  assert.match(htmlEn, /Download Data \(JSON\)/);

  const htmlEs = generateBilingualReviewHtml([{ ...items[0], shownValue: 'omitido' }], 'es');
  assert.match(htmlEs, /is-skipped/);
  assert.match(htmlEs, />Responder</);
  assert.match(htmlEs, /Imprimir \/ Guardar resumen/);
  assert.match(htmlEs, /Iniciar nueva sesión/);
  assert.match(htmlEs, /Descargar datos \(JSON\)/);
});

test('renderMilestoneHtml renders animated progress track and percentage', () => {
  const m = { index: 1, total: 5, title: 'Personal', completedCount: 3, remainingCount: 7 };
  const html = renderMilestoneHtml(m, 'es');
  assert.match(html, /Parte 1 de 5: Personal · faltan 7/);
  assert.match(html, /milestone-track/);
  assert.match(html, /milestone-fill/);
  assert.match(html, /style="width:\s*30%"/);
});

test('generateInBubbleChipsHtml renders interactive button chips with escaped data values', () => {
  const chips = [
    { label: 'Sofía (con F)', value: 'con F' },
    { label: 'Sophia (con P-H)', value: 'con PH' },
  ];
  const html = generateInBubbleChipsHtml(chips);
  assert.match(html, /class="msg-chips"/);
  assert.match(html, /data-val="con F"[^>]*>Sofía \(con F\)</);
  assert.match(html, /data-val="con PH"[^>]*>Sophia \(con P-H\)</);
  assert.equal(generateInBubbleChipsHtml([]), '');
  assert.equal(generateInBubbleChipsHtml(null), '');
});

