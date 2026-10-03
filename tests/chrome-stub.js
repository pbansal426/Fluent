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
      query: async () => [{ id: window.parent.SIM_ACTIVE_TAB || 1, url: pageFrame().contentWindow.location.href }],
      update: async (tabId, props) => {
        if (props.url) pageFrame().src = props.url;
        if (props.active) window.parent.SIM_TAB_UPDATES = [...(window.parent.SIM_TAB_UPDATES || []), tabId];
      },
      sendMessage: async (_tabId, msg) => {
        // Tests simulate the page's helper script disappearing: every message fails until it is injected again.
        if (window.parent.SIM_LOST) throw new Error('Could not establish connection. Receiving end does not exist.');
        return routes[msg.type]?.(msg);
      },
      create: ({ url }) => console.log('would open tab', url),
      onUpdated: noopEvent,
      // Tests switch tabs with window.parent.SIM_ACTIVATE(tabId).
      onActivated: { addListener: (fn) => (window.parent.SIM_ACTIVATE = (tabId) => fn({ tabId })) },
      onRemoved: noopEvent,
    },
    scripting: {
      executeScript: async ({ files }) => {
        if (window.parent.SIM_DEAD) return; // the page cannot be reached at all
        if (window.parent.SIM_LOST) {
          window.parent.SIM_LOST = false;
          // a fresh helper: it knows no fields and hands out ids from the start again
          const F = pageFrame().contentWindow.__fluent;
          F.registry.clear();
          F.seq = 0;
          pageFrame().contentDocument.querySelectorAll('[data-fluent-id]').forEach((el) => delete el.dataset.fluentId);
        }
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
  window.parent.SIM_BOOT?.(window);
})();
