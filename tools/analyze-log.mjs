// Turns logs/fluent.log into a list of things worth looking at, per session:
// rejected or suspicious fills, "did not understand" loops, retries of the same words, slow turns, errors,
// user reports. Run it after trying the extension:   node tools/analyze-log.mjs [path] [--all]
import { readFileSync, existsSync } from 'node:fs';

const file = process.argv.find((a, i) => i > 1 && !a.startsWith('--')) || new URL('../logs/fluent.log', import.meta.url).pathname;
if (!existsSync(file)) {
  console.log(`No log yet at ${file}. Start the log server (node tools/log-server.mjs), reload the extension, and use it.`);
  process.exit(0);
}
const events = readFileSync(file, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => { try { return JSON.parse(l); } catch { return null; } })
  .filter(Boolean);

// A session starts at each "start" event.
const sessions = [];
for (const e of events) {
  if (e.event === 'start' || !sessions.length) sessions.push({ start: e, events: [] });
  sessions.at(-1).events.push(e);
}
const shown = process.argv.includes('--all') ? sessions : sessions.slice(-1);

const SLOW_MS = 6000;
const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

for (const s of shown) {
  const ev = s.events;
  const turns = ev.filter((e) => e.event === 'turn');
  const issues = [];
  const note = (kind, e, text) => issues.push(`  [${kind}] ${e.t?.slice(11, 19) || ''} ${text}`);

  ev.forEach((e, i) => {
    if (e.event === 'reject') note('rejected', e, `${e.field}: "${e.value}" (${e.reason})`);
    if (e.event === 'error') note('error', e, e.message);
    if (e.event === 'report') note('REPORT', e, `${e.note ? `"${e.note}" ` : ''}at field "${e.field}"\n${(e.transcript || []).slice(-8).map((l) => `        ${l}`).join('\n')}`);
    if (e.event === 'turn' && e.ms > SLOW_MS) note('slow', e, `${e.ms} ms for "${e.said}"`);
    if (e.event === 'turn' && !e.calls?.length && !e.content) note('no-tool', e, `the model called no tool for "${e.said}"`);
    if (e.event === 'fill') {
      const said = [...ev.slice(0, i)].reverse().find((x) => x.event === 'turn')?.said || '';
      if (norm(said).split(' ').length >= 6 && norm(said) === norm(e.value)) note('echo', e, `${e.field} = the whole sentence "${e.value}"`);
      if (/\b(first name|last name|my name|dot|at)\b/i.test(e.value) && /email|name/i.test(e.field)) note('suspicious', e, `${e.field} = "${e.value}"`);
    }
    if (e.event === 'say' && /did not understand|no entendí|não entendi/i.test(e.text)) {
      const prev = ev.slice(Math.max(0, i - 8), i).filter((x) => x.event === 'say' && /did not understand/i.test(x.text)).length;
      if (prev >= 1) note('loop', e, 'asked to repeat more than once in a row');
    }
    if (e.event === 'user' && e.via !== undefined) {
      const earlier = ev.slice(Math.max(0, i - 10), i).find((x) => x.event === 'user' && norm(x.text) === norm(e.text) && norm(e.text));
      if (earlier) note('retry', e, `user said "${e.text}" again (the first attempt did not work)`);
    }
    if (e.event === 'mic' && e.live === 'unavailable') note('mic', e, `live microphone unavailable: ${e.reason}`);
    if (e.event === 'talk-over') note('info', e, `talk-over after ${e.afterMs} ms`);
  });

  const sorted = turns.map((t) => t.ms || 0).sort((a, b) => a - b);
  console.log(`\n=== session ${s.start.t} · build ${s.start.build || '?'} · ${s.start.tabUrl || ''}`);
  console.log(`    model ${s.start.model} · lang ${s.start.lang} · live ${s.start.live} · ${turns.length} turns · median ${sorted[Math.floor(sorted.length / 2)] || 0} ms`);
  const scan = ev.find((e) => e.event === 'scan');
  if (scan) console.log(`    form language ${scan.formLang}, ${scan.fields.length} questions`);
  console.log(issues.length ? issues.join('\n') : '  nothing suspicious');
}
console.log('');
