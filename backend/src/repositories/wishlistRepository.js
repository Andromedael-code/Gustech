import crypto from 'node:crypto';

export async function listWishlistItems(connection, uid) {
  const [rows] = await connection.execute(
    `SELECT wi.id AS docId, wi.product_id AS productId, wi.created_at AS createdAt,
            p.name, p.slug, p.description, p.category, p.image_url AS image, p.price,
            p.old_price AS oldPrice, p.stock, p.condition_label AS \`condition\`,
            p.sales, p.rating, p.reviews_count AS reviews
     FROM wishlist_items wi
     INNER JOIN products p ON p.id = wi.product_id
     WHERE wi.user_id = ? AND p.is_active = 1
     ORDER BY wi.created_at DESC`,
    [uid]
  );
  return rows;
}

export async function addWishlistItem(connection, uid, productId) {
  const id = crypto.randomUUID();
  await connection.execute(
    `INSERT INTO wishlist_items (id, user_id, product_id, created_at, updated_at)
     VALUES (?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE updated_at = UTC_TIMESTAMP()`,
    [id, uid, productId]
  );
  return id;
}

export async function removeWishlistItem(connection, uid, productId) {
  await connection.execute('DELETE FROM wishlist_items WHERE user_id = ? AND product_id = ?', [uid, productId]);
}

export async function hasWishlistItem(connection, uid, productId) {
  const [rows] = await connection.execute(
    'SELECT id FROM wishlist_items WHERE user_id = ? AND product_id = ? LIMIT 1',
    [uid, productId]
  );
  return Boolean(rows[0]);
}
