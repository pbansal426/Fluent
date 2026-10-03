// Speech recognition inside the form's page. Only used when Chrome refuses to run it in the side panel.
(() => {
  const F = (window.__fluent = window.__fluent || {});
  let rec = null;
  let cancel = null;

  // Resolves with { text } ('' if nothing was said) or { error: <recognition error code> }.
  F.listen = function listen(lang) {
    return new Promise((resolve) => {
      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Recognition) return resolve({ error: 'unsupported' });
      F.stopListening();
      const active = rec = new Recognition();
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (rec === active) { rec = null; cancel = null; }
        resolve(result);
      };
      cancel = () => finish({ text: '' });
      const timer = setTimeout(() => { finish({ error: 'timeout' }); active.abort(); }, 20000);
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
        finish(error ? { error } : { text: '' });
      };
      rec.onend = () => {
        finish(error ? { error } : { text: text.trim() });
      };
      try {
        rec.start();
      } catch (e) {
        finish({ error: e.name || 'start-failed' });
      }
    });
  };

  F.stopListening = function stopListening() {
    const active = rec;
    cancel?.();
    active?.abort();
    return { ok: true };
  };
})();
