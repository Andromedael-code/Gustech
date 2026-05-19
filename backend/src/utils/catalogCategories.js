export const DISPLAY_CATEGORY_ORDER = [
  'playstation',
  'xbox',
  'consoles',
  'classicos',
  'combos',
  'monitores',
  'nintendo',
  'raridades',
  'perifericos'
];

export const CONSOLE_CATEGORY_MEMBERS = ['playstation', 'xbox', 'nintendo', 'classicos', 'raridades', 'combos'];

const CATEGORY_ALIASES = {
  geral: 'consoles',
  moveis: 'perifericos',
  acessorios: 'perifericos',
  hardware: 'perifericos'
};

const PRODUCT_CATEGORY_OVERRIDES = {
  'ps4-seminovo': 'playstation',
  'ps4-lacrado': 'playstation',
  'ps4-novo': 'playstation',
  'ps4-usado': 'playstation',
  'ps4-slim': 'playstation',
  'ps4-bundle': 'combos',
  'xbox-series-s-combo': 'combos',
  'xbox-one-s': 'xbox',
  'xbox-one-x': 'xbox',
  switch: 'nintendo',
  'snes-classic': 'classicos',
  'ps2-fat': 'raridades',
  'prod-rtx-4070-super': 'perifericos',
  'prod-ryzen-7-7800x3d': 'perifericos',
  'prod-headset-cloud-iii': 'perifericos',
  'prod-teclado-k70-rgb-pro': 'perifericos',
  'prod-mouse-g-pro-x-superlight': 'perifericos',
  'prod-monitor-27-qhd-165': 'monitores',
  'prod-cadeira-ergonomica-pro': 'perifericos',
  'prod-ssd-nvme-2tb': 'perifericos',
  'prod-dualsense-midnight': 'playstation'
};

export function sanitizeCatalogCategory(rawCategory, productId = '') {
  const normalizedCategory = String(rawCategory || '').trim().toLowerCase();
  const normalizedId = String(productId || '').trim().toLowerCase();

  if (PRODUCT_CATEGORY_OVERRIDES[normalizedId]) return PRODUCT_CATEGORY_OVERRIDES[normalizedId];
  if (CATEGORY_ALIASES[normalizedCategory]) return CATEGORY_ALIASES[normalizedCategory];
  if (DISPLAY_CATEGORY_ORDER.includes(normalizedCategory)) return normalizedCategory;
  return 'consoles';
}

export function normalizeCatalogCategories(rawCategories, fallbackCategory = '', productId = '') {
  const source = Array.isArray(rawCategories)
    ? rawCategories
    : typeof rawCategories === 'string'
      ? rawCategories.split(/[\n,]/g)
      : [fallbackCategory].filter(Boolean);

  const normalized = source
    .map((category) => sanitizeCatalogCategory(category, productId))
    .filter((category) => DISPLAY_CATEGORY_ORDER.includes(category))
    .filter((category, index, list) => list.indexOf(category) === index);

  if (normalized.length) return normalized;
  return [sanitizeCatalogCategory(fallbackCategory || 'consoles', productId)];
}

export function expandCatalogFilterCategory(category) {
  const normalized = sanitizeCatalogCategory(category);
  if (normalized === 'consoles') return ['consoles', ...CONSOLE_CATEGORY_MEMBERS];
  return [normalized];
}

export function buildCategoryCaseExpression(categoryColumn = 'category', idColumn = 'id') {
  const aliasCases = Object.entries(CATEGORY_ALIASES)
    .map(([from, to]) => `WHEN LOWER(${categoryColumn}) = '${from}' THEN '${to}'`)
    .join(' ');
  const productCases = Object.entries(PRODUCT_CATEGORY_OVERRIDES)
    .map(([id, category]) => `WHEN LOWER(${idColumn}) = '${id}' THEN '${category}'`)
    .join(' ');

  return `CASE ${productCases} ${aliasCases} ELSE LOWER(${categoryColumn}) END`;
}
