import { getPool, withTransaction } from '../config/mysql.js';
import { AppError } from '../utils/http.js';
import { getProductById } from '../repositories/productRepository.js';
import { addWishlistItem, hasWishlistItem, listWishlistItems, removeWishlistItem } from '../repositories/wishlistRepository.js';

export async function listMyWishlist(uid) {
  return listWishlistItems(getPool(), uid);
}

export async function checkWishlistProduct(uid, productId) {
  const normalizedProductId = String(productId || '').trim();
  if (!normalizedProductId) throw new AppError(400, 'Produto invalido.');
  return { inWishlist: await hasWishlistItem(getPool(), uid, normalizedProductId) };
}

export async function toggleWishlistProduct(uid, productId) {
  const normalizedProductId = String(productId || '').trim();
  if (!normalizedProductId) throw new AppError(400, 'Produto invalido.');

  const product = await getProductById(getPool(), normalizedProductId);
  if (!product || !product.isActive) throw new AppError(404, 'Produto nao encontrado.'); // feat: FUNC-5

  const alreadySaved = await hasWishlistItem(getPool(), uid, normalizedProductId);
  if (alreadySaved) {
    await withTransaction((connection) => removeWishlistItem(connection, uid, normalizedProductId));
    return { saved: false, productId: normalizedProductId };
  }

  await withTransaction((connection) => addWishlistItem(connection, uid, normalizedProductId));
  return { saved: true, productId: normalizedProductId };
}
