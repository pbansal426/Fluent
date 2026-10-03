// Generic: walk every fillable page of a PDF in Fluent's viewer and print what the assistant would see.
//   node tests/run-harness.mjs "http://127.0.0.1:8777/extension/pdf/viewer.html?file=/i-485.pdf" x.png @tests/pdf-scan-all.js
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const F = window.__fluent;
  const pages = [];
  for (let i = 0; i < 60; i++) {
    for (let j = 0; j < 150 && F?.pdfReady === false; j++) await sleep(100);
    const scan = await F.scan();
    pages.push(scan.fields.map((f) => `${f.kind}${f.required ? '*' : ''} | ${f.label}${f.options?.length ? ' [' + f.options.slice(0, 3).join(',') + ']' : ''}`));
    const r = await F.nextPage();
    if (!r.moved) break;
  }
  return JSON.stringify({ pages: pages.length, fieldsPerPage: pages.map((p) => p.length), sample: pages.slice(1, 4) }, null, 1);
})();
