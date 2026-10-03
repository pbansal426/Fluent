// Fire-and-forget development log: posts events to tools/log-server.mjs on this machine.
// If the server is not running the calls quietly do nothing (and pause for 30 seconds after a failure).
export function createLog({ url = 'http://127.0.0.1:8788/log', fetchImpl = (...a) => fetch(...a) } = {}) {
  let pausedUntil = 0;
  return (event, data = {}) => {
    if (Date.now() < pausedUntil) return;
    try {
      fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ t: new Date().toISOString(), event, ...data }), keepalive: true })
        .then((res) => { if (!res.ok) pausedUntil = Date.now() + 30000; })
        .catch(() => { pausedUntil = Date.now() + 30000; });
    } catch {
      pausedUntil = Date.now() + 30000;
    }
  };
}
