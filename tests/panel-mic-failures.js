// Deterministic failures; this does not verify a real microphone.
(async () => {
  const checks = {};
  const wait = async (condition) => {
    for (let i = 0; i < 200; i++) { if (condition()) return; await sim.sleep(30); }
    throw new Error('condition timed out');
  };
  for (const fault of ['pending-mic', 'pending-recognition', 'missing-handler']) {
    let calls = 0;
    window.SIM_SETTINGS = { lang: 'en', speak: false, live: false };
    window.SIM_BOOT = (w) => {
      w.webkitSpeechRecognition = class {
        start() { if (fault === 'missing-handler') setTimeout(() => this.onerror?.({ error: 'not-allowed' }), 0); }
        abort() {} // Chrome never emits onend
      };
      w.navigator.mediaDevices.getUserMedia = () => fault === 'pending-mic' ? new Promise(() => {}) : Promise.resolve({ getTracks: () => [{ stop() {} }] });
      w.fetch = async (url) => {
        if (url.endsWith('/models')) return Response.json({ data: [{ id: 'test' }] });
        calls++;
        return Response.json({ choices: [{ message: { tool_calls: [{ function: { name: 'ask_user', arguments: '{"message":"Your typed message was received."}' } }] } }] });
      };
    };
    const frame = document.getElementById('panel');
    const loaded = new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }));
    frame.srcdoc = frame.srcdoc;
    await loaded;
    await wait(() => sim.panel()?.getElementById('start')?.textContent === 'Help me with this form');
    await sim.click('start');
    sim.panel().getElementById('mic').click();
    if (fault === 'missing-handler') {
      await wait(() => /missing-handler/.test(sim.state().banner || ''));
      checks['old content script failure gives reload advice'] = /Reload the form tab/.test(sim.state().banner);
    } else await sim.sleep(100);
    await sim.say(`A typed question during ${fault}`);
    checks[`typed turn replies during ${fault}`] = calls === 1 && sim.state().bubbles.some((b) => b.includes('Your typed message was received.'));
    checks[`composer available after ${fault}`] = !sim.state().textDisabled && sim.panel().getElementById('interim').hidden;
  }
  delete window.SIM_BOOT;
  return JSON.stringify({ checks, summary: `${Object.values(checks).filter(Boolean).length}/${Object.keys(checks).length} passed` });
})();
