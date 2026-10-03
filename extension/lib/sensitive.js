// Decides which fields the user must type themselves.
// Sensitive values never go to the model or the microphone; long answers are simply easier to type.

const NUM = '(?:no\\.?|num(?:ber)?|#)';

const SENSITIVE_PATTERNS = [
  /\bssn\b/,
  // The number itself, not "social security wages" or "social security tax withheld".
  new RegExp(`social\\s*security\\s*${NUM}`),
  /n[uú]m(?:ero)?\.?\s*de\s*seguro\s*social/,
  /passport|pasaporte/,
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

export function classify(field) {
  const haystack = [field.label, field.name, field.htmlId, field.placeholder].map(words).join(' | ');
  const sensitive =
    field.inputType === 'password' ||
    SENSITIVE_AUTOCOMPLETE.test(field.autocomplete || '') ||
    SENSITIVE_PATTERNS.some((re) => re.test(haystack));
  const long = field.kind === 'textarea' || (field.maxLength || 0) > LONG_MAX_LENGTH;
  return { sensitive, long };
}
