import { LANGUAGES } from './speech.js';

const names = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' });
const nameToCode = new Map();
for (let a = 97; a <= 122; a++) for (let b = 97; b <= 122; b++) {
  const code = String.fromCharCode(a, b), name = names.of(code);
  if (name) nameToCode.set(name.toLowerCase(), code);
}

// Metadata may contain a BCP-47 tag (es-MX) or a language name.
export function language(value) {
  const raw = String((Array.isArray(value) ? value[0] : value) || '').trim();
  const known = LANGUAGES.find((l) => [l.name, l.native, l.code].some((s) => s.toLowerCase() === raw.toLowerCase()));
  if (known) return { code: known.code, name: known.name };
  if (nameToCode.has(raw.toLowerCase())) return language(nameToCode.get(raw.toLowerCase()));
  if (!/^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})*$/i.test(raw)) return null;
  const code = raw.replaceAll('_', '-').split('-')[0].toLowerCase();
  if (['und', 'mul', 'zxx'].includes(code)) return null;
  try {
    const name = names.of(code);
    return name ? { code, name } : null;
  } catch { return null; }
}

export async function detectLanguage(llm, scan) {
  const hint = language(scan.pdfLang || scan.pageLang);
  // Some official translated PDFs retain the original template's catalog language.
  // Validate PDF metadata against printed labels; ordinary page lang is authoritative.
  if (hint && !scan.pdfLang) return hint;
  const out = await llm.chatJson({
    messages: [
      { role: 'system', content: 'Detect the language of these form labels. Return JSON with "language": its English name. Metadata is a hint; printed labels take priority if they disagree. Read only the labels, not the language of the user or viewer. Do not answer the form.' },
      { role: 'user', content: JSON.stringify({ metadata_language: hint?.name, labels: scan.fields.slice(0, 24).map((f) => ({ label: f.label, section: f.section, options: f.options })) }) },
    ],
    responseFormat: { type: 'json_schema', json_schema: { name: 'form_language', strict: true, schema: { type: 'object', properties: { language: { type: 'string' } }, required: ['language'] } } },
    maxTokens: 80,
  });
  const detected = language(out.language);
  if (!detected) throw new Error('Could not detect the form language. Please try starting again.');
  return detected;
}
