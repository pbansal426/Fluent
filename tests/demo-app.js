// The demo page end to end, with the real model: upload a PDF (the same path as the Upload button), start the
// assistant in the sidebar, answer by typing, and read the answers back out of the form on the left.
//   node tests/run-harness.mjs "http://127.0.0.1:8780/demo/app/?lang=en&speak=0&live=0" x.png @tests/demo-app.js
(async () => {
  const checks = {};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const wait = async (condition, what, tries = 400) => {
    for (let i = 0; i < tries; i++) { if (await condition()) return; await sleep(100); }
    throw new Error(`timed out waiting for ${what}`);
  };
  const side = () => document.getElementById('side').contentDocument;
  const form = () => document.getElementById('form').contentDocument;
  const idle = () => wait(() => !side().querySelector('.thinking') && !side().getElementById('chat').hidden, 'the assistant to finish its turn', 900);

  await wait(() => side()?.getElementById('start')?.textContent, 'the sidebar');
  checks['sidebar shows the start button'] = /form/i.test(side().getElementById('start').textContent);
  checks['sample forms are listed'] = document.querySelectorAll('#samples button').length >= 1;

  // Upload: fetch a real PDF as a File and hand it over exactly as the file picker would.
  const blob = await (await fetch('/i-9.pdf')).blob();
  await demo.loadFile(new File([blob], 'i-9.pdf', { type: 'application/pdf' }));
  await wait(() => document.getElementById('form').contentWindow.__fluent?.pdfReady === true, 'the PDF to draw');
  checks['uploaded PDF is drawn with fields'] = form().querySelectorAll('#annotations input').length > 5;

  side().getElementById('start').click();
  await wait(() => !side().getElementById('chat').hidden, 'the chat');
  await idle();
  const bubbles = () => [...side().querySelectorAll('.bubble.agent')].map((b) => b.textContent);
  checks['the assistant greets and asks the first question'] = bubbles().some((t) => /Fluent/.test(t)) && bubbles().some((t) => /last name|family name/i.test(t));

  const say = async (text) => {
    side().getElementById('text').value = text;
    side().getElementById('send-form').requestSubmit();
    await sleep(300);
    await idle();
  };
  await say('Lopez Garcia');
  await say('Maria Elena');
  const value = (label) => {
    const el = [...form().querySelectorAll('#annotations section')].find((s) => new RegExp(label, 'i').test(s.getAttribute('title') || ''))?.querySelector('input');
    return el?.value || '';
  };
  checks['answers land in the uploaded form'] = /lopez garc/i.test(value('Last Name')) && /maria/i.test(value('First Name'));

  // Picking a sample replaces the form and starts a fresh conversation.
  demo.loadUrl('/demo/intake.html');
  await wait(() => form().getElementById?.('first') || form().querySelector('input'), 'the sample form');
  await sleep(500);
  checks['a new form resets the conversation'] = !side().getElementById('welcome').hidden;
  return JSON.stringify({ checks, summary: `${Object.values(checks).filter(Boolean).length}/${Object.keys(checks).length} passed` });
})();
