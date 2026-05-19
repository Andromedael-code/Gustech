import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/http.js';
import { addItemToMyCart, listMyCart, removeItemFromMyCart, updateItemQuantityInMyCart } from '../services/cartService.js';

const router = Router();

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  res.json({ items: await listMyCart(req.user.uid) });
}));

router.post('/me', requireAuth, asyncHandler(async (req, res) => {
  res.status(201).json(await addItemToMyCart(req.user.uid, req.body || {}));
}));

router.patch('/me/:itemId', requireAuth, asyncHandler(async (req, res) => {
  res.json(await updateItemQuantityInMyCart(req.user.uid, req.params.itemId, req.body?.quantity));
}));

router.delete('/me/:itemId', requireAuth, asyncHandler(async (req, res) => {
  res.json(await removeItemFromMyCart(req.user.uid, req.params.itemId));
}));

export default router;
