// Evaluated inside tests/panel-sim.html by run-harness.mjs (needs fw2_es.pdf in the repo root, which is not in git):
//   node tests/run-harness.mjs "http://127.0.0.1:8765/tests/panel-sim.html?page=/fw2_es.pdf&lang=en" shot.png @tests/panel-walkthrough-pdf.js
// The tab shows a PDF; pressing Start must reopen it in Fluent's viewer and begin the conversation in English.
(async () => {
  const out = {};
  try {
    await sim.sleep(1500);
    out.before = sim.state();
    await sim.click('start');
    out.pageUrl = document.getElementById('page').contentWindow.location.pathname;
    out.atSsn = sim.state();
    const input = (labelStart) => {
      const doc = sim.page();
      const a = [...doc.querySelectorAll('.fluent-pdf-label')].find((n) => n.firstChild.textContent.startsWith(labelStart));
      return doc.querySelector(`[aria-labelledby="${a.id}"]`);
    };
    const type = (labelStart, value) => {
      const el = input(labelStart);
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    type('a Núm.', '123-45-6789');
    await sim.click('continue');
    type('b Núm.', '12-3456789');
    await sim.click('continue');
    await sim.click('skip'); // employer name and address
    await sim.say('skip');   // control number
    await sim.say('My name is Maria Lopez');
    out.afterName = sim.state();
    out.checks = {
      'start label in English': out.before.start === 'Help me with this form',
      'pdf reopened in the Fluent viewer': out.pageUrl === '/extension/pdf/viewer.html',
      'first question is the private SSN, in English': /social security/i.test(out.atSsn.typeCard || '') && out.atSsn.textDisabled,
      'name filled from speech': /maria/i.test(input('e Primer nombre').value), // the last name may be asked separately
      'labels translated on the page': sim.page().querySelectorAll('.fluentLabelLayer .fluent-badge').length > 10,
      'no error banner': !out.afterName.banner,
    };
  } catch (e) {
    out.error = String(e?.stack || e);
    out.state = sim.state();
  }
  return JSON.stringify(out, null, 1);
})();
