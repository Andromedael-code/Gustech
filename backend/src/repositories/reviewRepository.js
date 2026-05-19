export async function listProductReviews(connection, productId) {
  const [rows] = await connection.execute(
    `SELECT id, user_id AS userId, product_id AS productId, author_name AS name, rating, comment, created_at AS createdAt
     FROM product_reviews WHERE product_id = ? ORDER BY created_at DESC LIMIT 50`,
    [productId]
  );
  return rows.map((row) => ({ ...row, verifiedPurchase: true }));
}

export async function hasUserReviewed(connection, uid, productId) {
  const [rows] = await connection.execute('SELECT id FROM product_reviews WHERE user_id = ? AND product_id = ? LIMIT 1', [uid, productId]);
  return Boolean(rows[0]);
}

export async function userPurchasedProduct(connection, uid, productId, email = '') {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const [rows] = await connection.execute(
    `SELECT oi.id
     FROM orders o
     INNER JOIN order_items oi ON oi.order_id = o.id
     WHERE oi.product_id = ?
       AND (o.user_id = ? ${normalizedEmail ? 'OR o.customer_email = ?' : ''})
     LIMIT 1`,
    normalizedEmail ? [productId, uid, normalizedEmail] : [productId, uid]
  );
  return Boolean(rows[0]);
}

export async function createReview(connection, review) {
  await connection.execute(
    `INSERT INTO product_reviews (user_id, product_id, author_name, rating, comment, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
    [review.userId, review.productId, review.name, review.rating, review.comment]
  );
}
