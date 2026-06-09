import crypto from 'node:crypto';
import { isSqlite } from '../config/mysql.js';

const makeId = () => crypto.randomUUID();

export async function listCartItems(connection, uid) {
  const [rows] = await connection.execute(
    `SELECT ci.id AS docId,
            ci.product_id AS productId,
            COALESCE(p.name, ci.name) AS name,
            COALESCE(p.image_url, ci.image_url) AS image,
            COALESCE(p.price, ci.price) AS price,
            COALESCE(p.old_price, ci.old_price) AS oldPrice,
            ci.quantity,
            ci.created_at AS addedAt,
            CASE WHEN p.id IS NOT NULL AND p.is_active = 1 THEN 1 ELSE 0 END AS isAvailable,
            COALESCE(p.stock, 0) AS stock
     FROM cart_items ci
     LEFT JOIN products p ON p.id = ci.product_id
     WHERE ci.user_id = ?
     ORDER BY ci.created_at DESC`,
    [uid]
  );
  return rows;
}

export async function addCartItem(connection, uid, item) {
  const id = makeId();
  if (item.productId) {
    if (isSqlite()) {
      await connection.execute(
        `INSERT INTO cart_items
          (id, user_id, product_id, name, image_url, price, old_price, quantity, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
         ON CONFLICT(user_id, product_id) DO UPDATE SET
          name = excluded.name,
          image_url = excluded.image_url,
          price = excluded.price,
          old_price = excluded.old_price,
          quantity = MIN(cart_items.quantity + excluded.quantity, 99),
          updated_at = CURRENT_TIMESTAMP`,
        [id, uid, item.productId, item.name, item.image || '', item.price, item.oldPrice || 0, item.quantity || 1]
      );
      const [rows] = await connection.execute(
        'SELECT id FROM cart_items WHERE user_id = ? AND product_id = ? LIMIT 1',
        [uid, item.productId]
      );
      return rows[0]?.id || id;
    }

    await connection.execute(
      `INSERT INTO cart_items
        (id, user_id, product_id, name, image_url, price, old_price, quantity, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        image_url = VALUES(image_url),
        price = VALUES(price),
        old_price = VALUES(old_price),
        quantity = LEAST(quantity + VALUES(quantity), 99),
        updated_at = UTC_TIMESTAMP()`,
      [id, uid, item.productId, item.name, item.image || '', item.price, item.oldPrice || 0, item.quantity || 1]
    );
    const [rows] = await connection.execute(
      'SELECT id FROM cart_items WHERE user_id = ? AND product_id = ? LIMIT 1',
      [uid, item.productId]
    );
    return rows[0]?.id || id;
  }

  await connection.execute(
    `INSERT INTO cart_items
      (id, user_id, product_id, name, image_url, price, old_price, quantity, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
    [id, uid, item.productId || null, item.name, item.image || '', item.price, item.oldPrice || 0, item.quantity || 1]
  );
  return id;
}

export async function removeCartItem(connection, uid, cartItemId) {
  await connection.execute('DELETE FROM cart_items WHERE id = ? AND user_id = ?', [cartItemId, uid]);
}

export async function clearCartItems(connection, uid, cartItemIds = []) {
  if (!cartItemIds.length) return;
  const placeholders = cartItemIds.map(() => '?').join(',');
  await connection.execute(`DELETE FROM cart_items WHERE user_id = ? AND id IN (${placeholders})`, [uid, ...cartItemIds]);
}

export async function updateCartItemQuantity(connection, uid, cartItemId, quantity) {
  await connection.execute(
    `UPDATE cart_items
     SET quantity = ?, updated_at = UTC_TIMESTAMP()
     WHERE id = ? AND user_id = ?`,
    [quantity, cartItemId, uid]
  );
}
