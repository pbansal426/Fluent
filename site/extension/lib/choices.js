// Government PDFs draw "Yes / No", "Male / Female" and similar choices as separate checkboxes, each with its
// own label ("Have you ever ...?: Select Yes", "... Select No"). Asked one by one they make a bad conversation,
// so a run of such checkboxes becomes one question with options. The agent ticks the matching box.

const OPTION = /^(.*?)[\s:.]*\b(?:select|check|mark)\s+(?:the\s+)?(.+?)\s*$/i;
const MAX_OPTIONS = 8;

const normalize = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

// The question without its heading path: "Part 1. About You (applying) 6. Sex" -> "Sex".
function stemOf(raw) {
  const stem = raw.replace(/[\s:.]+$/, '');
  return stem.length > 80 || /^part\s+\d/i.test(stem) ? stem.split(/\.\s+/).at(-1).trim() : stem;
}

// fields: scanned fields in reading order. Returns the same list where each run of 2-8 checkboxes that
// share a question becomes one { kind: 'radio', options, members: [{ id, option }] } field.
export function groupChoices(fields) {
  const out = [];
  for (let i = 0; i < fields.length; ) {
    const f = fields[i];
    const first = f.kind === 'checkbox' && !f.sensitive ? OPTION.exec(f.label) : null;
    if (!first || /all that apply|check all/i.test(f.label)) {
      out.push(f);
      i++;
      continue;
    }
    const raw = first[1];
    const run = [{ field: f, option: first[2] }];
    for (let j = i + 1; j < fields.length && run.length < MAX_OPTIONS; j++) {
      const m = fields[j].kind === 'checkbox' && !fields[j].sensitive ? OPTION.exec(fields[j].label) : null;
      if (!m || normalize(m[1]) !== normalize(raw)) break;
      run.push({ field: fields[j], option: m[2] });
    }
    if (run.length < 2 || new Set(run.map((r) => normalize(r.option))).size < run.length) {
      out.push(f);
      i++;
      continue;
    }
    out.push({
      ...f,
      kind: 'radio',
      label: stemOf(raw),
      options: run.map((r) => r.option),
      members: run.map((r) => ({ id: r.field.id, option: r.option })),
      required: run.some((r) => r.field.required),
    });
    i += run.length;
  }
  return out;
}

// Index of the option the user chose, or -1: exact match first, then a prefix either way ("yes" / "Yes, I have").
export function matchOption(options, value) {
  const v = normalize(value);
  if (!v) return -1;
  const opts = options.map(normalize);
  let i = opts.indexOf(v);
  if (i < 0) i = opts.findIndex((o) => o && (o.startsWith(v) || v.startsWith(o)));
  return i;
}
