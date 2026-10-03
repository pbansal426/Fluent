// Recognises which AI service an API key belongs to, so pasting a key is all the setup needed.
// Every provider here offers an OpenAI-compatible chat endpoint, which is what llm.js speaks.

export const PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic (Claude)', test: /^sk-ant-/, baseUrl: 'https://api.anthropic.com/v1', prefer: [/claude-haiku-4-5/, /haiku/, /claude-sonnet-5-5/, /sonnet/] },
  { id: 'openrouter', name: 'OpenRouter', test: /^sk-or-/, baseUrl: 'https://openrouter.ai/api/v1', prefer: [/^openai\/gpt-4o-mini$/, /^openai\/gpt-4\.1-mini$/, /gemini.*flash/] },
  { id: 'groq', name: 'Groq', test: /^gsk_/, baseUrl: 'https://api.groq.com/openai/v1', prefer: [/llama-3\.3-70b/, /llama.*70b/, /llama/] },
  { id: 'gemini', name: 'Google Gemini', test: /^AIza/, baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', prefer: [/gemini-2\.5-flash$/, /gemini.*flash(?!.*(lite|image|live))/, /gemini/] },
  { id: 'xai', name: 'xAI (Grok)', test: /^xai-/, baseUrl: 'https://api.x.ai/v1', prefer: [/grok.*(fast|mini)/, /grok/] },
  // Last: OpenAI keys start with a plain "sk-" (also "sk-proj-"), which the more specific prefixes above must win over.
  { id: 'openai', name: 'OpenAI', test: /^sk-/, baseUrl: 'https://api.openai.com/v1', prefer: [/^gpt-4\.1-mini$/, /^gpt-4o-mini$/, /^gpt-4\.1$/, /^gpt-4o$/] },
];

export const detectProvider = (key) => {
  const k = String(key || '').trim();
  return k ? PROVIDERS.find((p) => p.test.test(k)) || null : null;
};

// The best model from what the provider lists: the first preference that exists, else the first listed.
export function pickModel(provider, models) {
  for (const re of provider.prefer) {
    const hit = models.find((m) => re.test(m));
    if (hit) return hit;
  }
  return models[0] || '';
}
