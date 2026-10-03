// Side panel: wires the page, the model, speech and the conversation together.
import { createClient } from '../lib/llm.js';
import { Agent } from '../lib/agent.js';
import { PHRASES, translatePhrases } from '../lib/prompts.js';
import { LANGUAGES, createSpeech } from '../lib/speech.js';
import { createLive } from '../lib/live.js';
import { detectProvider, pickModel } from '../lib/providers.js';
import { createLog } from '../lib/log.js';
import { createNeuralTts } from '../lib/neural-tts.js';

// Shown at the bottom of the panel, so it is obvious which copy of the extension is running.
const BUILD = '2026-10-03.14';
const log = createLog();

const DEFAULTS = {
  baseUrl: 'http://localhost:1234/v1',
  model: 'google/gemma-4-e4b',
  apiKey: '',
  lang: 'es',
  speak: true,
  live: true, // hands-free: listen automatically after the assistant speaks
  noThink: true,
};
const CONTENT_FILES = ['content/scan.js', 'content/overlay.js', 'content/fill.js', 'content/listen.js', 'content/content.js'];

const $ = (id) => document.getElementById(id);
const speech = createSpeech();

const state = {
  settings: { ...DEFAULTS },
  phrases: { ...PHRASES },
  agent: null,
  tabId: null,
  mode: 'idle',
  field: null,
  busy: false,
  voiceOn: false,
  listening: false,
  speaking: false,
  skipSpeech: false, // the user interrupted: stay quiet until this turn ends
  silentRounds: 0,
  micOk: false,
  pendingRescan: false,
  queue: [],
  listenToken: 0,
  session: 0,
  muted: false, // the user paused the microphone for now
  typing: false, // a draft is in the text box: the microphone waits so voice and text never both answer
  typingTimer: null,
  live: null, // the open microphone stream of live mode
  speakStart: 0,
  falseBarges: 0,
  away: false, // the user is on another tab: this session stays hidden and quiet
  resumeVoice: false,
};

const lang = () => LANGUAGES.find((l) => l.code === state.settings.lang) || LANGUAGES[0];

// ---------- settings ----------

async function loadSettings() {
  const stored = await chrome.storage.local.get('settings');
  state.settings = { ...DEFAULTS, ...(stored.settings || {}) };
  $('base-url').value = state.settings.baseUrl;
  $('model').value = state.settings.model;
  $('api-key').value = state.settings.apiKey;
  $('speak').checked = state.settings.speak;
  $('live').checked = state.settings.live;
  $('no-think').checked = state.settings.noThink;
  $('lang').value = state.settings.lang;
}

// With an OpenAI key the assistant uses OpenAI's natural voice; otherwise the best voice the browser has.
function applyVoice() {
  const s = state.settings;
  const openai = s.apiKey && detectProvider(s.apiKey)?.id === 'openai' && /api\.openai\.com/.test(s.baseUrl);
  speech.setNeural(openai ? createNeuralTts({ apiKey: s.apiKey, baseUrl: s.baseUrl }) : null);
  log('voice', { neural: !!openai });
}

async function saveSettings() {
  Object.assign(state.settings, {
    baseUrl: $('base-url').value.trim() || DEFAULTS.baseUrl,
    model: $('model').value.trim() || DEFAULTS.model,
    apiKey: $('api-key').value.trim(),
    speak: $('speak').checked,
    live: $('live').checked,
    noThink: $('no-think').checked,
    lang: $('lang').value,
  });
  await chrome.storage.local.set({ settings: state.settings });
  applyVoice();
}

function client() {
  const s = state.settings;
  return createClient({ baseUrl: s.baseUrl, model: s.model, apiKey: s.apiKey, disableThinking: s.noThink });
}

async function refreshModels() {
  try {
    const models = await client().listModels();
    $('models').replaceChildren(...models.map((id) => Object.assign(document.createElement('option'), { value: id })));
    $('settings-note').textContent = `Connected: ${models.length} models`;
  } catch (e) {
    $('settings-note').textContent = e.message;
  }
}

// ---------- rendering ----------

function banner(text, kind = 'error') {
  $('banner').hidden = !text;
  $('banner').textContent = text || '';
  $('banner').className = kind === 'info' ? 'info' : '';
}

function bubble(kind, text) {
  const b = document.createElement('div');
  b.className = `bubble ${kind}`;
  b.dir = 'auto';
  b.textContent = text;
  // Keep the "working…" dots at the bottom.
  const thinking = kind === 'thinking' ? null : $('transcript').querySelector('.thinking');
  $('transcript').insertBefore(b, thinking);
  $('transcript').parentElement.parentElement.scrollTop = 1e9;
  return b;
}

function filledBubble(items) {
  const b = bubble('filled', '');
  for (const it of items) {
    const row = document.createElement('div');
    row.className = 'item';
    row.dir = 'auto';
    const strong = document.createElement('strong');
    strong.textContent = `✓ ${it.label.replace(/[\s*:]+$/, '')}:`;
    const orig = document.createElement('span');
    orig.className = 'orig';
    orig.textContent = `(${it.original.replace(/[\s*:]+$/, '')})`;
    row.append(strong, ` ${it.shown ?? it.value} `, orig);
    b.appendChild(row);
  }
}

function render() {
  const p = state.phrases;
  const started = !!state.agent && !state.away;
  const awayFromForm = !!state.agent && state.away;
  $('away-note').hidden = !awayFromForm;
  $('back-tab').hidden = !awayFromForm;
  $('away-note').textContent = p.away_note;
  $('back-tab').textContent = p.btn_back_tab;
  $('welcome').hidden = started;
  $('chat').hidden = !started;
  $('composer').hidden = !started;
  $('start').textContent = lang().start;
  document.documentElement.lang = lang().code;

  const typing = state.mode === 'type';
  const privateField = typing && state.field?.sensitive;
  $('type-card').hidden = !typing;
  if (typing) {
    $('type-text').textContent = `${state.field.label.replace(/[\s*:]+$/, '')} — ${state.field.sensitive ? p.type_private : p.type_long}`;
    $('continue').textContent = p.btn_continue;
    $('skip').textContent = p.btn_skip;
    $('repeat-card').textContent = p.btn_repeat;
    $('translate').textContent = p.btn_translate;
    $('translate').hidden = !state.canTranslate;
  }
  $('show-tr-label').textContent = p.show_translations;
  // A private field is typed here, masked, and goes straight to the form: never to the model.
  $('text').type = privateField && !state.reveal ? 'password' : 'text';
  $('reveal').hidden = !privateField;
  $('reveal').setAttribute('aria-pressed', String(!!state.reveal));
  // One microphone button: mute / unmute (in hands-free mode). Talking over the assistant needs no button.
  const live = state.settings.live;
  $('mic').disabled = !speech.supported;
  $('mic').classList.toggle('muted', live && state.muted);
  $('mic').classList.toggle('on', state.listening);
  $('mic').classList.toggle('speaking', state.speaking);
  $('mic').setAttribute('aria-pressed', String(live && state.muted));
  $('mic').setAttribute('aria-label', live ? (state.muted ? p.mic_unmute : p.mic_mute) : p.mic_talk);
  $('mic').title = $('mic').getAttribute('aria-label');
  $('text').placeholder = privateField ? p.input_private : p.input_placeholder;
  // A short line saying what is happening, so the user always knows whose turn it is.
  let status = ['', 'idle'];
  if (!speech.supported) status = ['', 'idle'];
  else if (live && state.muted) status = [p.status_muted, 'muted'];
  else if (privateField) status = [p.status_private, 'type'];
  else if (state.typing) status = [p.status_typing, 'type'];
  else if (state.speaking) status = [p.status_speaking, 'speaking'];
  else if (state.listening) status = [p.listening, 'listening'];
  else if (state.busy) status = [p.status_thinking, 'thinking'];
  $('live-status').textContent = status[0];
  $('live-status').dataset.state = status[1];
  $('repeat').title = $('repeat').ariaLabel = p.btn_repeat;
  $('report-btn').hidden = !state.agent;
}

// ---------- page bridge ----------

async function ensureInjected(tabId) {
  try {
    const pong = await chrome.tabs.sendMessage(tabId, { type: 'fluent:ping' });
    if (pong?.ok) return;
  } catch {}
  await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_FILES });
}

const VIEWER_URL = chrome.runtime.getURL('pdf/viewer.html');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Returns a function that sends messages to the form in `tab`, or null if Fluent cannot work there.
// Web pages get the content scripts injected. PDFs are reopened in Fluent's own viewer (an extension
// page, reached with runtime messages), because Chrome's built-in PDF viewer cannot be scripted.
async function connect(tab) {
  const inViewer = tab.url?.startsWith(VIEWER_URL);
  if (inViewer || /\.pdf($|[?#])/i.test(tab.url || '')) {
    if (!inViewer) await chrome.tabs.update(tab.id, { url: `${VIEWER_URL}?file=${encodeURIComponent(tab.url)}` });
    const send = (msg) => chrome.runtime.sendMessage({ ...msg, viewerTab: tab.id });
    for (let i = 0; i < 60; i++) {
      const pong = await send({ type: 'fluent:ping' }).catch(() => null);
      if (pong?.ready) return send;
      await sleep(250);
    }
    banner('Open the PDF in the Fluent viewer tab (drop the file there), then press the button again.', 'info');
    return null;
  }
  try {
    await ensureInjected(tab.id);
  } catch {
    banner('Fluent cannot run on this page. Open a web page or a PDF with a form.');
    return null;
  }
  // If the page's helper script has gone (extension reloaded, tab frozen), put it back, re-link the fields by label
  // and try once more. Only if that fails too does the user see a message, and then a clean way to start again.
  const raw = (msg) => chrome.tabs.sendMessage(tab.id, msg);
  const lost = (e) => /Receiving end does not exist|Could not establish connection|context invalidated/i.test(String(e?.message));
  // One recovery at a time: calls that fail meanwhile wait for it, then retry. Recovery talks to the page through
  // the plain connection, so it can never wait on itself.
  let recovery = null;
  const recover = () =>
    (recovery ||= (async () => {
      log('lost-connection', { started: true, tabId: tab.id });
      await ensureInjected(tab.id);
      const map = (await state.agent?.relink?.(bridge(raw))) || new Map();
      if (state.agent && !map.size) throw new Error('nothing matched');
      log('lost-connection', { recovered: true });
      return map;
    })().finally(() => { recovery = null; }));
  return async (msg) => {
    try {
      return await raw(msg);
    } catch (e) {
      if (!lost(e)) throw e;
      try {
        const map = await recover();
        return await raw(map.has(msg.id) ? { ...msg, id: map.get(msg.id) } : msg);
      } catch (e2) {
        log('lost-connection', { recovered: false, message: String(e2?.message) });
        throw Object.assign(new Error('lost connection to the form page'), { kind: 'lost' });
      }
    }
  };
}

function bridge(send) {
  return {
    scan: () => send({ type: 'fluent:scan' }),
    apply: (translations) => send({ type: 'fluent:apply', translations }),
    highlight: (id) => send({ type: 'fluent:highlight', id }),
    focus: (id) => send({ type: 'fluent:focus', id }),
    fill: (id, value) => send({ type: 'fluent:fill', id, value }),
    read: (id) => send({ type: 'fluent:read', id }),
    nextPage: () => send({ type: 'fluent:next-page' }),
  };
}

// ---------- conversation ----------

const ui = {
  language(name, sameLanguage) {
    $('form-language').textContent = `Form language: ${name}`;
    $('show-tr').parentElement.hidden = sameLanguage;
  },
  async say(text) {
    bubble('agent', text);
    log('say', { text, spoken: state.settings.speak && !state.skipSpeech && !state.away });
    if (!state.settings.speak || state.skipSpeech || state.away) return;
    state.speaking = true;
    state.speakStart = performance.now();
    state.live?.arm(!state.muted); // the user may now talk over the assistant
    render();
    try { await speech.speak(text, lang().speech); }
    finally { state.live?.arm(false); state.speaking = false; render(); }
  },
  prompt(p) {
    state.mode = p.mode;
    state.field = p.field;
    state.canTranslate = p.canTranslate;
    render();
  },
  filled: filledBubble,
  status() {},
  log,
  error(e) {
    console.error(e);
    log('error', { message: String(e?.message || e), kind: e?.kind, raw: e?.raw });
    if (e?.kind === 'lost') {
      const text = state.phrases.lost_connection;
      reset().then(() => { banner(text); });
      return;
    }
    const message = e?.kind === 'unreachable' ? `${state.phrases.ai_error} (${state.settings.baseUrl})` : e?.kind === 'timeout' ? state.phrases.ai_slow : String(e?.message || e);
    banner(message);
    bubble('agent', message);
  },
};

// Runs one step of the conversation, then hands the turn back to the user.
async function runTurn(fn) {
  if (state.busy) return;
  const session = state.session;
  state.busy = true;
  render();
  const thinking = bubble('thinking', '…');
  try {
    await fn();
  } catch (e) {
    ui.error(e);
  } finally {
    thinking.remove();
    if (session !== state.session) return;
    state.busy = false;
    state.speaking = false;
    state.skipSpeech = false;
    if (state.agent && !state.agent.fields.length) {
      // A no-form session has nothing to answer. Keep Start available for recovery.
      banner(state.phrases.no_form, 'info');
      state.agent = null;
      state.queue = [];
      state.voiceOn = false;
    }
    render();
  }
  if (state.queue.length) {
    const item = state.queue.shift();
    if (typeof item === 'function') return runTurn(item);
    return runTurn(() => state.mode === 'type' && state.field?.sensitive
      ? ui.say(state.phrases.type_private)
      : state.agent.handleUser(item));
  }
  if (state.pendingRescan) {
    state.pendingRescan = false;
    return runTurn(() => state.agent.rescan());
  }
  if (state.voiceOn && state.mode === 'listen') listenOnce();
  else render();
}

// The assistant's fixed phrases in the chosen language: cached, and fetched ahead of time
// (when the panel opens or the language changes) so Start does not wait on it.
const phraseJobs = new Map();
function phrasesFor(llm) {
  const { code, name } = lang();
  if (!phraseJobs.has(code)) {
    phraseJobs.set(
      code,
      (async () => {
        const key = `phrases:v20:${code}`; // bump when PHRASES changes
        const cached = (await chrome.storage.local.get(key))[key];
        if (cached && Object.keys(PHRASES).every((k) => cached[k])) return cached;
        const phrases = await translatePhrases(llm, name);
        if (phrases.greeting !== PHRASES.greeting) await chrome.storage.local.set({ [key]: phrases });
        else phraseJobs.delete(code); // the model was unreachable; try again next time
        return phrases;
      })()
    );
  }
  return phraseJobs.get(code);
}

async function start() {
  if (state.agent) await reset(); // starting here replaces the session of another tab
  banner('');
  await saveSettings();
  const llm = client();
  $('start').disabled = true;
  try {
    await llm.listModels(); // fail early, before touching the page
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const send = await connect(tab);
    if (!send) return;
    state.tabId = tab.id;
    state.send = send;
    state.phrases = await phrasesFor(llm);
    state.agent = new Agent({ llm, page: bridge(send), ui, userLang: lang().name, phrases: state.phrases });
    $('transcript').replaceChildren();
    $('form-language').textContent = 'Detecting form language…';
    // Hands-free by default: after the assistant speaks, it listens.
    state.voiceOn = state.settings.live && speech.supported;
    state.silentRounds = 0;
    state.muted = false;
    await openLive();
    log('start', { build: BUILD, tabUrl: tab.url, lang: lang().code, model: state.settings.model, baseUrl: state.settings.baseUrl, live: state.settings.live });
    render();
  } catch (e) {
    return banner(e?.kind === 'unreachable' ? `Cannot reach the AI model at ${state.settings.baseUrl}. Is LM Studio's server running?` : e?.kind === 'timeout' ? state.phrases.ai_slow : String(e?.message || e));
  } finally {
    $('start').disabled = false;
  }
  await runTurn(() => state.agent.start());
}

async function reset() {
  state.session++;
  cancelListening();
  speech.stopSpeaking();
  speech.stopListening();
  closeLive();
  state.send?.({ type: 'fluent:clear' }).catch(() => {});
  Object.assign(state, { away: false, agent: null, send: null, mode: 'idle', field: null, busy: false, queue: [], pendingRescan: false, pageListen: false, voiceOn: false, muted: false, listening: false, speaking: false, skipSpeech: false, phrases: { ...PHRASES } });
  banner('');
  render();
}

function sendText(text, spoken = false) {
  text = text.trim();
  if (!text || !state.agent) return false;
  if (state.mode === 'type' && state.field?.sensitive) {
    // Spoken text never reaches a private field; only what is typed here does.
    if (spoken) return false;
    if (state.busy) return false;
    log('user', { text: '[private]', via: 'typed', field: state.field?.label });
    bubble('user', '••••••••');
    runTurn(() => state.agent.submitPrivate(text));
    return true;
  }
  // Typing does not turn the microphone off; without hands-free mode one spoken answer ends the listening.
  if (spoken && !state.settings.live) state.voiceOn = false;
  log('user', { text, via: spoken ? 'voice' : 'typed', busy: state.busy });
  // Only a turn that is already talking is cut short; a spoken answer in live mode gets a spoken reply.
  if (state.busy) state.skipSpeech = true;
  speech.stopSpeaking();
  cancelListening();
  bubble('user', text);
  if (state.busy) {
    state.queue.push(text);
    render();
    return true;
  }
  runTurn(() => state.agent.handleUser(text));
  return true;
}

function cancelListening() {
  state.listenToken++;
  speech.stopListening();
  state.send?.({ type: 'fluent:stop-listen' }).catch(() => {});
  state.listening = false;
  $('interim').hidden = true;
}

// ---------- voice ----------

// Can this panel open the microphone right now? Tried for real rather than asked of the Permissions API,
// which is not reliable inside a side panel. Returns '' when it works, otherwise the error name.
async function micProblem() {
  if (state.micOk) return '';
  let timer;
  let expired = false;
  try {
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => { expired = true; reject(Object.assign(new Error('no answer'), { name: 'NotAllowedError' })); }, 3000); });
    const request = navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      if (expired) stream.getTracks().forEach((t) => t.stop());
      return stream;
    });
    const stream = await Promise.race([request, timeout]);
    stream.getTracks().forEach((t) => t.stop());
    state.micOk = true;
    return '';
  } catch (e) {
    return e.name || 'Error';
  } finally { clearTimeout(timer); }
}

// A side panel cannot show the microphone prompt itself, so a small tab asks once.
function askForMic() {
  chrome.tabs.create({ url: chrome.runtime.getURL('panel/permission.html') });
}

// Plain-language reasons for each speech recognition failure, always shown with the raw code.
const MIC_HELP = {
  'not-allowed': 'Chrome is blocking the microphone for Fluent. On a Mac, also check System Settings → Privacy & Security → Microphone → Google Chrome.',
  'service-not-allowed': "Chrome's speech service is not available in this browser profile.",
  network: 'Speech recognition needs an internet connection (Chrome sends the audio to Google).',
  'audio-capture': 'No microphone was found.',
  'language-not-supported': 'Chrome cannot recognise speech in this language.',
  unsupported: 'This browser has no speech recognition.',
  timeout: 'Speech recognition did not respond. Tap the microphone to try again.',
  'missing-handler': 'Reload the form tab and Fluent in chrome://extensions, then start again.',
};
const micBanner = (where, code) => banner(`Microphone (${where}: ${code}). ${MIC_HELP[code] || ''} You can always type your answers below.`, 'info');

// Speech recognition normally runs here in the panel. If Chrome refuses it here even though the
// microphone itself opens, it runs inside the form's page instead (state.pageListen).
async function recognise() {
  if (!state.pageListen) {
    try {
      return await speech.listen(lang().speech, { onInterim: (t) => ($('interim').textContent = t) });
    } catch (e) {
      if (!/not-allowed/.test(e.message)) throw Object.assign(e, { where: 'panel' });
      console.warn('Fluent: speech recognition refused in the panel, switching to the page', e.message);
      state.pageListen = true;
    }
  }
  const res = await state.send({ type: 'fluent:listen', lang: lang().speech });
  if (!res || typeof res.text !== 'string' && !res.error) throw Object.assign(new Error('missing-handler'), { where: 'page' });
  if (res?.error) throw Object.assign(new Error(res.error), { where: 'page' });
  return res?.text || '';
}

const NUDGE_AFTER = 2; // silent rounds before the assistant gently asks again
const MAX_SILENT_ROUNDS = 6; // how many times to keep listening through silence before pausing

// byUser: the user tapped the mic (so it is fine to open the permission tab); otherwise hands-free.
async function listenOnce(byUser = false) {
  if (state.listening || state.busy || state.away || state.typing || state.mode !== 'listen') return;
  const token = ++state.listenToken;
  const problem = await micProblem();
  if (token !== state.listenToken) return;
  if (problem) {
    state.voiceOn = false;
    render();
    if (problem !== 'NotAllowedError') return banner(`Microphone unavailable (${problem}). ${problem === 'NotFoundError' ? 'No microphone was found.' : ''} You can type your answers below.`, 'info');
    if (!byUser) return banner('Tap the microphone to answer by voice, or type your answers below.', 'info');
    banner('Fluent needs permission to use the microphone. A tab opened to ask for it; allow it there, then tap the microphone again.', 'info');
    return askForMic();
  }
  if (state.listening || state.busy || state.mode !== 'listen') return;
  state.listening = true;
  $('interim').hidden = false;
  $('interim').textContent = '';
  render();
  let text = '';
  let timer;
  try {
    text = await Promise.race([recognise(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), 22000);
    })]);
  } catch (e) {
    if (token !== state.listenToken) return;
    state.voiceOn = false;
    speech.stopListening();
    state.send?.({ type: 'fluent:stop-listen' }).catch(() => {});
    micBanner(e.where || 'panel', e.message);
  } finally { clearTimeout(timer); }
  if (token !== state.listenToken) return;
  state.listening = false;
  $('interim').hidden = true;
  if (text && state.typing) text = ''; // the user started typing meanwhile: the typed answer wins
  if (text) {
    state.silentRounds = 0;
    render();
    return sendText(text, true);
  }
  // Silence. Keep listening for a while, like a person waiting for an answer, then pause.
  if (state.voiceOn && ++state.silentRounds < MAX_SILENT_ROUNDS) {
    render();
    if (state.silentRounds === NUDGE_AFTER && state.agent) {
      // Like a person waiting: check they are still there and ask again, then keep listening.
      return runTurn(() => state.agent.nudge());
    }
    return listenOnce();
  }
  state.voiceOn = false;
  state.silentRounds = 0;
  render();
}

// Live mode keeps one microphone stream open for the whole session, so the user can simply talk over the
// assistant at any moment. Without microphone permission the assistant just cannot be interrupted by voice.
async function openLive() {
  closeLive();
  if (!state.settings.live || !speech.supported) return;
  const live = createLive({ onVoice: talkOver });
  let timer;
  try {
    await Promise.race([live.open(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('no answer')), 3000); })]);
    state.live = live;
    state.micOk = true;
    log('mic', { live: 'open' });
  } catch (e) {
    live.close();
    log('mic', { live: 'unavailable', reason: e?.name || e?.message });
  } finally { clearTimeout(timer); }
}

function closeLive() {
  state.live?.close();
  state.live = null;
}

// The user started talking while the assistant was speaking: stop it and listen, right away.
function talkOver() {
  if (!state.speaking || state.muted || state.typing) return;
  // Speaker echo can look like talking. Interrupting within a moment of starting to speak twice in a row is
  // probably echo, so be less eager from then on.
  state.falseBarges = performance.now() - state.speakStart < 900 ? state.falseBarges + 1 : 0;
  if (state.falseBarges >= 2) {
    state.live?.desensitize();
    state.falseBarges = 0;
  }
  log('talk-over', { afterMs: Math.round(performance.now() - state.speakStart) });
  state.skipSpeech = true;
  state.voiceOn = true;
  speech.stopSpeaking();
}

// The one microphone button. Hands-free mode: mute / unmute. Otherwise: tap to talk once.
function toggleMic() {
  if (!state.settings.live) {
    if (state.listening) return cancelListening(), render();
    banner('');
    state.voiceOn = true;
    state.silentRounds = 0;
    render();
    return listenOnce(true);
  }
  state.muted = !state.muted;
  log('mic', { muted: state.muted });
  if (state.muted) {
    state.voiceOn = false;
    state.live?.arm(false);
    cancelListening();
    render();
    return;
  }
  banner('');
  state.voiceOn = true;
  state.silentRounds = 0;
  render();
  if (state.mode === 'listen' && !state.busy && !state.speaking) listenOnce(true);
}

// ---------- wiring ----------

$('lang').replaceChildren(...LANGUAGES.map((l) => Object.assign(document.createElement('option'), { value: l.code, textContent: l.native })));
$('lang').addEventListener('change', async () => {
  await saveSettings();
  await reset();
  phrasesFor(client());
});
$('settings-btn').addEventListener('click', () => {
  $('settings').hidden = !$('settings').hidden;
  if (!$('settings').hidden) refreshModels();
});
$('save-settings').addEventListener('click', async () => {
  await saveSettings();
  await refreshModels();
  if (state.agent) await reset();
});
$('grant-mic').addEventListener('click', askForMic);

// Paste any AI key and Fluent works out the service, its endpoint and a suitable model.
let keyTimer;
async function applyKey() {
  const key = $('api-key').value.trim();
  if (!key) return;
  const provider = detectProvider(key);
  if (!provider) {
    $('settings-note').textContent = 'Key format not recognised. Set the endpoint address and model below.';
    return;
  }
  $('base-url').value = provider.baseUrl;
  $('settings-note').textContent = `Connecting to ${provider.name}…`;
  try {
    const models = await createClient({ baseUrl: provider.baseUrl, model: '', apiKey: key }).listModels();
    $('models').replaceChildren(...models.map((id) => Object.assign(document.createElement('option'), { value: id })));
    $('model').value = pickModel(provider, models);
    $('settings-note').textContent = `${provider.name} connected, model ${$('model').value}. Your answers, except private fields, are sent to ${provider.name}.`;
    await saveSettings();
  } catch (e) {
    $('settings-note').textContent = `${provider.name}: ${e.message}`;
  }
}
$('api-key').addEventListener('input', () => {
  clearTimeout(keyTimer);
  keyTimer = setTimeout(applyKey, 400);
});
$('use-local').addEventListener('click', async () => {
  Object.assign(state.settings, { baseUrl: DEFAULTS.baseUrl, model: DEFAULTS.model, apiKey: '' });
  $('base-url').value = DEFAULTS.baseUrl;
  $('model').value = DEFAULTS.model;
  $('api-key').value = '';
  await chrome.storage.local.set({ settings: state.settings });
  applyVoice();
  await refreshModels();
});
$('start').addEventListener('click', start);
$('send-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('text').value;
  if (sendText(text)) $('text').value = '';
  endTyping();
});

// One answer at a time: while the user types, the microphone waits (and the assistant stops talking).
// Enter sends and the microphone comes back; so does emptying the box, or a few seconds without typing.
function resumeListening() {
  if (state.voiceOn && !state.muted && state.mode === 'listen' && !state.busy && !state.away && !state.speaking) listenOnce();
}
function endTyping() {
  clearTimeout(state.typingTimer);
  if (!state.typing) return;
  state.typing = false;
  log('typing', { ended: true });
  render();
  resumeListening();
}
$('text').addEventListener('input', () => {
  clearTimeout(state.typingTimer);
  if (!$('text').value) return endTyping();
  if (!state.typing) {
    state.typing = true;
    log('typing', { started: true });
    if (state.busy) state.skipSpeech = true;
    speech.stopSpeaking();
    cancelListening();
    state.live?.arm(false);
    render();
  }
  state.typingTimer = setTimeout(endTyping, 6000);
});
$('mic').addEventListener('click', toggleMic);
// One click sends the whole conversation and the state of the form to the development log (no screenshots needed).
$('report-btn').addEventListener('click', () => {
  const transcript = [...document.querySelectorAll('#transcript .bubble')].map((b) => `${b.className.replace('bubble ', '')}: ${b.textContent}`);
  log('report', {
    note: state.mode === 'type' && state.field?.sensitive ? '' : $('text').value,
    mode: state.mode,
    field: state.field?.label,
    muted: state.muted,
    away: state.away,
    transcript,
  });
  banner('Thank you. The conversation was saved for the developer.', 'info');
  setTimeout(() => banner(''), 4000);
});
$('reveal').addEventListener('click', () => {
  state.reveal = !state.reveal;
  render();
});
// A button press cuts the assistant short and then does its job; it never waits for the assistant to finish.
function act(fn) {
  log('button', { while: state.busy ? 'busy' : 'idle' });
  speech.stopSpeaking();
  if (state.busy) {
    state.skipSpeech = true;
    state.queue.push(fn);
    return;
  }
  runTurn(fn);
}
$('continue').addEventListener('click', () => act(() => state.agent.continueTyped()));
$('skip').addEventListener('click', () => act(() => state.agent.skipCurrent()));
$('translate').addEventListener('click', () => act(() => state.agent.translateTyped()));
$('repeat').addEventListener('click', () => act(() => state.agent.repeat()));
$('repeat-card').addEventListener('click', () => act(() => state.agent.repeat()));
$('show-tr').addEventListener('change', (e) => {
  state.send?.({ type: 'fluent:visible', show: e.target.checked }).catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === 'fluent:changed' && state.agent && sender.tab?.id === state.tabId) {
    if (state.busy) state.pendingRescan = true;
    else runTurn(() => state.agent.rescan());
  }
  if (msg?.type === 'fluent:mic-granted') {
    banner('');
    $('settings-note').textContent = 'Microphone allowed';
    state.micOk = false; // re-check now that permission changed
    if (state.agent && state.mode === 'listen' && !state.listening) { state.muted = false; state.voiceOn = true; listenOnce(true); }
  }
});

// A session belongs to the tab it started on. On any other tab it is hidden and silent, so the user is
// never shown (or spoken to about) a form that is not in front of them; coming back restores it.
function goAway() {
  if (state.away) return;
  log('tab', { away: true });
  state.away = true;
  state.resumeVoice = state.voiceOn;
  state.voiceOn = false;
  cancelListening();
  speech.stopSpeaking();
  state.live?.arm(false);
  render();
}
function comeBack() {
  if (!state.away) return;
  log('tab', { away: false });
  state.away = false;
  state.voiceOn = state.resumeVoice && !state.muted;
  render();
  if (state.voiceOn && state.mode === 'listen' && !state.busy) listenOnce();
}
chrome.tabs.onActivated?.addListener(({ tabId }) => {
  if (!state.agent) return;
  if (tabId === state.tabId) comeBack();
  else goAway();
});
chrome.tabs.onRemoved?.addListener((tabId) => {
  if (tabId === state.tabId && state.agent) reset();
});
$('back-tab').addEventListener('click', () => chrome.tabs.update(state.tabId, { active: true }));

// The page was reloaded or navigated: the old conversation no longer matches it.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (tabId === state.tabId && info.status === 'loading' && state.agent) reset();
});

await loadSettings();
applyVoice();
$('build').textContent = `Fluent build ${BUILD}`;
render();
phrasesFor(client());
