// Evaluated inside tests/panel-sim.html by run-harness.mjs:
//   node tests/run-harness.mjs http://127.0.0.1:8765/tests/panel-sim.html shot.png @tests/panel-walkthrough.js
// Drives the real panel UI through the start of a Spanish conversation, up to the private SSN field.
(async () => {
  const out = {};
  try {
    await sim.sleep(1500);
    out.before = sim.state();
    await sim.click('start');
    await sim.say('Me llamo María Elena López García y nací el 3 de marzo de 1998');
    await sim.say('mujer');
    await sim.say('estoy casada');
    out.atPrivateField = sim.state();
    sim.page().getElementById('ssn').value = '123-45-6789';
    await sim.click('continue');
    out.afterContinue = sim.state();
    const form = Object.fromEntries(new FormData(sim.page().getElementById('intake')));
    out.checks = {
      'start label in Spanish': out.before.start === 'Ayúdame con este formulario',
      'three answers filled': form.first_name === 'María Elena' && form.dob === '1998-03-03' && form.sex === 'Female' && form.marital_status === 'Married',
      'type card shown for SSN': /Seguro Social/i.test(out.atPrivateField.typeCard || ''),
      'panel input locked on private field': out.atPrivateField.textDisabled && out.atPrivateField.micDisabled,
      'continues to phone': out.afterContinue.typeCard === null && !out.afterContinue.textDisabled,
      'no error banner': !out.afterContinue.banner,
      'detected form language shown': out.afterContinue.formLanguage === 'Form language: English',
    };
  } catch (e) {
    out.error = String(e?.stack || e);
    out.state = sim.state();
  }
  return JSON.stringify(out, null, 1);
})();
