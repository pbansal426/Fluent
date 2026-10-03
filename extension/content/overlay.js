// Shows translations next to the original text and highlights the field being asked about.
(() => {
  const F = (window.__fluent = window.__fluent || {});

  const CSS = `
.fluent-badge{display:block;width:fit-content;max-width:100%;box-sizing:border-box;margin:3px 0 5px;padding:2px 8px;
  font:500 13px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;color:#0b4a8f;background:#e8f2ff;
  border-left:3px solid #2b7de9;border-radius:4px;text-transform:none;letter-spacing:0;font-style:normal;text-align:start;white-space:normal}
.fluent-badge.fluent-inline{display:inline-block;margin:0 0 0 6px;vertical-align:baseline}
.fluent-badge .fluent-exp{display:none;font-weight:400;color:#35557a}
.fluent-badge.fluent-current .fluent-exp{display:block}
.fluent-hidden .fluent-badge{display:none !important}
[data-fluent-current]{outline:3px solid #f59e0b !important;outline-offset:3px;box-shadow:0 0 0 7px rgba(245,158,11,.22) !important;border-radius:6px}
`;

  function ensureStyle() {
    if (document.getElementById('fluent-style')) return;
    const style = document.createElement('style');
    style.id = 'fluent-style';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function badge(text, { inline = false, explanation = '', key }) {
    const b = document.createElement('span');
    b.className = 'fluent-badge' + (inline ? ' fluent-inline' : '');
    b.dataset.fluentBadge = key;
    b.dir = 'auto';
    b.textContent = text;
    if (explanation) {
      b.title = explanation;
      const exp = document.createElement('span');
      exp.className = 'fluent-exp';
      exp.textContent = explanation;
      b.appendChild(exp);
    }
    return b;
  }

  function removeBadge(key) {
    document.querySelectorAll(`[data-fluent-badge="${key}"]`).forEach((n) => n.remove());
  }

  function applyField(t) {
    const entry = F.registry.get(t.id);
    if (!entry || !t.label) return;
    removeBadge(t.id);
    const b = badge(t.label, { explanation: t.explanation, key: t.id });
    if (entry.labelNode) entry.labelNode.appendChild(b);
    else entry.els[0].insertAdjacentElement(entry.els[0].type === 'checkbox' ? 'afterend' : 'beforebegin', b);

    (t.options || []).forEach((text, i) => {
      const node = entry.optionNodes[i];
      if (!node || !text) return;
      if (node.tagName === 'OPTION') {
        if (!node.dataset.fluentOrig) node.dataset.fluentOrig = node.textContent.trim();
        // Without a value attribute the text IS the submitted value; pin it before changing the text.
        if (!node.hasAttribute('value')) node.setAttribute('value', node.value);
        node.dataset.fluentTr = text;
        if (!F.hidden && text.toLowerCase() !== node.dataset.fluentOrig.toLowerCase()) {
          node.textContent = `${node.dataset.fluentOrig} — ${text}`;
        }
      } else {
        const key = `${t.id}:${i}`;
        removeBadge(key);
        node.appendChild(badge(text, { inline: true, key }));
      }
    });
  }

  function applyText(t) {
    const el = F.textNodes.get(t.id);
    if (!el || !t.text) return;
    removeBadge(t.id);
    const inline = el.tagName === 'BUTTON';
    el.appendChild(badge(t.text, { inline, key: t.id }));
  }

  F.apply = function apply({ fields = [], texts = [] }) {
    ensureStyle();
    fields.forEach(applyField);
    texts.forEach(applyText);
    return { ok: true };
  };

  F.setVisible = function setVisible(show) {
    ensureStyle();
    F.hidden = !show;
    document.documentElement.classList.toggle('fluent-hidden', !show);
    document.querySelectorAll('option[data-fluent-tr]').forEach((o) => {
      const { fluentOrig: orig, fluentTr: tr } = o.dataset;
      o.textContent = show && tr.toLowerCase() !== orig.toLowerCase() ? `${orig} — ${tr}` : orig;
    });
    return { ok: true };
  };

  F.highlight = function highlight(id) {
    ensureStyle();
    document.querySelectorAll('[data-fluent-current]').forEach((n) => n.removeAttribute('data-fluent-current'));
    document.querySelectorAll('.fluent-current').forEach((n) => n.classList.remove('fluent-current'));
    const entry = id && F.registry.get(id);
    if (!entry) return { ok: false };
    const target = entry.els.length > 1 || entry.els[0].type === 'checkbox' ? entry.container.closest('label') || entry.container : entry.els[0];
    target.setAttribute('data-fluent-current', '');
    document.querySelectorAll(`[data-fluent-badge="${id}"]`).forEach((n) => n.classList.add('fluent-current'));
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return { ok: true };
  };

  F.clear = function clear() {
    document.querySelectorAll('[data-fluent-badge]').forEach((n) => n.remove());
    document.querySelectorAll('[data-fluent-current]').forEach((n) => n.removeAttribute('data-fluent-current'));
    document.querySelectorAll('option[data-fluent-orig]').forEach((o) => {
      o.textContent = o.dataset.fluentOrig;
      delete o.dataset.fluentTr;
    });
    return { ok: true };
  };
})();
