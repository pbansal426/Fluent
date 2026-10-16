// extension/lib/form-session.js
// Universal form session adapter (DOM, PDF, and headless/telephony schemas),
// milestone progress tracker, document location hint catalog, and bilingual review builder.

const headingOf = (f) => (f?.label && f.label.includes(': ') ? f.label.split(': ')[0].trim() : '');
const sectionNameOf = (f) => (f?.section && f.section.trim()) || headingOf(f) || 'General Information';

const DOCUMENT_HINTS = [
  {
    id: 'insurance_group',
    match: /\b(group\s*(number|no|id|#)|rx\s*grp|n[uú]mero\s+de\s+grupo)\b/i,
    sampleCode: 'GRP: 748291',
    highlightZone: 'bottom-left',
    en: {
      cardTitle: 'Health Insurance Card',
      whereToLook: 'Look on the front of your insurance card next to "GRP" or "Group #".',
    },
    es: {
      cardTitle: 'Tarjeta de Seguro Médico',
      whereToLook: 'Busque en el frente de su tarjeta de seguro junto a las letras "GRP" o "Group".',
    },
  },
  {
    id: 'insurance_member',
    match: /\b(member\s*id|policy\s*(number|no|#)|subscriber\s*id|id\s+de\s+miembro|n[uú]mero\s+de\s+p[oó]liza)\b/i,
    sampleCode: 'ID: W98234102',
    highlightZone: 'center-left',
    en: {
      cardTitle: 'Insurance Member ID',
      whereToLook: 'Look near the middle of your insurance card next to "Member ID" or "Subscriber ID".',
    },
    es: {
      cardTitle: 'ID de Miembro del Seguro',
      whereToLook: 'Busque en el centro de su tarjeta de seguro junto a "Member ID" o "Subscriber ID".',
    },
  },
  {
    id: 'rx_bin',
    match: /\b(rx\s*bin|rx\s*pcn|bin\s*number)\b/i,
    sampleCode: 'RxBIN: 610014',
    highlightZone: 'bottom-right',
    en: {
      cardTitle: 'Pharmacy Benefit (RxBIN)',
      whereToLook: 'Look on the front or back corner of your insurance card for "RxBIN" (usually 6 digits).',
    },
    es: {
      cardTitle: 'Código de Farmacia (RxBIN)',
      whereToLook: 'Busque en una esquina de su tarjeta de seguro las letras "RxBIN" (usualmente 6 dígitos).',
    },
  },
  {
    id: 'alien_number',
    match: /\b(alien\s+registration|a-?number|uscis\s*#|n[uú]mero\s+de\s+registro\s+de\s+extranjero|n[uú]mero\s+a)\b/i,
    sampleCode: 'A-098-765-432',
    highlightZone: 'center-right',
    en: {
      cardTitle: 'USCIS Green Card / Work Permit',
      whereToLook: 'Look on your Green Card or Work Permit under "USCIS#" — it starts with the letter A followed by 7 to 9 digits.',
    },
    es: {
      cardTitle: 'Tarjeta de Residencia / Permiso (USCIS)',
      whereToLook: 'Mire en su Green Card o Permiso de Trabajo bajo "USCIS#" — empieza con la letra A seguida de 7 a 9 números.',
    },
  },
  {
    id: 'ein_number',
    match: /\b(employer\s+identification|ein\b|federal\s+tax\s+id|identificaci[oó]n\s+del\s+empleador)\b/i,
    sampleCode: '12-3456789',
    highlightZone: 'top-left',
    en: {
      cardTitle: 'Form W-2 (Box b)',
      whereToLook: 'Look near the top left of your W-2 form in Box b ("Employer identification number").',
    },
    es: {
      cardTitle: 'Formulario W-2 (Casilla b)',
      whereToLook: 'Busque arriba a la izquierda en su formulario W-2, en la casilla b ("EIN").',
    },
  },
];

export function getDocumentHint(field, userLang = 'English') {
  if (!field) return null;
  const text = `${field.label || ''} ${field.name || ''} ${field.htmlId || ''}`.trim();
  if (!text) return null;
  const hit = DOCUMENT_HINTS.find((h) => h.match.test(text));
  if (!hit) return null;
  const isEs = /^es|spanish|espa/i.test(String(userLang || ''));
  const copy = isEs ? hit.es : hit.en;
  return {
    id: hit.id,
    cardTitle: copy.cardTitle,
    whereToLook: copy.whereToLook,
    highlightZone: hit.highlightZone,
    sampleCode: hit.sampleCode,
  };
}

export function getRequiredDocumentsSummary(fields = [], userLang = 'English') {
  const seen = new Set();
  const summary = [];
  for (const f of fields || []) {
    const hint = getDocumentHint(f, userLang);
    if (hint && !seen.has(hint.id)) {
      seen.add(hint.id);
      summary.push({
        id: hint.id,
        cardTitle: hint.cardTitle,
        whereToLook: hint.whereToLook,
        highlightZone: hint.highlightZone,
        sampleCode: hint.sampleCode,
      });
    }
  }
  return summary;
}

export function buildReviewItems({
  fields = [],
  values = new Map(),
  filled = new Set(),
  skipped = new Set(),
  translations = new Map(),
  typedPrivateLabel = 'typed by you, kept private',
  skippedLabel = 'skipped',
} = {}) {
  const items = [];
  for (const f of fields) {
    const isFilled = filled?.has(f.id);
    const isSkipped = skipped?.has(f.id);
    if (!isFilled && !isSkipped) continue;
    const tr = translations.get(f.id) || { label: f.label, options: f.options || [], section: f.section || '' };
    const cleanLabel = String(tr.label || f.label || '').replace(/[\s*:]+$/, '');
    const cleanOrig = String(f.label || '').replace(/[\s*:]+$/, '');
    const section = tr.section || sectionNameOf(f);
    if (isSkipped) {
      items.push({
        id: f.id,
        label: cleanLabel,
        originalLabel: cleanOrig,
        value: '',
        shownValue: skippedLabel || 'skipped',
        section,
        sensitive: !!f.sensitive,
        skipped: true,
      });
      continue;
    }
    if (f.sensitive) {
      items.push({
        id: f.id,
        label: cleanLabel,
        originalLabel: cleanOrig,
        value: '',
        shownValue: typedPrivateLabel,
        section,
        sensitive: true,
      });
      continue;
    }
    const rawVal = String(values.get(f.id) ?? '');
    let shownValue = rawVal;
    if (f.kind === 'checkbox') {
      shownValue = rawVal === 'true' ? '\u2713' : '\u2717';
    } else if (Array.isArray(f.options) && f.options.length) {
      const idx = f.options.indexOf(rawVal);
      if (idx >= 0 && Array.isArray(tr.options) && tr.options[idx]) {
        shownValue = tr.options[idx];
      }
    }
    items.push({
      id: f.id,
      label: cleanLabel,
      originalLabel: cleanOrig,
      value: rawVal,
      shownValue,
      section,
      sensitive: false,
    });
  }
  return items;
}

export class FormSession {
  constructor({ fields = [], milestones = [], metadata = {} } = {}) {
    this._fields = new Map(fields.map((f) => [f.id, { ...f }]));
    this._milestones = milestones.length > 0 ? milestones.map((m) => ({ ...m, fieldIds: [...m.fieldIds] })) : this._inferMilestones(fields);
    this._metadata = metadata;
    this._values = new Map();
    this._filled = new Set();
    this._skipped = new Set();
  }

  static fromSchema(schema = {}) {
    const fields = [];
    const milestones = [];
    if (Array.isArray(schema.sections) && schema.sections.length > 0) {
      for (const section of schema.sections) {
        const fieldIds = [];
        for (const field of section.fields || []) {
          fields.push({ ...field, section: section.title || section.id });
          fieldIds.push(field.id);
        }
        milestones.push({
          id: section.id,
          title: section.title || section.id,
          fieldIds,
        });
      }
    } else if (Array.isArray(schema.fields) && schema.fields.length > 0) {
      for (const field of schema.fields) {
        fields.push({ ...field });
      }
    }
    return new FormSession({ fields, milestones, metadata: { title: schema.title || '' } });
  }

  static fromDOM(fields = [], metadata = {}) {
    return new FormSession({ fields, metadata });
  }

  static fromPDF(fields = [], pdfMeta = {}) {
    return new FormSession({ fields, metadata: pdfMeta });
  }

  _inferMilestones(fields) {
    const groups = new Map();
    for (const f of fields) {
      const title = sectionNameOf(f);
      if (!groups.has(title)) groups.set(title, []);
      groups.get(title).push(f.id);
    }
    let idx = 1;
    const out = [];
    for (const [title, fieldIds] of groups.entries()) {
      out.push({
        id: `milestone-${idx++}`,
        title,
        fieldIds,
      });
    }
    return out;
  }

  getFields() {
    return Array.from(this._fields.values());
  }

  getField(id) {
    return this._fields.get(id) || null;
  }

  setValue(id, value) {
    const f = this._fields.get(id);
    if (!f) return;
    this._filled.add(id);
    this._skipped.delete(id);
    if (!f.sensitive) this._values.set(id, String(value));
  }

  markFilled(id, value) {
    const f = this._fields.get(id);
    if (!f) return;
    this._filled.add(id);
    this._skipped.delete(id);
    if (!f.sensitive && value !== undefined) this._values.set(id, String(value));
  }

  markSkipped(id) {
    if (!this._fields.has(id)) return;
    this._filled.delete(id);
    this._values.delete(id);
    this._skipped.add(id);
  }

  clearField(id) {
    this._filled.delete(id);
    this._skipped.delete(id);
    this._values.delete(id);
  }

  getValue(id) {
    return this._values.get(id) ?? null;
  }

  toPageAdapter() {
    return {
      scan: async () => ({
        fields: this.getFields().map((f) => ({
          inputType: 'text',
          name: '',
          htmlId: '',
          autocomplete: '',
          placeholder: '',
          helpText: '',
          required: false,
          maxLength: 0,
          options: [],
          value: this.getValue(f.id) || '',
          ...f,
        })),
        texts: [],
        pageLang: this._metadata?.lang || 'en',
      }),
      apply: async () => ({ ok: true }),
      highlight: async () => ({ ok: true }),
      focus: async () => ({ ok: true }),
      fill: async (id, value) => {
        const f = this.getField(id);
        if (!f) return { ok: false, error: 'not_found' };
        const str = String(value ?? '');
        if (str === '') {
          this.clearField(id);
          return { ok: true, value: '' };
        }
        if (Array.isArray(f.options) && f.options.length && !f.options.includes(str)) {
          return { ok: false, error: 'invalid_option' };
        }
        this.setValue(id, str);
        return { ok: true, value: str };
      },
      read: async (id) => ({ ok: true, value: this.getValue(id) || '' }),
    };
  }

  syncState({ filled = new Set(), skipped = new Set(), values = new Map(), translations = new Map(), groupedFields = [] } = {}) {
    this._filled = new Set(filled);
    this._skipped = new Set(skipped);
    this._values = new Map();
    for (const [k, v] of values.entries()) {
      const f = this._fields.get(k);
      if (f && !f.sensitive) this._values.set(k, String(v));
    }
    this._translations = translations;
    for (const gf of groupedFields) {
      if (!Array.isArray(gf.members) || !gf.members.length) continue;
      if (this._filled.has(gf.id)) {
        const chosenOpt = values.get(gf.id);
        for (const m of gf.members) {
          this._filled.add(m.id);
          this._skipped.delete(m.id);
          if (chosenOpt !== undefined) {
            this._values.set(m.id, m.option === chosenOpt ? 'true' : 'false');
          }
        }
      } else if (this._skipped.has(gf.id)) {
        for (const m of gf.members) {
          this._skipped.add(m.id);
          this._filled.delete(m.id);
          this._values.delete(m.id);
        }
      } else {
        for (const m of gf.members) {
          this._filled.delete(m.id);
          this._skipped.delete(m.id);
          this._values.delete(m.id);
        }
      }
    }
  }

  getMilestones() {
    const total = this._milestones.length;
    return this._milestones.map((m, idx) => {
      let completedCount = 0;
      for (const id of m.fieldIds) {
        if (this._filled.has(id) || this._skipped.has(id)) completedCount++;
      }
      const remainingCount = Math.max(0, m.fieldIds.length - completedCount);
      const firstField = this._fields.get(m.fieldIds[0]);
      const trSection = firstField && this._translations?.get(firstField.id)?.section;
      return {
        id: m.id,
        title: trSection || m.title,
        index: idx + 1,
        total,
        fieldIds: [...m.fieldIds],
        completedCount,
        remainingCount,
        completed: remainingCount === 0 && m.fieldIds.length > 0,
      };
    });
  }

  getCurrentMilestone(currentFieldId = null) {
    const milestones = this.getMilestones();
    if (!milestones.length) return null;
    if (currentFieldId) {
      const hit = milestones.find((m) => m.fieldIds.includes(currentFieldId));
      if (hit) return hit;
    }
    return milestones.find((m) => !m.completed) || milestones[milestones.length - 1];
  }

  isComplete() {
    for (const f of this._fields.values()) {
      if (f.required && !this._filled.has(f.id)) return false;
    }
    return this._fields.size > 0 && Array.from(this._fields.keys()).every((id) => this._filled.has(id) || this._skipped.has(id) || !this._fields.get(id).required);
  }
}
