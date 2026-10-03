// Decides which fields the user must type themselves.
// Sensitive values never go to the model or the microphone; long answers are simply easier to type.

const NUM = '(?:no\\.?|num(?:ber)?|#)';

const SENSITIVE_PATTERNS = [
  /\bssn\b/,
  // The number itself, not "social security wages" or "social security tax withheld".
  new RegExp(`social\\s*security\\s*${NUM}`),
  /n[uú]m(?:ero)?\.?\s*de\s*seguro\s*social/,
  /passport|pasaporte/,
  /registro de extranjero|n[uú]mero a\b|\bn[uú]m\.?\s*a\b/,
  /licencia\s*de\s*conducir/,
  /contrase[ñn]a/,
  /n[uú]m(?:ero)?\.?\s*de\s*(?:tarjeta|cuenta|identificaci[oó]n)/,
  new RegExp(`driver'?s?\\s*licen[cs]e`),
  new RegExp(`licen[cs]e\\s*${NUM}`),
  new RegExp(`\\bcard\\s*${NUM}`),
  /\b(?:cvv|cvc|csc)\b|security\s*code/,
  /\bpin\b/,
  /\brouting\b|\biban\b|\bswift\b/,
  new RegExp(`account\\s*${NUM}`),
  /tax(?:payer)?\s*id|\bitin\b|\bein\b|\btin\b/,
  /password|passcode/,
  new RegExp(`alien\\s*(?:registration)?\\s*${NUM}|\\ba-number\\b|uscis\\s*${NUM}`),
  /national\s*id|aadhaar|\bcurp\b/,
  new RegExp(`member\\s*id|policy\\s*${NUM}|\\bid\\s*${NUM}`),
  /mother'?s?\s*maiden/,
];

const SENSITIVE_AUTOCOMPLETE = /^(cc-|new-password|current-password|one-time-code)/;

const LONG_MAX_LENGTH = 120;

// "member_id" / "memberId" -> "member id"
function words(s) {
  return String(s || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-\[\]]+/g, ' ')
    .toLowerCase();
}

// "Passport expiration date" and "Country that issued the passport" are not the passport number.
const ID_WORDS = /passport|pasaporte|driver|licen[cs]e|licencia/;
const NOT_THE_NUMBER = /\b(expir\w*|vencimiento|fecha|date|country|pa[ií]s|issued|issuing|emitid\w*|state|estado)\b/;
const NUMBER_WORDS = /\b(number|num|n[uú]mero|no)\b|#/;

export function classify(field) {
  const haystack = [field.label, field.name, field.htmlId, field.placeholder].map(words).join(' | ');
  const aboutAnIdButNotItsNumber = ID_WORDS.test(haystack) && NOT_THE_NUMBER.test(words(field.label)) && !NUMBER_WORDS.test(words(field.label));
  const sensitive =
    field.inputType === 'password' ||
    SENSITIVE_AUTOCOMPLETE.test(field.autocomplete || '') ||
    (!aboutAnIdButNotItsNumber && SENSITIVE_PATTERNS.some((re) => re.test(haystack)));
  const long = field.kind === 'textarea' || (field.maxLength || 0) > LONG_MAX_LENGTH;
  return { sensitive, long };
}

// Numbers that look like an SSN, EIN, card or account number. Replaced before text goes to the model,
// so a pasted block of details cannot leak a private value into a nonprivate answer.
const PRIVATE_NUMBER = [
  /\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g, // SSN
  /\b\d{2}-\d{7}\b/g, // EIN
  /\b(?:\d[ -]?){12,18}\d\b/g, // card, account, IBAN-style digit runs
  /\b\d{9}\b/g, // SSN or passport number without separators (10 digits stays: phone numbers)
];

export function redactPrivate(text) {
  let redacted = false;
  let out = String(text || '');
  for (const re of PRIVATE_NUMBER) {
    out = out.replace(re, () => ((redacted = true), '[private]'));
  }
  return { text: out, redacted };
}
