// Stand-in for the chrome.* extension APIs, so the real side panel can run in an ordinary page
// (tests/panel-sim.html) next to the demo form. Speech is off by default here.
(() => {
  const store = { settings: { speak: false, live: false, ...(window.parent.SIM_SETTINGS || {}) } };
  const pageFrame = () => window.parent.document.getElementById('page');
  const F = () => pageFrame().contentWindow.__fluent;

  const routes = {
    'fluent:ping': () => {
      if (!F()?.scan) throw new Error('not injected');
      return { ok: true, ready: F().pdfReady !== false };
    },
    'fluent:scan': () => F().scan(),
    'fluent:apply': (m) => F().apply(m.translations),
    'fluent:visible': (m) => F().setVisible(m.show),
    'fluent:highlight': (m) => F().highlight(m.id),
    'fluent:fill': (m) => F().fill(m.id, m.value),
    'fluent:read': (m) => F().read(m.id),
    'fluent:focus': (m) => F().focus(m.id),
    'fluent:clear': () => F().clear(),
  };

  const noopEvent = { addListener() {} };
  window.chrome = {
    storage: {
      local: {
        get: async (key) => (key in store ? { [key]: store[key] } : {}),
        set: async (obj) => void Object.assign(store, obj),
      },
    },
    tabs: {
      query: async () => [{ id: 1, url: pageFrame().contentWindow.location.href }],
      update: async (_tabId, { url }) => void (pageFrame().src = url),
      sendMessage: async (_tabId, msg) => routes[msg.type](msg),
      create: ({ url }) => console.log('would open tab', url),
      onUpdated: noopEvent,
    },
    scripting: {
      executeScript: async ({ files }) => {
        const doc = pageFrame().contentDocument;
        for (const file of files) {
          await new Promise((resolve, reject) => {
            const s = doc.createElement('script');
            s.src = `/extension/${file}`;
            s.onload = resolve;
            s.onerror = reject;
            doc.head.appendChild(s);
          });
        }
      },
    },
    runtime: {
      getURL: (p) => `${window.parent.location.origin}/extension/${p}`, // this frame is srcdoc: no origin of its own
      onMessage: noopEvent,
      // The panel reaches Fluent's PDF viewer (an extension page) with runtime messages.
      sendMessage: async (msg) => (routes[msg.type] ? routes[msg.type](msg) : undefined),
    },
  };
})();
