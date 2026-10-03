// Development log sink: the Fluent panel posts what it does (what the assistant said, what the user said,
// tool calls, fills, mic and tab events) here, and it is appended to logs/fluent.log as JSON lines.
// Private values are never logged: the panel only ever holds them as dots.
//   node tools/log-server.mjs        (listens on 127.0.0.1:8788; nothing happens if it is not running)
import { createServer } from 'node:http';
import { appendFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../logs/', import.meta.url));
mkdirSync(dir, { recursive: true });
const file = `${dir}fluent.log`;

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.writeHead(204).end();
  if (req.method !== 'POST') return res.writeHead(200).end('fluent log server');
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    appendFileSync(file, `${body.replace(/\n/g, ' ')}\n`);
    res.writeHead(204).end();
  });
}).listen(8788, '127.0.0.1', () => console.log(`logging to ${file}`));
