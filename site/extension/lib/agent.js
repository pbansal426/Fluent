// The conversation conductor. Code owns the order of questions and the privacy rules;
// the model only translates and interprets what the user said.
import { classify, redactPrivate } from './sensitive.js';
import { groupChoices, matchOption, fuzzyOption } from './choices.js';
import { validateValue, plainYesNo, looksLikeSkip } from './audit.js';
import { detectLanguage, language } from './language.js';
import { FormSession, getDocumentHint, buildReviewItems, getRequiredDocumentsSummary } from './form-session.js';
import { MetacognitiveResolver } from './metacognitive.js';
import {
  PHRASES,
  TOOLS,
  turnSystemPrompt,
  overviewPrompt,
  OVERVIEW_SCHEMA,
  translateFieldsPrompt,
  TRANSLATE_FIELDS_SCHEMA,
  translateTextsPrompt,
  TRANSLATE_TEXTS_SCHEMA,
  translateAnswerPrompt,
  translatePhrases,
} from './prompts.js';

const FIRST_CHUNK = 4; // small, so the first question comes quickly
const FIELD_CHUNK = 10;
const TEXT_CHUNK = 12;
const HISTORY_TURNS = 6;
const MAX_SPOKEN_OPTIONS = 8;
const MAX_READBACK = 15;
const MAX_REMAINING = 10;

const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
// The part of a form a field belongs to: its section, or the question heading in "Heading: item" labels.
const headingOf = (f) => (f.label.includes(': ') ? f.label.split(': ')[0] : '');
const groupOf = (f) => f.section || headingOf(f);
// "1 million", "2.5 mil", "3k": the number the user meant, as digits, so "1000000" is not mistaken for an invented one.
const SCALES = { k: 1e3, thousand: 1e3, mil: 1e3, miles: 1e3, million: 1e6, millon: 1e6, millones: 1e6, billion: 1e9, billon: 1e9, billones: 1e9 };
const scaledNumbers = (said) =>
  [...String(said).matchAll(/(\d+(?:[.,]\d+)?)\s*(k|thousand|mil|miles|million|mill[oó]n|millones|billion|bill[oó]n|billones)\b/gi)].map((m) => {
    const scale = SCALES[m[2].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')];
    return String(Math.round(parseFloat(m[1].replace(',', '.')) * scale));
  });
// "Name *:" -> "Name"
const bare = (label) => label.replace(/[\s*:.]+$/, '');
// "Name" -> "Name."   "Need help?" -> "Need help?"
const sentence = (label) => (/[?!؟。？！]$/.test(bare(label)) ? bare(label) : `${bare(label)}.`);

export class Agent {
  // page: { scan, apply, highlight, focus, fill, read }   (all async, talk to the web page)
  constructor({ llm, page, ui, userLang, phrases = PHRASES, sessionModel = null, autoTranslatePhrases = false }) {
    this.llm = llm;
    this.page = page;
    this.ui = ui;
    this.userLang = userLang;
    this.phrases = phrases;
    this._customPhrases = phrases !== PHRASES;
    this._autoTranslatePhrases = autoTranslatePhrases;
    this.fields = [];
    this.translations = new Map(); // id -> { label, explanation, options }
    this.pending = new Map(); // id -> promise resolved when its translation is in
    this.values = new Map(); // id -> value written (never holds private values)
    this.filled = new Set();
    this.skipped = new Set();
    this.history = [];
    this.lastFill = null; // the last non-private answer written, so "no, I mean ..." can correct it
    this.helpCount = new Map(); // field id -> times the user got help without answering
    this.current = null;
    this.formLang = '';
    this.mode = 'idle'; // idle | listen | type | done
    this.busy = false;
    this.sessionModel = sessionModel || new FormSession();
    this._customSessionModel = !!sessionModel;
    this.metacognitive = new MetacognitiveResolver();
    this.pendingConfirm = null;
  }

  static fromSchema(schema, opts = {}) {
    const session = FormSession.fromSchema(schema);
    const agent = new Agent({
      ...opts,
      page: session.toPageAdapter(),
      sessionModel: session,
      autoTranslatePhrases: opts.phrases ? false : true,
    });
    return { agent, session };
  }

  log(event, data) {
    if (typeof console !== 'undefined' && console.log) {
      if (event === 'turn') {
        const callsStr = data.calls && data.calls.length ? JSON.stringify(data.calls) : '[] (no tools)';
        console.log(`[Fluent Agent] Turn: "${data.said}" -> calls: ${callsStr}${data.content ? `\n  Content: "${data.content}"` : ''}${data.reasoning ? `\n  Model Reasoning: ${data.reasoning}` : ''}`);
      } else if (event === 'fill') {
        console.log(`[Fluent Agent] Fill: ${data.field} = "${data.value}"${data.confirmed ? ' (confirmed spelling)' : ''}`);
      } else if (event === 'spelling-confirm') {
        console.log(`[Fluent Agent] Spelling check on ${data.field}: candidate "${data.candidate}", options:`, data.options);
      } else if (event === 'navigate') {
        console.log(`[Fluent Agent] Navigate: action=${data.action}, field=${data.field}, target=${data.target || 'none'}`);
      } else if (event === 'skip') {
        console.log(`[Fluent Agent] Skip: field=${data.field}`);
      } else if (event === 'ask_user') {
        console.log(`[Fluent Agent] Ask User: "${data.message}"`);
      }
    }
    this.ui.log?.(event, data);
  }

  async start() {
    this.ui.status('scan');
    if (this._autoTranslatePhrases && !this._customPhrases && this.llm && this.userLang && !/^english$/i.test(this.userLang)) {
      this.phrases = await translatePhrases(this.llm, this.userLang);
    }
    const scan = await this.page.scan();
    this.raw = new Map(scan.fields.map((f) => [f.id, { ...f, ...classify(f) }]));
    this.fields = groupChoices([...this.raw.values()]);
    if (!this._customSessionModel) {
      this.sessionModel = FormSession.fromDOM(this.fields);
    }
    if (!this.fields.length) {
      this.setMode('idle');
      await this.ui.say(this.phrases.no_form);
      return;
    }
    // What kind of form this is, so the model can translate and explain in context.
    this.context = [scan.title, ...(scan.texts || []).slice(0, 3).map((t) => t.text)].filter(Boolean).join(' · ').slice(0, 300);
    const detected = await detectLanguage(this.llm, scan);
    this.formLang = detected.name;
    this.sameLanguage = detected.code === language(this.userLang)?.code;
    this.ui.language?.(this.formLang, this.sameLanguage);
    this.log('scan', { formLang: this.formLang, same: this.sameLanguage, fields: this.fields.map((f) => `${f.kind}${f.sensitive ? ' PRIVATE' : ''}: ${f.label}`) });
    for (const f of this.fields) {
      if (!f.value) continue;
      this.filled.add(f.id);
      if (!f.sensitive) this.values.set(f.id, f.value);
    }
    this.translating = this.translateAll(this.fields, scan.texts || []);
    const overview = this.overview(scan); // asked now, spoken right after the greeting
    this.ui.status('ready');
    await this.ui.say(this.phrases.greeting);
    const about = await overview;
    const docs = getRequiredDocumentsSummary(this.fields, this.userLang);
    let docNotice = '';
    if (docs.length > 0) {
      const isEs = /^es|spanish|espa/i.test(String(this.userLang || ''));
      const docTitles = docs.map((d) => d.cardTitle).join(', ');
      docNotice = isEs
        ? `Es útil tener a mano su ${docTitles}, o podemos omitirlo por ahora.`
        : `It helps to have your ${docTitles} handy, or we can skip it for now.`;
    }
    const spokenOverview = [about, docNotice].filter(Boolean).join(' ');
    if (spokenOverview) await this.ui.say(spokenOverview);
    await this.advance();
  }

  // One or two simple sentences, in the user's language, on what this form is. Never blocks the conversation.
  async overview(scan) {
    try {
      const sections = [...new Set(this.fields.map((f) => f.section || (f.label.includes(': ') ? f.label.split(': ')[0] : '')).filter(Boolean))].slice(0, 8);
      const out = await this.llm.chatJson({
        messages: [
          { role: 'system', content: overviewPrompt({ userLang: this.userLang, formLang: this.formLang, title: scan.title, context: this.context, sections, fieldCount: this.fields.length }) },
          { role: 'user', content: JSON.stringify({ title: scan.title || '' }) },
        ],
        responseFormat: OVERVIEW_SCHEMA,
        maxTokens: 300,
      });
      const text = String(out?.overview || '').trim();
      this.log('overview', { text });
      return text.length >= 10 && text.length <= 600 ? text : '';
    } catch {
      return '';
    }
  }

  // The page's helper script was lost and reinjected (extension reloaded, page frozen): its field ids start over.
  // Match the new fields to the old ones by label and keep everything the user already did.
  // Returns Map(oldId -> newId); empty when nothing matched.
  async relink(page = this.page) {
    const scan = await page.scan();
    const incoming = scan.fields.map((f) => ({ ...f, ...classify(f) }));
    const taken = new Set();
    const idMap = new Map();
    for (const old of this.raw.values()) {
      const hit = incoming.find((n) => !taken.has(n.id) && n.label === old.label && n.kind === old.kind);
      if (hit) {
        taken.add(hit.id);
        idMap.set(old.id, hit.id);
      }
    }
    if (!idMap.size) return idMap;
    const re = (id) => idMap.get(id) ?? id;
    this.filled = new Set([...this.filled].map(re));
    this.skipped = new Set([...this.skipped].map(re));
    for (const key of ['values', 'translations', 'pending', 'helpCount']) this[key] = new Map([...this[key]].map(([k, v]) => [re(k), v]));
    this.raw = new Map([...this.raw].map(([k, f]) => [re(k), f]));
    const seen = new Set();
    for (const f of [...this.raw.values(), ...this.fields]) {
      if (seen.has(f)) continue;
      seen.add(f);
      f.id = re(f.id);
      for (const m of f.members || []) m.id = re(m.id);
    }
    if (this.lastFill) this.lastFill.field_id = re(this.lastFill.field_id);
    if (this.pendingConfirm) this.pendingConfirm.fieldId = re(this.pendingConfirm.fieldId);
    await page.apply({ fields: this.fields.filter((f) => this.translations.has(f.id)).map((f) => this.pagePayload(f)) });
    if (this.current) await page.highlight(this.current.id);
    this.log('relink', { matched: idMap.size, of: incoming.length });
    return idMap;
  }

  // The form grew or shrank (multi-step forms): pick up the new fields, keep what is done.
  async rescan() {
    const scan = await this.page.scan();
    const before = new Set(this.raw.keys());
    this.raw = new Map(scan.fields.map((f) => [f.id, this.raw.get(f.id) || { ...f, ...classify(f) }]));
    const known = new Map(this.fields.map((f) => [f.id, f]));
    const grouped = groupChoices([...this.raw.values()]);
    // A group keeps its earlier object (and its translations) when its first box was already known.
    this.fields = grouped.map((f) => (before.has(f.id) && known.get(f.id)) || f);
    if (!this._customSessionModel) {
      this.sessionModel = FormSession.fromDOM(this.fields);
    }
    const fresh = this.fields.filter((f) => !this.translations.has(f.id) && !before.has(f.id));
    // The page rebuilt its registry, so translations must be re-attached.
    await this.page.apply({ fields: this.fields.filter((f) => this.translations.has(f.id)).map((f) => this.pagePayload(f)) });
    if (fresh.length) this.translating = this.translateAll(fresh, []);
    if (this.mode === 'done' || !this.current || !this.fields.includes(this.current)) await this.advance();
  }

  async translateAll(fields, texts) {
    // Same language: no badges or text translation, but the questions still get simple wording.
    if (this.sameLanguage) texts = [];
    const fieldChunks = [fields.slice(0, FIRST_CHUNK), ...chunks(fields.slice(FIRST_CHUNK), FIELD_CHUNK)].filter((c) => c.length);
    const jobs = fieldChunks.map((chunk) => {
      let resolve;
      const promise = new Promise((r) => (resolve = r));
      for (const f of chunk) this.pending.set(f.id, promise);
      return { chunk, resolve };
    });
    for (const { chunk, resolve } of jobs) {
      await this.translateFields(chunk);
      resolve();
    }
    for (const chunk of chunks(texts, TEXT_CHUNK)) {
      try {
        const out = await this.llm.chatJson({
          messages: [
            { role: 'system', content: translateTextsPrompt(this.userLang) },
            { role: 'user', content: JSON.stringify(chunk) },
          ],
          responseFormat: TRANSLATE_TEXTS_SCHEMA,
          maxTokens: 2500,
        });
        await this.page.apply({ texts: (out.texts || []).filter((t) => t && t.id && t.text) });
      } catch {
        // Surrounding text is a nicety; the questions still work without it.
      }
    }
  }

  async translateFields(chunk) {
    let out = null;
    try {
      out = await this.llm.chatJson({
        messages: [
          { role: 'system', content: translateFieldsPrompt(this.userLang, this.context, this.sameLanguage) },
          {
            role: 'user',
            content: JSON.stringify(
              chunk.map((f) => ({ id: f.id, label: f.label, kind: f.kind, section: f.section || undefined, hint: f.helpText || f.placeholder || undefined, options: f.options }))
            ),
          },
        ],
        responseFormat: TRANSLATE_FIELDS_SCHEMA,
        maxTokens: 2500,
      });
    } catch (e) {
      this.log('translate-failed', { fields: chunk.length, message: String(e?.message), raw: e?.raw });
      // A reply that could not be read: try the two halves separately. A smaller request usually works, and the user
      // never sees a half-translated form turn into an error. Real failures (bad key, no connection) are still shown.
      if (e?.kind === 'bad_json' && chunk.length > 1) {
        const mid = Math.ceil(chunk.length / 2);
        await this.translateFields(chunk.slice(0, mid));
        await this.translateFields(chunk.slice(mid));
        return;
      }
      if (e?.kind !== 'bad_json') this.ui.error(e);
    }
    const byId = new Map((out?.fields || []).map((t) => [t.id, t]));
    const applied = [];
    for (const f of chunk) {
      const t = byId.get(f.id);
      const options = t && Array.isArray(t.options) && t.options.length === f.options.length ? t.options : f.options;
      // Small models sometimes hand the label back untranslated; for English there is a second source.
      const english = /^english$/i.test(this.userLang) && t?.english;
      const label = this.sameLanguage ? f.label : (t?.label && t.label !== f.label ? t.label : english) || t?.label || f.label;
      const tr = {
        label,
        explanation: t?.explanation || '',
        question: (t?.question || '').trim(),
        options: this.sameLanguage ? f.options : options,
        section: f.section ? (this.sameLanguage ? f.section : t?.section || f.section) : '',
      };
      this.translations.set(f.id, tr);
      applied.push({ id: f.id, ...tr, hintOnly: this.sameLanguage });
      // The privacy rules read English; on a form in another language, check the English label too.
      if (t?.english && !f.sensitive && classify({ ...f, label: t.english }).sensitive) f.sensitive = true;
    }
    if (applied.length) await this.page.apply({ fields: applied });
  }

  // What the page is given for a field: the translation badge, or (same language) only the description.
  pagePayload(f) {
    return { id: f.id, ...this.translations.get(f.id), hintOnly: this.sameLanguage };
  }

  tr(field) {
    return this.translations.get(field.id) || { label: field.label, explanation: '', options: field.options, section: field.section || '' };
  }

  // The field's name as spoken; the first field of each form section is announced with it.
  spokenLabel(field) {
    const t = this.tr(field);
    const label = sentence(t.label);
    const newSection = t.section && field.section !== this.lastSection;
    this.lastSection = field.section;
    return newSection ? `${sentence(t.section)} ${label}` : label;
  }

  _syncSession() {
    this.sessionModel.syncState({
      filled: this.filled,
      skipped: this.skipped,
      values: this.values,
      translations: this.translations,
      groupedFields: this.fields,
    });
  }

  getMilestones() {
    this._syncSession();
    return this.sessionModel.getMilestones();
  }

  getCurrentMilestone() {
    this._syncSession();
    return this.sessionModel.getCurrentMilestone(this.current?.id);
  }

  getDocumentHint(field = this.current) {
    return getDocumentHint(field, this.userLang);
  }

  getReviewSummary() {
    const isEs = /^es|spanish|espa/i.test(String(this.userLang || ''));
    return buildReviewItems({
      fields: this.fields,
      values: this.values,
      filled: this.filled,
      skipped: this.skipped,
      translations: this.translations,
      typedPrivateLabel: this.phrases.typed_private,
      skippedLabel: isEs ? 'omitido' : 'skipped',
    });
  }

  async editField(fieldId) {
    const field = this.fields.find((f) => f.id === fieldId);
    if (!field || this.busy) return;
    this.pendingConfirm = null;
    this.skipped.delete(field.id);
    this.filled.delete(field.id);
    await this.advance(field);
  }

  async setUserLanguage(userLang, phrases = this.phrases) {
    if (!userLang || userLang === this.userLang) return;
    this.userLang = userLang;
    if (this._autoTranslatePhrases && this.llm && !/^english$/i.test(userLang)) {
      this.phrases = await translatePhrases(this.llm, userLang);
    } else {
      this.phrases = { ...PHRASES, ...phrases };
    }
    this.pendingConfirm = null;
    this.lastSection = '';
    this.sameLanguage = language(this.formLang)?.code === language(this.userLang)?.code;
    this.ui.language?.(this.formLang, this.sameLanguage);
    this.translations.clear();
    this.translating = this.translateAll(this.fields, []);
    if (this.current) {
      await this.advance(this.current);
    } else if (this.mode === 'done') {
      await this.translating;
      this.setMode('done');
    }
  }

  setMode(mode) {
    this.mode = mode;
    const f = this.current;
    this.ui.prompt({
      mode,
      field: f ? { id: f.id, label: this.tr(f).label, sensitive: f.sensitive, long: f.long } : null,
      canTranslate: mode === 'type' && !!f && f.long && !f.sensitive && !this.sameLanguage,
      milestone: this.getCurrentMilestone(),
      documentHint: mode !== 'done' ? this.getDocumentHint(f) : null,
      review: mode === 'done' ? this.getReviewSummary() : null,
    });
  }

  // The question stays on the current field until it is answered or skipped; then the next open field
  // after it, wrapping round to anything the user jumped over.
  nextField() {
    const open = (f) => !!f && !this.filled.has(f.id) && !this.skipped.has(f.id);
    if (open(this.current) && this.fields.includes(this.current)) return this.current;
    const i = this.fields.indexOf(this.current);
    return this.fields.slice(i + 1).find(open) || this.fields.find(open) || null;
  }

  question(field) {
    const t = this.tr(field);
    const parts = [];
    if (t.question) {
      // Conversational: a natural question, with the section named when it changes.
      const newSection = t.section && field.section !== this.lastSection;
      this.lastSection = field.section;
      parts.push(newSection ? `${(this.phrases.next_section || 'Next, for {section}:').replace('{section}', bare(t.section))} ${t.question}` : t.question);
    } else {
      parts.push(this.spokenLabel(field));
      if (t.explanation) parts.push(t.explanation);
      if (field.kind === 'checkbox') parts.push(this.phrases.checkbox);
    }
    if (field.kind !== 'checkbox' && t.options.length && t.options.length <= MAX_SPOKEN_OPTIONS) parts.push(`${this.phrases.options}: ${t.options.join(', ')}.`);
    const docHint = this.getDocumentHint(field);
    if (docHint?.whereToLook) parts.push(docHint.whereToLook);
    // Said once, not after every question.
    if (!field.required && !this.saidSkipHint) {
      this.saidSkipHint = true;
      parts.push(this.phrases.optional);
    }
    return parts.join(' ');
  }

  async advance(target = null) {
    const next = target || this.nextField();
    if (this.pendingConfirm && this.pendingConfirm.fieldId !== next?.id) {
      this.pendingConfirm = null;
    }
    this.current = next;
    if (!next) {
      // A long PDF: carry on with the next page that has fields before calling it done.
      const moved = await this.page.nextPage?.().catch(() => null);
      if (moved?.moved) {
        await this.ui.say(this.phrases.next_page);
        return this.rescan();
      }
      await this.page.highlight(null);
      this.setMode('done');
      await this.ui.say(this.phrases.done);
      return;
    }
    await this.page.highlight(next.id);
    await this.pending.get(next.id);
    await this.page.highlight(next.id); // again, so the fresh badge shows its explanation
    if (next.sensitive || next.long) {
      await this.page.focus(next.id);
      this.setMode('type');
      const docHint = this.getDocumentHint(next);
      const hintSuffix = docHint?.whereToLook ? ` ${docHint.whereToLook}` : '';
      this.lastSpoken = `${this.spokenLabel(next)} ${next.sensitive ? this.phrases.type_private : this.phrases.type_long}${hintSuffix}`;
      await this.ui.say(this.lastSpoken);
    } else {
      this.setMode('listen');
      this.lastAsked = this.question(next);
      this.lastSpoken = this.lastAsked;
      await this.ui.say(this.lastSpoken);
    }
  }

  findField(idOrLabel) {
    if (!idOrLabel) return null;
    const s = String(idOrLabel).trim().toLowerCase();
    let hit = this.fields.find((f) => f.id === idOrLabel);
    if (hit) return hit;
    hit = this.fields.find((f) => f.id?.toLowerCase() === s || f.htmlId?.toLowerCase() === s || f.name?.toLowerCase() === s);
    if (hit) return hit;
    hit = this.fields.find((f) => f.label?.trim().toLowerCase() === s || bare(f.label).toLowerCase() === s);
    if (hit) return hit;
    hit = this.fields.find((f) => {
      const tr = this.translations.get(f.id);
      return tr && (tr.label?.trim().toLowerCase() === s || bare(tr.label).toLowerCase() === s);
    });
    if (hit) return hit;
    hit = this.fields.find((f) => f.label?.toLowerCase().includes(s) || s.includes(f.label?.toLowerCase()));
    if (hit) return hit;
    return null;
  }

  // What the model is shown of the form: the current question in detail, the next few open ones, and what is answered.
  // Not the whole form: forty fields of noise made a small model lose the question it had just asked.
  modelView() {
    const cur = this.current;
    const brief = (f) => {
      const o = { id: f.id, label: f.label, kind: f.kind };
      if (f.htmlId && f.htmlId !== f.id) o.name = f.htmlId;
      else if (f.name && f.name !== f.id) o.name = f.name;
      if (f.section) o.section = f.section;
      if (f.options.length) o.options = f.options;
      if (f.required) o.required = true;
      if (f.sensitive) o.private = true;
      const tr = this.tr(f);
      if (tr && tr.label && tr.label !== f.label) o.user_label = tr.label;
      if (f.placeholder) o.placeholder = f.placeholder;
      return o;
    };
    const recent = new Set([...this.values.keys()].slice(-5));
    const docHint = cur ? this.getDocumentHint(cur) : null;
    return {
      current: cur
        ? {
            ...brief(cur),
            asks: this.tr(cur).explanation || undefined,
            question: this.tr(cur).question || undefined,
            document_hint: docHint?.whereToLook || undefined,
          }
        : null,
      open: this.fields.filter((f) => f !== cur && !this.filled.has(f.id) && !this.skipped.has(f.id)).slice(0, 8).map(brief),
      answered: this.fields
        .filter((f) => this.filled.has(f.id))
        .map((f) => (f.sensitive ? { id: f.id, label: f.label, private: true } : { id: f.id, label: f.label, ...(recent.has(f.id) ? { value: this.values.get(f.id) } : {}) })),
    };
  }

  // The older, whole-form view (kept for tests and tools).
  fieldsForModel() {
    return this.fields.map((f) => {
      const o = { id: f.id, label: f.label, kind: f.kind };
      if (f.section) o.section = f.section;
      if (f.options.length) o.options = f.options;
      if (f.required) o.required = true;
      if (f.sensitive) o.private = true;
      else if (this.values.has(f.id)) o.value = this.values.get(f.id);
      if (this.skipped.has(f.id)) o.skipped = true;
      return o;
    });
  }

  async handleUser(text, meta = {}) {
    text = String(text || '').trim();
    if (!text || this.busy || !this.fields.length) return;
    this.busy = true;
    try {
      await this.turn(text, meta);
    } catch (e) {
      this.ui.error(e);
    } finally {
      this.busy = false;
    }
  }

  // A bare "skip" (in English or the user's language) needs no interpreting.
  isSkip(text) {
    const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const said = norm(text);
    return !!said && [norm(this.phrases.skip_word), norm(this.phrases.btn_skip), 'skip'].includes(said);
  }

  async turn(text, meta = {}) {
    const startedAt = Date.now();
    if (this.current && this.mode === 'listen' && this.isSkip(text)) {
      this.history.push(`- User said "${text}"; ${this.current.label} was skipped.`);
      this.skipped.add(this.current.id);
      if (this.noteSkip(this.current)) await this.ui.say(this.phrases.skipped_group);
      return this.advance();
    }
    // Pasted details may hold a private number: the model never sees it.
    const { text: said, redacted } = redactPrivate(text);
    if (this.pendingConfirm && this.current && this.pendingConfirm.fieldId === this.current.id) {
      const pending = this.pendingConfirm;
      this.pendingConfirm = null;
      const resolved = this.metacognitive.resolveConfirmation(pending, said);
      if (resolved.resolved) {
        const field = this.current;
        const r = await this.fillField(field, String(resolved.value));
        if (r?.ok) {
          this.filled.add(field.id);
          this.skipped.delete(field.id);
          this.values.set(field.id, r.value);
          const item = { id: field.id, label: this.tr(field).label, original: field.label, value: r.value, shown: this.shownValue(field, r.value) };
          this.ui.filled([item]);
          this.log('fill', { field: field.label, value: r.value, confirmed: true });
          this.lastFill = { field_id: field.id, label: field.label, value: r.value };
          this.history.push(`- User confirmed spelling "${said}"; you wrote ${field.label} = "${r.value}".`);
          return this.advance();
        }
      }
    }
    // Other things the speech recogniser thought it heard (if it said so), best first.
    const alts = (meta.alts || []).map((a) => redactPrivate(a).text).filter((a) => a && a.toLowerCase() !== said.toLowerCase()).slice(0, 3);
    // A short answer to a choice question is matched in code, by meaning and by sound ("mail" -> "Male"), before the model is asked.
    const shortAnswer = said.split(/\s+/).length <= 3 && !/\d/.test(said);
    const fuzzy = this.current && ['select', 'radio'].includes(this.current.kind) && shortAnswer && !looksLikeSkip(said)
      ? fuzzyOption(this.current.options, this.tr(this.current).options, [said, ...alts]) : null;
    const quick = this.quickChoice(this.current, said) || fuzzy;
    if (fuzzy && fuzzy !== this.quickChoice(this.current, said)) this.log('fuzzy-choice', { said, alts, chose: fuzzy });
    const res = quick ? { content: '', toolCalls: [{ name: 'fill_fields', args: { values: [{ field_id: this.current.id, value: quick }] } }] } : await this.llm.chat({
      messages: [
        {
          role: 'system',
          content: turnSystemPrompt({
            userLang: this.userLang,
            formLang: this.formLang,
            current: this.current,
            view: this.modelView(),
            history: this.history.slice(-HISTORY_TURNS),
            context: this.context,
            asked: this.lastAsked,
            helped: this.helpCount.get(this.current?.id) || 0,
            lastFilled: this.lastFill,
          }),
        },
        { role: 'user', content: alts.length ? `${said}\n\n(Speech recognition also considered: ${alts.map((a) => `"${a}"`).join(', ')})` : said },
      ],
      tools: TOOLS,
      toolChoice: 'required',
      maxTokens: 800,
    });

    this.log('turn', {
      said,
      calls: res.toolCalls.map((c) => ({ name: c.name, args: c.args })),
      content: res.content || undefined,
      reasoning: res.reasoning || undefined,
      current: this.current?.label,
      ms: Date.now() - startedAt,
    });
    const done = [];
    const spoken = [];
    const navLog = [];
    let reply = '';
    let refusedPrivate = false;
    let progressed = false;
    let target = null;
    let info = false;
    let unclear = false;

    for (const call of res.toolCalls) {
      if (call.name === 'fill_fields') {
        for (const v of Array.isArray(call.args.values) ? call.args.values : []) {
          const field = this.findField(v?.field_id);
          if (!field) continue;
          let value = v.value;
          const copy = v.copy_from ? this.findField(v.copy_from) : null;
          if (v.copy_from) {
            // Only an answer already on the form, and never a private one, can be copied.
            const source = copy && copy !== field && !copy.sensitive ? this.values.get(copy.id) : '';
            if (field.sensitive) refusedPrivate = true;
            else if (!source) spoken.push(this.phrases.copied_nothing);
            if (field.sensitive || !source) continue;
            value = source;
          }
          if (value == null || value === '') continue;
          if (field.sensitive || String(value).includes('[private]')) {
            refusedPrivate = true;
            continue;
          }
          // Fluent only interprets: a number the user never gave does not go on the form.
          if (!copy && this.inventedNumber(String(value), text)) {
            this.log('reject', { field: field.label, value: String(value), reason: 'invented-number' });
            continue;
          }
          // Obvious non-answers (a placeholder email, the whole sentence, half a phone number) are not written.
          if (!copy) {
            const check = validateValue(field, value, said);
            if (!check.ok) {
              this.log('reject', { field: field.label, value: String(value), reason: check.reason });
              spoken.push(this.phrases[check.phrase]);
              continue;
            }
            value = check.value;
          }
          if (!copy) {
            const spell = this.metacognitive.assessSpelling(field, String(value), {
              said,
              alternatives: alts,
              lang: language(this.userLang)?.code || this.userLang,
            });
            if (spell.needsConfirmation) {
              if (!this.pendingConfirm) {
                this.pendingConfirm = {
                  fieldId: field.id,
                  candidate: spell.candidate,
                  options: spell.options,
                  baseOptions: spell.baseOptions,
                };
                this.log('spelling-confirm', { field: field.label, candidate: spell.candidate, options: spell.options });
                this.pendingPrompt = spell.prompt;
                spoken.push(spell.prompt);
              }
              continue;
            }
            value = spell.value;
          }
          const r = await this.fillField(field, String(value));
          if (!r?.ok) continue;
          if (this.pendingConfirm?.fieldId === field.id) this.pendingConfirm = null;
          this.filled.add(field.id);
          this.skipped.delete(field.id);
          this.skipStreak = { group: '', n: 0 };
          this.values.set(field.id, r.value);
          done.push({ id: field.id, label: this.tr(field).label, original: field.label, value: r.value, shown: this.shownValue(field, r.value) });
          this.log('fill', { field: field.label, value: r.value });
          this.lastFill = { field_id: field.id, label: field.label, value: r.value };
          if ((field.members || field.kind === 'radio') && /^(no|none|n\/a|not applicable)$/i.test(r.value)) this.skipDependents(field);
          progressed = true;
        }
      } else if (call.name === 'skip_field') {
        const field = this.findField(call.args.field_id) || this.current;
        if (field && !this.filled.has(field.id) && looksLikeSkip(text)) {
          this.skipped.add(field.id);
          this.log('skip', { field: field.label, userSaid: text });
          if (this.noteSkip(field)) spoken.push(this.phrases.skipped_group);
          progressed = true;
        } else if (field && !this.filled.has(field.id)) {
          // The model reached for skip_field, but the user never asked to skip: a mishearing or something said to
          // someone else. Ask again instead of silently moving on.
          this.log('ignored-skip', { said, field: field.label });
          unclear = true;
        }
      } else if (call.name === 'navigate') {
        const n = await this.navigate(call.args || {});
        if (n.say) spoken.push(n.say);
        if (n.target) target = n.target;
        if (n.handled) progressed = true;
        if (n.info) info = true;
        if (n.log) navLog.push(n.log);
        this.log('navigate', { action: call.args.action, field: call.args.field_id, target: target?.label });
      } else if ((call.name === 'ask_user' || call.name === 'ask_question') && call.args?.message) {
        reply = String(call.args.message);
        this.log('ask_user', { message: reply });
      }
    }
    if (!reply && res.content) reply = res.content;

    // Kept as a plain log inside the system prompt: as chat turns, small models start imitating it.
    const outcome = [
      done.length ? `you wrote ${done.map((d) => `${d.original} = "${d.value}"`).join(', ')}` : '',
      ...navLog,
      reply ? `you replied "${reply}"` : '',
    ].filter(Boolean).join('; ');
    this.history.push(`- User said "${said}"; ${outcome || 'nothing was filled'}.`);

    if (done.length) {
      this.ui.filled(done); // the green confirmation says it all; the assistant does not repeat it
    }
    if (refusedPrivate) await this.ui.say(this.phrases.private_refused);
    else if (redacted) await this.ui.say(this.phrases.redacted);
    // A spelling check is the only thing said: the other lines would bury the question.
    const confirmPrompt = this.pendingConfirm ? spoken.find((s) => s === this.pendingPrompt) : '';
    for (const s of confirmPrompt ? [confirmPrompt] : spoken) await this.ui.say(s);

    if (this.pendingConfirm) {
      const confirmField = this.fields.find((f) => f.id === this.pendingConfirm.fieldId);
      if (confirmField) {
        this.current = confirmField;
        const confirmPrompt = spoken.find((s) => s.includes('?') || s.length > 5);
        if (confirmPrompt) {
          this.lastAsked = confirmPrompt;
          this.lastSpoken = confirmPrompt;
        }
        this.setMode('listen');
        return;
      }
    }

    if (reply) {
      if (this.current) this.helpCount.set(this.current.id, (this.helpCount.get(this.current.id) || 0) + 1);
      await this.ui.say(reply);
      if (!progressed && !info) return;
    }

    // Reading things out is not an answer: carry on with the question that is waiting.
    if (progressed || (info && this.mode !== 'done')) return this.advance(target);
    if (!refusedPrivate && !redacted && !spoken.length && !reply) {
      // Not understood: say so and ask the question again (with its choices, if it has any), so the user is never
      // left wondering what was asked, for example after talking over the assistant or to someone else.
      const again = this.current && this.mode === 'listen' ? this.lastSpoken : '';
      await this.ui.say(again ? `${this.phrases.not_understood} ${again}` : this.phrases.not_understood);
    }
  }

  // Moves around the form on the user's request. The model only names an action; code does it and
  // decides what is read out, so private values stay private.
  async navigate({ action, field_id: id }) {
    const byId = id ? this.findField(id) : null;
    const label = (f) => bare(this.tr(f).label);
    const cur = this.current;
    switch (action) {
      case 'back': {
        const i = cur ? this.fields.indexOf(cur) : this.fields.length;
        if (i <= 0) return { say: this.phrases.first_question, info: true };
        const target = this.fields[i - 1];
        this.skipped.delete(target.id);
        return { target, handled: true, log: `you went back to ${target.label}` };
      }
      case 'goto': {
        if (!byId) return {};
        this.skipped.delete(byId.id);
        return { target: byId, handled: true, log: `you went to ${byId.label}` };
      }
      case 'clear': {
        const field = byId || cur;
        if (!field) return {};
        const r = await this.fillField(field, '');
        if (!r?.ok) return {};
        this.filled.delete(field.id);
        this.skipped.delete(field.id);
        this.values.delete(field.id);
        if (this.pendingConfirm?.fieldId === field.id) this.pendingConfirm = null;
        const reopen = field === cur || this.mode === 'done'; // ask it again right away
        return { say: `${this.phrases.cleared} ${label(field)}.`, target: reopen ? field : null, handled: this.mode === 'done', info: true, log: `you cleared ${field.label}` };
      }
      case 'skip_section': {
        const section = (byId || cur) && groupOf(byId || cur);
        if (!section) return {};
        for (const f of this.fields) if (groupOf(f) === section && !this.filled.has(f.id)) this.skipped.add(f.id);
        return { say: this.phrases.skipped_section, handled: true, log: `you skipped the section "${section}"` };
      }
      case 'readback': {
        const shown = (byId ? [byId] : this.fields).filter((f) => this.filled.has(f.id));
        const lines = shown.slice(0, MAX_READBACK).map((f) => {
          if (f.sensitive) return `${label(f)}: ${this.phrases.typed_private}`;
          const v = String(this.values.get(f.id) ?? '');
          return this.readBack({ id: f.id, label: this.tr(f).label, value: v.length > 80 ? `${v.slice(0, 80)}…` : v });
        });
        return { say: lines.length ? `${lines.join('. ')}.` : this.phrases.nothing_yet, info: true, log: 'you read the answers back' };
      }
      case 'remaining': {
        const open = this.fields.filter((f) => !this.filled.has(f.id) && !this.skipped.has(f.id));
        const names = open.slice(0, MAX_REMAINING).map(label);
        if (open.length > MAX_REMAINING) names.push(`+${open.length - MAX_REMAINING}`);
        return { say: open.length ? `${this.phrases.remaining} ${names.join(', ')}.` : this.phrases.nothing_left, info: true, log: 'you listed what is left' };
      }
      default:
        return {};
    }
  }

  // True when `value` contains a number (3+ digits) that appears neither in what the user just said
  // nor in an answer already on the form ("same as box 1"). Spoken-out numbers ("fifty two thousand")
  // carry no digits to compare, so they are let through.
  inventedNumber(value, said) {
    const digits = (s) => String(s).replace(/\D/g, '');
    const saidDigits = digits(said);
    if (!saidDigits) return false;
    const known = [saidDigits, ...scaledNumbers(said), ...[...this.values.values()].map(digits)];
    // Compared group by group, so reformatting ("3 de marzo de 1998" -> 1998-03-03, 52000 -> 52,000.00) passes.
    const groups = value.match(/\d{3,}/g) || [];
    return groups.some((group) => !known.some((k) => k.includes(group)));
  }

  // A plain "yes" / "no" (or "I am", "never", "sí") to a Yes / No question needs no interpreting.
  quickChoice(field, said) {
    // Any two-option Yes / No question: a group of checkboxes or radio buttons, in English or Spanish (Sí / No).
    if (!field || field.options?.length !== 2 || !['radio'].includes(field.kind)) return null;
    const plain = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const yes = field.options.findIndex((o) => ['yes', 'si'].includes(plain(o)));
    const no = field.options.findIndex((o) => plain(o) === 'no');
    if (yes < 0 || no < 0) return null;
    const answer = plainYesNo(said);
    return answer ? field.options[answer === 'Yes' ? yes : no] : null;
  }

  // Writes a value into a field. A choice drawn as several checkboxes (Yes / No) ticks the chosen one only.
  async fillField(field, value) {
    if (!field.members) return this.page.fill(field.id, value);
    if (value === '') {
      for (const m of field.members) await this.page.fill(m.id, '');
      return { ok: true, value: '' };
    }
    const chosen = matchOption(field.options, value);
    if (chosen < 0) return { ok: false };
    for (const [i, m] of field.members.entries()) await this.page.fill(m.id, i === chosen ? 'true' : 'false');
    return { ok: true, value: field.options[chosen] };
  }

  // What the green confirmation shows: a choice in the user's language, a checkbox as a tick, anything else as written.
  shownValue(field, value) {
    if (field.kind === 'checkbox') return value === 'true' ? '\u2713' : '\u2717';
    const i = field.options.indexOf(value);
    return i >= 0 && this.tr(field).options[i] ? this.tr(field).options[i] : value;
  }

  // Read choices back in the user's language, everything else as written.
  readBack(item) {
    const field = this.fields.find((f) => f.id === item.id);
    const t = this.tr(field);
    const label = bare(item.label);
    if (field.kind === 'checkbox') return label; // "true" means nothing when read aloud
    const i = field.options.indexOf(item.value);
    return `${label}: ${i >= 0 && t.options[i] ? t.options[i] : item.value}`;
  }

  // The user pressed Continue after typing a private or long field themselves.
  async continueTyped() {
    if (this.busy || !this.current || this.mode !== 'type') return;
    const field = this.current;
    const r = await this.page.read(field.id);
    if (!r?.value) {
      if (field.required) return this.ui.say(this.phrases.empty_required);
      this.skipped.add(field.id);
    } else {
      this.filled.add(field.id);
      if (!field.sensitive) this.values.set(field.id, r.value);
    }
    await this.advance();
  }

  // A private value typed in the chat box. It goes straight to the field: never to the model,
  // never into history, values or the transcript.
  async submitPrivate(text) {
    const field = this.current;
    text = String(text || '').trim();
    if (this.busy || !text || !field?.sensitive || this.mode !== 'type') return false;
    this.busy = true;
    try {
      const r = await this.page.fill(field.id, text);
      if (!r?.ok) {
        await this.ui.say(this.phrases.private_failed);
        return false;
      }
      this.filled.add(field.id);
      this.skipped.delete(field.id);
      await this.ui.say(this.phrases.private_saved);
      await this.advance();
      return true;
    } catch (e) {
      this.ui.error(e);
      return false;
    } finally {
      this.busy = false;
    }
  }

  // Say the current question again (the Repeat button).
  async repeat() {
    if (this.current && this.lastSpoken && this.mode !== 'done') await this.ui.say(this.lastSpoken);
  }

  // Nobody answered for a while: ask again, gently, like a person waiting.
  async nudge() {
    if (!this.current || this.mode !== 'listen') return;
    await this.ui.say(`${this.phrases.still_there} ${this.lastAsked || ''}`.trim());
  }

  async skipCurrent() {
    if (this.busy || !this.current) return;
    this.skipped.add(this.current.id);
    if (this.noteSkip(this.current)) await this.ui.say(this.phrases.skipped_group);
    await this.advance();
  }

  // After "No" to a Yes / No question, the "If you answered Yes, ..." fields that follow do not apply.
  skipDependents(field) {
    const DEPENDENT = /\bif\s+(you\s+)?(answered|selected|checked|chose|said)\b|\bif\s+["“]?yes\b|\bif\s+(so|applicable)\b|\bsi\s+(usted\s+)?(respondi[oó]|contest[oó]|marc[oó]|seleccion[oó]|dijo)\b|\bsi\s+(la\s+respuesta\s+es\s+)?["«“]?s[ií]\b/i;
    for (let i = this.fields.indexOf(field) + 1; i < this.fields.length && DEPENDENT.test(this.fields[i].label); i++) {
      this.skipped.add(this.fields[i].id);
      this.log('skip-dependent', { field: this.fields[i].label });
    }
  }

  // Two skips in a row inside one group of questions ("Other names": family name, given name, middle name)
  // mean the user has nothing for that group: the rest of it is skipped too. True when that just happened.
  noteSkip(field) {
    const group = headingOf(field); // only a question heading, never a whole section
    this.skipStreak = group && this.skipStreak?.group === group ? { group, n: this.skipStreak.n + 1 } : { group, n: 1 };
    if (!group || this.skipStreak.n < 2) return false;
    let more = false;
    for (const f of this.fields) {
      if (headingOf(f) === group && !this.filled.has(f.id) && !this.skipped.has(f.id)) {
        this.skipped.add(f.id);
        more = true;
      }
    }
    this.skipStreak = { group: '', n: 0 };
    return more;
  }

  // Long answers typed in the user's language can be translated into the form's language on request.
  async translateTyped() {
    const field = this.current;
    if (this.busy || !field || field.sensitive) return;
    this.busy = true;
    try {
      const r = await this.page.read(field.id);
      if (!r?.value) return;
      const res = await this.llm.chat({
        messages: [
          { role: 'system', content: translateAnswerPrompt(this.userLang, this.formLang) },
          { role: 'user', content: r.value },
        ],
        maxTokens: 1500,
      });
      if (res.content) await this.page.fill(field.id, res.content);
    } catch (e) {
      this.ui.error(e);
    } finally {
      this.busy = false;
    }
  }
}
