// Demo page, English speaker on an English form: plain-language descriptions appear under the fields (no translation badges).
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const wait = async (condition, tries = 600) => { for (let i = 0; i < tries; i++) { if (await condition()) return true; await sleep(100); } return false; };
  const side = () => document.getElementById('side').contentDocument;
  const form = () => document.getElementById('form').contentDocument;
  await wait(() => side()?.getElementById('start')?.textContent);
  demo.loadUrl('/demo/intake.html');
  await wait(() => form().querySelector('input'));
  await sleep(500);
  side().getElementById('start').click();
  await wait(() => !side().getElementById('chat').hidden);
  await wait(() => form().querySelectorAll('.fluent-hint').length > 5, 900);
  const hints = [...form().querySelectorAll('.fluent-hint')];
  const badges = form().querySelectorAll('.fluent-badge:not(.fluent-hint)');
  return JSON.stringify({ hints: hints.length, translationBadges: badges.length, sample: hints.slice(0, 4).map((h) => h.textContent) }, null, 1);
})();
