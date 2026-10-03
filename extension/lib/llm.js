// Minimal client for any OpenAI-compatible chat endpoint (LM Studio, OpenAI, Ollama, ...).

export class LlmError extends Error {
  constructor(kind, message, raw = '') {
    super(message);
    this.raw = raw; // what the model actually said, for the development log
    this.kind = kind; // 'unreachable' | 'timeout' | 'http' | 'bad_json'
  }
}

// Some local models leak their reasoning into the answer.
export function stripThink(text) {
  return String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^[\s\S]*?<\/think>/i, '')
    .trim();
}

// Parse JSON that may be wrapped in a code fence or surrounded by prose.
export function parseJsonLoose(text) {
  if (text && typeof text === 'object') return text;
  const s = stripThink(text).replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(s);
  } catch {}
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(s.slice(start, end + 1));
    } catch {}
  }
  return null;
}

// Local models sometimes write a tool call into the text instead of the tool_calls field, in their
// own notation: fill_fields{values:[{field_id:<|"|>f5<|"|>,value:<|"|>Maria<|"|>}]}
export function parseTextToolCalls(content, names) {
  const calls = [];
  for (const name of names) {
    const at = content.indexOf(name);
    if (at < 0) continue;
    const start = content.indexOf('{', at);
    if (start < 0) continue;
    // Try each closing brace from the end, as plain JSON first, then with bare keys quoted.
    let args = null;
    for (let end = content.lastIndexOf('}'); end > start && !args; end = content.lastIndexOf('}', end - 1)) {
      const body = content.slice(start, end + 1).replaceAll('<|"|>', '"');
      for (const candidate of [body, body.replace(/([{,]\s*)([A-Za-z_]\w*)\s*:/g, '$1"$2":')]) {
        try {
          args = JSON.parse(candidate);
          break;
        } catch {}
      }
    }
    if (args) calls.push({ name, args: args.arguments || args.parameters || args });
  }
  return calls;
}

// OpenAI-family models in strict structured-output mode refuse a schema whose objects do not say
// additionalProperties: false. Say it everywhere, so every provider accepts the same schema.
export function strictify(format) {
  if (!format?.json_schema?.schema) return format;
  const walk = (node) => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== 'object') return node;
    const out = Object.fromEntries(Object.entries(node).map(([k, v]) => [k, walk(v)]));
    if (out.type === 'object' && out.properties && out.additionalProperties === undefined) out.additionalProperties = false;
    return out;
  };
  return { ...format, json_schema: { ...format.json_schema, schema: walk(format.json_schema.schema) } };
}

export function createClient({ baseUrl, model, apiKey = '', disableThinking = true, fetchImpl = (...a) => fetch(...a) }) {
  const root = String(baseUrl || '').replace(/\/+$/, '');
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  // Parameters this server has rejected; dropped for the rest of the session.
  const unsupported = new Set();

  async function post(body) {
    let res;
    try {
      // One quiet retry on a network failure (a server restarting, a dropped connection): the request is safe to repeat.
      for (let attempt = 0; ; attempt++) {
        try {
          res = await fetchImpl(`${root}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
          break;
        } catch (e) {
          if (attempt === 1 || e?.name === 'TimeoutError' || e?.name === 'AbortError') throw e;
          await new Promise((r) => setTimeout(r, 900));
        }
      }
    } catch (e) {
      // A slow answer (a model still loading, a busy GPU) is not the same as an unreachable server.
      if (e?.name === 'TimeoutError' || e?.name === 'AbortError') throw new LlmError('timeout', `The AI endpoint at ${root} did not answer in time`);
      throw new LlmError('unreachable', `Cannot reach the AI endpoint at ${root}`);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      const err = new LlmError('http', `AI endpoint error ${res.status}: ${detail.slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  async function chat({ messages, tools, toolChoice, responseFormat, maxTokens = 1200, temperature = 0.1 }) {
    const optional = {
      reasoning_effort: disableThinking ? 'none' : undefined,
      response_format: strictify(responseFormat),
    };
    for (;;) {
      const body = { model, messages, temperature, max_tokens: maxTokens };
      if (tools) {
        body.tools = tools;
        if (toolChoice) body.tool_choice = toolChoice;
      }
      for (const [k, v] of Object.entries(optional)) if (v !== undefined && !unsupported.has(k)) body[k] = v;
      try {
        const data = await post(body);
        const msg = data.choices?.[0]?.message || {};
        const toolCalls = (msg.tool_calls || [])
          .map((c) => ({ name: c.function?.name, args: parseJsonLoose(c.function?.arguments) }))
          .filter((c) => c.name && c.args);
        const content = stripThink(typeof msg.content === 'string' ? msg.content : Array.isArray(msg.content) ? msg.content.map((p) => p?.text || '').join('') : '');
        const finish = data.choices?.[0]?.finish_reason;
        if (tools && !toolCalls.length && content) {
          const names = tools.map((t) => t.function.name);
          const fromText = parseTextToolCalls(content, names);
          if (fromText.length) return { content: '', toolCalls: fromText };
          // Tool-call debris that could not be read must not be shown or spoken to the user.
          if (names.some((n) => content.includes(n)) || content.includes('<|')) return { content: '', toolCalls: [] };
        }
        return { content, toolCalls, finish };
      } catch (e) {
        // Not every server knows every optional parameter: drop one and try again.
        const droppable = Object.keys(optional).find((k) => body[k] !== undefined);
        if (e.kind === 'http' && e.status === 400 && droppable) {
          unsupported.add(droppable);
          continue;
        }
        throw e;
      }
    }
  }

  // Ask for a JSON object; retries once if the model returns something unparseable.
  // Models differ in how they break a JSON request. Retry with the fix that fits: more room if the answer was cut
  // off, a plain reminder if it was prose, and finally without the structured-output setting some providers mishandle.
  async function chatJson(opts) {
    let current = opts;
    let last = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      const { content, finish } = await chat(current);
      const parsed = parseJsonLoose(content);
      if (parsed) return parsed;
      last = content;
      if (finish === 'length') current = { ...current, maxTokens: Math.min((current.maxTokens || 1200) * 2, 6000) };
      else if (attempt === 0) current = { ...current, messages: [...opts.messages, { role: 'user', content: 'Reply with only the JSON object, with no other words and no code fence.' }] };
      else current = { ...current, responseFormat: undefined };
    }
    throw new LlmError('bad_json', 'The AI model did not return valid JSON', String(last).slice(0, 400));
  }

  async function listModels() {
    let res;
    // One quiet retry: a server that is busy loading a model often answers a few seconds later.
    for (let attempt = 0; ; attempt++) {
      try {
        res = await fetchImpl(`${root}/models`, { headers, signal: AbortSignal.timeout(10000) });
        break;
      } catch (e) {
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 2500));
          continue;
        }
        if (e?.name === 'TimeoutError' || e?.name === 'AbortError') throw new LlmError('timeout', `The AI endpoint at ${root} did not answer in time`);
        throw new LlmError('unreachable', `Cannot reach the AI endpoint at ${root}`);
      }
    }
    if (!res.ok) throw new LlmError('http', `AI endpoint error ${res.status}`);
    const data = await res.json();
    return (data.data || []).map((m) => m.id).filter((id) => !/embed/i.test(id));
  }

  return { chat, chatJson, listModels };
}
