// The Fluent demo server.
//   node tools/demo-server.mjs               then open  http://localhost:8765/demo/app/
//   PORT=8780 node tools/demo-server.mjs
// To share it on a public link (see README): set OPENROUTER_API_KEY (a key with a spending cap) in this terminal first,
// start this server, then run a tunnel to http://127.0.0.1:8765. Visitors then need no key.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDemoServer } from './demo-server-lib.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT) || 8765;
// Only this machine can reach the server directly; a tunnel connects from here.
createDemoServer({ root }).listen(port, process.env.HOST || '127.0.0.1', () => {
  const shared = process.env.OPENROUTER_API_KEY || existsSync(join(root, '.openrouter-key')) ? ` (shared OpenRouter key on, model ${process.env.DEMO_MODEL || 'openai/gpt-4o-mini'})` : '';
  console.log(`Fluent demo: http://localhost:${port}/demo/app/${shared}`);
});
