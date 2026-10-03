// Prints one logged session as a readable transcript: what the assistant said, what the user said, what the model
// did with it, what was filled or rejected, and the events around it.
//   node tools/show-session.mjs [logfile] [n]     n = which session from the end (1 = the latest, default)
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const file = args.find((a) => a.endsWith('.log')) || new URL('../logs/fluent.log', import.meta.url).pathname;
const nth = Number(args.find((a) => /^\d+$/.test(a))) || 1;
const events = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const starts = events.map((e, i) => (e.event === 'start' ? i : -1)).filter((i) => i >= 0);
const from = starts.at(-nth) ?? 0;
const to = starts[starts.length - nth + 1] ?? events.length;
for (const e of events.slice(from, to)) {
  const t = e.t?.slice(11, 19) || '';
  const rest = Object.fromEntries(Object.entries(e).filter(([k]) => !['t', 'event'].includes(k)));
  switch (e.event) {
    case 'start': console.log(`\n${t} START build ${e.build} ${e.tabUrl} model ${e.model} lang ${e.lang} live ${e.live}`); break;
    case 'say': console.log(`${t} ASSISTANT${e.spoken ? '' : ' (silent)'}: ${e.text}`); break;
    case 'user': console.log(`${t} USER [${e.via}${e.busy ? ', while busy' : ''}]: ${e.text}`); break;
    case 'turn': console.log(`${t}   model (${e.ms} ms, at "${e.current}"): ${(e.calls || []).map((c) => `${c.name} ${JSON.stringify(c.args)}`).join(' | ')}${e.content ? ` | said: ${e.content}` : ''}`); break;
    case 'fill': console.log(`${t}   FILLED ${e.field} = ${e.value}`); break;
    case 'reject': console.log(`${t}   REJECTED ${e.field} = "${e.value}" (${e.reason})`); break;
    case 'scan': console.log(`${t}   scan: ${e.fields.length} questions, form language ${e.formLang}`); break;
    case 'overview': console.log(`${t}   overview: ${e.text}`); break;
    default: console.log(`${t}   · ${e.event} ${JSON.stringify(rest)}`);
  }
}
