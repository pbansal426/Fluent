import { splitSentences } from './speech.js';

export function sentencesOf(text) {
  return splitSentences(text);
}

export const NEURAL_VOICES = {
  es: 'es-US-PalomaNeural',
  en: 'en-US-AvaMultilingualNeural',
  hi: 'hi-IN-SwaraNeural',
  zh: 'zh-CN-XiaoxiaoNeural',
  ar: 'ar-SA-ZariyahNeural',
  vi: 'vi-VN-HoaiMyNeural',
  ko: 'ko-KR-SunHiNeural',
  fr: 'fr-FR-VivienneMultilingualNeural',
  pt: 'pt-BR-ThalitaMultilingualNeural',
  ru: 'ru-RU-SvetlanaNeural',
  tl: 'fil-PH-BlessicaNeural',
  bn: 'bn-IN-TanishaaNeural',
};

export function pickNeuralVoice(lang) {
  const code = String(lang || 'en').split('-')[0].toLowerCase();
  return NEURAL_VOICES[code] || NEURAL_VOICES.en;
}

export function createNeuralTts({ apiKey = '', baseUrl = 'https://api.openai.com/v1', model = 'gpt-4o-mini-tts', voice = 'nova', fetchImpl = (...a) => fetch(...a), audioFactory = (url) => new Audio(url) }) {
  let current = null;
  const cache = new Map();

  async function fetchClip(sentence, lang) {
    const activeVoice = (lang ? pickNeuralVoice(lang) : null) || voice;
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const res = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/audio/speech`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, voice: activeVoice, input: sentence, response_format: 'mp3', instructions: 'Speak warmly and calmly, like a patient helper, at an easy pace.' }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`speech service ${res.status}`);
    return URL.createObjectURL(await res.blob());
  }
  const clip = (s, lang) => {
    const key = `${lang || ''}:${s}`;
    return cache.get(key) || cache.set(key, fetchClip(s, lang)).get(key);
  };

  function play(url, stopped) {
    return new Promise((resolve, reject) => {
      const audio = audioFactory(url);
      current = audio;
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error('audio playback failed'));
      if (stopped()) return resolve();
      audio.play().catch(reject);
    });
  }

  return {
    // isStopped(): true once the user interrupted
    async speak(text, lang, isStopped = () => false) {
      const parts = sentencesOf(text);
      parts.slice(0, 2).forEach((s) => clip(s, lang)); // start fetching the first two straight away
      for (let i = 0; i < parts.length; i++) {
        if (isStopped()) return;
        if (parts[i + 2]) clip(parts[i + 2], lang);
        const url = await clip(parts[i], lang);
        if (isStopped()) return;
        await play(url, isStopped);
        cache.delete(`${lang || ''}:${parts[i]}`);
        URL.revokeObjectURL?.(url);
      }
    },
    stop() {
      current?.pause?.();
      current = null;
    },
  };
}
