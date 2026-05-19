import { getPool, withTransaction } from '../config/mysql.js';
import { AppError } from '../utils/http.js';
import { slugify } from '../utils/validators.js';
import { CONSOLE_CATEGORY_MEMBERS, DISPLAY_CATEGORY_ORDER, normalizeCatalogCategories, sanitizeCatalogCategory } from '../utils/catalogCategories.js';
import {
  countProducts,
  createProduct,
  decrementProductStock,
  deleteProduct,
  getProductById,
  getProductStock,
  incrementProductSales,
  listCatalogCategories,
  listProducts,
  listRelatedProducts,
  refreshProductReviewAggregate,
  summarizeCatalog,
  updateProduct
} from '../repositories/productRepository.js';
import { ensureProductSeed } from './seedService.js';

function normalizeStringArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value.split('\n').map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function normalizeSpecs(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => ({ label: String(item?.label || '').trim(), value: String(item?.value || '').trim() }))
      .filter((item) => item.label && item.value);
  }
  if (typeof value === 'string') {
    return value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [label, ...rest] = line.split(':');
        return { label: String(label || '').trim(), value: rest.join(':').trim() };
      })
      .filter((item) => item.label && item.value);
  }
  return [];
}

function normalizeProduct(payload = {}) {
  const name = String(payload.name || '').trim();
  if (!name) throw new AppError(400, 'Nome do produto é obrigatório.');

  const categories = normalizeCatalogCategories(payload.categories || payload.category || 'consoles', payload.category || 'consoles', payload.id || name);
  const category = categories[0];
  const image = String(payload.image || payload.image_url || '').trim();
  const gallery = normalizeStringArray(payload.gallery).length ? normalizeStringArray(payload.gallery) : [image].filter(Boolean);

  return {
    id: String(payload.id || slugify(name)).trim(),
    slug: slugify(payload.slug || name),
    name,
    description: String(payload.description || '').trim(),
    category,
    categories,
    brand: String(payload.brand || 'GusTech').trim(),
    badge: String(payload.badge || '').trim(),
    image,
    gallery,
    highlights: normalizeStringArray(payload.highlights),
    specs: normalizeSpecs(payload.specs),
    price: Number(payload.price || 0),
    oldPrice: Number(payload.oldPrice || payload.old_price || 0),
    stock: Math.max(0, Number(payload.stock || 0)),
    condition: String(payload.condition || payload.condition_label || '').trim(),
    sales: Math.max(0, Number(payload.sales || 0)),
    rating: Math.max(0, Number(payload.rating || 0)),
    reviews: Math.max(0, Number(payload.reviews || payload.reviews_count || 0)),
    relevanceScore: Math.max(0, Number(payload.relevanceScore || payload.relevance_score || 0)),
    isActive: payload.isActive !== false && payload.is_active !== 0
  };
}

function enrichProduct(product) {
  const gallery = Array.isArray(product.gallery) && product.gallery.length ? product.gallery : [product.image].filter(Boolean);
  const categories = Array.isArray(product.categories) && product.categories.length
    ? product.categories.map((category) => sanitizeCatalogCategory(category, product.id))
    : [sanitizeCatalogCategory(product.category, product.id)];

  return {
    ...product,
    category: categories[0] || 'consoles',
    categories,
    brand: product.brand || 'GusTech',
    badge: product.badge || '',
    isFeatured: Number(product.relevanceScore || 0) >= 900,
    highlights: Array.isArray(product.highlights) ? product.highlights : [],
    specs: Array.isArray(product.specs) ? product.specs : [],
    gallery
  };
}

export async function listCatalog(filters) {
  await ensureProductSeed({ logger: console });
  const limit = Math.min(Math.max(Number(filters?.limit) || 200, 1), 500);
  const page = Math.max(Number(filters?.page) || 1, 1);
  const [products, total] = await Promise.all([
    listProducts(getPool(), { ...(filters || {}), limit, page }),
    countProducts(getPool(), filters || {})
  ]);
  const totalPages = Math.max(Math.ceil(total / limit), 1);
  return {
    products: products.map(enrichProduct),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1
    }
  };
}

export async function getCatalogOverview(filters = {}) {
  await ensureProductSeed({ logger: console });
  const [summary, products] = await Promise.all([
    summarizeCatalog(getPool(), filters || {}),
    listCatalogCategories(getPool())
  ]);

  const activeCategories = new Set();
  products.forEach((product) => {
    const enriched = enrichProduct(product);
    enriched.categories.forEach((category) => activeCategories.add(category));
  });

  return { ...summary, activeCategories: activeCategories.size };
}

export async function getCatalogProduct(id) {
  await ensureProductSeed({ logger: console });
  const product = await getProductById(getPool(), id);
  if (!product) throw new AppError(404, 'Produto não encontrado.');
  const relatedProducts = (await listRelatedProducts(getPool(), enrichProduct(product), 4)).map(enrichProduct);
  return { ...enrichProduct(product), relatedProducts };
}

export async function createCatalogProduct(payload) {
  const product = normalizeProduct(payload);
  await withTransaction((connection) => createProduct(connection, product));
  return product;
}

export async function updateCatalogProduct(id, payload) {
  const existing = await getProductById(getPool(), id);
  if (!existing) throw new AppError(404, 'Produto não encontrado.');
  const product = normalizeProduct({ ...existing, ...payload, id });
  await withTransaction((connection) => updateProduct(connection, id, product));
  return product;
}

export async function removeCatalogProduct(id) {
  const existing = await getProductById(getPool(), id);
  if (!existing) throw new AppError(404, 'Produto não encontrado.');
  await withTransaction((connection) => deleteProduct(connection, id));
  return { ok: true };
}

export async function registerSoldItems(connection, items = []) {
  for (const item of items) {
    if (!item.productId) continue;
    await incrementProductSales(connection, item.productId, Number(item.quantity || 1));
  }
}

export async function refreshReviewSummary(productId) {
  await withTransaction((connection) => refreshProductReviewAggregate(connection, productId));
}

export async function listCategorySummaries() {
  await ensureProductSeed({ logger: console });
  const products = await listCatalogCategories(getPool());
  const totals = new Map();
  const consoleProductIds = new Set();

  products.forEach((product) => {
    const enriched = enrichProduct(product);
    enriched.categories.forEach((category) => {
      totals.set(category, Number(totals.get(category) || 0) + 1);
      if (category === 'consoles' || CONSOLE_CATEGORY_MEMBERS.includes(category)) {
        consoleProductIds.add(product.id);
      }
    });
  });

  if (consoleProductIds.size > 0) totals.set('consoles', consoleProductIds.size);

  return DISPLAY_CATEGORY_ORDER
    .map((category) => ({ category, total: Number(totals.get(category) || 0) }))
    .filter((item) => item.total > 0);
}

export async function ensureStockForItems(items = []) {
  for (const item of items) {
    if (!item.productId) continue;
    const stock = await getProductStock(getPool(), item.productId);
    if (stock < 0) throw new AppError(404, `Produto ${item.name || item.productId} não encontrado.`);
    if (stock < Number(item.quantity || 0)) {
      throw new AppError(400, `Estoque insuficiente para ${item.name || 'o produto selecionado'}.`);
    }
  }
}

export async function reserveStock(connection, items = []) {
  for (const item of items) {
    if (!item.productId) continue;
    const reserved = await decrementProductStock(connection, item.productId, Number(item.quantity || 1));
    if (!reserved) {
      throw new AppError(400, `Não foi possível reservar estoque para ${item.name || 'o produto selecionado'}.`);
    }
  }
}
