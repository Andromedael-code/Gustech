import { buildCategoryCaseExpression, expandCatalogFilterCategory, sanitizeCatalogCategory } from '../utils/catalogCategories.js';

function mapProductRow(row) {
  const categories = safeJsonArray(row.categories_json);
  return {
    ...row,
    isActive: Boolean(row.isActive),
    categories: categories.length ? categories : [row.category].filter(Boolean),
    gallery: safeJsonArray(row.gallery_json),
    highlights: safeJsonArray(row.highlights_json),
    specs: safeJsonArray(row.specs_json)
  };
}

function safeJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapProductOptionRow(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    isActive: Boolean(row.isActive),
    image: row.image || ''
  };
}

function buildProductFilters(filters = {}) {
  const params = [];
  const where = [];
  const categoryExpr = buildCategoryCaseExpression('category', 'id');
  const categoriesExpr = `COALESCE(categories_json, JSON_ARRAY(${categoryExpr}))`;

  if (!filters.includeInactive) where.push('is_active = 1');
  if (filters.category && filters.category !== 'todos') {
    const categories = expandCatalogFilterCategory(filters.category);
    where.push(`(${categories.map(() => `JSON_CONTAINS(${categoriesExpr}, JSON_ARRAY(?))`).join(' OR ')})`);
    params.push(...categories);
  }
  if (Number.isFinite(Number(filters.minPrice)) && Number(filters.minPrice) > 0) {
    where.push('price >= ?');
    params.push(Number(filters.minPrice));
  }
  if (Number.isFinite(Number(filters.maxPrice)) && Number(filters.maxPrice) > 0) {
    where.push('price <= ?');
    params.push(Number(filters.maxPrice));
  }
  if (filters.featured === 'true' || filters.featured === true) {
    where.push('relevance_score >= 900');
  }
  if (filters.search) {
    where.push('(id LIKE ? OR name LIKE ? OR description LIKE ? OR brand LIKE ? OR category LIKE ?)');
    const term = `%${filters.search}%`;
    params.push(term, term, term, term, term);
  }

  return { where, params };
}

export async function listProducts(connection, filters = {}) {
  const { where, params } = buildProductFilters(filters);
  const categoryExpr = buildCategoryCaseExpression('category', 'id');

  const allowedSort = {
    name: 'name ASC',
    price_asc: 'price ASC',
    price_desc: 'price DESC',
    best_sellers: 'sales DESC, relevance_score DESC, name ASC',
    top_rated: 'rating DESC, reviews_count DESC, relevance_score DESC, name ASC',
    relevance: 'relevance_score DESC, sales DESC, rating DESC, name ASC',
    newest: 'created_at DESC'
  };
  const orderBy = allowedSort[filters.sort] || allowedSort.relevance;
  const limit = Math.min(Math.max(Number(filters.limit) || 200, 1), 500);
  const page = Math.max(Number(filters.page) || 1, 1);
  const offset = (page - 1) * limit;
  params.push(limit, offset);

  const [rows] = await connection.execute(
    `SELECT id, slug, name, description, ${categoryExpr} AS category, categories_json, brand, badge, image_url AS image, gallery_json, highlights_json, specs_json,
            price, old_price AS oldPrice, stock, condition_label AS \`condition\`, sales, rating, reviews_count AS reviews,
            relevance_score AS relevanceScore, is_active AS isActive,
            created_at AS createdAt, updated_at AS updatedAt
     FROM products
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
    params
  );

  return rows.map(mapProductRow);
}

export async function countProducts(connection, filters = {}) {
  const { where, params } = buildProductFilters(filters);
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS total
     FROM products
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`,
    params
  );
  return Number(rows[0]?.total || 0);
}

export async function summarizeCatalog(connection, filters = {}) {
  const { where, params } = buildProductFilters({ ...(filters || {}), includeInactive: true });
  const categoryExpr = buildCategoryCaseExpression('category', 'id');
  const [rows] = await connection.execute(
    `SELECT
        COUNT(*) AS totalProducts,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS activeProducts,
        SUM(CASE WHEN is_active = 1 THEN stock ELSE 0 END) AS activeStock,
        COUNT(DISTINCT CASE WHEN is_active = 1 THEN ${categoryExpr} END) AS activeCategories
     FROM products
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`,
    params
  );

  return {
    totalProducts: Number(rows[0]?.totalProducts || 0),
    activeProducts: Number(rows[0]?.activeProducts || 0),
    activeStock: Number(rows[0]?.activeStock || 0),
    activeCategories: Number(rows[0]?.activeCategories || 0)
  };
}

export async function listRelatedProducts(connection, product, limit = 4) {
  const categoryExpr = buildCategoryCaseExpression('category', 'id');
  const relatedCategories = Array.from(new Set(
    (Array.isArray(product.categories) && product.categories.length ? product.categories : [product.category])
      .flatMap((category) => expandCatalogFilterCategory(category))
      .filter(Boolean)
  ));
  const categoriesExpr = `COALESCE(categories_json, JSON_ARRAY(${categoryExpr}))`;
  const [rows] = await connection.execute(
    `SELECT id, slug, name, description, ${categoryExpr} AS category, categories_json, brand, badge, image_url AS image, gallery_json, highlights_json, specs_json,
            price, old_price AS oldPrice, stock, condition_label AS \`condition\`, sales, rating, reviews_count AS reviews,
            relevance_score AS relevanceScore, is_active AS isActive,
            created_at AS createdAt, updated_at AS updatedAt
     FROM products
     WHERE is_active = 1 AND id <> ? AND ((${relatedCategories.map(() => `JSON_CONTAINS(${categoriesExpr}, JSON_ARRAY(?))`).join(' OR ')}) OR price BETWEEN ? AND ?)
     ORDER BY (${relatedCategories.map(() => `JSON_CONTAINS(${categoriesExpr}, JSON_ARRAY(?))`).join(' OR ')}) DESC, relevance_score DESC, rating DESC, sales DESC
     LIMIT ?`,
    [
      product.id,
      ...relatedCategories,
      Math.max(Number(product.price || 0) - 700, 0),
      Number(product.price || 0) + 700,
      ...relatedCategories,
      limit
    ]
  );
  return rows.map(mapProductRow);
}

export async function listCatalogCategories(connection) {
  const [rows] = await connection.execute(
    `SELECT id, category, categories_json
     FROM products
     WHERE is_active = 1`
  );
  return rows.map((row) => mapProductRow({ ...row, isActive: 1, gallery_json: '[]', highlights_json: '[]', specs_json: '[]' }));
}

export async function getProductById(connection, id) {
  const categoryExpr = buildCategoryCaseExpression('category', 'id');
  const [rows] = await connection.execute(
    `SELECT id, slug, name, description, ${categoryExpr} AS category, categories_json, brand, badge, image_url AS image, gallery_json, highlights_json, specs_json,
            price, old_price AS oldPrice, stock, condition_label AS \`condition\`, sales, rating, reviews_count AS reviews,
            relevance_score AS relevanceScore, is_active AS isActive,
            created_at AS createdAt, updated_at AS updatedAt
     FROM products WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] ? mapProductRow(rows[0]) : null;
}

export async function getProductsByIds(connection, ids = []) {
  if (!Array.isArray(ids) || !ids.length) return [];

  const categoryExpr = buildCategoryCaseExpression('category', 'id');
  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await connection.execute(
    `SELECT id, slug, name, description, ${categoryExpr} AS category, categories_json, brand, badge, image_url AS image, gallery_json, highlights_json, specs_json,
            price, old_price AS oldPrice, stock, condition_label AS \`condition\`, sales, rating, reviews_count AS reviews,
            relevance_score AS relevanceScore, is_active AS isActive,
            created_at AS createdAt, updated_at AS updatedAt
     FROM products
     WHERE id IN (${placeholders})`,
    ids
  );

  const products = rows.map(mapProductRow);
  const byId = new Map(products.map((product) => [product.id, product]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

export async function listAllProductOptions(connection) {
  const categoryExpr = buildCategoryCaseExpression('category', 'id');
  const [rows] = await connection.execute(
    `SELECT id, name, ${categoryExpr} AS category, categories_json, image_url AS image, is_active AS isActive
     FROM products
     ORDER BY is_active DESC, name ASC`
  );
  return rows.map((row) => ({
    ...mapProductOptionRow(row),
    categories: safeJsonArray(row.categories_json).length ? safeJsonArray(row.categories_json) : [row.category].filter(Boolean)
  }));
}

export async function createProduct(connection, product) {
  await connection.execute(
    `INSERT INTO products
      (id, slug, name, description, category, categories_json, brand, badge, image_url, gallery_json, highlights_json, specs_json, price, old_price, stock, condition_label, sales, rating, reviews_count, relevance_score, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
    [
      product.id,
      product.slug,
      product.name,
      product.description,
      product.category,
      JSON.stringify(product.categories || [product.category]),
      product.brand || '',
      product.badge || '',
      product.image,
      JSON.stringify(product.gallery || []),
      JSON.stringify(product.highlights || []),
      JSON.stringify(product.specs || []),
      product.price,
      product.oldPrice,
      product.stock,
      product.condition,
      product.sales,
      product.rating,
      product.reviews,
      product.relevanceScore,
      product.isActive ? 1 : 0
    ]
  );
}

export async function updateProduct(connection, id, product) {
  await connection.execute(
    `UPDATE products
     SET slug = ?, name = ?, description = ?, category = ?, categories_json = ?, brand = ?, badge = ?, image_url = ?, gallery_json = ?, highlights_json = ?, specs_json = ?,
         price = ?, old_price = ?, stock = ?, condition_label = ?, sales = ?, rating = ?, reviews_count = ?, relevance_score = ?, is_active = ?, updated_at = UTC_TIMESTAMP()
     WHERE id = ?`,
    [
      product.slug,
      product.name,
      product.description,
      product.category,
      JSON.stringify(product.categories || [product.category]),
      product.brand || '',
      product.badge || '',
      product.image,
      JSON.stringify(product.gallery || []),
      JSON.stringify(product.highlights || []),
      JSON.stringify(product.specs || []),
      product.price,
      product.oldPrice,
      product.stock,
      product.condition,
      product.sales,
      product.rating,
      product.reviews,
      product.relevanceScore,
      product.isActive ? 1 : 0,
      id
    ]
  );
}

export async function deleteProduct(connection, id) {
  await connection.execute('DELETE FROM products WHERE id = ?', [id]);
}

export async function incrementProductSales(connection, productId, quantity) {
  await connection.execute('UPDATE products SET sales = sales + ?, updated_at = UTC_TIMESTAMP() WHERE id = ?', [quantity, productId]);
}

export async function getProductStock(connection, productId) {
  const [rows] = await connection.execute('SELECT stock FROM products WHERE id = ? LIMIT 1', [productId]);
  return Number(rows[0]?.stock ?? -1);
}

export async function decrementProductStock(connection, productId, quantity) {
  const [result] = await connection.execute(
    `UPDATE products
     SET stock = stock - ?, updated_at = UTC_TIMESTAMP()
     WHERE id = ? AND stock >= ?`,
    [quantity, productId, quantity]
  );
  return Number(result.affectedRows || 0) > 0;
}

export async function refreshProductReviewAggregate(connection, productId) {
  await connection.execute(
    `UPDATE products p
     LEFT JOIN (
       SELECT product_id, COUNT(*) AS reviews_count, ROUND(AVG(rating), 1) AS rating_avg
       FROM product_reviews WHERE product_id = ? GROUP BY product_id
     ) r ON r.product_id = p.id
     SET p.rating = COALESCE(r.rating_avg, 0), p.reviews_count = COALESCE(r.reviews_count, 0), p.updated_at = UTC_TIMESTAMP()
     WHERE p.id = ?`,
    [productId, productId]
  );
}

export async function refreshAllProductReviewAggregates(connection) {
  await connection.execute(
    `UPDATE products p
     LEFT JOIN (
       SELECT product_id, COUNT(*) AS reviews_count, ROUND(AVG(rating), 1) AS rating_avg
       FROM product_reviews
       GROUP BY product_id
     ) r ON r.product_id = p.id
     SET p.rating = COALESCE(r.rating_avg, 0),
         p.reviews_count = COALESCE(r.reviews_count, 0),
         p.updated_at = UTC_TIMESTAMP()`
  );
}
