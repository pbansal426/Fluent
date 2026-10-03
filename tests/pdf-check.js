// Evaluated inside the PDF viewer by run-harness.mjs (needs fw2_es.pdf in the repo root, which is not in git):
//   node tests/run-harness.mjs "http://127.0.0.1:8765/extension/pdf/viewer.html?file=/fw2_es.pdf" shot.png @tests/pdf-check.js
(async () => {
  const out = { checks: {} };
  const check = (name, ok, detail) => (out.checks[name] = ok ? 'PASS' : `FAIL ${JSON.stringify(detail)}`);
  try {
    const F = window.__fluent;
    for (let i = 0; i < 100 && !F.pdfReady; i++) await new Promise((r) => setTimeout(r, 200));
    check('pdf rendered', F.pdfReady === true);
    out.page = document.getElementById('pageinfo').textContent;
    check('starts on first fillable page', out.page === 'Page 3 / 11', out.page);

    const scan = F.scan();
    out.fields = scan.fields.map((f) => `${f.id} ${f.kind} "${f.label}"${f.maxLength ? ' max' + f.maxLength : ''}`);
    out.texts = scan.texts.map((t) => t.text);
    const by = (start) => scan.fields.find((f) => f.label.startsWith(start));
    check('only the upper form is asked about', scan.fields.length >= 40 && scan.fields.length <= 47, scan.fields.length);
    check('ssn label', !!by('a Núm. de seguro social del empleado'), out.fields.slice(0, 3));
    check('name labels', !!by('e Primer nombre e inicial') && !!by('Apellido'));
    check('wage label', !!by('1 Salarios, propinas, otras compensaciones'));
    check('checkbox label', by('Empleado estatutario')?.kind === 'checkbox');
    check('title offered for translation', out.texts.includes('Comprobante de Salarios e Impuestos'), out.texts);
    check('toolbar not translated', !out.texts.some((t) => /Download|Open PDF/.test(t)));

    F.apply({
      fields: [{ id: by('e Primer nombre').id, label: 'e First name and initial', explanation: 'Your first name.', options: [] }],
      texts: [{ id: scan.texts[0].id, text: 'Translated line' }],
    });
    check('badge covers the caption', document.querySelectorAll('.fluentLabelLayer .fluent-badge').length === 2);

    const first = F.fill(by('e Primer nombre').id, 'Maria E.');
    const wages = F.fill(by('1 Salarios').id, '52000.00');
    const box = F.fill(by('Empleado estatutario').id, 'true');
    check('fill', first.ok && wages.ok && box.ok, { first, wages, box });

    const inputs = [...document.querySelectorAll('.annotationLayer input[type=text]')];
    check('lower copy mirrors the upper', inputs.filter((i) => i.value === 'Maria E.').length === 2 && inputs.filter((i) => i.value === '52000.00').length === 2);

    // The values must really be in the saved PDF: reopen the saved bytes and read the fields back.
    const pdfjs = await import('./lib/pdf.min.mjs');
    const saved = await pdfjs.getDocument({ data: await F.savePdf() }).promise;
    const widgets = (await (await saved.getPage(3)).getAnnotations()).filter((a) => a.subtype === 'Widget');
    out.savedValues = widgets.filter((a) => a.fieldValue && a.fieldValue !== 'Off').map((a) => `${a.fieldName.split('.').pop()}=${a.fieldValue}`);
    check('saved PDF holds the values', widgets.filter((a) => a.fieldValue === 'Maria E.').length === 2 && widgets.filter((a) => a.fieldValue === '52000.00').length === 2, out.savedValues);
  } catch (e) {
    out.error = String(e?.stack || e);
  }
  const passed = Object.values(out.checks).filter((v) => v === 'PASS').length;
  out.summary = `${passed}/${Object.keys(out.checks).length} passed`;
  return JSON.stringify(out, null, 1);
})();
