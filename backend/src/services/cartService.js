import { getPool, withTransaction } from '../config/mysql.js';
import { AppError } from '../utils/http.js';
import { addCartItem, clearCartItems, listCartItems, removeCartItem, updateCartItemQuantity } from '../repositories/cartRepository.js';

function normalizeCartItem(payload = {}) {
  const name = String(payload.name || '').trim();
  if (!name) throw new AppError(400, 'Item invalido para o carrinho.');
  return {
    productId: payload.productId ? String(payload.productId) : null,
    name,
    image: String(payload.image || '').trim(),
    price: Number(payload.price || 0),
    oldPrice: Number(payload.oldPrice || 0),
    quantity: Math.min(Math.max(Number(payload.quantity || 1), 1), 99)
  };
}

export async function listMyCart(uid) {
  return listCartItems(getPool(), uid);
}

export async function addItemToMyCart(uid, payload) {
  const item = normalizeCartItem(payload);
  const docId = await withTransaction((connection) => addCartItem(connection, uid, item));
  return { docId, ...item };
}

export async function removeItemFromMyCart(uid, cartItemId) {
  await withTransaction((connection) => removeCartItem(connection, uid, cartItemId));
  return { ok: true };
}

export async function updateItemQuantityInMyCart(uid, cartItemId, quantity) {
  const normalizedQuantity = Math.min(Math.max(Number(quantity || 1), 1), 99);
  if (!cartItemId) throw new AppError(400, 'Item do carrinho invalido.');
  await withTransaction((connection) => updateCartItemQuantity(connection, uid, cartItemId, normalizedQuantity));
  return { ok: true, quantity: normalizedQuantity };
}

export async function clearPurchasedItems(uid, cartItemIds = []) {
  await withTransaction((connection) => clearCartItems(connection, uid, cartItemIds));
}
