import { getPool, withTransaction } from '../config/mysql.js';
import { getProductsByIds, listAllProductOptions } from '../repositories/productRepository.js';
import { getStorefrontSetting, upsertStorefrontSetting } from '../repositories/storefrontRepository.js';
import { DISPLAY_CATEGORY_ORDER, sanitizeCatalogCategory } from '../utils/catalogCategories.js';
import { AppError } from '../utils/http.js';

const HOME_CONFIG_KEY = 'home_config';
const DEFAULT_HEADER_CATEGORY_ORDER = ['playstation', 'xbox', 'consoles', 'classicos', 'monitores', 'nintendo', 'raridades', 'perifericos'];
const DEFAULT_SLIDE_BLUEPRINTS = [
  { accent: 'Oferta em destaque', preferredTerms: ['playstation', '5'], fallbackTerms: ['playstation'] },
  { accent: 'Seleção gamer', preferredTerms: ['nintendo', 'switch', 'oled'], fallbackTerms: ['nintendo', 'switch'] }
];
const SLIDE_PRODUCT_REPLACEMENTS = {
  'prod-monitor-27-qhd-165': ['prod-headset-cloud-iii', 'prod-dualsense-midnight', 'ps4-lacrado', 'switch']
};

function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function dedupe(values = []) {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function pickProduct(products = [], preferredTerms = [], fallbackTerms = []) {
  const indexed = products.map((product) => ({
    product,
    haystack: `${normalizeText(product.name)} ${normalizeText(product.category)} ${normalizeText(product.id)}`
  }));

  const preferred = indexed.find(({ haystack }) => preferredTerms.every((term) => haystack.includes(normalizeText(term))));
  if (preferred) return preferred.product;

  const fallback = indexed.find(({ haystack }) => fallbackTerms.every((term) => haystack.includes(normalizeText(term))));
  return fallback?.product || null;
}

function normalizeHeaderCategories(categories = []) {
  const source = Array.isArray(categories) && categories.length ? categories : DEFAULT_HEADER_CATEGORY_ORDER;
  const normalized = source
    .map((category) => sanitizeCatalogCategory(category))
    .filter((category) => DISPLAY_CATEGORY_ORDER.includes(category));

  const unique = dedupe(normalized);
  return unique.length ? unique : [...DEFAULT_HEADER_CATEGORY_ORDER];
}

function buildDefaultHomeConfig(products = []) {
  const productSlides = DEFAULT_SLIDE_BLUEPRINTS
    .map((blueprint, index) => {
      const match = pickProduct(products, blueprint.preferredTerms, blueprint.fallbackTerms);
      if (!match) return null;
      return {
        id: `slide-${index + 1}`,
        productId: match.id,
        accent: blueprint.accent
      };
    })
    .filter(Boolean);

  return {
    headerCategories: [...DEFAULT_HEADER_CATEGORY_ORDER],
    productSlides
  };
}

function resolveSlideProductId(productId = '', availableIds = new Set()) {
  const normalizedId = String(productId || '').trim();
  if (!normalizedId || !availableIds.has(normalizedId)) return normalizedId;

  const replacements = SLIDE_PRODUCT_REPLACEMENTS[normalizedId];
  if (!replacements?.length) return normalizedId;

  const replacement = replacements.find((candidate) => availableIds.has(candidate));
  return replacement || normalizedId;
}

function normalizeSlideRows(slides = [], availableIds = new Set()) {
  const base = Array.isArray(slides) ? slides : [];
  const normalized = [];

  base.forEach((slide, index) => {
    const productId = resolveSlideProductId(slide?.productId, availableIds);
    if (!productId || !availableIds.has(productId)) return;
    if (normalized.some((item) => item.productId === productId)) return;

    normalized.push({
      id: String(slide?.id || `slide-${index + 1}`).trim() || `slide-${index + 1}`,
      productId,
      accent: String(slide?.accent || DEFAULT_SLIDE_BLUEPRINTS[index]?.accent || 'Oferta em destaque').trim().slice(0, 60) || 'Oferta em destaque'
    });
  });

  return normalized;
}

async function loadStoredHomeConfig() {
  const stored = await getStorefrontSetting(getPool(), HOME_CONFIG_KEY);
  if (stored?.settingsJson) return stored.settingsJson;
  return null;
}

async function loadAvailableProductOptions() {
  return listAllProductOptions(getPool());
}

export async function getAdminHomeConfig() {
  const productOptions = await loadAvailableProductOptions();
  const availableIds = new Set(productOptions.map((product) => product.id));
  const stored = await loadStoredHomeConfig();
  const fallback = buildDefaultHomeConfig(productOptions);

  const config = {
    headerCategories: normalizeHeaderCategories(stored?.headerCategories || fallback.headerCategories),
    productSlides: normalizeSlideRows(stored?.productSlides || fallback.productSlides, availableIds)
  };

  if (!config.productSlides.length) {
    config.productSlides = normalizeSlideRows(fallback.productSlides, availableIds);
  }

  return {
    config,
    productOptions,
    availableCategories: DISPLAY_CATEGORY_ORDER
  };
}

export async function getPublicHomeConfig() {
  const { config } = await getAdminHomeConfig();
  const slideProductIds = config.productSlides.map((slide) => slide.productId);
  const products = await getProductsByIds(getPool(), slideProductIds);
  const productsById = new Map(products.map((product) => [product.id, product]));

  return {
    headerCategories: config.headerCategories,
    productSlides: config.productSlides
      .map((slide) => ({
        ...slide,
        product: productsById.get(slide.productId) || null
      }))
      .filter((slide) => Boolean(slide.product))
  };
}

export async function saveAdminHomeConfig(payload = {}) {
  const productOptions = await loadAvailableProductOptions();
  const availableIds = new Set(productOptions.map((product) => product.id));
  const headerCategories = normalizeHeaderCategories(payload.headerCategories);
  const productSlides = normalizeSlideRows(payload.productSlides, availableIds);

  if (!productSlides.length) {
    throw new AppError(400, 'Selecione ao menos um produto para os slides da home.');
  }

  const config = { headerCategories, productSlides };

  await withTransaction(async (connection) => {
    await upsertStorefrontSetting(connection, HOME_CONFIG_KEY, config);
  });

  return config;
}
