// Builds site/: exactly the files the public demo serves (nothing else from the repo), for the hosted version.
//   node tools/build-site.mjs        (Vercel runs this as its build command)
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { SAMPLE_NAMES } from './demo-server-lib.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'site');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// the demo page, the sidebar, the PDF viewer (and its libraries), the sample web forms
cpSync(join(root, 'demo'), join(out, 'demo'), { recursive: true });
cpSync(join(root, 'extension'), join(out, 'extension'), { recursive: true, filter: (src) => !src.endsWith('manifest.json') && !src.endsWith('background.js') });

// the sample PDFs that exist
const samples = [];
for (const f of readdirSync(root)) {
  if (SAMPLE_NAMES[f]) {
    cpSync(join(root, f), join(out, f));
    samples.push({ name: SAMPLE_NAMES[f], url: `/${f}` });
  }
}
samples.push({ name: 'Clinic intake (web form)', url: '/demo/intake.html' }, { name: 'Clinic intake (Spanish)', url: '/demo/intake-es.html' }, { name: 'I-485 part 1 (Spanish)', url: '/demo/i485-es.html' });
writeFileSync(join(out, 'samples.json'), JSON.stringify(samples));

// what the page asks the server at start: a visitor is never "local", and the shared key exists on the host
writeFileSync(join(out, 'config.json'), JSON.stringify({ sharedKey: true, local: false, model: process.env.DEMO_MODEL || 'openai/gpt-4o-mini' }));
writeFileSync(join(out, 'index.html'), '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=/demo/app/"><title>Fluent</title><a href="/demo/app/">Open the Fluent demo</a>');
console.log(`site/ ready: ${samples.length} samples, demo + sidebar + viewer`);
