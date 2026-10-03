// A natural voice from OpenAI's text-to-speech endpoint, used when the user has pasted an OpenAI key.
// Sentences are fetched one ahead of the one being played, so there is no gap between them.
// It throws if the service is unavailable; speech.js then falls back to the browser's own voice.

export function sentencesOf(text) {
  return text.match(/[^.!?。？！।؟]+[.!?。？！।؟]*\s*/g)?.map((s) => s.trim()).filter(Boolean) || [text];
}

export function createNeuralTts({ apiKey, baseUrl = 'https://api.openai.com/v1', model = 'gpt-4o-mini-tts', voice = 'nova', fetchImpl = (...a) => fetch(...a), audioFactory = (url) => new Audio(url) }) {
  let current = null;
  const cache = new Map();

  async function fetchClip(sentence) {
    const res = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, voice, input: sentence, response_format: 'mp3', instructions: 'Speak warmly and calmly, like a patient helper, at an easy pace.' }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`speech service ${res.status}`);
    return URL.createObjectURL(await res.blob());
  }
  const clip = (s) => cache.get(s) || cache.set(s, fetchClip(s)).get(s);

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
    async speak(text, _lang, isStopped = () => false) {
      const parts = sentencesOf(text);
      parts.slice(0, 2).forEach(clip); // start fetching the first two straight away
      for (let i = 0; i < parts.length; i++) {
        if (isStopped()) return;
        if (parts[i + 2]) clip(parts[i + 2]);
        const url = await clip(parts[i]);
        if (isStopped()) return;
        await play(url, isStopped);
        cache.delete(parts[i]);
        URL.revokeObjectURL?.(url);
      }
    },
    stop() {
      current?.pause?.();
      current = null;
    },
  };
}
