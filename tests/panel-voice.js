// Deterministic: one microphone button (mute / unmute), a status line, no interruption setting, no Form tab,
// and the build number shown. Speech and the model are doubles.
(async () => {
  const checks = {};
  window.SIM_SETTINGS = { lang: 'en', speak: false, live: true };
  window.SIM_BOOT = (w) => {
    w.webkitSpeechRecognition = class { start() {} abort() {} };
    w.navigator.mediaDevices.getUserMedia = () => new Promise(() => {}); // permission never answers: live detection is optional
    w.fetch = async (url, init) => {
      if (String(url).endsWith('/models')) return Response.json({ data: [{ id: 'test' }] });
      if (String(url).includes('8788')) return new Response(null, { status: 204 });
      if (!/"tools"/.test(init?.body || '')) return Response.json({ choices: [{ message: { content: JSON.stringify({ form_language: 'English', fields: [], language: 'English' }) } }] });
      return Response.json({ choices: [{ message: { tool_calls: [{ function: { name: 'ask_user', arguments: '{"message":"Okay."}' } }] } }] });
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

  checks['no Form tab'] = !p().getElementById('tab-form') && !p().getElementById('form-view');
  checks['no interruption setting'] = !p().getElementById('barge-in');
  checks['build number is shown'] = /build \d{4}-\d{2}-\d{2}/.test(p().getElementById('build').textContent);

  await sim.click('start');
  const mic = p().getElementById('mic');
  checks['mic button offers to mute'] = /mute/i.test(mic.getAttribute('aria-label')) && !/unmute/i.test(mic.getAttribute('aria-label'));
  mic.click();
  await sim.sleep(100);
  checks['muting shows muted state'] = mic.classList.contains('muted') && /muted/i.test(p().getElementById('live-status').textContent);
  checks['button now offers to unmute'] = /unmute/i.test(mic.getAttribute('aria-label'));
  checks['mic stays available while muted'] = !mic.disabled;
  mic.click();
  await sim.sleep(100);
  checks['unmuting clears muted state'] = !mic.classList.contains('muted');
  delete window.SIM_BOOT;
  return JSON.stringify({ checks, summary: `${Object.values(checks).filter(Boolean).length}/${Object.keys(checks).length} passed` });
})();
