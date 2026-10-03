// Generic: how does the scanner see a web form? Prints each question as the assistant would get it (after grouping,
// with private ones marked). Run inside the panel simulator:
//   node tests/run-harness.mjs "http://127.0.0.1:8777/tests/panel-sim.html?page=/demo/i485-es.html" x.png @tests/scan-web-form.js
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(800);
  const frame = document.getElementById('page');
  const doc = frame.contentDocument;
  for (const f of ['scan', 'overlay', 'fill']) {
    await new Promise((resolve, reject) => {
      const s = doc.createElement('script');
      s.src = `/extension/content/${f}.js`;
      s.onload = resolve;
      s.onerror = reject;
      doc.head.appendChild(s);
    });
  }
  const scan = await frame.contentWindow.__fluent.scan();
  const { classify } = await import('/extension/lib/sensitive.js');
  const { groupChoices } = await import('/extension/lib/choices.js');
  const fields = groupChoices(scan.fields.map((f) => ({ ...f, ...classify(f) })));
  return JSON.stringify({
    pageLang: scan.pageLang,
    questions: fields.length,
    private: fields.filter((f) => f.sensitive).map((f) => f.label),
    list: fields.map((f) => `${f.kind}${f.sensitive ? ' PRIVATE' : ''} | ${f.section ? f.section.slice(0, 28) + ' | ' : ''}${f.label}${f.options.length ? ' [' + f.options.slice(0, 5).join(', ') + ']' : ''}`),
  }, null, 1);
})();
