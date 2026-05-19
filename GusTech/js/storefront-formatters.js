export const CATEGORY_LABELS = {
  playstation: 'PlayStation',
  xbox: 'Xbox',
  consoles: 'Consoles',
  classicos: 'Clássicos',
  combos: 'Combos',
  monitores: 'Monitores',
  nintendo: 'Nintendo',
  raridades: 'Raridades',
  perifericos: 'Periféricos'
};

export function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function formatCategoryLabel(category = '') {
  const normalized = String(category || '').trim().toLowerCase();
  return CATEGORY_LABELS[normalized] || String(category || 'Categoria');
}

export function hasRealReviews(reviewsCount = 0) {
  return Number(reviewsCount || 0) > 0;
}

export function formatReviewSummary(rating = 0, reviewsCount = 0) {
  const total = Number(reviewsCount || 0);
  if (total <= 0) return 'Sem avaliações ainda';
  return `${Number(rating || 0).toFixed(1)} · ${total} ${total === 1 ? 'avaliação' : 'avaliações'}`;
}

export function debounce(callback, delay = 220) {
  let timeoutId = null;

  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => callback(...args), delay);
  };
}
