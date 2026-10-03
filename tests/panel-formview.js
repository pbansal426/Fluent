// Deterministic: the Form tab lists the form as editable rows; edits reach the page.
(async () => {
  const checks = {};
  window.SIM_SETTINGS = { lang: 'en', speak: false, live: false };
  window.SIM_BOOT = (w) => {
    w.fetch = async (url) => {
      if (url.endsWith('/models')) return Response.json({ data: [{ id: 'test' }] });
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
  checks['tabs appear after start'] = !p().getElementById('view-tabs').hidden;
  p().getElementById('tab-form').click();
  await sim.sleep(200);
  checks['form view replaces chat'] = !p().getElementById('form-view').hidden && p().getElementById('chat').hidden && p().getElementById('composer').hidden;
  const rows = p().querySelectorAll('#form-view .frow');
  checks['one row per field'] = rows.length >= 15;
  const city = [...p().querySelectorAll('#form-view label')].find((l) => /^City/.test(l.textContent));
  const input = city && p().getElementById(city.htmlFor);
  input.value = 'Urbana';
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await sim.sleep(400);
  const pageCity = [...sim.page().querySelectorAll('input')].find((el) => /city/i.test(el.id + el.name));
  checks['edit reaches the form'] = pageCity?.value === 'Urbana';
  const ssn = [...p().querySelectorAll('#form-view input')].find((el) => el.type === 'password');
  checks['private row is masked'] = !!ssn;
  p().getElementById('tab-chat').click();
  await sim.sleep(100);
  checks['back to chat'] = p().getElementById('form-view').hidden && !p().getElementById('chat').hidden;
  delete window.SIM_BOOT;
  return JSON.stringify({ checks, summary: `${Object.values(checks).filter(Boolean).length}/${Object.keys(checks).length} passed` });
})();
