// Code-owned sanity checks on what the model wants to write into a field. A small model sometimes writes the
// user's whole sentence, a placeholder ("first name dot last name at outlook.com") or half an answer; these
// checks stop the obvious cases before they reach the form, and say what to ask for instead.
//
// validateValue(field, value, said) -> { ok: true, value } | { ok: false, reason, phrase }
//   `phrase` is a key of PHRASES: the fixed sentence the assistant says instead of filling.

const wordsOf = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const hint = (field) => `${field.label || ''} ${field.name || ''} ${field.htmlId || ''} ${field.autocomplete || ''} ${field.placeholder || ''}`;

const isEmail = (f) => f.inputType === 'email' || /e-?mail|correo/i.test(hint(f));
const isPhone = (f) => f.inputType === 'tel' || /phone|tel[eé]fono|mobile|cell|celular|fax/i.test(hint(f));
const isZip = (f) => /\bzip\b|postal|c[oó]digo postal/i.test(hint(f));
const isName = (f) => /\b(first|last|given|family|middle|full|legal)\s+name\b|\bapellido\b|\bnombre\b|\bsurname\b/i.test(f.label || '') && !/user\s*name|file\s*name|company|business|employer|street|school|city|country|state/i.test(f.label || '');

// "maria dot lopez at gmail dot com" -> "maria.lopez@gmail.com" (also Spanish: punto, arroba)
export function spokenEmail(value) {
  return String(value)
    .trim()
    .replace(/\s+(?:at|arroba)\s+/gi, '@')
    .replace(/\s+(?:dot|punto)\s+/gi, '.')
    .replace(/\s+(?:underscore|guion bajo)\s+/gi, '_')
    .replace(/\s+(?:dash|hyphen|guion)\s+/gi, '-')
    .replace(/\s+/g, '');
}

// A hedge is not an answer to a choice: "maybe", "I think so", "no sé".
const HEDGE = /\b(maybe|perhaps|probably|i think|i guess|not sure|unsure|i don'?t know|dunno|could be|might be)\b|\b(quiz[aá]s?|tal vez|creo que|no s[eé]|no estoy seguro|puede ser)\b/i;

// "1 million" -> "1000000", "2.5 mil" -> "2500": a number the user said with a scale word, written as digits.
const SCALES = { k: 1e3, thousand: 1e3, mil: 1e3, miles: 1e3, million: 1e6, millon: 1e6, millones: 1e6, billion: 1e9, billon: 1e9, billones: 1e9 };
export function expandScale(value) {
  const m = /^\s*\$?\s*(\d+(?:[.,]\d+)?)\s*(k|thousand|mil|miles|million|mill[oó]n|millones|billion|bill[oó]n|billones)\s*(?:dollars?|d[oó]lares|usd)?\s*$/i.exec(String(value));
  if (!m) return null;
  return String(Math.round(parseFloat(m[1].replace(',', '.')) * SCALES[m[2].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')]));
}

export function validateValue(field, value, said = '') {
  const v = String(value ?? '').trim();
  if (v && ['checkbox', 'radio', 'select'].includes(field.kind) && HEDGE.test(said)) return { ok: false, reason: 'unsure', phrase: 'invalid_unsure' };
  if (!v || field.kind === 'checkbox' || field.kind === 'radio' || field.kind === 'select' || field.kind === 'date') return { ok: true, value: v };
  // One letter is an answer only for an initial, or when that letter is all the user said.
  if (/^\p{L}\.?$/u.test(v) && !/initial|inicial/i.test(field.label || '') && wordsOf(said).split(' ').length > 2) return { ok: false, reason: 'letter', phrase: 'invalid_letter' };
  const scaled = expandScale(v);
  if (scaled) return { ok: true, value: scaled };

  if (isEmail(field)) {
    const email = spokenEmail(v);
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && !/\b(first|last)name\b/i.test(email)
      ? { ok: true, value: email }
      : { ok: false, reason: 'email', phrase: 'invalid_email' };
  }
  if (isPhone(field)) {
    const digits = v.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15 && !/[\p{L}]{3,}/u.test(v.replace(/ext\.?|x\d+/gi, ''))
      ? { ok: true, value: v }
      : { ok: false, reason: 'phone', phrase: 'invalid_phone' };
  }
  if (isZip(field)) {
    return /\d/.test(v) && /^[\w\s-]{3,10}$/.test(v) ? { ok: true, value: v } : { ok: false, reason: 'zip', phrase: 'invalid_zip' };
  }
  if (isName(field)) {
    const looksLikeName = /^[\p{L}\p{M}\s.'’,-]{1,60}$/u.test(v) && !/\b(first|last|middle|full|my|your)\s+name\b/i.test(v) && !/\b(dot|at|punto|arroba)\b/i.test(v);
    if (!looksLikeName) return { ok: false, reason: 'name', phrase: 'invalid_name' };
  }
  // The model copied the user's whole sentence into a short field: that is not an answer.
  const sentence = wordsOf(said).split(' ').length >= 6;
  if (!field.long && field.kind !== 'textarea' && sentence && wordsOf(v) === wordsOf(said)) return { ok: false, reason: 'echo', phrase: 'invalid_echo' };
  return { ok: true, value: v };
}
