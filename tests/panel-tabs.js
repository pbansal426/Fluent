// Deterministic: a session belongs to its tab. On another tab it is hidden and silent; coming back restores it.
(async () => {
  const checks = {};
  const spoken = [];
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  window.SIM_SETTINGS = { lang: 'en', speak: true, live: false };
  window.SIM_ACTIVE_TAB = 1;
  window.SIM_BOOT = (w) => {
    Object.defineProperty(w, 'speechSynthesis', { configurable: true, value: { getVoices: () => [{ lang: 'en-US', name: 'Test' }], addEventListener() {}, cancel() {}, speak(u) { spoken.push(u.text); setTimeout(() => u.onend?.(), 0); } } });
    w.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    w.fetch = async (url, init) => {
      if (String(url).endsWith('/models')) return Response.json({ data: [{ id: 'test' }] });
      if (!/"tools"/.test(init?.body || '')) return Response.json({ choices: [{ message: { content: JSON.stringify({ form_language: 'English', fields: [], language: 'English' }) } }] });
      await gate; // a slow model turn, still running when the user leaves the tab
      return Response.json({ choices: [{ message: { tool_calls: [{ function: { name: 'ask_user', arguments: '{"message":"Late reply about the form."}' } }] } }] });
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
  const p = () => sim.panel();
  await wait(() => p()?.getElementById('start')?.textContent === 'Help me with this form');
  await sim.click('start');
  checks['session shows on its own tab'] = !p().getElementById('chat').hidden && p().getElementById('welcome').hidden;

  // Ask something; the model is slow. Meanwhile the user switches to another tab.
  p().getElementById('text').value = 'what is this?';
  p().getElementById('send-form').requestSubmit();
  await sim.sleep(200);
  window.SIM_ACTIVATE(2);
  await sim.sleep(100);
  checks['chat is hidden on another tab'] = p().getElementById('chat').hidden && p().getElementById('composer').hidden && p().getElementById('view-tabs').hidden;
  checks['other tab is told what is going on'] = !p().getElementById('away-note').hidden && !p().getElementById('back-tab').hidden && p().getElementById('welcome').hidden === false;
  const before = spoken.length;
  release();
  await sim.sleep(400);
  checks['nothing is spoken about the form while away'] = spoken.length === before;

  p().getElementById('back-tab').click();
  await sim.sleep(100);
  checks['go back button activates the form tab'] = (window.SIM_TAB_UPDATES || []).includes(1);
  window.SIM_ACTIVATE(1);
  await sim.sleep(200);
  checks['session is restored on its tab'] = !p().getElementById('chat').hidden && p().getElementById('away-note').hidden;
  checks['the late reply is waiting in the chat'] = [...p().querySelectorAll('.bubble.agent')].some((b) => /Late reply/.test(b.textContent));

  // Starting on the other tab replaces the session.
  window.SIM_ACTIVATE(2);
  window.SIM_ACTIVE_TAB = 2;
  await sim.sleep(100);
  await sim.click('start');
  checks['starting here begins a fresh session'] = !p().getElementById('chat').hidden && ![...p().querySelectorAll('.bubble.agent')].some((b) => /Late reply/.test(b.textContent));
  delete window.SIM_BOOT;
  return JSON.stringify({ checks, summary: `${Object.values(checks).filter(Boolean).length}/${Object.keys(checks).length} passed` });
})();
