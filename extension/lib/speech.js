// Chrome's built-in speech: recognition (speech-to-text) and synthesis (text-to-speech).

// `start` is the start-button label in the language itself, shown before any model call.
export const LANGUAGES = [
  { code: 'es', name: 'Spanish', native: 'Español', speech: 'es-US', start: 'Ayúdame con este formulario' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', speech: 'hi-IN', start: 'इस फ़ॉर्म को भरने में मेरी मदद करें' },
  { code: 'zh', name: 'Mandarin Chinese (Simplified)', native: '中文', speech: 'zh-CN', start: '帮我填写这份表格' },
  { code: 'ar', name: 'Arabic', native: 'العربية', speech: 'ar-SA', start: 'ساعدني في ملء هذا النموذج' },
  { code: 'vi', name: 'Vietnamese', native: 'Tiếng Việt', speech: 'vi-VN', start: 'Giúp tôi điền mẫu đơn này' },
  { code: 'ko', name: 'Korean', native: '한국어', speech: 'ko-KR', start: '이 양식 작성을 도와주세요' },
  { code: 'fr', name: 'French', native: 'Français', speech: 'fr-FR', start: 'Aidez-moi à remplir ce formulaire' },
  { code: 'pt', name: 'Portuguese', native: 'Português', speech: 'pt-BR', start: 'Ajude-me com este formulário' },
  { code: 'ru', name: 'Russian', native: 'Русский', speech: 'ru-RU', start: 'Помогите мне заполнить эту форму' },
  { code: 'tl', name: 'Tagalog', native: 'Tagalog', speech: 'fil-PH', start: 'Tulungan mo ako sa form na ito' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা', speech: 'bn-IN', start: 'এই ফর্মটি পূরণ করতে আমাকে সাহায্য করুন' },
  { code: 'en', name: 'English', native: 'English', speech: 'en-US', start: 'Help me with this form' },
];

// macOS ships joke voices next to the real ones; never pick those.
const NOVELTY = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|kathy|ralph|princess)\b/i;

// The most natural-sounding installed voice for a language: neural / premium / enhanced first, then network
// voices (Google), then plain system voices; the exact regional match breaks ties.
export function pickVoice(voices, lang) {
  const prefix = lang.split('-')[0].toLowerCase();
  const same = voices.filter((v) => v.lang && v.lang.toLowerCase().replace('_', '-').startsWith(prefix) && !NOVELTY.test(v.name || ''));
  if (!same.length) return null;
  const score = (v) =>
    (/natural|neural|premium|enhanced|siri|studio/i.test(v.name) ? 6 : 0) +
    (/google/i.test(v.name) ? 3 : 0) +
    (/compact|espeak/i.test(v.name) ? -3 : 0) +
    (v.localService === false ? 1 : 0) +
    (v.lang.toLowerCase().replace('_', '-') === lang.toLowerCase() ? 1 : 0);
  return same.reduce((best, v) => (score(v) > score(best) ? v : best));
}

// Text as it should be spoken: no markup, symbols or list marks read aloud, no stray blank space.
export const spokenText = (text) =>
  String(text || '')
    .replace(/[*_`#>]+/g, '')
    .replace(/\s*[→←↔]\s*/g, ', ')
    .replace(/\s*[–—]\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();

export function createSpeech() {
  const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
  const synth = globalThis.speechSynthesis;
  let rec = null;
  let speakToken = 0;
  let finishSpeaking = null;
  let finishListening = null;
  let neural = null; // optional { speak(text, lang), stop() }: a neural cloud voice, used while it works

  function voicesReady() {
    return new Promise((resolve) => {
      const voices = synth.getVoices();
      if (voices.length) return resolve(voices);
      synth.addEventListener('voiceschanged', () => resolve(synth.getVoices()), { once: true });
      setTimeout(() => resolve(synth.getVoices()), 1000);
    });
  }


  // Long utterances get cut off in Chrome, so speak sentence by sentence.
  function sentences(text) {
    return text.match(/[^.!?。？！।؟]+[.!?。？！।؟]*\s*/g)?.map((s) => s.trim()).filter(Boolean) || [text];
  }

  async function speak(text, lang) {
    text = spokenText(text);
    if (!text) return;
    if (neural) {
      stopSpeaking();
      const token = ++speakToken;
      try {
        await neural.speak(text, lang, () => token !== speakToken);
        return;
      } catch (e) {
        if (token !== speakToken) return; // interrupted, not failed
        console.warn('Fluent: neural voice failed, using the browser voice', e?.message || e);
        neural = null; // fall back for the rest of the session
      }
    }
    if (!synth) return;
    stopSpeaking();
    const token = ++speakToken;
    const voice = pickVoice(await voicesReady(), lang);
    for (const part of sentences(text)) {
      if (token !== speakToken) return;
      await new Promise((resolve) => {
        let timer;
        const finish = () => {
          clearTimeout(timer);
          if (finishSpeaking === finish) finishSpeaking = null;
          resolve();
        };
        finishSpeaking = finish;
        const u = new SpeechSynthesisUtterance(part);
        u.lang = lang;
        if (voice) u.voice = voice;
        u.rate = 0.97; // a touch slower than the default sounds less hurried
        u.onend = u.onerror = finish;
        // Chrome sometimes never fires onend; don't let the conversation hang on it.
        timer = setTimeout(finish, 4000 + part.length * 150);
        synth.speak(u);
      });
    }
  }

  function stopSpeaking() {
    speakToken++;
    neural?.stop();
    finishSpeaking?.();
    synth?.cancel();
  }

  // Resolves with what the user said ('' if nothing); rejects with the recognition error code.
  function listen(lang, { onInterim } = {}) {
    return new Promise((resolve, reject) => {
      if (!Recognition) return reject(new Error('unsupported'));
      stopListening();
      const active = rec = new Recognition();
      let settled = false;
      const finish = (error, text = '') => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (rec === active) rec = null;
        if (finishListening === finish) finishListening = null;
        if (error) reject(new Error(error));
        else resolve(text);
      };
      finishListening = finish;
      const timer = setTimeout(() => { finish('timeout'); active.abort(); }, 20000);
      rec.lang = lang;
      rec.interimResults = true;
      rec.continuous = false;
      let finalText = '';
      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
          else interim += e.results[i][0].transcript;
        }
        onInterim?.(finalText + interim);
      };
      rec.onerror = (e) => {
        finish(e.error === 'no-speech' || e.error === 'aborted' ? '' : e.error);
      };
      rec.onend = () => {
        finish('', finalText.trim());
      };
      try { rec.start(); } catch (e) { finish(e.name || 'start-failed'); }
    });
  }

  function stopListening() {
    const active = rec;
    finishListening?.('');
    active?.abort();
  }

  return { supported: !!Recognition, speak, stopSpeaking, listen, stopListening, setNeural: (n) => (neural = n || null), get neural() { return !!neural; } };
}
