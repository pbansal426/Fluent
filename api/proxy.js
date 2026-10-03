// Vercel function: forwards the page's AI requests. The shared key comes from the environment variable
// OPENROUTER_API_KEY set in the Vercel project's settings (encrypted there): it is never in the code, the repo or the page.
import { buildUpstream, cleanKey, createLimiter } from '../tools/proxy-core.mjs';

const limited = createLimiter(process.env);

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    // Vercel may already have parsed a JSON body.
    return Buffer.from(typeof req.body === 'string' || Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body));
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('POST only');
  const plan = buildUpstream(
    {
      target: req.headers['x-target-url'],
      method: req.headers['x-target-method'] || 'POST',
      headers: req.headers,
      body: await readBody(req),
      local: false, // a hosted function never reaches anyone's LM Studio
      visitor: String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim(),
    },
    { sharedKey: cleanKey(process.env.OPENROUTER_API_KEY), sharedModel: process.env.DEMO_MODEL || 'openai/gpt-4o-mini', maxTokens: Number(process.env.DEMO_MAX_TOKENS) || 3000, limited },
  );
  if (plan.refuse) return res.status(plan.refuse.status).setHeader('content-type', 'text/plain').send(plan.refuse.text);
  try {
    const upstream = await fetch(plan.url, plan.init);
    const out = Buffer.from(await upstream.arrayBuffer());
    res.status(upstream.status).setHeader('content-type', upstream.headers.get('content-type') || 'application/octet-stream').send(out);
  } catch (e) {
    res.status(502).setHeader('content-type', 'text/plain').send(`proxy: ${e.message}`);
  }
}
