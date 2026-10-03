// Speech recognition inside the form's page. Only used when Chrome refuses to run it in the side panel.
(() => {
  const F = (window.__fluent = window.__fluent || {});
  let rec = null;

  // Resolves with { text } ('' if nothing was said) or { error: <recognition error code> }.
  F.listen = function listen(lang) {
    return new Promise((resolve) => {
      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Recognition) return resolve({ error: 'unsupported' });
      rec = new Recognition();
      rec.lang = lang;
      rec.interimResults = false;
      rec.continuous = false;
      let text = '';
      let error = '';
      rec.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) text += e.results[i][0].transcript;
      };
      rec.onerror = (e) => {
        if (e.error !== 'no-speech' && e.error !== 'aborted') error = e.error;
      };
      rec.onend = () => {
        rec = null;
        resolve(error ? { error } : { text: text.trim() });
      };
      try {
        rec.start();
      } catch (e) {
        resolve({ error: e.name || 'start-failed' });
      }
    });
  };

  F.stopListening = function stopListening() {
    rec?.abort();
    return { ok: true };
  };
})();
