// Deterministic: a private field is typed in the chat box (masked) and goes straight to the form,
// never to the model, the transcript, or a spoken reply. Model and speech are doubles.
(async () => {
  const checks = {};
  const sent = [];
  const SSN = '123-45-6789';
  window.SIM_SETTINGS = { lang: 'en', speak: false, live: false };
  window.SIM_BOOT = (w) => {
    w.fetch = async (url, init) => {
      if (url.endsWith('/models')) return Response.json({ data: [{ id: 'test' }] });
      sent.push(init?.body || '');
      return Response.json({ choices: [{ message: { content: JSON.stringify({ form_language: 'English', fields: [], language: 'English' }) } }] });
    };
  };
  const frame = document.getElementById('panel');
  const loaded = new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }));
  frame.srcdoc = frame.srcdoc;
  await loaded;
  const wait = async (condition) => {
    for (let i = 0; i < 200; i++) { if (condition()) return; await sim.sleep(30); }
    throw new Error('condition timed out');
  };
  await wait(() => sim.panel()?.getElementById('start')?.textContent === 'Help me with this form');
  await sim.click('start');
  const p = () => sim.panel();
  // A number offered as ordinary chat text is hidden in the transcript and never sent to the model.
  await sim.say('My social is 987-65-4321');
  checks['chat-typed number hidden in transcript'] = !sim.state().bubbles.some((b) => b.includes('987-65-4321')) && sim.state().bubbles.some((b) => b.includes('[private]'));
  checks['chat-typed number never sent to the model'] = !sent.some((b) => b.includes('987-65-4321'));
  // Skip ahead (a bare "skip" needs no model) until the Social Security Number comes up.
  for (let i = 0; i < 12 && !/Social Security/i.test(sim.state().typeCard || ''); i++) await sim.say('skip');
  checks['private field is asked'] = /Social Security/i.test(sim.state().typeCard || '');
  checks['chat box stays usable'] = !sim.state().textDisabled;
  checks['chat box is masked'] = p().getElementById('text').type === 'password';
  p().getElementById('reveal').click();
  checks['show toggle unmasks'] = p().getElementById('text').type === 'text';
  p().getElementById('reveal').click();

  await sim.say(SSN);
  const field = [...sim.page().querySelectorAll('input')].find((el) => /ssn/i.test(el.id + el.name));
  checks['value reached the form'] = field?.value === SSN;
  checks['value never sent to the model'] = !sent.some((b) => b.includes(SSN));
  checks['transcript hides the value'] = !sim.state().bubbles.some((b) => b.includes(SSN)) && sim.state().bubbles.some((b) => b.includes('••••'));
  checks['moved on to the next field'] = !/Social Security/i.test(sim.state().typeCard || '') && !sim.state().bubbles.at(-1).includes('Social Security');
  checks['chat box unmasked again'] = p().getElementById('text').type === 'text';
  delete window.SIM_BOOT;
  return JSON.stringify({ checks, summary: `${Object.values(checks).filter(Boolean).length}/${Object.keys(checks).length} passed` });
})();
