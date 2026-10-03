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

export function createSpeech() {
  const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
  const synth = globalThis.speechSynthesis;
  let rec = null;
  let speakToken = 0;

  function voicesReady() {
    return new Promise((resolve) => {
      const voices = synth.getVoices();
      if (voices.length) return resolve(voices);
      synth.addEventListener('voiceschanged', () => resolve(synth.getVoices()), { once: true });
      setTimeout(() => resolve(synth.getVoices()), 1000);
    });
  }

  function pickVoice(voices, lang) {
    const prefix = lang.split('-')[0].toLowerCase();
    const same = voices.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(prefix));
    return same.find((v) => v.lang.toLowerCase() === lang.toLowerCase()) || same[0] || null;
  }

  // Long utterances get cut off in Chrome, so speak sentence by sentence.
  function sentences(text) {
    return text.match(/[^.!?。？！।؟]+[.!?。？！।؟]*\s*/g)?.map((s) => s.trim()).filter(Boolean) || [text];
  }

  async function speak(text, lang) {
    if (!synth || !text) return;
    const token = ++speakToken;
    synth.cancel();
    const voice = pickVoice(await voicesReady(), lang);
    for (const part of sentences(text)) {
      if (token !== speakToken) return;
      await new Promise((resolve) => {
        const u = new SpeechSynthesisUtterance(part);
        u.lang = lang;
        if (voice) u.voice = voice;
        u.rate = 0.95;
        u.onend = u.onerror = resolve;
        synth.speak(u);
      });
    }
  }

  function stopSpeaking() {
    speakToken++;
    synth?.cancel();
  }

  // Resolves with what the user said ('' if nothing); rejects with the recognition error code.
  function listen(lang, { onInterim } = {}) {
    return new Promise((resolve, reject) => {
      if (!Recognition) return reject(new Error('unsupported'));
      rec = new Recognition();
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
        if (e.error === 'no-speech' || e.error === 'aborted') return;
        rec = null;
        reject(new Error(e.error));
      };
      rec.onend = () => {
        rec = null;
        resolve(finalText.trim());
      };
      rec.start();
    });
  }

  function stopListening() {
    rec?.abort();
  }

  return { supported: !!Recognition, speak, stopSpeaking, listen, stopListening };
}
