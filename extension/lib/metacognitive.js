// extension/lib/metacognitive.js
// Phonetic ambiguity detection and low-friction spelling confirmation for names, addresses, and emails.

const NAME_FIELD = /\b(first|last|given|family|middle|full|legal)\s+name\b|\bapellido\b|\bnombre\b|\bsurname\b/i;
const NOT_PERSON_NAME = /user\s*name|file\s*name|company|business|employer|street|school|city|country|state/i;

const VARIANT_GROUPS = [
  {
    options: ['Bryan', 'Brian'],
    prompt: (lang) => (lang === 'es' ? '¿Se escribe Bryan con Y o Brian con I?' : 'Got it — is that Bryan with a Y or Brian with an I?'),
    chips: (lang) => (lang === 'es' ? [
      { label: 'Bryan (con Y)', value: 'con Y' },
      { label: 'Brian (con I)', value: 'con I' },
    ] : [
      { label: 'Bryan (with Y)', value: 'with a Y' },
      { label: 'Brian (with I)', value: 'with an I' },
    ]),
    resolveRule: (said) => {
      if (/\b(with a y|con y|con i griega|con ye|\by\b)\b/i.test(said)) return 'Bryan';
      if (/\b(with an i|con i|con i latina|\bi\b)\b/i.test(said)) return 'Brian';
      return null;
    },
  },
  {
    options: ['Sarah', 'Sara'],
    prompt: (lang) => (lang === 'es' ? '¿Sara se escribe con H o sin H al final?' : 'Got it — is that Sarah with an H or Sara without an H?'),
    chips: (lang) => (lang === 'es' ? [
      { label: 'Sara (sin H)', value: 'sin H' },
      { label: 'Sarah (con H)', value: 'con H' },
    ] : [
      { label: 'Sara (no H)', value: 'without an H' },
      { label: 'Sarah (with H)', value: 'with an H' },
    ]),
    resolveRule: (said) => {
      if (/\b(without (an )?h|no h|sin h)\b/i.test(said)) return 'Sara';
      if (/\b(with (an )?h|con h|\bh\b)\b/i.test(said)) return 'Sarah';
      return null;
    },
  },
  {
    options: ['John', 'Jon'],
    prompt: (lang) => (lang === 'es' ? '¿Se escribe J-O-H-N con H o J-O-N sin H?' : 'Got it — is that J-O-H-N with an H or J-O-N?'),
    chips: (lang) => (lang === 'es' ? [
      { label: 'John (con H)', value: 'con H' },
      { label: 'Jon (sin H)', value: 'sin H' },
    ] : [
      { label: 'John (with H)', value: 'with an H' },
      { label: 'Jon (no H)', value: 'without an H' },
    ]),
    resolveRule: (said) => {
      if (/\b(without (an )?h|no h|sin h|j[\s-]*o[\s-]*n)\b/i.test(said)) return 'Jon';
      if (/\b(with (an )?h|con h|j[\s-]*o[\s-]*h[\s-]*n|\bh\b)\b/i.test(said)) return 'John';
      return null;
    },
  },
  {
    options: ['Marc', 'Mark'],
    prompt: (lang) => (lang === 'es' ? '¿Se escribe Marc con C o Mark con K?' : 'Got it — is that Marc with a C or Mark with a K?'),
    chips: (lang) => (lang === 'es' ? [
      { label: 'Marc (con C)', value: 'con C' },
      { label: 'Mark (con K)', value: 'con K' },
    ] : [
      { label: 'Marc (with C)', value: 'with a C' },
      { label: 'Mark (with K)', value: 'with a K' },
    ]),
    resolveRule: (said) => {
      if (/\b(with a c|con c|\bc\b)\b/i.test(said)) return 'Marc';
      if (/\b(with a k|con k|\bk\b)\b/i.test(said)) return 'Mark';
      return null;
    },
  },
  {
    options: ['Steven', 'Stephen'],
    prompt: (lang) => (lang === 'es' ? '¿Se escribe Steven con V o Stephen con P-H?' : 'Got it — is that Steven with a V or Stephen with P-H?'),
    chips: (lang) => (lang === 'es' ? [
      { label: 'Steven (con V)', value: 'con V' },
      { label: 'Stephen (con P-H)', value: 'con PH' },
    ] : [
      { label: 'Steven (with V)', value: 'with a V' },
      { label: 'Stephen (with P-H)', value: 'with P-H' },
    ]),
    resolveRule: (said) => {
      if (/\b(with a v|con v|\bv\b)\b/i.test(said)) return 'Steven';
      if (/\b(with p[\s-]*h|con p[\s-]*h|\bph\b)\b/i.test(said)) return 'Stephen';
      return null;
    },
  },
  {
    options: ['Eric', 'Erik'],
    prompt: (lang) => (lang === 'es' ? '¿Se escribe Eric con C o Erik con K?' : 'Got it — is that Eric with a C or Erik with a K?'),
    chips: (lang) => (lang === 'es' ? [
      { label: 'Eric (con C)', value: 'con C' },
      { label: 'Erik (con K)', value: 'con K' },
    ] : [
      { label: 'Eric (with C)', value: 'with a C' },
      { label: 'Erik (with K)', value: 'with a K' },
    ]),
    resolveRule: (said) => {
      if (/\b(with a c|con c|\bc\b)\b/i.test(said)) return 'Eric';
      if (/\b(with a k|con k|\bk\b)\b/i.test(said)) return 'Erik';
      return null;
    },
  },
  {
    options: ['Shawn', 'Sean'],
    prompt: (lang) => (lang === 'es' ? '¿Se escribe Shawn con S-H-A-W-N o Sean con S-E-A-N?' : 'Got it — is that Shawn (S-H-A-W-N) or Sean (S-E-A-N)?'),
    chips: (lang) => (lang === 'es' ? [
      { label: 'Shawn (S-H-A-W-N)', value: 'Shawn' },
      { label: 'Sean (S-E-A-N)', value: 'Sean' },
    ] : [
      { label: 'Shawn (S-H-A-W-N)', value: 'Shawn' },
      { label: 'Sean (S-E-A-N)', value: 'Sean' },
    ]),
    resolveRule: (said) => {
      if (/\b(shawn|with a w|con w|s[\s-]*h[\s-]*a[\s-]*w[\s-]*n)\b/i.test(said)) return 'Shawn';
      if (/\b(sean|with ea|con e|s[\s-]*e[\s-]*a[\s-]*n)\b/i.test(said)) return 'Sean';
      return null;
    },
  },
  {
    options: ['Sofia', 'Sophia'],
    prompt: (lang) => (lang === 'es' ? '¿Se escribe Sofía con F o Sophia con P-H?' : 'Got it — is that Sofia with an F or Sophia with P-H?'),
    chips: (lang) => (lang === 'es' ? [
      { label: 'Sofía (con F)', value: 'con F' },
      { label: 'Sophia (con P-H)', value: 'con PH' },
    ] : [
      { label: 'Sofia (with F)', value: 'with an F' },
      { label: 'Sophia (with P-H)', value: 'with P-H' },
    ]),
    resolveRule: (said) => {
      if (/\b(with (an )?f|con f|\bf\b)\b/i.test(said)) return 'Sofia';
      if (/\b(with p[\s-]*h|con p[\s-]*h|\bph\b)\b/i.test(said)) return 'Sophia';
      return null;
    },
  },
  {
    options: ['Catherine', 'Katherine'],
    prompt: (lang) => (lang === 'es' ? '¿Se escribe Catherine con C o Katherine con K?' : 'Got it — is that Catherine with a C or Katherine with a K?'),
    chips: (lang) => (lang === 'es' ? [
      { label: 'Catherine (con C)', value: 'con C' },
      { label: 'Katherine (con K)', value: 'con K' },
    ] : [
      { label: 'Catherine (with C)', value: 'with a C' },
      { label: 'Katherine (with K)', value: 'with a K' },
    ]),
    resolveRule: (said) => {
      if (/\b(with a c|con c|\bc\b)\b/i.test(said)) return 'Catherine';
      if (/\b(with a k|con k|\bk\b)\b/i.test(said)) return 'Katherine';
      return null;
    },
  },
  {
    options: ['Teresa', 'Theresa'],
    prompt: (lang) => (lang === 'es' ? '¿Teresa se escribe con T o con T-H?' : 'Got it — is that Teresa with a T or Theresa with T-H?'),
    chips: (lang) => (lang === 'es' ? [
      { label: 'Teresa (con T)', value: 'con T' },
      { label: 'Theresa (con T-H)', value: 'con TH' },
    ] : [
      { label: 'Teresa (with T)', value: 'with a T' },
      { label: 'Theresa (with T-H)', value: 'with T-H' },
    ]),
    resolveRule: (said) => {
      if (/\b(with a t|con t|without (an )?h|sin h|\bt\b)\b/i.test(said)) return 'Teresa';
      if (/\b(with t[\s-]*h|con t[\s-]*h|\bth\b)\b/i.test(said)) return 'Theresa';
      return null;
    },
  },
];

const TEEN_TY_PAIRS = [
  {
    teen: 13,
    ty: 30,
    teenWords: ['13', 'thirteen', 'trece'],
    tyWords: ['30', 'thirty', 'treinta'],
    teenDisambiguatePattern: /\b(one\s+three|uno\s+tres)\b/i,
    tyDisambiguatePattern: /\b(three\s+zero|tres\s+cero)\b/i,
  },
  {
    teen: 14,
    ty: 40,
    teenWords: ['14', 'fourteen', 'catorce'],
    tyWords: ['40', 'forty', 'cuarenta'],
    teenDisambiguatePattern: /\b(one\s+four|uno\s+cuatro)\b/i,
    tyDisambiguatePattern: /\b(four\s+zero|cuatro\s+cero)\b/i,
  },
  {
    teen: 15,
    ty: 50,
    teenWords: ['15', 'fifteen', 'quince'],
    tyWords: ['50', 'fifty', 'cincuenta'],
    teenDisambiguatePattern: /\b(one\s+five|uno\s+cinco)\b/i,
    tyDisambiguatePattern: /\b(five\s+zero|cinco\s+cero)\b/i,
  },
  {
    teen: 16,
    ty: 60,
    teenWords: ['16', 'sixteen', 'dieciseis', 'dieciséis'],
    tyWords: ['60', 'sixty', 'sesenta'],
    teenDisambiguatePattern: /\b(one\s+six|uno\s+seis)\b/i,
    tyDisambiguatePattern: /\b(six\s+zero|seis\s+cero)\b/i,
  },
  {
    teen: 17,
    ty: 70,
    teenWords: ['17', 'seventeen', 'diecisiete'],
    tyWords: ['70', 'seventy', 'setenta'],
    teenDisambiguatePattern: /\b(one\s+seven|uno\s+siete)\b/i,
    tyDisambiguatePattern: /\b(seven\s+zero|siete\s+cero)\b/i,
  },
  {
    teen: 18,
    ty: 80,
    teenWords: ['18', 'eighteen', 'dieciocho'],
    tyWords: ['80', 'eighty', 'ochenta'],
    teenDisambiguatePattern: /\b(one\s+eight|uno\s+ocho)\b/i,
    tyDisambiguatePattern: /\b(eight\s+zero|ocho\s+cero)\b/i,
  },
  {
    teen: 19,
    ty: 90,
    teenWords: ['19', 'nineteen', 'diecinueve'],
    tyWords: ['90', 'ninety', 'noventa'],
    teenDisambiguatePattern: /\b(one\s+nine|uno\s+nueve)\b/i,
    tyDisambiguatePattern: /\b(nine\s+zero|nueve\s+cero)\b/i,
  },
];

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class MetacognitiveResolver {
  isNameField(field) {
    const label = String(field?.label || '');
    return NAME_FIELD.test(label) && !NOT_PERSON_NAME.test(label);
  }

  isEmailField(field) {
    if (!field) return false;
    if (field.inputType === 'email') return true;
    return /\b(e-?mail|correo\s+electr[oó]nico|correo)\b/i.test(String(field.label || ''));
  }

  normalizeSpelledWord(input) {
    if (!input || typeof input !== 'string') return '';
    const cleaned = input.replace(/\b(?:as in|like|como en|de)\s+[A-Za-zÀ-ÿ]+/gi, ' ');
    const tokens = cleaned.split(/[\s,.-]+/).filter(Boolean);
    if (tokens.length >= 2 && tokens.every((t) => /^[A-Za-zÀ-ÿ]$/.test(t))) {
      const joined = tokens.join('');
      return joined.charAt(0).toUpperCase() + joined.slice(1).toLowerCase();
    }
    return input.trim();
  }

  normalizeEmail(transcript) {
    if (!transcript || typeof transcript !== 'string') return '';
    return transcript
      .trim()
      .toLowerCase()
      .replace(/\s+(?:at|arroba)\s+/gi, '@')
      .replace(/\s+(?:dot|punto)\s+/gi, '.')
      .replace(/\s+(?:underscore|guion bajo|guión bajo)\s+/gi, '_')
      .replace(/\s+(?:dash|hyphen|guion|guión)\s+/gi, '-')
      .replace(/\s+/g, '');
  }

  assessSpelling(field, value, { said = '', alternatives = [], lang = 'en' } = {}) {
    const cleanValue = String(value || '').trim();
    if (!cleanValue) {
      return { needsConfirmation: false, value: cleanValue };
    }

    if (this.isEmailField(field)) {
      if (/\b(at|arroba|dot|punto)\b/i.test(cleanValue)) {
        return { needsConfirmation: false, value: this.normalizeEmail(cleanValue) };
      }
      if (!cleanValue.includes('@') && /\b(at|arroba)\b/i.test(said)) {
        return { needsConfirmation: false, value: this.normalizeEmail(said) };
      }
      return { needsConfirmation: false, value: cleanValue };
    }

    const langCode = /^es|spanish|espa/i.test(String(lang || '')) ? 'es' : 'en';

    // Acoustic number metacognition (-teen vs -ty in street numbers, ages, codes)
    for (const pair of TEEN_TY_PAIRS) {
      const teenRe = new RegExp(`\\b(${pair.teenWords.join('|')})\\b`, 'i');
      const tyRe = new RegExp(`\\b(${pair.tyWords.join('|')})\\b`, 'i');
      const hasTeen = teenRe.test(cleanValue);
      const hasTy = tyRe.test(cleanValue);
      const altsHaveTeen = (alternatives || []).some((a) => teenRe.test(String(a)));
      const altsHaveTy = (alternatives || []).some((a) => tyRe.test(String(a)));

      if ((hasTeen && altsHaveTy) || (hasTy && altsHaveTeen)) {
        if (pair.teenDisambiguatePattern.test(said) || pair.tyDisambiguatePattern.test(said)) {
          return { needsConfirmation: false, value: cleanValue };
        }
        let opt1 = cleanValue;
        let opt2 = cleanValue;
        if (hasTeen) {
          const match = cleanValue.match(teenRe);
          const replacement = match && /^\d+$/.test(match[0]) ? String(pair.ty) : pair.tyWords[1];
          opt2 = cleanValue.replace(teenRe, replacement);
        } else {
          const match = cleanValue.match(tyRe);
          const replacement = match && /^\d+$/.test(match[0]) ? String(pair.teen) : pair.teenWords[1];
          opt2 = cleanValue.replace(tyRe, replacement);
        }
        const prompt = langCode === 'es'
          ? `Para confirmar, ¿dijo ${hasTeen ? `${pair.teen} o ${pair.ty}` : `${pair.ty} o ${pair.teen}`}?`
          : `Just to be sure, was that ${hasTeen ? `${pair.teen} or ${pair.ty}` : `${pair.ty} or ${pair.teen}`}?`;

        const chips = hasTeen ? [
          { label: String(pair.teen), value: String(pair.teen) },
          { label: String(pair.ty), value: String(pair.ty) },
        ] : [
          { label: String(pair.ty), value: String(pair.ty) },
          { label: String(pair.teen), value: String(pair.teen) },
        ];

        return {
          needsConfirmation: true,
          variantType: 'number_split',
          options: [opt1, opt2],
          baseOptions: hasTeen ? [String(pair.teen), String(pair.ty)] : [String(pair.ty), String(pair.teen)],
          prompt,
          chips,
          candidate: cleanValue,
          value: cleanValue,
        };
      }
    }

    if (!this.isNameField(field)) {
      return { needsConfirmation: false, value: cleanValue };
    }

    const spelled = this.normalizeSpelledWord(said);
    if (spelled !== said.trim() && spelled.length >= 2) {
      return { needsConfirmation: false, value: spelled };
    }

    const words = cleanValue.split(/\s+/);
    const lowerWords = words.map((w) => w.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''));
    const lowerAltTokens = new Set(
      (alternatives || [])
        .flatMap((a) => String(a || '').toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, ' ').trim().split(/\s+/))
        .filter(Boolean)
    );
    for (const group of VARIANT_GROUPS) {
      const lowerOpts = group.options.map((o) => o.toLowerCase());
      let matchIdx = lowerWords.findIndex((w) => lowerOpts.includes(w));
      if (matchIdx >= 0) {
        const replaceAt = (replacement) => words.map((w, idx) => (idx === matchIdx ? replacement : w)).join(' ');
        const alreadyDisambiguated = group.resolveRule(said);
        if (alreadyDisambiguated) {
          return { needsConfirmation: false, value: replaceAt(alreadyDisambiguated) };
        }
        const chips = group.chips
          ? group.chips(langCode)
          : group.options.map((o) => ({ label: o, value: o }));

        return {
          needsConfirmation: true,
          variantType: 'name_split',
          options: group.options.map((o) => replaceAt(o)),
          baseOptions: [...group.options],
          prompt: group.prompt(langCode),
          chips,
          candidate: cleanValue,
          value: cleanValue,
        };
      }
    }

    return { needsConfirmation: false, value: cleanValue };
  }

  resolveConfirmation(pending, reply) {
    if (!pending || !Array.isArray(pending.options) || !reply) {
      return { resolved: false };
    }
    const text = String(reply).trim();
    const spelled = this.normalizeSpelledWord(text);
    const baseOptions = pending.baseOptions || pending.options.map((o) => String(o).split(/\s+/)[0]);

    for (let i = 0; i < pending.options.length; i++) {
      const opt = pending.options[i];
      const baseOpt = baseOptions[i] || opt;
      if (
        spelled.toLowerCase() === opt.toLowerCase() ||
        spelled.toLowerCase() === baseOpt.toLowerCase() ||
        text.toLowerCase() === opt.toLowerCase() ||
        text.toLowerCase() === baseOpt.toLowerCase()
      ) {
        return { resolved: true, value: opt };
      }
    }

    // Acoustic number resolution (-teen vs -ty)
    for (const pair of TEEN_TY_PAIRS) {
      const teenRe = new RegExp(`\\b(${pair.teenWords.join('|')})\\b`, 'i');
      const tyRe = new RegExp(`\\b(${pair.tyWords.join('|')})\\b`, 'i');
      const saysTy = pair.tyDisambiguatePattern.test(text) || tyRe.test(text);
      const saysTeen = pair.teenDisambiguatePattern.test(text) || teenRe.test(text);
      if (saysTy && !pair.teenDisambiguatePattern.test(text)) {
        const idx = pending.options.findIndex((o) => tyRe.test(o) || new RegExp(`\\b${pair.ty}\\b`).test(o));
        if (idx >= 0) return { resolved: true, value: pending.options[idx] };
      }
      if (saysTeen) {
        const idx = pending.options.findIndex((o) => teenRe.test(o) || new RegExp(`\\b${pair.teen}\\b`).test(o));
        if (idx >= 0) return { resolved: true, value: pending.options[idx] };
      }
    }
    if (/\b(first|first one|primero|primera|el primero|la primera)\b/i.test(text) && pending.options.length >= 1) {
      return { resolved: true, value: pending.options[0] };
    }
    if (/\b(second|second one|segundo|segunda|el segundo|la segunda)\b/i.test(text) && pending.options.length >= 2) {
      return { resolved: true, value: pending.options[1] };
    }

    for (const group of VARIANT_GROUPS) {
      if (group.options.some((opt) => baseOptions.includes(opt))) {
        const hit = group.resolveRule(text);
        if (hit) {
          const idx = baseOptions.findIndex((b) => b.toLowerCase() === hit.toLowerCase());
          return { resolved: true, value: idx >= 0 ? pending.options[idx] : hit };
        }
      }
    }

    for (let i = 0; i < pending.options.length; i++) {
      const opt = pending.options[i];
      const baseOpt = baseOptions[i] || opt;
      const re = new RegExp(`\\b(?:${escapeRegex(opt)}|${escapeRegex(baseOpt)})\\b`, 'i');
      if (re.test(text)) return { resolved: true, value: opt };
    }

    return { resolved: false };
  }
}
