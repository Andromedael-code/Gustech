import { getPool, withTransaction } from '../config/mysql.js';
import { AppError } from '../utils/http.js';
import { getProductById } from '../repositories/productRepository.js';
import { addCartItem, clearCartItems, listCartItems, removeCartItem, updateCartItemQuantity } from '../repositories/cartRepository.js';

async function normalizeCartItem(payload = {}) {
  const productId = String(payload.productId || '').trim();
  if (!productId) throw new AppError(400, 'Produto invalido para o carrinho.');

  const product = await getProductById(getPool(), productId);
  if (!product || !product.isActive) throw new AppError(404, 'Produto nao encontrado.');

  return {
    productId,
    name: product.name,
    image: product.image || '',
    price: Number(product.price || 0),
    oldPrice: Number(product.oldPrice || 0),
    quantity: Math.min(Math.max(Number(payload.quantity || 1), 1), 99)
  };
}

export async function listMyCart(uid) {
  return listCartItems(getPool(), uid);
}

export async function addItemToMyCart(uid, payload) {
  const item = await normalizeCartItem(payload);
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
