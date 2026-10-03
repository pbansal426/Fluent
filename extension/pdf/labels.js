// PDF form fields carry no usable labels (names look like "f2_01"), so labels are matched by position:
// the printed text sitting just above (or below) each field. Coordinates are PDF points, y pointing up.
//
// widgets: [{ id, x1, y1, x2, y2 }]      items: [{ str, x, y, w, h }]  (x, y = start of the text baseline)

const ABOVE_WINDOW = 12; // how far above a field its caption may sit
const MULTILINE_GAP = 7; // captions may wrap onto a second line this close
const STACK_GAP = 14; // a field this close under another with the same width is "line 2" of it
const ADJACENT_GAP = 4;

// A text item belongs to a field's column if it starts inside it or is centred over it.
function inColumn(it, w) {
  const centre = it.x + it.w / 2;
  return (it.x >= w.x1 - 2 && it.x < w.x2) || (centre >= w.x1 - 2 && centre <= w.x2);
}

function joinLines(items) {
  const sorted = [...items].sort((a, b) => (Math.abs(a.y - b.y) > 1.5 ? b.y - a.y : a.x - b.x));
  return sorted.map((it) => it.str.trim()).join(' ').replace(/\s+/g, ' ');
}

function boxOf(items) {
  const x = Math.min(...items.map((i) => i.x));
  const y = Math.min(...items.map((i) => i.y));
  return { x, y, w: Math.max(...items.map((i) => i.x + i.w)) - x, h: Math.max(...items.map((i) => i.y + i.h)) - y };
}

function captionNear(w, texts, where) {
  const gap = (it) => (where === 'above' ? it.y - w.y2 : w.y1 - it.y);
  const near = texts.filter((it) => inColumn(it, w) && (where === 'above' ? gap(it) > -1 && gap(it) <= ABOVE_WINDOW : gap(it) > 0 && gap(it) <= ABOVE_WINDOW));
  if (!near.length) return null;
  const closest = Math.min(...near.map(gap));
  return near.filter((it) => gap(it) - closest <= MULTILINE_GAP);
}

// Many paper forms print the same form twice on a page (two W-2s per sheet).
// Returns Map(lowerWidgetId -> upperWidgetId) when the lower half repeats the upper half.
export function findTwins(widgets, pageHeight) {
  const half = pageHeight / 2;
  const lower = widgets.filter((w) => w.y2 <= half + 2);
  const upper = widgets.filter((w) => w.y1 >= half - 2);
  const twins = new Map();
  for (const lo of lower) {
    const up = upper.find((u) => Math.abs(u.x1 - lo.x1) < 1 && Math.abs(u.x2 - lo.x2) < 1 && Math.abs(u.y1 - half - lo.y1) < 1.5);
    if (up) twins.set(lo.id, up.id);
  }
  return lower.length >= 5 && twins.size >= lower.length * 0.8 ? twins : new Map();
}

const GENERIC_TIP = /^(text|check ?box|radio( button)?|combo ?box|list ?box|field|button|text field|form field)\b[\s\d.:_-]*$/i;

// A tooltip worth using as a label: real words, not "Text Field 3" or a bare field name.
export function cleanTip(tip) {
  const t = String(tip || '').replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '');
  if (!/\p{L}{3}/u.test(t) || GENERIC_TIP.test(t) || /^[\w\[\]#.-]+$/.test(t) && /\d|\[/.test(t)) return '';
  return compactTip(t);
}

const clip = (s, n) => (s.length <= n ? s : `${s.slice(0, n).replace(/\s+\S*$/, '')}…`);

// "Part 2. Information About You. Your Full Legal Name. 1. A. Enter Family Name, Last Name"
//   -> "Your Full Legal Name: 1.A Enter Family Name, Last Name"
// The tooltips of government forms run "Part. Title. Group. [instructions]. item. action"; the question only
// needs the group, the item number and the action.
function compactTip(t) {
  const matches = [...t.matchAll(/\b(\d+)\.\s?([A-Za-z])\.\s+/g)];
  const m = matches.at(-1);
  if (!m) return t.length <= 140 ? t : `…${t.slice(-120).replace(/^\S*\s+/, '')}`; // what tells fields apart is at the end
  const before = t.slice(0, m.index).split(/\.\s+/).map((s) => s.trim()).filter(Boolean);
  const action = clip(t.slice(m.index + m[0].length), 110);
  const short = (s) => s && s.length <= 45 && !/^part\b/i.test(s);
  const group = short(before[2]) ? before[2] : short(before.at(-1)) ? before.at(-1) : '';
  const item = `${m[1]}.${m[2].toUpperCase()}`;
  return group ? `${group}: ${item} ${action}` : `${item} ${action}`;
}

// Returns { labels: Map(id -> { text, box | null }), texts: [{ text, box }] }
//   box  = where the caption is printed ({x, y, w, h}); null when the label was inferred from a neighbour
//   texts = remaining printed lines (titles, instructions) worth translating
export function labelWidgets(widgets, items, pageHeight) {
  const twins = findTwins(widgets, pageHeight);
  const active = widgets.filter((w) => !twins.has(w.id));
  const floor = twins.size ? pageHeight / 2 : -Infinity; // ignore the repeated lower form's text
  const texts = items.filter((it) => it.str.trim() && it.y >= floor);
  const used = new Set();
  const labels = new Map();

  // 1. A caption printed directly above the field.
  for (const w of active) {
    const caption = captionNear(w, texts, 'above');
    if (!caption) continue;
    caption.forEach((it) => used.add(it));
    labels.set(w.id, { text: joinLines(caption), box: boxOf(caption), own: true });
  }

  const sameRow = (a, b) => Math.abs(a.y1 - b.y1) < 2;
  for (const w of active) {
    if (labels.has(w.id)) continue;
    // 2. Second part of the captioned field immediately to its left (box 12: code, then amount).
    const left = active.find((o) => sameRow(o, w) && w.x1 - o.x2 >= -1 && w.x1 - o.x2 <= ADJACENT_GAP && labels.get(o.id)?.own);
    // 3. Second line of the field stacked right above it (state rows 15-20).
    const above = active.find((o) => Math.abs(o.x1 - w.x1) < 2 && Math.abs(o.x2 - w.x2) < 2 && o.y1 - w.y2 >= 0 && o.y1 - w.y2 <= STACK_GAP && labels.has(o.id));
    const source = left || above;
    if (source) {
      labels.set(w.id, { text: labels.get(source.id).text, box: null, own: false });
      continue;
    }
    // 4. A caption printed below the field.
    const caption = captionNear(w, texts, 'below');
    if (caption) {
      caption.forEach((it) => used.add(it));
      labels.set(w.id, { text: joinLines(caption), box: boxOf(caption), own: true });
    }
  }

  // 5. The PDF's own tooltip. Government forms carry full descriptions ("Part 2. Your Full Legal Name. 1.B. Enter
  //    Given Name, First Name."), which beat guessing from position, so it fills in where no readable caption
  //    sits above or below the field, or where the label would only be copied from a neighbour.
  for (const w of active) {
    const tip = cleanTip(w.tip);
    if (!tip) continue;
    const label = labels.get(w.id);
    if (!label || label.own === false || !/\p{L}{3}/u.test(label.text)) labels.set(w.id, { text: tip, box: null, own: true });
  }

  // Repeated labels get numbered so they can be told apart: "State", "State (2)".
  const seen = new Map();
  for (const w of active) {
    const label = labels.get(w.id);
    if (!label) continue;
    const n = (seen.get(label.text) || 0) + 1;
    seen.set(label.text, n);
    labels.set(w.id, { text: n > 1 ? `${label.text} (${n})` : label.text, box: label.box });
  }

  const rest = texts
    .filter((it) => !used.has(it) && it.str.trim().length >= 12 && /\p{L}{4}/u.test(it.str))
    .map((it) => ({ text: it.str.trim(), box: boxOf([it]) }));

  return { labels, texts: rest, twins };
}
