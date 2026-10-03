// Side panel: wires the page, the model, speech and the conversation together.
import { createClient } from '../lib/llm.js';
import { Agent } from '../lib/agent.js';
import { PHRASES, translatePhrases } from '../lib/prompts.js';
import { LANGUAGES, createSpeech } from '../lib/speech.js';

const DEFAULTS = {
  baseUrl: 'http://localhost:1234/v1',
  model: 'google/gemma-4-e4b',
  apiKey: '',
  lang: 'es',
  speak: true,
  noThink: true,
};
const CONTENT_FILES = ['content/scan.js', 'content/overlay.js', 'content/fill.js', 'content/content.js'];

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
  pendingRescan: false,
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
  $('no-think').checked = state.settings.noThink;
  $('lang').value = state.settings.lang;
}

async function saveSettings() {
  Object.assign(state.settings, {
    baseUrl: $('base-url').value.trim() || DEFAULTS.baseUrl,
    model: $('model').value.trim() || DEFAULTS.model,
    apiKey: $('api-key').value.trim(),
    speak: $('speak').checked,
    noThink: $('no-think').checked,
    lang: $('lang').value,
  });
  await chrome.storage.local.set({ settings: state.settings });
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
    row.append(strong, ` ${it.value} `, orig);
    b.appendChild(row);
  }
}

function render() {
  const p = state.phrases;
  const started = !!state.agent;
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
    $('translate').textContent = p.btn_translate;
    $('translate').hidden = !state.canTranslate;
  }
  $('show-tr-label').textContent = p.show_translations;
  // While a private field is open, nothing typed or spoken here should be able to carry its value.
  $('text').disabled = privateField || state.busy;
  $('send').disabled = privateField || state.busy;
  $('mic').disabled = typing || state.mode === 'done' || !speech.supported;
  $('text').placeholder = state.listening ? p.listening : p.input_placeholder;
  $('mic').classList.toggle('on', state.listening);
  for (const id of ['continue', 'skip', 'translate']) $(id).disabled = state.busy;
}

// ---------- page bridge ----------

async function ensureInjected(tabId) {
  try {
    const pong = await chrome.tabs.sendMessage(tabId, { type: 'fluent:ping' });
    if (pong?.ok) return;
  } catch {}
  await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_FILES });
}

function bridge(tabId) {
  const send = (msg) => chrome.tabs.sendMessage(tabId, msg);
  return {
    scan: () => send({ type: 'fluent:scan' }),
    apply: (translations) => send({ type: 'fluent:apply', translations }),
    highlight: (id) => send({ type: 'fluent:highlight', id }),
    focus: (id) => send({ type: 'fluent:focus', id }),
    fill: (id, value) => send({ type: 'fluent:fill', id, value }),
    read: (id) => send({ type: 'fluent:read', id }),
  };
}

// ---------- conversation ----------

const ui = {
  async say(text) {
    bubble('agent', text);
    if (state.settings.speak) await speech.speak(text, lang().speech);
  },
  prompt(p) {
    state.mode = p.mode;
    state.field = p.field;
    state.canTranslate = p.canTranslate;
    render();
  },
  filled: filledBubble,
  status() {},
  error(e) {
    console.error(e);
    banner(e?.kind === 'unreachable' ? `${state.phrases.ai_error} (${state.settings.baseUrl})` : String(e?.message || e));
  },
};

// Runs one step of the conversation, then hands the turn back to the user.
async function runTurn(fn) {
  if (state.busy) return;
  state.busy = true;
  render();
  const thinking = bubble('thinking', '…');
  try {
    await fn();
  } catch (e) {
    ui.error(e);
  } finally {
    thinking.remove();
    state.busy = false;
    render();
  }
  if (state.pendingRescan) {
    state.pendingRescan = false;
    return runTurn(() => state.agent.rescan());
  }
  if (state.voiceOn && state.mode === 'listen') listenOnce();
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
        const key = `phrases:${code}`;
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
  banner('');
  await saveSettings();
  const llm = client();
  $('start').disabled = true;
  try {
    await llm.listModels(); // fail early, before touching the page
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    try {
      await ensureInjected(tab.id);
    } catch {
      return banner('Fluent cannot run on this page. Open a normal web page with a form.');
    }
    state.tabId = tab.id;
    state.phrases = await phrasesFor(llm);
    state.agent = new Agent({ llm, page: bridge(tab.id), ui, userLang: lang().name, phrases: state.phrases });
    $('transcript').replaceChildren();
    render();
  } catch (e) {
    return banner(e?.kind === 'unreachable' ? `Cannot reach the AI model at ${state.settings.baseUrl}. Is LM Studio's server running?` : String(e?.message || e));
  } finally {
    $('start').disabled = false;
  }
  await runTurn(() => state.agent.start());
}

async function reset() {
  speech.stopSpeaking();
  speech.stopListening();
  if (state.tabId) chrome.tabs.sendMessage(state.tabId, { type: 'fluent:clear' }).catch(() => {});
  Object.assign(state, { agent: null, mode: 'idle', field: null, voiceOn: false, listening: false, phrases: { ...PHRASES } });
  banner('');
  render();
}

function sendText(text) {
  text = text.trim();
  if (!text || !state.agent || state.busy) return;
  speech.stopSpeaking();
  bubble('user', text);
  runTurn(() => state.agent.handleUser(text));
}

// ---------- voice ----------

async function micAllowed() {
  try {
    const status = await navigator.permissions.query({ name: 'microphone' });
    return status.state === 'granted';
  } catch {
    return false;
  }
}

// A side panel cannot show the microphone prompt itself, so a small tab asks once.
function askForMic() {
  chrome.tabs.create({ url: chrome.runtime.getURL('panel/permission.html') });
}

async function listenOnce() {
  if (state.listening || state.busy || state.mode !== 'listen') return;
  state.listening = true;
  $('interim').hidden = false;
  $('interim').textContent = '';
  render();
  let text = '';
  try {
    text = await speech.listen(lang().speech, { onInterim: (t) => ($('interim').textContent = t) });
  } catch (e) {
    state.voiceOn = false;
    if (/not-allowed|service-not-allowed/.test(e.message)) askForMic();
    else banner(`Microphone: ${e.message}`, 'info');
  }
  state.listening = false;
  $('interim').hidden = true;
  if (!text) state.voiceOn = false; // silence: stop the loop until the mic is tapped again
  render();
  if (text) sendText(text);
}

async function toggleMic() {
  if (state.listening) {
    state.voiceOn = false;
    speech.stopListening();
    return;
  }
  if (!(await micAllowed())) return askForMic();
  banner('');
  speech.stopSpeaking();
  state.voiceOn = true;
  listenOnce();
}

// ---------- wiring ----------

$('lang').replaceChildren(...LANGUAGES.map((l) => Object.assign(document.createElement('option'), { value: l.code, textContent: `${l.native} — ${l.name}` })));
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
$('start').addEventListener('click', start);
$('send-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('text').value;
  $('text').value = '';
  sendText(text);
});
$('mic').addEventListener('click', toggleMic);
$('continue').addEventListener('click', () => runTurn(() => state.agent.continueTyped()));
$('skip').addEventListener('click', () => runTurn(() => state.agent.skipCurrent()));
$('translate').addEventListener('click', () => runTurn(() => state.agent.translateTyped()));
$('show-tr').addEventListener('change', (e) => {
  if (state.tabId) chrome.tabs.sendMessage(state.tabId, { type: 'fluent:visible', show: e.target.checked }).catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === 'fluent:changed' && state.agent && sender.tab?.id === state.tabId) {
    if (state.busy) state.pendingRescan = true;
    else runTurn(() => state.agent.rescan());
  }
  if (msg?.type === 'fluent:mic-granted' && state.agent) toggleMic();
});

// The page was reloaded or navigated: the old conversation no longer matches it.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (tabId === state.tabId && info.status === 'loading' && state.agent) reset();
});

await loadSettings();
render();
phrasesFor(client());
