import crypto from 'node:crypto';

const makeId = () => crypto.randomUUID();

export async function listCartItems(connection, uid) {
  const [rows] = await connection.execute(
    `SELECT id AS docId, product_id AS productId, name, image_url AS image, price, old_price AS oldPrice,
            quantity, created_at AS addedAt
     FROM cart_items WHERE user_id = ? ORDER BY created_at DESC`,
    [uid]
  );
  return rows;
}

export async function addCartItem(connection, uid, item) {
  const id = makeId();
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
