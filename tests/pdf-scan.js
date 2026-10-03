// Generic: how does the PDF pipeline see an arbitrary fillable PDF? Prints field count, kinds and labels.
//   node tests/run-harness.mjs "http://127.0.0.1:8777/extension/pdf/viewer.html?file=/i-765.pdf" x.png @tests/pdf-scan.js
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const F = window.__fluent;
  for (let i = 0; i < 150 && F?.pdfReady === false; i++) await sleep(200);
  const scan = await F.scan();
  const kinds = {};
  for (const f of scan.fields) kinds[f.kind] = (kinds[f.kind] || 0) + 1;
  return JSON.stringify({
    pdfLang: scan.pdfLang, title: scan.title, fields: scan.fields.length, kinds,
    unlabeled: scan.fields.filter((f) => !f.label || /^f?\d/.test(f.label) || f.label.length < 3).length,
    sample: scan.fields.slice(0, 40).map((f) => `${f.kind}${f.required ? '*' : ''} | ${f.section || ''} | ${f.label}${f.options?.length ? ' [' + f.options.slice(0, 4).join(',') + ']' : ''}`),
  }, null, 1);
})();
