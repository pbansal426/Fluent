// Deterministic: the owner's error "Could not establish connection. Receiving end does not exist."
// The page's helper script vanishes mid-session. Recoverable: the panel puts it back, re-links the fields and
// carries on. Unrecoverable: the user gets a plain message and a clean way to start again.
(async () => {
  const checks = {};
  window.SIM_SETTINGS = { lang: 'en', speak: false, live: false };
  const logged = [];
  window.SIM_BOOT = (w) => {
    w.fetch = async (url, init) => {
      if (String(url).includes('8788')) { try { logged.push(JSON.parse(init.body)); } catch {} return new Response(null, { status: 204 }); }
      if (String(url).endsWith('/models')) return Response.json({ data: [{ id: 'test' }] });
      return Response.json({ choices: [{ message: { content: JSON.stringify({ form_language: 'English', fields: [], language: 'English' }) } }] });
    };
  };
  const frame = document.getElementById('panel');
  const loaded = new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }));
  frame.srcdoc = frame.srcdoc;
  await loaded;
  const wait = async (condition) => {
    for (let i = 0; i < 300; i++) { if (condition()) return; await sim.sleep(30); }
    throw new Error('condition timed out');
  };
  const p = () => sim.panel();
  await wait(() => p()?.getElementById('start')?.textContent === 'Help me with this form');
  await sim.click('start');
  await sim.say('skip'); // first name skipped: now asking the last name
  const before = sim.state().bubbles.length;

  // the helper script disappears
  window.SIM_LOST = true;
  await sim.say('skip');
  checks['no error banner after recovery'] = !sim.state().banner;
  checks['conversation carried on'] = sim.state().bubbles.length > before && /Date of birth/i.test(sim.state().bubbles.at(-1));
  checks['chat is still showing'] = !p().getElementById('chat').hidden;
  const current = sim.page().querySelector('[data-fluent-id].fluent-current, [data-fluent-current]');
  checks['the page highlight works again'] = !!sim.page().querySelector('#dob')?.dataset.fluentId;

  // and now the page cannot be reached at all
  window.SIM_LOST = true;
  window.SIM_DEAD = true;
  p().getElementById('text').value = 'skip';
  p().getElementById('send-form').requestSubmit();
  await sim.sleep(2500);
  checks['plain message when it cannot recover'] = /lost the connection/i.test(p().getElementById('banner').textContent);
  checks['back to the start screen'] = !p().getElementById('welcome').hidden && p().getElementById('chat').hidden;
  delete window.SIM_LOST;
  delete window.SIM_DEAD;
  delete window.SIM_BOOT;
  return JSON.stringify({ lost: logged.filter((l) => /lost|relink|error/.test(l.event)).map((l) => JSON.stringify(l).slice(0, 200)), checks, summary: `${Object.values(checks).filter(Boolean).length}/${Object.keys(checks).length} passed` });
})();
