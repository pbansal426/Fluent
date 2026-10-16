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
  {
    options: ['Shawn', 'Sean'],
    prompt: (lang) => (lang === 'es' ? '¿Se escribe Shawn con S-H-A-W-N o Sean con S-E-A-N?' : 'Got it — is that Shawn (S-H-A-W-N) or Sean (S-E-A-N)?'),
    resolveRule: (said) => {
      if (/\b(shawn|with a w|con w|s[\s-]*h[\s-]*a[\s-]*w[\s-]*n)\b/i.test(said)) return 'Shawn';
      if (/\b(sean|with ea|con e|s[\s-]*e[\s-]*a[\s-]*n)\b/i.test(said)) return 'Sean';
      return null;
    },
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

    if (!this.isNameField(field)) {
      return { needsConfirmation: false, value: cleanValue };
    }

    const spelled = this.normalizeSpelledWord(said);
    if (spelled !== said.trim() && spelled.length >= 2) {
      return { needsConfirmation: false, value: spelled };
    }

    const words = cleanValue.split(/\s+/);
    const lowerWords = words.map((w) => w.toLowerCase());
    const lowerAltTokens = new Set(
      (alternatives || [])
        .flatMap((a) => String(a || '').trim().split(/\s+/))
        .filter(Boolean)
        .map((t) => t.toLowerCase())
    );
    const langCode = /^es|spanish|espa/i.test(String(lang || '')) ? 'es' : 'en';

    for (const group of VARIANT_GROUPS) {
      const lowerOpts = group.options.map((o) => o.toLowerCase());
      let matchIdx = lowerWords.findIndex((w) => lowerOpts.includes(w));
      if (matchIdx < 0 && lowerOpts.some((o) => lowerAltTokens.has(o))) {
        matchIdx = 0;
      }
      if (matchIdx >= 0) {
        const replaceAt = (replacement) => words.map((w, idx) => (idx === matchIdx ? replacement : w)).join(' ');
        const alreadyDisambiguated = group.resolveRule(said);
        if (alreadyDisambiguated) {
          return { needsConfirmation: false, value: replaceAt(alreadyDisambiguated) };
        }
        return {
          needsConfirmation: true,
          variantType: 'name_split',
          options: group.options.map((o) => replaceAt(o)),
          baseOptions: [...group.options],
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
