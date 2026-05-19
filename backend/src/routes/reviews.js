import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/http.js';
import { createReviewForProduct, listReviewsForProduct } from '../services/reviewService.js';

const router = Router();

router.get('/:productId', asyncHandler(async (req, res) => {
  res.json({ reviews: await listReviewsForProduct(req.params.productId) });
}));

router.post('/:productId', requireAuth, asyncHandler(async (req, res) => {
  res.status(201).json(await createReviewForProduct(req.user.uid, req.user.email, req.params.productId, req.body || {}));
}));

export default router;
