// On the demo page, a Spanish speaker on an English form should see translated labels and descriptions on the form.
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
  await wait(() => form().querySelectorAll('[data-fluent-badge]').length > 5, 900);
  const badges = [...form().querySelectorAll('[data-fluent-badge]')];
  return JSON.stringify({
    badgeCount: badges.length,
    sample: badges.slice(0, 5).map((b) => b.textContent.slice(0, 80)),
    toggleVisible: !side().getElementById('show-tr').parentElement.hidden,
  }, null, 1);
})();
