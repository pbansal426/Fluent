// Minimal client for any OpenAI-compatible chat endpoint (LM Studio, OpenAI, Ollama, ...).

export class LlmError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // 'unreachable' | 'http' | 'bad_json'
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

export function createClient({ baseUrl, model, apiKey = '', disableThinking = true, fetchImpl = (...a) => fetch(...a) }) {
  const root = String(baseUrl || '').replace(/\/+$/, '');
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  // Parameters this server has rejected; dropped for the rest of the session.
  const unsupported = new Set();

  async function post(body) {
    let res;
    try {
      res = await fetchImpl(`${root}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) });
    } catch (e) {
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
      response_format: responseFormat,
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
        return { content: stripThink(msg.content), toolCalls };
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
  async function chatJson(opts) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { content } = await chat(opts);
      const parsed = parseJsonLoose(content);
      if (parsed) return parsed;
    }
    throw new LlmError('bad_json', 'The AI model did not return valid JSON');
  }

  async function listModels() {
    let res;
    try {
      res = await fetchImpl(`${root}/models`, { headers });
    } catch {
      throw new LlmError('unreachable', `Cannot reach the AI endpoint at ${root}`);
    }
    if (!res.ok) throw new LlmError('http', `AI endpoint error ${res.status}`);
    const data = await res.json();
    return (data.data || []).map((m) => m.id).filter((id) => !/embed/i.test(id));
  }

  return { chat, chatJson, listModels };
}
