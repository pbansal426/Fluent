// Real panel, deterministic model/speech doubles. No microphone or LM Studio needed.
(async () => {
  await sim.sleep(500);
  const p = sim.panel(), w = p.defaultView;
  const checks = {}, requests = [];
  let utterance, cancelled = 0, holdTurn, releaseTurn;
  w.speechSynthesis.getVoices = () => [{ lang: 'zz' }]; // no matching voice needed
  w.speechSynthesis.speak = (u) => { utterance = u; };
  w.speechSynthesis.cancel = () => { cancelled++; }; // intentionally never emits onend
  w.fetch = async (url, options) => {
    if (url.endsWith('/models')) return Response.json({ data: [{ id: 'test' }] });
    const body = JSON.parse(options.body);
    const input = body.messages.at(-1).content;
    requests.push(body);
    let message;
    if (body.tools) {
      if (holdTurn) await new Promise((r) => { releaseTurn = r; });
      message = { tool_calls: [{ function: { name: 'fill_fields', arguments: JSON.stringify({ values: [{ field_id: 'f1', value: input.includes('Bea') ? 'Bea' : 'Ana' }] }) } }] };
    } else {
      const data = JSON.parse(input);
      message = { content: JSON.stringify({ form_language: 'English', fields: Array.isArray(data) ? data.map((f) => ({ ...f, question: `What is your ${f.label}?`, english: f.label })) : [] }) };
    }
    return Response.json({ choices: [{ message }] });
  };
  const wait = async (test) => {
    for (let i = 0; i < 150; i++) { if (test()) return; await sim.sleep(50); }
    throw new Error('condition timed out');
  };
  const submit = (text) => { p.getElementById('text').value = text; p.getElementById('send-form').requestSubmit(); };
  p.getElementById('speak').checked = true;
  p.getElementById('save-settings').click();
  await sim.sleep(100);
  p.getElementById('start').click();
  await wait(() => !!utterance);
  checks['composer available during speech'] = !p.getElementById('text').disabled;
  submit('My first name is Ana');
  await wait(() => requests.some((r) => r.tools));
  checks['speech cancelled without waiting for onend'] = cancelled > 1;
  checks['typed turn received by model'] = requests.some((r) => r.tools && r.messages.at(-1).content === 'My first name is Ana');
  // Finish the reply's speech, then turn speech off to check queued text during model work.
  w.speechSynthesis.speak = (u) => setTimeout(() => u.onend?.(), 0);
  utterance?.onend?.();
  await sim.idle();
  holdTurn = true;
  submit('My first name is Ana');
  await wait(() => !!releaseTurn);
  submit('Change my first name to Bea');
  checks['queued message visible immediately'] = sim.state().bubbles.some((b) => b.includes('Change my first name to Bea'));
  holdTurn = false;
  releaseTurn();
  await sim.idle();
  checks['queued turn processed in order'] = sim.page().querySelector('[name="first_name"]').value === 'Bea';
  checks['no error banner'] = !sim.state().banner;
  return JSON.stringify({ checks, summary: `${Object.values(checks).filter(Boolean).length}/${Object.keys(checks).length} passed` });
})();
