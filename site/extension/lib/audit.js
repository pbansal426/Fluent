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
const isAddress = (f) => /address|direcci[oó]n|street|calle/i.test(f.label || '') && !/e-?mail|correo|web|url|ip /i.test(f.label || '');
// How a spoken sentence begins (as opposed to a name, a company or an address said on its own).
const SENTENCE_START = /^(my|i|i'm|im|i've|ive|it|it's|its|the|well|so|um|uh|yes|yeah|no|me|mi|yo|es|soy|bueno|pues|este|that|this|we|our|you|since|because|actually)\b/;
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
const HEDGE = /\b(maybe|perhaps|probably|i think|i guess|not sure|unsure|i don'?t know|dunno|could be|might be|it'?s complicated|complicated|it depends|depends)\b|\b(quiz[aá]s?|tal vez|creo que|no s[eé]|no estoy seguro|puede ser|es complicado|depende)\b/i;

// "1 million" -> "1000000", "2.5 mil" -> "2500": a number the user said with a scale word, written as digits.
const SCALES = { k: 1e3, thousand: 1e3, mil: 1e3, miles: 1e3, million: 1e6, millon: 1e6, millones: 1e6, billion: 1e9, billon: 1e9, billones: 1e9 };
export function expandScale(value) {
  const m = /^\s*\$?\s*(\d+(?:[.,]\d+)?)\s*(k|thousand|mil|miles|million|mill[oó]n|millones|billion|bill[oó]n|billones)\s*(?:dollars?|d[oó]lares|usd)?\s*$/i.exec(String(value));
  if (!m) return null;
  return String(Math.round(parseFloat(m[1].replace(',', '.')) * SCALES[m[2].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')]));
}

// A date needs a day, a month and a year. If the user only said a year (or an age), the model must not invent the rest.
const MONTH_WORDS = /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/i;
const NUMERIC_DATE = /\b\d{1,4}\s*[\/.-]\s*\d{1,2}\s*[\/.-]\s*\d{1,4}\b/;

const DAY_WORDS = /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|twenty|thirtieth|thirty|primero|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|diecis[eé]is|diecisiete|dieciocho|diecinueve|veinte|veinti\w+|treinta)\b/i;
const hasDay = (said) => /\b\d{1,2}(?:st|nd|rd|th)?\b/.test(said.replace(/\b\d{4}\b/g, ' ')) || DAY_WORDS.test(said);

// Fields that expect a number, and what a number looks like once written.
const isNumeric = (f) => /wage|salary|income|amount|tax|total|compensation|tips|how many|number of|\bage\b|years|hours|\$|monto|salario|ingreso/i.test(f.label || '');
const NUMBER = /^[\s$€£]*-?[\d.,]+\s*$/;
const NAMEISH_NOISE = /^(yes|no|yeah|yep|nope|ok|okay|sure|s[ií]|vale|hello|hola|thanks|none|n\/a)$/i;

// Did the user actually ask to skip, pass, or say they have no answer? Mishearings ("mail", "again", "da") and off-topic
// chatter must not silently skip a question just because a small model reached for skip_field.
export function looksLikeSkip(said) {
  const t = String(said || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}' /]+/gu, ' ').replace(/\s+/g, ' ').trim();
  return /\b(skip|pass|next( one| question)?|move on|no thanks|i don't (have|know|want|remember)|i do not (have|know|want|remember)|i have no|i dont (have|know|want)|none|n\/?a|not applicable|doesn't apply|does not apply|prefer not|rather not|later|saltar|salta|omitir|omite|siguiente|paso|no tengo|no aplica|no se|no quiero|no recuerdo|prefiero no|despues)\b/.test(t);
}

// A plain yes / no in a few words ("yes", "I am", "never", "sí"): 'Yes', 'No', or null when it is anything else.
export function plainYesNo(said) {
  const t = String(said || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z' ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.split(' ').length > 8 || /\b(maybe|perhaps|probably|not sure|dont know|don't know|no se|quizas|tal vez|depends|what|why|how)\b/.test(t)) return null;
  if (/^(no|nope|nah|never|nunca|negative|not really|no way|i am not|i'm not|im not|i do not|i don't|i dont|i have not|i haven't|i havent|i did not|i didn't|i didnt|i was not|i wasn't|para nada)\b/.test(t)) return 'No';
  if (/^(yes|yeah|yep|yup|sure|of course|correct|right|i am|i'm|im|i do|i have|i did|i was|i agree|agreed|ok|okay|si|claro|correcto|es correcto|asi es|por supuesto|afirmativo|exacto|ya|estoy de acuerdo|de acuerdo|acepto)\b/.test(t)) return 'Yes';
  return null;
}

export function validateValue(field, value, said = '') {
  const v = String(value ?? '').trim();
  // A single checkbox is ticked or not; anything else the model writes ("I agree to the terms") is turned into that,
  // using what the user actually said. Without a clear yes or no nothing is written.
  if (v && field.kind === 'checkbox' && !field.members && !HEDGE.test(said) && !/^(true|false)$/i.test(v)) {
    const answer = plainYesNo(said) || plainYesNo(v);
    return answer ? { ok: true, value: answer === 'Yes' ? 'true' : 'false' } : { ok: false, reason: 'unsure', phrase: 'invalid_unsure' };
  }
  if (v && field.kind === 'date' && said && MONTH_WORDS.test(said) && !hasDay(said)) return { ok: false, reason: 'incomplete-date', phrase: 'invalid_date' };
  if (v && isNumeric(field) && !['checkbox', 'radio', 'select', 'date'].includes(field.kind) && HEDGE.test(said)) return { ok: false, reason: 'unsure', phrase: 'invalid_unsure' };
  if (v && field.kind === 'date' && said && !MONTH_WORDS.test(said) && !NUMERIC_DATE.test(said)) return { ok: false, reason: 'incomplete-date', phrase: 'invalid_date' };
  if (v && ['checkbox', 'radio', 'select'].includes(field.kind) && HEDGE.test(said)) return { ok: false, reason: 'unsure', phrase: 'invalid_unsure' };
  if (v && ['radio', 'select'].includes(field.kind) && (field.options || []).length > 1) {
    // "married and single": two different choices were named, so none can be chosen for them.
    const heard = ` ${wordsOf(said)} `;
    const named = field.options.filter((o) => wordsOf(o).length >= 3 && heard.includes(` ${wordsOf(o)} `));
    if (named.length >= 2) return { ok: false, reason: 'two-choices', phrase: 'invalid_unsure' };
  }
  if (!v || field.kind === 'checkbox' || field.kind === 'radio' || field.kind === 'select' || field.kind === 'date') return { ok: true, value: v };
  // One letter is an answer only for an initial, or when that letter is all the user said.
  if (/^\p{L}\.?$/u.test(v) && !/initial|inicial/i.test(field.label || '') && wordsOf(said).split(' ').length > 2) return { ok: false, reason: 'letter', phrase: 'invalid_letter' };
  const scaled = expandScale(v);
  if (scaled) return { ok: true, value: scaled };
  if (isNumeric(field) && !NUMBER.test(v)) return { ok: false, reason: 'not-a-number', phrase: 'invalid_number' };

  if (isEmail(field)) {
    const email = spokenEmail(v);
    const ending = email.split('.').pop().toLowerCase();
    if (said && /@/.test(email) && !new RegExp(`\\b${ending}\\b`, 'i').test(said) && !said.includes('@')) return { ok: false, reason: 'email', phrase: 'invalid_email' }; // an ending nobody said
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && !/\b(first|last)name\b/i.test(email)
      ? { ok: true, value: email }
      : { ok: false, reason: 'email', phrase: 'invalid_email' };
  }
  if (isPhone(field)) {
    const digits = v.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15 && !/[\p{L}]{3,}/u.test(v.replace(/\b(ext(ension)?\.?|x)\s*\d+/gi, ''))
      ? { ok: true, value: v }
      : { ok: false, reason: 'phone', phrase: 'invalid_phone' };
  }
  if (isZip(field)) {
    const said9 = said.replace(/\D/g, '');
    if (said9.length === 9 && v.replace(/\D/g, '').length === 5 && said9.startsWith(v.replace(/\D/g, ''))) return { ok: true, value: `${said9.slice(0, 5)}-${said9.slice(5)}` };
    return /\d/.test(v) && /^[\w\s-]{3,10}$/.test(v) ? { ok: true, value: v } : { ok: false, reason: 'zip', phrase: 'invalid_zip' };
  }
  if (isName(field)) {
    if (NAMEISH_NOISE.test(v) || /\d/.test(said)) return { ok: false, reason: 'name', phrase: 'invalid_name' };
    const looksLikeName = /^[\p{L}\p{M}\s.'’,-]{1,60}$/u.test(v) && !/\b(first|last|middle|full|my|your)\s+name\b/i.test(v) && !/\b(dot|at|punto|arroba)\b/i.test(v);
    if (!looksLikeName) return { ok: false, reason: 'name', phrase: 'invalid_name' };
  }
  // The model copied the user's whole sentence into a short field: that is not an answer.
  const sentence = wordsOf(said).split(' ').length >= 6 && SENTENCE_START.test(wordsOf(said));
  if (!field.long && field.kind !== 'textarea' && sentence && wordsOf(v) === wordsOf(said)) return { ok: false, reason: 'echo', phrase: 'invalid_echo' };
  // A street address needs words, not just a number ("111").
  if (isAddress(field) && !/\p{L}{2,}/u.test(v)) return { ok: false, reason: 'address', phrase: 'invalid_address' };
  return { ok: true, value: v };
}
