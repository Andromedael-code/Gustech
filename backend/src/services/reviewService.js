import { getPool, withTransaction } from '../config/mysql.js';
import { AppError } from '../utils/http.js';
import { reviewSchema, validateWithSchema } from '../utils/validators.js';
import { createReview, hasUserReviewed, listProductReviews, userPurchasedProduct } from '../repositories/reviewRepository.js';
import { getMe } from './userService.js';
import { refreshReviewSummary } from './productService.js';

export async function listReviewsForProduct(productId) {
  return listProductReviews(getPool(), String(productId || ''));
}

export async function createReviewForProduct(uid, email, productId, payload) {
  const data = validateWithSchema(reviewSchema, payload || {});
  const pool = getPool();
  const purchased = await userPurchasedProduct(pool, uid, productId, email);

  if (!purchased) throw new AppError(400, 'Usuário não comprou este produto.');
  if (await hasUserReviewed(pool, uid, productId)) {
    throw new AppError(400, 'Usuário já avaliou este produto.');
  }

  const { profile } = await getMe(uid);
  await withTransaction(async (connection) => {
    await createReview(connection, {
      userId: uid,
      productId,
      name: profile?.username || profile?.name || 'Cliente',
      rating: data.rating,
      comment: data.comment
    });
  });

  await refreshReviewSummary(productId);
  return { ok: true };
}
