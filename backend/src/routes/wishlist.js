import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/http.js';
import { checkWishlistProduct, listMyWishlist, toggleWishlistProduct } from '../services/wishlistService.js';

const router = Router();

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  res.json({ items: await listMyWishlist(req.user.uid) });
}));

router.get('/check/:productId', requireAuth, asyncHandler(async (req, res) => {
  res.json(await checkWishlistProduct(req.user.uid, req.params.productId));
}));

router.post('/me/:productId/toggle', requireAuth, asyncHandler(async (req, res) => {
  res.json(await toggleWishlistProduct(req.user.uid, req.params.productId));
}));

export default router;
