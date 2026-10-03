// Writes values into fields the way a person would, so framework-driven forms notice the change.
(() => {
  const F = (window.__fluent = window.__fluent || {});

  const norm = (s) =>
    String(s ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

  function setNative(el, value) {
    const proto =
      el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  // Index of the option matching `value`, or -1. Exact match first, then a unique partial match.
  function matchOption(labels, value) {
    const v = norm(value);
    if (!v) return -1;
    const ls = labels.map(norm);
    let i = ls.indexOf(v);
    if (i >= 0) return i;
    const partial = ls.map((l, idx) => (l.startsWith(v) || v.startsWith(l) || l.includes(v) ? idx : -1)).filter((idx) => idx >= 0);
    return partial.length === 1 ? partial[0] : -1;
  }

  function toIsoDate(value) {
    const s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const t = Date.parse(s);
    if (Number.isNaN(t)) return '';
    const d = new Date(t);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  const TRUTHY = new Set(['true', 'yes', 'y', '1', 'on', 'checked', 'agree', 'si', 'oui']);

  F.fill = function fill(id, value) {
    const entry = F.registry.get(id);
    if (!entry) return { ok: false, error: 'unknown field' };
    const el = entry.els[0];

    // An empty value clears the field.
    if (value === '') {
      if (el.type === 'radio' || el.type === 'checkbox') {
        for (const r of entry.els) r.checked = false;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (el.tagName === 'SELECT') {
        el.selectedIndex = -1;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        setNative(el, '');
      }
      return { ok: true, value: '' };
    }

    if (el.type === 'radio') {
      const labels = entry.els.map((r, i) => {
        const node = entry.optionNodes[i];
        const c = node ? node.cloneNode(true) : null;
        if (c) c.querySelectorAll('[data-fluent-badge],input').forEach((n) => n.remove());
        return c ? c.textContent : r.value;
      });
      let i = matchOption(labels, value);
      if (i < 0) i = matchOption(entry.els.map((r) => r.value), value);
      if (i < 0) return { ok: false, error: 'not one of the options' };
      if (!entry.els[i].checked) entry.els[i].click();
      return { ok: true, value: labels[i].replace(/\s+/g, ' ').trim() };
    }

    if (el.type === 'checkbox') {
      const want = TRUTHY.has(norm(value));
      if (el.checked !== want) el.click();
      return { ok: true, value: want ? 'true' : 'false' };
    }

    if (el.tagName === 'SELECT') {
      const opts = entry.optionNodes;
      let i = matchOption(opts.map((o) => o.dataset.fluentOrig || o.textContent), value);
      if (i < 0) i = matchOption(opts.map((o) => o.value), value);
      if (i < 0) return { ok: false, error: 'not one of the options' };
      setNative(el, opts[i].value);
      return { ok: true, value: (opts[i].dataset.fluentOrig || opts[i].textContent).trim() };
    }

    let v = String(value ?? '');
    if (el.type === 'date') {
      v = toIsoDate(v);
      if (!v) return { ok: false, error: 'not a date' };
    } else if (el.type === 'number') {
      v = v.replace(/[^\d.\-]/g, '');
    }
    el.focus({ preventScroll: true });
    setNative(el, v);
    return { ok: true, value: el.value };
  };

  F.read = function read(id) {
    const entry = F.registry.get(id);
    if (!entry) return { ok: false, value: '' };
    const el = entry.els[0];
    if (el.type === 'radio') return { ok: true, value: entry.els.some((r) => r.checked) ? 'selected' : '' };
    if (el.type === 'checkbox') return { ok: true, value: el.checked ? 'true' : '' };
    return { ok: true, value: el.value || '' };
  };

  F.focus = function focus(id) {
    const entry = F.registry.get(id);
    if (!entry) return { ok: false };
    entry.els[0].focus({ preventScroll: true });
    return { ok: true };
  };
})();
