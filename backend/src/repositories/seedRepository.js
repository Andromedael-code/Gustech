import { isSqlite } from '../config/mysql.js';

export async function countProducts(connection) {
  const [rows] = await connection.execute('SELECT COUNT(*) AS total FROM products');
  return Number(rows[0]?.total || 0);
}

export async function insertProductsIfMissing(connection, products = []) {
  if (!products.length) return { inserted: 0 };

  let inserted = 0;
  for (const product of products) {
    const [existingRows] = isSqlite()
      ? await connection.execute('SELECT id FROM products WHERE id = ? LIMIT 1', [product.id])
      : [[]];
    if (isSqlite()) {
      await connection.execute(
        `INSERT INTO products
          (id, slug, name, description, category, categories_json, brand, badge, image_url, gallery_json, highlights_json, specs_json, price, old_price, stock, condition_label, sales, rating, reviews_count, relevance_score, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
         ON CONFLICT(id) DO UPDATE SET
          slug = excluded.slug,
          name = excluded.name,
          description = excluded.description,
          category = excluded.category,
          categories_json = excluded.categories_json,
          brand = excluded.brand,
          badge = excluded.badge,
          image_url = excluded.image_url,
          gallery_json = excluded.gallery_json,
          highlights_json = excluded.highlights_json,
          specs_json = excluded.specs_json,
          price = excluded.price,
          old_price = excluded.old_price,
          stock = excluded.stock,
          condition_label = excluded.condition_label,
          sales = excluded.sales,
          relevance_score = excluded.relevance_score,
          is_active = excluded.is_active,
          updated_at = CURRENT_TIMESTAMP`,
        [
          product.id,
          product.slug,
          product.name,
          product.description || '',
          product.category,
          JSON.stringify(product.categories || [product.category]),
          product.brand || 'GusTech',
          product.badge || '',
          product.image_url || null,
          JSON.stringify(product.gallery || []),
          JSON.stringify(product.highlights || []),
          JSON.stringify(product.specs || []),
          product.price,
          product.old_price || 0,
          product.stock || 0,
          product.condition_label || null,
          product.sales || 0,
          0,
          0,
          product.relevance_score || 0,
          product.is_active ? 1 : 0
        ]
      );
      if (!existingRows.length) inserted += 1;
      continue;
    }

    const [result] = await connection.execute(
      `INSERT INTO products
        (id, slug, name, description, category, categories_json, brand, badge, image_url, gallery_json, highlights_json, specs_json, price, old_price, stock, condition_label, sales, rating, reviews_count, relevance_score, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE
        slug = VALUES(slug),
        name = VALUES(name),
        description = VALUES(description),
        category = VALUES(category),
        categories_json = VALUES(categories_json),
        brand = VALUES(brand),
        badge = VALUES(badge),
        image_url = VALUES(image_url),
        gallery_json = VALUES(gallery_json),
        highlights_json = VALUES(highlights_json),
        specs_json = VALUES(specs_json),
        price = VALUES(price),
        old_price = VALUES(old_price),
        stock = VALUES(stock),
        condition_label = VALUES(condition_label),
        sales = VALUES(sales),
        relevance_score = VALUES(relevance_score),
        is_active = VALUES(is_active),
        updated_at = UTC_TIMESTAMP()`,
      [
        product.id,
        product.slug,
        product.name,
        product.description || '',
        product.category,
        JSON.stringify(product.categories || [product.category]),
        product.brand || 'GusTech',
        product.badge || '',
        product.image_url || null,
        JSON.stringify(product.gallery || []),
        JSON.stringify(product.highlights || []),
        JSON.stringify(product.specs || []),
        product.price,
        product.old_price || 0,
        product.stock || 0,
        product.condition_label || null,
        product.sales || 0,
        0,
        0,
        product.relevance_score || 0,
        product.is_active ? 1 : 0
      ]
    );
    if (Number(result.insertId || 0) > 0) inserted += 1;
  }

  return { inserted };
}
