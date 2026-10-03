// Deterministic: language names, pasting an AI key, and the assistant speaking its reply after the user answers.
(async () => {
  const checks = {};
  const spoken = [];
  const urls = [];
  window.SIM_SETTINGS = { lang: 'en', speak: true, live: false };
  window.SIM_BOOT = (w) => {
    Object.defineProperty(w, 'speechSynthesis', { configurable: true, value: { getVoices: () => [{ lang: 'en-US', name: 'Test' }], addEventListener() {}, cancel() {}, speak(u) { spoken.push(u.text); setTimeout(() => u.onend?.(), 0); } } });
    w.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    w.fetch = async (url, init) => {
      urls.push(String(url));
      if (String(url).startsWith('https://api.openai.com/v1/models')) return Response.json({ data: [{ id: 'gpt-4o' }, { id: 'gpt-4.1-mini' }, { id: 'text-embedding-3-small' }] });
      if (String(url).endsWith('/models')) return Response.json({ data: [{ id: 'test' }] });
      if (!/"tools"/.test(init?.body || '')) return Response.json({ choices: [{ message: { content: JSON.stringify({ form_language: 'English', fields: [], language: 'English' }) } }] });
      return Response.json({ choices: [{ message: { tool_calls: [{ function: { name: 'ask_user', arguments: '{"message":"This is where you live."}' } }] } }] });
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

  const names = [...p().querySelectorAll('#lang option')].map((o) => o.textContent);
  checks['language names are the language only'] = names.includes('English') && names.includes('Español') && !names.some((n) => n.includes('—'));

  const key = p().getElementById('api-key');
  key.value = 'sk-proj-TESTKEY';
  key.dispatchEvent(new Event('input', { bubbles: true }));
  await wait(() => /OpenAI connected/.test(p().getElementById('settings-note').textContent));
  checks['pasted key selects the service'] = p().getElementById('base-url').value === 'https://api.openai.com/v1';
  checks['model chosen from the provider list'] = p().getElementById('model').value === 'gpt-4.1-mini';
  p().getElementById('use-local').click();
  await sim.sleep(300);
  checks['use local model resets'] = p().getElementById('base-url').value === 'http://localhost:1234/v1' && p().getElementById('api-key').value === '';

  await sim.click('start');
  const before = spoken.length;
  await sim.say('help me with this one'); // the user answers; the assistant must speak back
  checks['reply is spoken aloud after the user answers'] = spoken.slice(before).some((t) => /This is where you live\./.test(t));
  delete window.SIM_BOOT;
  return JSON.stringify({ checks, summary: `${Object.values(checks).filter(Boolean).length}/${Object.keys(checks).length} passed` });
})();
