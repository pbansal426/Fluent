// Routes messages from the side panel to scan / overlay / fill.
(() => {
  const F = window.__fluent;
  if (!F || F.routerLoaded || typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;
  F.routerLoaded = true;

  const handlers = {
    // In Fluent's PDF viewer the page is only ready once the PDF has been drawn.
    'fluent:ping': () => ({ ok: true, ready: F.pdfReady !== false }),
    'fluent:scan': () => F.scan(),
    'fluent:apply': (m) => F.apply(m.translations),
    'fluent:visible': (m) => F.setVisible(m.show),
    'fluent:highlight': (m) => F.highlight(m.id),
    'fluent:fill': (m) => F.fill(m.id, m.value),
    'fluent:read': (m) => F.read(m.id),
    'fluent:focus': (m) => F.focus(m.id),
    'fluent:clear': () => F.clear(),
  };

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    const handler = handlers[msg?.type];
    if (!handler) return;
    // Messages to the PDF viewer are broadcast to every extension page; only the addressed tab answers.
    if ('viewerTab' in msg ? msg.viewerTab !== F.viewerTabId : F.viewerTabId != null) return;
    try {
      sendResponse(handler(msg));
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
  });

  // Tell the panel when the form itself changes (multi-step forms, conditional sections).
  const countControls = () => document.querySelectorAll('input,select,textarea').length;
  let known = countControls();
  let timer = null;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const now = countControls();
      if (now === known) return;
      known = now;
      chrome.runtime.sendMessage({ type: 'fluent:changed' }).catch(() => {});
    }, 800);
  }).observe(document.body, { childList: true, subtree: true });
})();
