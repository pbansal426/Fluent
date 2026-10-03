import { test } from 'node:test';
import assert from 'node:assert/strict';
import { labelWidgets, findTwins } from '../extension/pdf/labels.js';

// Real geometry from the upper form on page 3 of the Spanish W-2 (fw2_es.pdf), PDF points.
const W = (id, x1, y1, x2, y2) => ({ id, x1, y1, x2, y2 });
const T = (x, y, w, str, h = 6) => ({ x, y, w, h, str });

const widgets = [
  W('ssn', 153, 732, 279, 744),
  W('ein', 38, 708, 330, 720),
  W('employer', 38, 636, 330, 696),
  W('first', 38, 588, 172, 600),
  W('last', 174, 588, 309, 600),
  W('suffix', 311, 588, 330, 600),
  W('address', 38, 516, 330, 586),
  W('box1', 333, 708, 452, 720),
  W('box2', 456, 708, 574, 720),
  W('code12a', 463, 588, 489, 600),
  W('amount12a', 491, 588, 574, 600),
  W('code12b', 463, 564, 489, 576),
  W('amount12b', 491, 564, 574, 576),
  W('statutory', 349, 578, 359, 588),
  W('retirement', 385, 578, 395, 588),
  W('state1', 38, 480, 64, 492),
  W('stateId1', 66, 480, 193, 492),
  W('state2', 38, 456, 64, 468),
  W('stateId2', 66, 456, 193, 468),
  W('localWages1', 361, 480, 445, 492),
  W('localWages2', 361, 456, 445, 468),
];
const items = [
  T(76, 740, 36, '22222', 10),
  T(157, 748, 4, 'a'),
  T(165, 748, 91, 'Núm. de seguro social del empleado'),
  T(289, 737, 71, 'Núm. de OMB 1545-0029'),
  T(42, 724, 4, 'b'),
  T(50, 724, 101, 'Núm. de identificación del empleador (EIN)'),
  T(42, 700, 4, 'c'),
  T(50, 700, 115, 'Nombre, dirección y código postal del empleador'),
  T(42, 604, 4, 'e'),
  T(50, 604, 56, 'Primer nombre e inicial'),
  T(177, 604, 21, 'Apellido'),
  T(313, 604, 10, 'Suf.'),
  T(42, 508, 2, 'f'),
  T(48, 508, 96, 'Dirección y código postal del empleado'),
  T(339, 724, 4, '1'),
  T(348, 724, 98, 'Salarios, propinas, otras compensaciones'),
  T(461, 724, 4, '2'),
  T(471, 724, 96, 'Impuesto federal sobre el ingreso retenido'),
  T(458, 604, 12, '12a'),
  T(458, 596, 12, 'Cód.'),
  T(458, 580, 12, '12b'),
  T(458, 572, 12, 'Cód.'),
  T(335, 592, 8, '13'),
  T(349, 595, 23, 'Empleado', 5),
  T(349, 590, 24, 'estatutario', 5),
  T(385, 595, 17, 'Plan de', 5),
  T(385, 590, 21, 'jubilación', 5),
  T(38, 496, 8, '15'),
  T(50, 496, 16, 'Estado', 5),
  T(71, 496, 33, 'Núm. ID estatal', 5),
  T(375, 496, 44, 'Salarios locales, etc.', 5),
  T(406, 445, 152, 'Departamento del Tesoro·Servicio de Impuestos Internos'),
  T(107, 436, 137, 'Comprobante de Salarios e Impuestos', 8),
];

const { labels, texts } = labelWidgets(widgets, items, 0); // pageHeight 0: no twin detection
const label = (id) => labels.get(id)?.text;

test('caption printed above the field, with its box letter or number', () => {
  assert.equal(label('ssn'), 'a Núm. de seguro social del empleado');
  assert.equal(label('ein'), 'b Núm. de identificación del empleador (EIN)');
  assert.equal(label('employer'), 'c Nombre, dirección y código postal del empleador');
  assert.equal(label('box1'), '1 Salarios, propinas, otras compensaciones');
  assert.equal(label('box2'), '2 Impuesto federal sobre el ingreso retenido');
});

test('neighbouring fields on one row each get their own caption', () => {
  assert.equal(label('first'), 'e Primer nombre e inicial');
  assert.equal(label('last'), 'Apellido');
  assert.equal(label('suffix'), 'Suf.');
  assert.equal(label('state1'), '15 Estado');
  assert.equal(label('stateId1'), 'Núm. ID estatal');
});

test('caption printed below the field', () => {
  assert.equal(label('address'), 'f Dirección y código postal del empleado');
});

test('two-line captions over checkboxes', () => {
  assert.equal(label('statutory'), 'Empleado estatutario');
  assert.equal(label('retirement'), 'Plan de jubilación');
});

test('uncaptioned fields inherit from the field to the left or above, numbered', () => {
  assert.equal(label('code12a'), '12a');
  assert.equal(label('amount12a'), '12a (2)');
  assert.equal(label('amount12b'), '12b (2)');
  assert.equal(label('state2'), '15 Estado (2)');
  assert.equal(label('stateId2'), 'Núm. ID estatal (2)');
  assert.equal(labels.get('stateId2').box, null);
});

test('a second-row field prefers the row above over unrelated text printed below it', () => {
  assert.equal(label('localWages1'), 'Salarios locales, etc.');
  assert.equal(label('localWages2'), 'Salarios locales, etc. (2)');
});

test('leftover lines are offered for translation, labels are not', () => {
  const lines = texts.map((t) => t.text);
  assert.ok(lines.includes('Comprobante de Salarios e Impuestos'));
  assert.ok(!lines.some((l) => l.includes('seguro social')));
  assert.ok(!lines.includes('22222'));
});

test('a form printed twice on one page is detected', () => {
  const upper = [W('a', 38, 708, 330, 720), W('b', 38, 636, 330, 696), W('c', 333, 708, 452, 720), W('d', 456, 708, 574, 720), W('e', 38, 588, 172, 600)];
  const lower = upper.map((w) => W(`${w.id}2`, w.x1, w.y1 - 396, w.x2, w.y2 - 396));
  const twins = findTwins([...upper, ...lower], 792);
  assert.equal(twins.size, 5);
  assert.equal(twins.get('a2'), 'a');
  assert.equal(findTwins(upper, 792).size, 0);
});

test("the PDF's own tooltip labels fields that have no readable caption above or below", () => {
  const ws = [
    { ...W('a', 100, 600, 300, 612), tip: 'Part 2. Information About You. 1.B. Enter Given Name, First Name.' }, // caption sits to the left
    { ...W('b', 100, 400, 300, 412), tip: 'Text Field 3' }, // generic: ignored
    { ...W('c', 100, 200, 300, 212), tip: 'Date of birth.' }, // has a good caption of its own
    { ...W('d', 100, 100, 300, 112), tip: 'Alien Registration Number' }, // only junk above
  ];
  const items = [T(100, 216, 60, 'Date of Birth'), T(100, 116, 4, '.')];
  const { labels } = labelWidgets(ws, items, 800);
  assert.equal(labels.get('a').text, 'Information About You: 1.B Enter Given Name, First Name');
  assert.equal(labels.get('b'), undefined);
  assert.equal(labels.get('c').text, 'Date of Birth');
  assert.equal(labels.get('d').text, 'Alien Registration Number');
});
