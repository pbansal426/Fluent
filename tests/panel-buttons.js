// Deterministic: on a private field the Continue / Skip / Repeat buttons work at once, even while the assistant
// is speaking (they cut it short instead of waiting). Speech and the model are doubles.
(async () => {
  const checks = {};
  const spoken = [];
  let hold = false;
  window.SIM_SETTINGS = { lang: 'en', speak: true, live: false };
  window.SIM_BOOT = (w) => {
    Object.defineProperty(w, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => [{ lang: 'en-US', name: 'Test' }],
        addEventListener() {},
        cancel() {},
        speak(u) { spoken.push(u.text); if (!hold) setTimeout(() => u.onend?.(), 0); }, // while holding, the assistant "talks" until interrupted
      },
    });
    w.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    w.fetch = async (url, init) => {
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
  for (let i = 0; i < 12 && !/Social Security/i.test(sim.state().typeCard || ''); i++) await sim.say('skip');
  checks['private field card is shown'] = /Social Security/i.test(sim.state().typeCard || '');
  checks['card has a Repeat button'] = !!p().getElementById('repeat-card') && p().getElementById('repeat-card').textContent === 'Repeat';

  // Repeat while the assistant is quiet speaks the prompt again.
  const n0 = spoken.length;
  await sim.click('repeat-card');
  checks['Repeat says the prompt again'] = /type it in the box/i.test(spoken.slice(n0).join(' '));

  // Now the assistant is "still talking": the buttons must stay usable.
  hold = true;
  p().getElementById('repeat-card').click();
  await wait(() => document.getElementById('panel').contentDocument.querySelector('.thinking'));
  await sim.sleep(100);
  checks['buttons are not greyed out while speaking'] = ['continue', 'skip', 'repeat-card', 'repeat'].every((id) => !p().getElementById(id).disabled);
  hold = false;
  p().getElementById('skip').click(); // pressed while speaking
  await wait(() => !/Social Security/i.test(sim.state().typeCard || ''));
  await sim.idle();
  checks['Skip pressed mid-speech interrupts and skips the field'] = !/Social Security/i.test(sim.state().typeCard || '') && !sim.state().bubbles.at(-1).includes('Social Security');
  delete window.SIM_BOOT;
  return JSON.stringify({ checks, summary: `${Object.values(checks).filter(Boolean).length}/${Object.keys(checks).length} passed` });
})();
