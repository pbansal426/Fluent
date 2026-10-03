// Lets the real side-panel code run as a sidebar inside an ordinary web page (the demo page), with no extension:
// the few chrome.* calls it makes are answered here. Loaded first, inside the sidebar frame.
(() => {
  const demo = window.parent.demo;
  const pageFrame = () => demo.formFrame();
  const F = () => pageFrame().contentWindow.__fluent;

  // Settings (including a pasted API key) are remembered in this browser.
  const read = () => { try { return JSON.parse(localStorage.getItem('fluent-demo-store') || '{}'); } catch { return {}; } };
  const write = (data) => { try { localStorage.setItem('fluent-demo-store', JSON.stringify(data)); } catch {} };

  // Browsers block a page from calling another site (LM Studio, OpenAI...). The demo server forwards those calls.
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, window.parent.location.href);
    if (/:8788$/.test(url.host) && url.pathname === '/log') return realFetch('/log', init); // the development log
    if (url.origin === window.parent.location.origin) return realFetch(input, init);
    return realFetch('/proxy', { ...init, method: 'POST', headers: { ...(init.headers || {}), 'x-target-url': url.href, 'x-target-method': init.method || 'GET' } });
  };

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
    'fluent:next-page': () => (F().nextPage ? F().nextPage() : { moved: false }),
  };

  const messageListeners = [];
  const event = { addListener() {} };
  window.chrome = {
    storage: {
      local: {
        get: async (key) => {
          const store = read();
          return typeof key === 'string' ? (key in store ? { [key]: store[key] } : {}) : store;
        },
        set: async (obj) => write({ ...read(), ...obj }),
      },
    },
    tabs: {
      query: async () => [{ id: 1, url: pageFrame().contentWindow.location.href }],
      get: async () => ({ id: 1 }),
      update: async (_id, props) => { if (props.url) pageFrame().src = props.url; },
      sendMessage: async (_id, msg) => routes[msg.type]?.(msg),
      // The "allow microphone" page of the extension becomes the browser's own permission prompt.
      create: async ({ url }) => {
        if (!/permission/.test(url)) return;
        try {
          (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((t) => t.stop());
          messageListeners.forEach((fn) => fn({ type: 'fluent:mic-granted' }, {}));
        } catch {}
      },
      onUpdated: { addListener: (fn) => demo.onUpdated.push(fn) },
      onActivated: event,
      onRemoved: event,
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
      getURL: (p) => `${window.parent.location.origin}/extension/${p}`,
      onMessage: { addListener: (fn) => messageListeners.push(fn) },
      // The panel reaches Fluent's PDF viewer with runtime messages.
      sendMessage: async (msg) => (routes[msg.type] ? routes[msg.type](msg) : undefined),
    },
  };
})();
