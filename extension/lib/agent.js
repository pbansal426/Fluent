// The conversation conductor. Code owns the order of questions and the privacy rules;
// the model only translates and interprets what the user said.
import { classify, redactPrivate } from './sensitive.js';
import { detectLanguage, language } from './language.js';
import {
  PHRASES,
  TOOLS,
  turnSystemPrompt,
  translateFieldsPrompt,
  TRANSLATE_FIELDS_SCHEMA,
  translateTextsPrompt,
  TRANSLATE_TEXTS_SCHEMA,
  translateAnswerPrompt,
} from './prompts.js';

const FIRST_CHUNK = 4; // small, so the first question comes quickly
const FIELD_CHUNK = 10;
const TEXT_CHUNK = 12;
const HISTORY_TURNS = 6;
const MAX_SPOKEN_OPTIONS = 8;
const MAX_READBACK = 15;
const MAX_REMAINING = 10;

const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
// "Name *:" -> "Name"
const bare = (label) => label.replace(/[\s*:.]+$/, '');
// "Name" -> "Name."   "Need help?" -> "Need help?"
const sentence = (label) => (/[?!؟。？！]$/.test(bare(label)) ? bare(label) : `${bare(label)}.`);

export class Agent {
  // page: { scan, apply, highlight, focus, fill, read }   (all async, talk to the web page)
  // ui:   { say(text), prompt(state), filled(items), status(text), error(err) }
  constructor({ llm, page, ui, userLang, phrases = PHRASES }) {
    this.llm = llm;
    this.page = page;
    this.ui = ui;
    this.userLang = userLang;
    this.phrases = phrases;
    this.fields = [];
    this.translations = new Map(); // id -> { label, explanation, options }
    this.pending = new Map(); // id -> promise resolved when its translation is in
    this.values = new Map(); // id -> value written (never holds private values)
    this.filled = new Set();
    this.skipped = new Set();
    this.history = [];
    this.current = null;
    this.formLang = '';
    this.mode = 'idle'; // idle | listen | type | done
    this.busy = false;
  }

  async start() {
    this.ui.status('scan');
    const scan = await this.page.scan();
    this.fields = scan.fields.map((f) => ({ ...f, ...classify(f) }));
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
    for (const f of this.fields) {
      if (!f.value) continue;
      this.filled.add(f.id);
      if (!f.sensitive) this.values.set(f.id, f.value);
    }
    this.translating = this.translateAll(this.fields, scan.texts || []);
    this.ui.status('ready');
    await this.ui.say(this.phrases.greeting);
    await this.advance();
  }

  // The form grew or shrank (multi-step forms): pick up the new fields, keep what is done.
  async rescan() {
    const scan = await this.page.scan();
    const known = new Map(this.fields.map((f) => [f.id, f]));
    const fresh = scan.fields.filter((f) => !known.has(f.id)).map((f) => ({ ...f, ...classify(f) }));
    this.fields = scan.fields.map((f) => known.get(f.id) || fresh.find((n) => n.id === f.id));
    // The page rebuilt its registry, so translations must be re-attached.
    await this.page.apply({ fields: this.fields.filter((f) => this.translations.has(f.id)).map((f) => ({ id: f.id, ...this.translations.get(f.id) })) });
    if (fresh.length) this.translating = this.translateAll(fresh, []);
    if (this.mode === 'done' || !this.current || !this.fields.includes(this.current)) await this.advance();
  }

  async translateAll(fields, texts) {
    if (this.sameLanguage) return;
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
          { role: 'system', content: translateFieldsPrompt(this.userLang, this.context) },
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
      this.ui.error(e);
    }
    const byId = new Map((out?.fields || []).map((t) => [t.id, t]));
    const applied = [];
    for (const f of chunk) {
      const t = byId.get(f.id);
      const options = t && Array.isArray(t.options) && t.options.length === f.options.length ? t.options : f.options;
      // Small models sometimes hand the label back untranslated; for English there is a second source.
      const english = /^english$/i.test(this.userLang) && t?.english;
      const label = (t?.label && t.label !== f.label ? t.label : english) || t?.label || f.label;
      const tr = { label, explanation: t?.explanation || '', question: (t?.question || '').trim(), options, section: f.section ? t?.section || f.section : '' };
      this.translations.set(f.id, tr);
      applied.push({ id: f.id, ...tr });
      // The privacy rules read English; on a form in another language, check the English label too.
      if (t?.english && !f.sensitive && classify({ ...f, label: t.english }).sensitive) f.sensitive = true;
    }
    await this.page.apply({ fields: applied });
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

  setMode(mode) {
    this.mode = mode;
    const f = this.current;
    this.ui.prompt({
      mode,
      field: f ? { id: f.id, label: this.tr(f).label, sensitive: f.sensitive, long: f.long } : null,
      canTranslate: mode === 'type' && !!f && f.long && !f.sensitive && !this.sameLanguage,
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
      if (t.section && field.section !== this.lastSection) parts.push(sentence(t.section));
      this.lastSection = field.section;
      parts.push(t.question);
    } else {
      parts.push(this.spokenLabel(field));
      if (t.explanation) parts.push(t.explanation);
      if (field.kind === 'checkbox') parts.push(this.phrases.checkbox);
    }
    if (field.kind !== 'checkbox' && t.options.length && t.options.length <= MAX_SPOKEN_OPTIONS) parts.push(`${this.phrases.options}: ${t.options.join(', ')}.`);
    // Said once, not after every question.
    if (!field.required && !this.saidSkipHint) {
      this.saidSkipHint = true;
      parts.push(this.phrases.optional);
    }
    return parts.join(' ');
  }

  async advance(target = null) {
    const next = target || this.nextField();
    this.current = next;
    if (!next) {
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
      await this.ui.say(`${this.spokenLabel(next)} ${next.sensitive ? this.phrases.type_private : this.phrases.type_long}`);
    } else {
      this.setMode('listen');
      this.lastAsked = this.question(next);
      await this.ui.say(this.lastAsked);
    }
  }

  // What the model is allowed to see of the form.
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

  async handleUser(text) {
    text = String(text || '').trim();
    if (!text || this.busy || !this.fields.length) return;
    this.busy = true;
    try {
      await this.turn(text);
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

  async turn(text) {
    if (this.current && this.mode === 'listen' && this.isSkip(text)) {
      this.history.push(`- User said "${text}"; ${this.current.label} was skipped.`);
      this.skipped.add(this.current.id);
      return this.advance();
    }
    // Pasted details may hold a private number: the model never sees it.
    const { text: said, redacted } = redactPrivate(text);
    const res = await this.llm.chat({
      messages: [
        {
          role: 'system',
          content: turnSystemPrompt({
            userLang: this.userLang,
            formLang: this.formLang,
            current: this.current,
            fields: this.fieldsForModel(),
            history: this.history.slice(-HISTORY_TURNS),
            context: this.context,
            asked: this.lastAsked,
          }),
        },
        { role: 'user', content: said },
      ],
      tools: TOOLS,
      toolChoice: 'required',
      maxTokens: 800,
    });

    const done = [];
    const spoken = [];
    const navLog = [];
    let reply = '';
    let refusedPrivate = false;
    let progressed = false;
    let target = null;
    let info = false;

    for (const call of res.toolCalls) {
      if (call.name === 'fill_fields') {
        for (const v of Array.isArray(call.args.values) ? call.args.values : []) {
          const field = this.fields.find((f) => f.id === v?.field_id);
          if (!field) continue;
          let value = v.value;
          const copy = v.copy_from ? this.fields.find((f) => f.id === v.copy_from) : null;
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
          if (!copy && this.inventedNumber(String(value), text)) continue;
          const r = await this.page.fill(field.id, String(value));
          if (!r?.ok) continue;
          this.filled.add(field.id);
          this.skipped.delete(field.id);
          this.values.set(field.id, r.value);
          done.push({ id: field.id, label: this.tr(field).label, original: field.label, value: r.value });
          progressed = true;
        }
      } else if (call.name === 'skip_field') {
        const field = this.fields.find((f) => f.id === call.args.field_id) || this.current;
        if (field && !this.filled.has(field.id)) {
          this.skipped.add(field.id);
          progressed = true;
        }
      } else if (call.name === 'navigate') {
        const n = await this.navigate(call.args || {});
        if (n.say) spoken.push(n.say);
        if (n.target) target = n.target;
        if (n.handled) progressed = true;
        if (n.info) info = true;
        if (n.log) navLog.push(n.log);
      } else if (call.name === 'ask_user' && call.args.message) {
        reply = String(call.args.message);
      }
    }
    if (!res.toolCalls.length && res.content) reply = res.content;

    // Kept as a plain log inside the system prompt: as chat turns, small models start imitating it.
    const outcome = [
      done.length ? `you wrote ${done.map((d) => `${d.original} = "${d.value}"`).join(', ')}` : '',
      ...navLog,
      reply ? `you replied "${reply}"` : '',
    ].filter(Boolean).join('; ');
    this.history.push(`- User said "${said}"; ${outcome || 'nothing was filled'}.`);

    if (done.length) {
      this.ui.filled(done);
      await this.ui.say(`${this.phrases.filled} ${done.map((d) => this.readBack(d).replace(/\.+$/, '')).join('. ')}.`);
    }
    if (refusedPrivate) await this.ui.say(this.phrases.private_refused);
    else if (redacted) await this.ui.say(this.phrases.redacted);
    for (const s of spoken) await this.ui.say(s);
    // Reading things out is not an answer: carry on with the question that is waiting.
    if (progressed || (info && this.mode !== 'done')) return this.advance(target);
    if (reply) return this.ui.say(reply);
    if (!refusedPrivate && !redacted && !spoken.length) await this.ui.say(this.phrases.not_understood);
  }

  // Moves around the form on the user's request. The model only names an action; code does it and
  // decides what is read out, so private values stay private.
  async navigate({ action, field_id: id }) {
    const byId = id ? this.fields.find((f) => f.id === id) : null;
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
        const r = await this.page.fill(field.id, '');
        if (!r?.ok) return {};
        this.filled.delete(field.id);
        this.skipped.delete(field.id);
        this.values.delete(field.id);
        const reopen = field === cur || this.mode === 'done'; // ask it again right away
        return { say: `${this.phrases.cleared} ${label(field)}.`, target: reopen ? field : null, handled: this.mode === 'done', info: true, log: `you cleared ${field.label}` };
      }
      case 'skip_section': {
        const section = (byId || cur)?.section;
        if (!section) return {};
        for (const f of this.fields) if (f.section === section && !this.filled.has(f.id)) this.skipped.add(f.id);
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
    const known = [saidDigits, ...[...this.values.values()].map(digits)];
    // Compared group by group, so reformatting ("3 de marzo de 1998" -> 1998-03-03, 52000 -> 52,000.00) passes.
    const groups = value.match(/\d{3,}/g) || [];
    return groups.some((group) => !known.some((k) => k.includes(group)));
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

  async skipCurrent() {
    if (this.busy || !this.current) return;
    this.skipped.add(this.current.id);
    await this.advance();
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
