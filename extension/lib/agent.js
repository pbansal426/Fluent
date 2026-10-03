// The conversation conductor. Code owns the order of questions and the privacy rules;
// the model only translates and interprets what the user said.
import { classify } from './sensitive.js';
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
    this.formLang = 'English';
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
          { role: 'system', content: translateFieldsPrompt(this.userLang) },
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
    if (out?.form_language) this.formLang = out.form_language;
    const byId = new Map((out?.fields || []).map((t) => [t.id, t]));
    const applied = [];
    for (const f of chunk) {
      const t = byId.get(f.id);
      const options = t && Array.isArray(t.options) && t.options.length === f.options.length ? t.options : f.options;
      const tr = { label: t?.label || f.label, explanation: t?.explanation || '', options, section: f.section ? t?.section || f.section : '' };
      this.translations.set(f.id, tr);
      applied.push({ id: f.id, ...tr });
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
      canTranslate: mode === 'type' && !!f && f.long && !f.sensitive,
    });
  }

  nextField() {
    return this.fields.find((f) => !this.filled.has(f.id) && !this.skipped.has(f.id)) || null;
  }

  question(field) {
    const t = this.tr(field);
    const parts = [this.spokenLabel(field)];
    if (t.explanation) parts.push(t.explanation);
    if (field.kind === 'checkbox') parts.push(this.phrases.checkbox);
    else if (t.options.length && t.options.length <= MAX_SPOKEN_OPTIONS) parts.push(`${this.phrases.options}: ${t.options.join(', ')}.`);
    if (!field.required && field.kind !== 'checkbox') parts.push(this.phrases.optional);
    return parts.join(' ');
  }

  async advance() {
    const next = this.nextField();
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
      await this.ui.say(this.question(next));
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

  async turn(text) {
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
          }),
        },
        { role: 'user', content: text },
      ],
      tools: TOOLS,
      toolChoice: 'required',
      maxTokens: 800,
    });

    const done = [];
    let reply = '';
    let refusedPrivate = false;
    let progressed = false;

    for (const call of res.toolCalls) {
      if (call.name === 'fill_fields') {
        for (const v of Array.isArray(call.args.values) ? call.args.values : []) {
          const field = this.fields.find((f) => f.id === v?.field_id);
          if (!field || v.value == null || v.value === '') continue;
          if (field.sensitive) {
            refusedPrivate = true;
            continue;
          }
          const r = await this.page.fill(field.id, String(v.value));
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
      } else if (call.name === 'ask_user' && call.args.message) {
        reply = String(call.args.message);
      }
    }
    if (!res.toolCalls.length && res.content) reply = res.content;

    // Kept as a plain log inside the system prompt: as chat turns, small models start imitating it.
    const outcome = [
      done.length ? `you wrote ${done.map((d) => `${d.original} = "${d.value}"`).join(', ')}` : '',
      reply ? `you replied "${reply}"` : '',
    ].filter(Boolean).join('; ');
    this.history.push(`- User said "${text}"; ${outcome || 'nothing was filled'}.`);

    if (done.length) {
      this.ui.filled(done);
      await this.ui.say(`${this.phrases.filled} ${done.map((d) => this.readBack(d)).join('. ')}.`);
    }
    if (refusedPrivate) await this.ui.say(this.phrases.private_refused);
    if (progressed) return this.advance();
    if (reply) return this.ui.say(reply);
    if (!refusedPrivate) await this.ui.say(this.phrases.not_understood);
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
