// Runs tests/harness.html in headless Chrome over the DevTools protocol and prints the result.
// Needs the repo served first: npm run demo
// Usage: node tests/run-harness.mjs [url] [screenshot.png] [js-to-evaluate-first]
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let port;
const [url = 'http://127.0.0.1:8765/tests/harness.html', shot, script] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'fluent-harness-'));
// --disable-web-security: this throwaway profile lets the e2e page call LM Studio, which sends no CORS headers.
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-web-security', `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--window-size=1100,1400', 'about:blank'], { stdio: 'ignore' });

let exitCode = 1;
try {
  let targets;
  for (let i = 0; i < 50 && !targets; i++) {
    await sleep(200);
    try { port = Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); } catch {}
    if (port) targets = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).catch(() => null);
  }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => ((ws.onopen = resolve), (ws.onerror = reject)));
  let seq = 0;
  const waiting = new Map();
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    // Surface page errors and console output; a silent hang is otherwise undebuggable.
    if (msg.method === 'Runtime.exceptionThrown') console.error('PAGE EXCEPTION:', msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    if (msg.method === 'Runtime.consoleAPICalled') console.error(`PAGE ${msg.params.type}:`, msg.params.args.map((a) => a.value ?? a.description).join(' '));
    if (msg.method === 'Log.entryAdded') console.error('PAGE LOG:', msg.params.entry.text, msg.params.entry.url || '');
    waiting.get(msg.id)?.(msg);
    waiting.delete(msg.id);
  };
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++seq;
      waiting.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const result = (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result;
    if (result?.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result?.result?.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.navigate', { url });
  await sleep(1500);
  // "@path" reads the script from a file.
  if (script) {
    const out = await evaluate(script.startsWith('@') ? readFileSync(script.slice(1), 'utf8') : script);
    console.log(out);
    const result = typeof out === 'string' ? JSON.parse(out) : out;
    exitCode = result?.checks && !result.error && Object.values(result.checks).every((v) => v === true) ? 0 : 1;
  }
  else {
    let out = 'running';
    for (let i = 0; i < 1200 && out === 'running'; i++) {
      await sleep(250);
      out = await evaluate(`document.getElementById('out')?.textContent`);
    }
    console.log(out);
    exitCode = /"summary": "(\d+)\/\1 passed"/.test(out) ? 0 : 1;
  }
  if (shot) {
    await sleep(600);
    const { result } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    writeFileSync(shot, Buffer.from(result.data, 'base64'));
  }
  ws.close();
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
process.exit(exitCode);
