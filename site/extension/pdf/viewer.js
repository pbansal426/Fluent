// Fluent's own PDF viewer. Chrome's built-in viewer cannot be scripted, so fillable PDFs are opened here:
// pdf.js draws the page and turns the PDF's form fields into ordinary inputs, which the same
// scan / overlay / fill scripts used on web pages can then drive.
import * as pdfjs from './lib/pdf.min.mjs';
import { labelWidgets } from './labels.js';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('./lib/pdf.worker.min.mjs', import.meta.url).href;

const F = (window.__fluent = window.__fluent || {});
F.pdfReady = false;
globalThis.chrome?.tabs?.getCurrent?.((tab) => (F.viewerTabId = tab?.id));

const $ = (id) => document.getElementById(id);
const MAX_SCALE = 1.9;
const state = { doc: null, pageNum: 1, name: 'form.pdf' };

// Link annotations are filtered out, but the annotation layer still wants a link service.
const linkService = {
  externalLinkEnabled: false,
  getDestinationHash: () => '#',
  getAnchorUrl: () => '#',
  addLinkAttributes() {},
  goToDestination() {},
  executeNamedAction() {},
  executeSetOCGState() {},
};

async function open(data, name) {
  F.pdfReady = false;
  state.name = name || 'form.pdf';
  state.doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  $('name').textContent = state.name;
  // The PDF's own title ("2026 Form W-2") tells the model what kind of form this is.
  const meta = await state.doc.getMetadata().catch(() => null);
  // The viewer's own HTML is English; only the PDF's language describes the form.
  F.pdfLang = meta?.info?.Language || meta?.metadata?.get('dc:language') || '';
  document.title = meta?.info?.Title || state.name;
  $('empty').hidden = true;
  $('stage').hidden = false;
  $('download').disabled = false;
  // Start on the first page that has something to fill in.
  state.pageNum = (await nextFillablePage(1)) || 1;
  await render();
}

// The first page at or after `from` that has something to fill in, or 0.
async function nextFillablePage(from) {
  for (let n = from; n <= state.doc.numPages; n++) {
    const page = await state.doc.getPage(n);
    const widgets = (await page.getAnnotations()).filter((a) => a.subtype === 'Widget' && !a.readOnly);
    if (widgets.length) return n;
  }
  return 0;
}

// The assistant finished this page: show the next one that has fields (long forms such as USCIS ones).
F.nextPage = async () => {
  const n = await nextFillablePage(state.pageNum + 1);
  if (!n) return { moved: false };
  state.pageNum = n;
  await render();
  return { moved: true, page: n, pages: state.doc.numPages };
};

async function render() {
  F.pdfReady = false;
  const page = await state.doc.getPage(state.pageNum);
  const [, , pageWidth, pageHeight] = page.view;
  const scale = Math.min(MAX_SCALE, (window.innerWidth - 60) / pageWidth);
  const viewport = page.getViewport({ scale });

  const container = $('page');
  container.style.setProperty('--scale-factor', scale);
  container.style.width = `${viewport.width}px`;
  container.style.height = `${viewport.height}px`;

  const canvas = $('canvas');
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(viewport.width * ratio);
  canvas.height = Math.floor(viewport.height * ratio);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  await page.render({
    canvasContext: canvas.getContext('2d'),
    viewport,
    transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null,
    annotationMode: pdfjs.AnnotationMode.ENABLE_FORMS,
  }).promise;

  const layerDiv = $('annotations');
  layerDiv.replaceChildren();
  $('labels').replaceChildren();
  const annotations = (await page.getAnnotations({ intent: 'display' })).filter((a) => a.subtype === 'Widget');
  const layer = new pdfjs.AnnotationLayer({
    div: layerDiv,
    page,
    viewport: viewport.clone({ dontFlip: true }),
    accessibilityManager: null,
    annotationCanvasMap: null,
    annotationEditorUIManager: null,
    structTreeLayer: null,
  });
  await layer.render({
    annotations,
    renderForms: true,
    linkService,
    imageResourcesPath: '',
    downloadManager: null,
    annotationStorage: state.doc.annotationStorage,
    enableScripting: false,
    hasJSActions: false,
    fieldObjects: null,
  });

  // Reading order (top to bottom, left to right), also the keyboard tab order.
  const top = (el) => parseFloat(el.style.top) || 0;
  const left = (el) => parseFloat(el.style.left) || 0;
  const sections = [...layerDiv.children].sort((a, b) => (Math.abs(top(a) - top(b)) > 0.6 ? top(a) - top(b) : left(a) - left(b)));
  layerDiv.append(...sections);

  const text = await page.getTextContent();
  attachLabels(annotations, text.items, viewport, pageHeight);

  $('pageinfo').textContent = `Page ${state.pageNum} / ${state.doc.numPages}`;
  $('prev').disabled = state.pageNum <= 1;
  $('next').disabled = state.pageNum >= state.doc.numPages;
  F.pdfReady = true;
}

const controlFor = (id) => $('annotations').querySelector(`[data-annotation-id="${id}"] :is(input, textarea, select)`);

// Place an invisible element exactly over a printed caption.
function anchor(tag, className, text, box, viewport) {
  const [x1, y1, x2, y2] = viewport.convertToViewportRectangle([box.x, box.y, box.x + box.w, box.y + box.h]);
  const el = document.createElement(tag);
  el.className = className;
  el.textContent = text;
  el.style.left = `${Math.min(x1, x2)}px`;
  el.style.top = `${Math.min(y1, y2)}px`;
  el.style.width = `${Math.abs(x2 - x1)}px`; // a shorter translation must still cover the whole caption
  el.style.fontSize = `${Math.max(9, Math.abs(y2 - y1) * 1.15)}px`;
  $('labels').appendChild(el);
  return el;
}

function attachLabels(annotations, textItems, viewport, pageHeight) {
  const widgets = annotations.map((a) => ({ id: a.id, x1: a.rect[0], y1: a.rect[1], x2: a.rect[2], y2: a.rect[3], tip: a.alternativeText, radio: !!a.radioButton, group: a.fieldName, buttonValue: a.buttonValue }));
  const items = textItems.map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: it.height }));
  const { labels, texts, twins, radios } = labelWidgets(widgets, items, pageHeight);

  for (const w of widgets) {
    const el = controlFor(w.id);
    if (!el) continue;

    // The same form printed a second time on the page: not asked about, just kept in step with the first.
    if (twins.has(w.id)) {
      el.dataset.fluentSkip = '';
      continue;
    }
    const radio = radios.get(w.id);
    if (radio) {
      // each button says its own option; the group's question travels with it
      el.removeAttribute('aria-labelledby');
      el.setAttribute('aria-label', radio.option);
      el.dataset.fluentGroup = radio.question;
      continue;
    }
    const label = labels.get(w.id);
    if (!label) {
      el.dataset.fluentSkip = '';
      continue;
    }
    if (label.box) {
      const a = anchor('span', 'fluent-pdf-label', label.text, label.box, viewport);
      a.id = `fluent-pdf-label-${w.id}`;
      // A translation may be longer than the caption; let it run to the right edge of its field.
      const fieldRight = viewport.convertToViewportRectangle([w.x2, w.y1, w.x2, w.y2])[0];
      a.style.setProperty('--fluent-max', `${Math.max(60, fieldRight - parseFloat(a.style.left))}px`);
      el.setAttribute('aria-labelledby', a.id);
    } else {
      el.setAttribute('aria-label', label.text);
    }
  }

  for (const [lowerId, upperId] of twins) mirror(controlFor(upperId), controlFor(lowerId));
  for (const t of texts) anchor('p', 'fluent-pdf-text', t.text, t.box, viewport);
}

// Whatever goes into `from` is copied into `to` (and so into the saved PDF).
function mirror(from, to) {
  if (!from || !to) return;
  const sync = () => {
    if (from.type === 'checkbox' || from.type === 'radio') {
      if (to.checked !== from.checked) to.click();
    } else if (to.value !== from.value) {
      to.value = from.value;
      to.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };
  from.addEventListener('input', sync);
  from.addEventListener('change', sync);
}

async function download() {
  const bytes = await state.doc.saveDocument();
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: state.name.replace(/\.pdf$/i, '') + '-filled.pdf' });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
F.savePdf = () => state.doc.saveDocument(); // for tests

async function openFile(file) {
  if (file) await open(new Uint8Array(await file.arrayBuffer()), file.name);
}
F.openFile = openFile; // the demo page hands the viewer a PDF the user picked

$('prev').addEventListener('click', () => { state.pageNum--; render(); });
$('next').addEventListener('click', () => { state.pageNum++; render(); });
$('download').addEventListener('click', download);
$('file').addEventListener('change', (e) => openFile(e.target.files[0]));
document.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('dragging'); });
document.addEventListener('dragleave', () => document.body.classList.remove('dragging'));
document.addEventListener('drop', (e) => {
  e.preventDefault();
  document.body.classList.remove('dragging');
  openFile(e.dataTransfer.files[0]);
});

// viewer.html?file=<url>: opened by the side panel when the current tab is a PDF.
const fileUrl = new URLSearchParams(location.search).get('file');
if (fileUrl) {
  try {
    const res = await fetch(fileUrl);
    if (!res.ok) throw new Error(String(res.status));
    await open(new Uint8Array(await res.arrayBuffer()), decodeURIComponent(fileUrl.split('/').pop().split(/[?#]/)[0]));
  } catch (e) {
    console.error(e);
    $('empty-text').textContent = fileUrl.startsWith('file:')
      ? 'Fluent could not read that file directly. Drop the PDF here, or use "Open PDF". (To skip this step, turn on "Allow access to file URLs" for Fluent in chrome://extensions.)'
      : `Could not load ${fileUrl}. Drop the PDF here, or use "Open PDF".`;
  }
}
