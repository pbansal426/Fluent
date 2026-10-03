// Runs tests/harness.html in headless Chrome over the DevTools protocol and prints the result.
// Needs the repo served first: npm run demo
// Usage: node tests/run-harness.mjs [url] [screenshot.png] [js-to-evaluate-first]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const [url = 'http://127.0.0.1:8765/tests/harness.html', shot, script] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'fluent-harness-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, '--window-size=1100,1400', 'about:blank'], { stdio: 'ignore' });

let exitCode = 1;
try {
  let targets;
  for (let i = 0; i < 50 && !targets; i++) {
    await sleep(200);
    targets = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json()).catch(() => null);
  }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => ((ws.onopen = resolve), (ws.onerror = reject)));
  let seq = 0;
  const waiting = new Map();
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    waiting.get(msg.id)?.(msg);
    waiting.delete(msg.id);
  };
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++seq;
      waiting.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

  await send('Page.enable');
  await send('Page.navigate', { url });
  await sleep(1500);
  if (script) console.log(await evaluate(script));
  else {
    let out = 'running';
    for (let i = 0; i < 40 && out === 'running'; i++) {
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
    if (script) exitCode = 0;
  }
  ws.close();
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
process.exit(exitCode);
