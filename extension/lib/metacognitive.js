// extension/lib/metacognitive.js
// Phonetic ambiguity detection and low-friction spelling confirmation for names, addresses, and emails.

const NAME_FIELD = /\b(first|last|given|family|middle|full|legal)\s+name\b|\bapellido\b|\bnombre\b|\bsurname\b/i;
const NOT_PERSON_NAME = /user\s*name|file\s*name|company|business|employer|street|school|city|country|state/i;

const VARIANT_GROUPS = [
  {
    options: ['Bryan', 'Brian'],
    prompt: (lang) => (lang === 'es' ? '¿Se escribe Bryan con Y o Brian con I?' : 'Got it — is that Bryan with a Y or Brian with an I?'),
    resolveRule: (said) => {
      if (/\b(with a y|con y|con i griega|con ye|\by\b)\b/i.test(said)) return 'Bryan';
      if (/\b(with an i|con i|con i latina|\bi\b)\b/i.test(said)) return 'Brian';
      return null;
    },
  },
  {
    options: ['Sarah', 'Sara'],
    prompt: (lang) => (lang === 'es' ? '¿Sara se escribe con H o sin H al final?' : 'Got it — is that Sarah with an H or Sara without an H?'),
    resolveRule: (said) => {
      if (/\b(without (an )?h|no h|sin h)\b/i.test(said)) return 'Sara';
      if (/\b(with (an )?h|con h|\bh\b)\b/i.test(said)) return 'Sarah';
      return null;
    },
  },
  {
    options: ['John', 'Jon'],
    prompt: (lang) => (lang === 'es' ? '¿Se escribe J-O-H-N con H o J-O-N sin H?' : 'Got it — is that J-O-H-N with an H or J-O-N?'),
    resolveRule: (said) => {
      if (/\b(without (an )?h|no h|sin h|j[\s-]*o[\s-]*n)\b/i.test(said)) return 'Jon';
      if (/\b(with (an )?h|con h|j[\s-]*o[\s-]*h[\s-]*n|\bh\b)\b/i.test(said)) return 'John';
      return null;
    },
  },
  {
    options: ['Marc', 'Mark'],
    prompt: (lang) => (lang === 'es' ? '¿Se escribe Marc con C o Mark con K?' : 'Got it — is that Marc with a C or Mark with a K?'),
    resolveRule: (said) => {
      if (/\b(with a c|con c|\bc\b)\b/i.test(said)) return 'Marc';
      if (/\b(with a k|con k|\bk\b)\b/i.test(said)) return 'Mark';
      return null;
    },
  },
  {
    options: ['Steven', 'Stephen'],
    prompt: (lang) => (lang === 'es' ? '¿Se escribe Steven con V o Stephen con P-H?' : 'Got it — is that Steven with a V or Stephen with P-H?'),
    resolveRule: (said) => {
      if (/\b(with a v|con v|\bv\b)\b/i.test(said)) return 'Steven';
      if (/\b(with p[\s-]*h|con p[\s-]*h|\bph\b)\b/i.test(said)) return 'Stephen';
      return null;
    },
  },
  {
    options: ['Eric', 'Erik'],
    prompt: (lang) => (lang === 'es' ? '¿Se escribe Eric con C o Erik con K?' : 'Got it — is that Eric with a C or Erik with a K?'),
    resolveRule: (said) => {
      if (/\b(with a c|con c|\bc\b)\b/i.test(said)) return 'Eric';
      if (/\b(with a k|con k|\bk\b)\b/i.test(said)) return 'Erik';
      return null;
    },
  },
];

export class MetacognitiveResolver {
  isNameField(field) {
    const label = String(field?.label || '');
    return NAME_FIELD.test(label) && !NOT_PERSON_NAME.test(label);
  }

  normalizeSpelledWord(input) {
    if (!input || typeof input !== 'string') return '';
    const cleaned = input.replace(/\b(?:as in|like|como en|de)\s+[A-Za-zÀ-ÿ]+/gi, ' ');
    const tokens = cleaned.split(/[\s,.-]+/).filter(Boolean);
    if (tokens.length >= 2 && tokens.every((t) => /^[A-Za-z]$/.test(t))) {
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
    if (!cleanValue || !this.isNameField(field)) {
      return { needsConfirmation: false, value: cleanValue };
    }

    const spelled = this.normalizeSpelledWord(said);
    if (spelled !== said.trim() && spelled.length >= 2) {
      return { needsConfirmation: false, value: spelled };
    }

    const lowerVal = cleanValue.toLowerCase();
    const lowerAlts = (alternatives || []).map((a) => String(a || '').trim().toLowerCase());
    const langCode = /^es|spanish|espa/i.test(String(lang || '')) ? 'es' : 'en';

    for (const group of VARIANT_GROUPS) {
      const lowerOpts = group.options.map((o) => o.toLowerCase());
      if (lowerOpts.includes(lowerVal) || lowerAlts.some((a) => lowerOpts.includes(a))) {
        const alreadyDisambiguated = group.resolveRule(said);
        if (alreadyDisambiguated) {
          return { needsConfirmation: false, value: alreadyDisambiguated };
        }
        return {
          needsConfirmation: true,
          variantType: 'name_split',
          options: [...group.options],
          prompt: group.prompt(langCode),
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
    for (const opt of pending.options) {
      if (spelled.toLowerCase() === opt.toLowerCase() || text.toLowerCase() === opt.toLowerCase()) {
        return { resolved: true, value: opt };
      }
    }

    for (const group of VARIANT_GROUPS) {
      if (group.options[0] === pending.options[0]) {
        const hit = group.resolveRule(text);
        if (hit) return { resolved: true, value: hit };
      }
    }

    for (const opt of pending.options) {
      const re = new RegExp(`\\b${opt}\\b`, 'i');
      if (re.test(text)) return { resolved: true, value: opt };
    }

    return { resolved: false };
  }
}
