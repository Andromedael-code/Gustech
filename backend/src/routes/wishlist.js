import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/http.js';
import { listMyWishlist, toggleWishlistProduct } from '../services/wishlistService.js';

const router = Router();

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  res.json({ items: await listMyWishlist(req.user.uid) });
}));

router.post('/me/:productId/toggle', requireAuth, asyncHandler(async (req, res) => {
  res.json(await toggleWishlistProduct(req.user.uid, req.params.productId));
}));

export default router;
