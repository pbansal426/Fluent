// Finds the form fields on the page and describes them as plain data.
// Classic script (injected with chrome.scripting), shares state through window.__fluent.
(() => {
  const F = (window.__fluent = window.__fluent || {});
  F.seq = F.seq || 0;
  F.tseq = F.tseq || 0;
  F.registry = F.registry || new Map(); // field id -> { els, labelNode, container, optionNodes }
  F.textNodes = F.textNodes || new Map(); // text id -> element

  const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'file']);
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

  // Text of a node without its form controls or our own badges.
  function textOf(node) {
    if (!node) return '';
    const c = node.cloneNode(true);
    c.querySelectorAll('input,select,textarea,button,script,style,[data-fluent-badge]').forEach((n) => n.remove());
    return clean(c.textContent);
  }

  function visible(el) {
    if (el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden') return true;
    // Custom-styled radios/checkboxes hide the input but show the label.
    if (el.type === 'radio' || el.type === 'checkbox') {
      const label = el.closest('label') || (el.labels && el.labels[0]);
      return !!(label && label.getClientRects().length);
    }
    return false;
  }

  function byIds(ids) {
    return (ids || '').split(/\s+/).map((id) => id && document.getElementById(id)).filter(Boolean);
  }

  // Nearest earlier element that looks like a caption for `el`.
  function precedingText(el) {
    let node = el;
    for (let depth = 0; depth < 3 && node && node !== document.body; depth++) {
      let sib = node.previousElementSibling;
      while (sib) {
        if (!sib.matches('[data-fluent-badge]') && !sib.querySelector('input,select,textarea')) {
          const t = textOf(sib);
          if (t && t.length < 200) return { text: t, node: sib };
        }
        sib = sib.previousElementSibling;
      }
      node = node.parentElement;
    }
    return null;
  }

  function labelInfo(el) {
    if (el.labels && el.labels.length) {
      const t = textOf(el.labels[0]);
      if (t) return { text: t, node: el.labels[0] };
    }
    const refs = byIds(el.getAttribute('aria-labelledby'));
    if (refs.length) return { text: clean(refs.map(textOf).join(' ')), node: refs[0] };
    const aria = clean(el.getAttribute('aria-label'));
    if (aria) return { text: aria, node: null };
    const prev = precedingText(el);
    if (prev) return prev;
    const fallback = clean(el.placeholder) || clean(el.title) || clean((el.name || el.id || '').replace(/[_\-\[\]]+/g, ' '));
    return { text: fallback, node: null };
  }

  function commonAncestor(els) {
    let node = els[0].parentElement;
    while (node && !els.every((e) => node.contains(e))) node = node.parentElement;
    return node || els[0].parentElement;
  }

  // The question a group of radios answers.
  function groupInfo(els) {
    const fieldset = els[0].closest('fieldset');
    // A legend names the group only when the fieldset holds nothing but these radios.
    if (fieldset && fieldset.querySelectorAll('input,select,textarea').length === els.length) {
      const legend = fieldset.querySelector('legend');
      if (legend && textOf(legend)) return { text: textOf(legend), node: legend, container: fieldset };
    }
    const group = els[0].closest('[role="radiogroup"],[role="group"]');
    if (group) {
      const refs = byIds(group.getAttribute('aria-labelledby'));
      if (refs.length) return { text: clean(refs.map(textOf).join(' ')), node: refs[0], container: group };
      const aria = clean(group.getAttribute('aria-label'));
      if (aria) return { text: aria, node: null, container: group };
    }
    const container = commonAncestor(els);
    // Caption may sit inside the container, just before the first option.
    let child = els[0];
    while (child.parentElement && child.parentElement !== container) child = child.parentElement;
    const prev = precedingText(child);
    if (prev) return { ...prev, container };
    return { text: clean((els[0].name || '').replace(/[_\-\[\]]+/g, ' ')), node: null, container };
  }

  function kindOf(el) {
    if (el.tagName === 'SELECT') return 'select';
    if (el.tagName === 'TEXTAREA') return 'textarea';
    if (el.type === 'radio') return 'radio';
    if (el.type === 'checkbox') return 'checkbox';
    if (el.type === 'date') return 'date';
    return 'text';
  }

  function idFor(el) {
    if (!el.dataset.fluentId) el.dataset.fluentId = 'f' + ++F.seq;
    return el.dataset.fluentId;
  }

  // "Legal first name *" -> "Legal first name"
  const tidy = (label) => label.replace(/\s*[*:]+\s*$/, '');

  // Name of the form section a control sits in ("Emergency Contact"), unless that is its own label.
  function sectionOf(el, labelNode) {
    const legend = el.closest('fieldset')?.querySelector('legend');
    return legend && legend !== labelNode ? textOf(legend) : '';
  }

  function describe(el, kind) {
    const describedBy = byIds(el.getAttribute('aria-describedby')).map(textOf).join(' ');
    return {
      kind,
      inputType: el.type || '',
      name: el.name || '',
      htmlId: el.id || '',
      autocomplete: el.getAttribute('autocomplete') || '',
      placeholder: clean(el.placeholder),
      helpText: clean(describedBy),
      required: !!el.required || el.getAttribute('aria-required') === 'true',
      maxLength: el.maxLength > 0 ? el.maxLength : 0,
    };
  }

  F.scan = function scan() {
    F.registry.clear();
    const fields = [];
    const labelNodes = new Set();
    const seenRadioGroups = new Set();
    const controls = [...document.querySelectorAll('input,select,textarea')].filter(
      (el) => !SKIP_TYPES.has(el.type) && !el.disabled && !el.readOnly && !('fluentSkip' in el.dataset) && visible(el)
    );

    for (const el of controls) {
      const kind = kindOf(el);

      if (kind === 'radio') {
        const key = (el.form ? [...document.forms].indexOf(el.form) : -1) + ':' + el.name;
        if (el.name && seenRadioGroups.has(key)) continue;
        seenRadioGroups.add(key);
        const els = el.name ? controls.filter((c) => c.type === 'radio' && c.name === el.name && c.form === el.form) : [el];
        const g = groupInfo(els);
        const options = els.map((r) => ({ value: r.value, label: labelInfo(r).text || r.value }));
        const optionNodes = els.map((r) => labelInfo(r).node);
        const id = idFor(els[0]);
        const checked = els.find((r) => r.checked);
        F.registry.set(id, { els, labelNode: g.node, container: g.container, optionNodes });
        if (g.node) labelNodes.add(g.node);
        fields.push({
          id,
          ...describe(els[0], 'radio'),
          required: els.some((r) => r.required),
          label: tidy(g.text),
          section: sectionOf(els[0], g.node),
          options: options.map((o) => o.label),
          value: checked ? options[els.indexOf(checked)].label : '',
        });
        continue;
      }

      const info = labelInfo(el);
      const id = idFor(el);
      const field = { id, ...describe(el, kind), label: tidy(info.text), section: sectionOf(el, info.node), options: [], value: '' };
      const entry = { els: [el], labelNode: info.node, container: el, optionNodes: [] };

      if (kind === 'select') {
        const opts = [...el.options].filter((o) => o.value !== '' && !o.disabled);
        field.options = opts.map((o) => clean(o.dataset.fluentOrig || o.textContent));
        entry.optionNodes = opts;
        const sel = el.selectedOptions[0];
        field.value = sel && sel.value !== '' ? clean(sel.dataset.fluentOrig || sel.textContent) : '';
      } else if (kind === 'checkbox') {
        field.value = el.checked ? 'true' : '';
      } else {
        field.value = el.value || '';
      }

      if (info.node) labelNodes.add(info.node);
      F.registry.set(id, entry);
      fields.push(field);
    }

    return { fields, texts: scanTexts(labelNodes), pageLang: document.documentElement.lang || '', title: document.title, url: location.href };
  };

  // Headings, instructions and buttons around the form, so the whole view can be translated.
  function scanTexts(labelNodes) {
    const scope = document.forms.length === 1 ? document.forms[0].parentElement || document.body : document.body;
    const out = [];
    const candidates = scope.querySelectorAll('h1,h2,h3,h4,legend,p,li,small,button,[type="submit"]');
    for (const el of candidates) {
      if (out.length >= 40) break;
      if (labelNodes.has(el) || el.closest('[data-fluent-badge],[data-fluent-ignore]') || !el.getClientRects().length) continue;
      if (el.tagName === 'INPUT') continue;
      if (el.querySelector('input,select,textarea,p,li')) continue;
      const text = textOf(el) || (el.tagName === 'BUTTON' ? clean(el.textContent) : '');
      if (text.length < 2 || text.length > 400) continue;
      if (!el.dataset.fluentTextId) el.dataset.fluentTextId = 't' + ++F.tseq;
      F.textNodes.set(el.dataset.fluentTextId, el);
      out.push({ id: el.dataset.fluentTextId, text });
    }
    return out;
  }
})();
