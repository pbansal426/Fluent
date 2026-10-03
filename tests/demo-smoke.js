// The demo page works on the hardened server (no AI needed): sidebar loads, samples are listed, an uploaded PDF is drawn.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const wait = async (condition, tries = 300) => { for (let i = 0; i < tries; i++) { if (await condition()) return true; await sleep(100); } return false; };
  const side = () => document.getElementById('side').contentDocument;
  const form = () => document.getElementById('form').contentDocument;
  const checks = {};
  checks['sidebar loads'] = await wait(() => side()?.getElementById('start')?.textContent);
  checks['samples are listed'] = document.querySelectorAll('#samples button').length >= 8;
  const blob = await (await fetch('/fw2_es.pdf')).blob();
  await demo.loadFile(new File([blob], 'fw2_es.pdf', { type: 'application/pdf' }));
  checks['uploaded PDF is drawn'] = await wait(() => document.getElementById('form').contentWindow.__fluent?.pdfReady === true && form().querySelectorAll('#annotations input').length > 10);
  demo.loadUrl('/demo/intake-es.html');
  checks['a sample web form opens'] = await wait(() => form().querySelector('input#first'));
  checks['no key banner for the owner'] = document.getElementById('nokey').hidden;
  return JSON.stringify({ checks, summary: `${Object.values(checks).filter(Boolean).length}/${Object.keys(checks).length} passed` });
})();
