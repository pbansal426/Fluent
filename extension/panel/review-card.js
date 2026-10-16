// extension/panel/review-card.js
// Pure HTML/text formatters for the milestone progress bar, visual document hint cards,
// and the end-of-session bilingual verification sheet.

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function renderMilestoneText(milestone, userLang = 'en') {
  if (!milestone || !milestone.total) return '';
  const isEs = /^es|spanish|espa/i.test(String(userLang || ''));
  const rem = milestone.remainingCount ?? 0;
  if (isEs) {
    const left = rem > 0 ? ` · faltan ${rem}` : '';
    return `Parte ${milestone.index} de ${milestone.total}: ${milestone.title}${left}`;
  }
  const left = rem > 0 ? ` · ${rem} left` : '';
  return `Part ${milestone.index} of ${milestone.total}: ${milestone.title}${left}`;
}

export function generateDocumentHintHtml(hint) {
  if (!hint || !hint.cardTitle) return '';
  return `<div class="doc-hint-inner" data-hint-id="${esc(hint.id)}">
    <div class="doc-hint-header">
      <span class="doc-hint-title">${esc(hint.cardTitle)}</span>
      <code class="doc-hint-sample" data-zone="${esc(hint.highlightZone || 'center')}">${esc(hint.sampleCode || '')}</code>
    </div>
    <p class="doc-hint-text">${esc(hint.whereToLook)}</p>
  </div>`;
}

export function generateBilingualReviewHtml(reviewItems = [], userLang = 'en') {
  if (!Array.isArray(reviewItems) || !reviewItems.length) return '';
  const isEs = /^es|spanish|espa/i.test(String(userLang || ''));
  const heading = isEs ? 'Resumen de verificación bilingüe' : 'Bilingual Verification Summary';
  const editLabel = isEs ? 'Cambiar' : 'Edit';
  const answerLabel = isEs ? 'Responder' : 'Answer';
  const printLabel = isEs ? 'Imprimir / Guardar resumen' : 'Print / Save Bilingual Summary';
  const exportLabel = isEs ? 'Descargar datos (JSON)' : 'Download Data (JSON)';
  const newSessionLabel = isEs ? 'Iniciar nueva sesión' : 'Start New Session';

  const rows = reviewItems
    .map(
      (item) => {
        const isSkipped = !!item.skipped;
        const displayVal = item.sensitive && !isSkipped
          ? item.shownValue || (isEs ? 'escrito por usted, privado' : 'typed by you, kept private')
          : item.shownValue || item.value;
        const btnLabel = isSkipped ? answerLabel : editLabel;
        const rowClass = `review-row${item.sensitive ? ' is-private' : ''}${isSkipped ? ' is-skipped' : ''}`;
        return `<div class="${rowClass}">
      <div class="review-labels">
        <span class="review-user-label">${esc(item.label)}</span>
        <span class="review-orig-label">${esc(item.originalLabel)}</span>
      </div>
      <div class="review-value-wrap">
        <span class="review-val">${esc(displayVal)}</span>
        <button type="button" class="small review-edit" data-edit-field="${esc(item.id)}">${esc(btnLabel)}</button>
      </div>
    </div>`;
      }
    )
    .join('');

  return `<div class="review-sheet">
    <div class="review-title">${esc(heading)}</div>
    <div class="review-list">${rows}</div>
    <div class="review-actions">
      <button type="button" class="small review-print" data-action="print-review">${esc(printLabel)}</button>
      <button type="button" class="small review-export" data-action="export-json">${esc(exportLabel)}</button>
      <button type="button" class="small review-reset" data-action="new-session">${esc(newSessionLabel)}</button>
    </div>
  </div>`;
}
