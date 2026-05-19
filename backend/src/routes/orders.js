import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/http.js';
import { createOrderForUser, createShippingLabelForOrder, issueInvoiceForOrder, listOrdersForAdmin, listOrdersForUser, updateOrderStatusAsAdmin } from '../services/orderService.js';

const router = Router();

router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const result = await createOrderForUser(req.user.uid, req.user.email, req.body || {});
  res.status(201).json(result);
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  res.json({ orders: await listOrdersForUser(req.user.uid, req.user.email) });
}));

router.get('/', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  res.json({ orders: await listOrdersForAdmin(req.query || {}) });
}));

router.patch('/:orderId/status', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const result = await updateOrderStatusAsAdmin(req.params.orderId, req.body?.status, req.user.uid);
  res.json(result);
}));

router.post('/:orderId/invoice', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  res.json(await issueInvoiceForOrder(req.params.orderId, req.user.uid));
}));

router.post('/:orderId/shipping-label', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  res.json(await createShippingLabelForOrder(req.params.orderId, req.user.uid, req.body?.carrier));
}));

export default router;
