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
  $('text').disabled = privateField;
  $('send').disabled = privateField;
  // While the assistant is talking the mic button interrupts it, whatever the field.
  $('mic').disabled = !speech.supported || (!state.speaking && (typing || state.mode === 'done'));
  $('mic').title = state.speaking ? 'Tap to interrupt' : typing ? 'The microphone is off while you type this answer' : 'Microphone';
  $('text').placeholder = p.input_placeholder;
  $('mic').classList.toggle('armed', state.voiceOn);
  $('mic').classList.toggle('on', state.listening);
  $('mic').classList.toggle('speaking', state.speaking);
  $('live-status').textContent = state.listening ? p.listening : '';
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
  return (msg) => chrome.tabs.sendMessage(tab.id, msg);
}

function bridge(send) {
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
    if (!state.settings.speak || state.skipSpeech) return;
    state.speaking = true;
    render();
    try { await speech.speak(text, lang().speech); }
    finally { state.speaking = false; render(); }
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
    const message = e?.kind === 'unreachable' ? `${state.phrases.ai_error} (${state.settings.baseUrl})` : String(e?.message || e);
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
    render();
  }
  if (state.queue.length) {
    const text = state.queue.shift();
    return runTurn(() => state.mode === 'type' && state.field?.sensitive
      ? ui.say(state.phrases.type_private)
      : state.agent.handleUser(text));
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
        const key = `phrases:v3:${code}`; // bump when PHRASES changes
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
    const send = await connect(tab);
    if (!send) return;
    state.tabId = tab.id;
    state.send = send;
    state.phrases = await phrasesFor(llm);
    state.agent = new Agent({ llm, page: bridge(send), ui, userLang: lang().name, phrases: state.phrases });
    $('transcript').replaceChildren();
    // Hands-free by default: after the assistant speaks, it listens.
    state.voiceOn = state.settings.live && speech.supported;
    state.silentRounds = 0;
    render();
  } catch (e) {
    return banner(e?.kind === 'unreachable' ? `Cannot reach the AI model at ${state.settings.baseUrl}. Is LM Studio's server running?` : String(e?.message || e));
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
  state.send?.({ type: 'fluent:clear' }).catch(() => {});
  Object.assign(state, { agent: null, send: null, mode: 'idle', field: null, busy: false, queue: [], pendingRescan: false, pageListen: false, voiceOn: false, listening: false, speaking: false, skipSpeech: false, phrases: { ...PHRASES } });
  banner('');
  render();
}

function sendText(text, spoken = false) {
  text = text.trim();
  if (!text || !state.agent) return false;
  if (state.mode === 'type' && state.field?.sensitive) {
    banner(state.phrases.type_private, 'info');
    return false;
  }
  if (!spoken) state.voiceOn = false;
  state.skipSpeech = true;
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

const MAX_SILENT_ROUNDS = 3; // how many times to keep listening through silence before pausing

// byUser: the user tapped the mic (so it is fine to open the permission tab); otherwise hands-free.
async function listenOnce(byUser = false) {
  if (state.listening || state.busy || state.mode !== 'listen') return;
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
  if (text) {
    state.silentRounds = 0;
    render();
    return sendText(text, true);
  }
  // Silence. Keep listening for a while, like a person waiting for an answer, then pause.
  if (state.voiceOn && ++state.silentRounds < MAX_SILENT_ROUNDS) {
    render();
    return listenOnce();
  }
  state.voiceOn = false;
  state.silentRounds = 0;
  render();
}

function toggleMic() {
  // Talking over the assistant: stop it, stay quiet for the rest of this turn, then listen.
  if (state.speaking) {
    state.skipSpeech = true;
    state.voiceOn = true;
    speech.stopSpeaking();
    return;
  }
  if (state.listening) {
    state.voiceOn = false;
    cancelListening();
    render();
    return;
  }
  banner('');
  state.voiceOn = true;
  state.silentRounds = 0;
  render();
  listenOnce(true);
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
  if (sendText(text)) $('text').value = '';
});
$('mic').addEventListener('click', toggleMic);
$('continue').addEventListener('click', () => runTurn(() => state.agent.continueTyped()));
$('skip').addEventListener('click', () => runTurn(() => state.agent.skipCurrent()));
$('translate').addEventListener('click', () => runTurn(() => state.agent.translateTyped()));
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
    if (state.agent && state.mode === 'listen' && !state.listening) toggleMic();
  }
});

// The page was reloaded or navigated: the old conversation no longer matches it.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (tabId === state.tabId && info.status === 'loading' && state.agent) reset();
});

await loadSettings();
render();
phrasesFor(client());
