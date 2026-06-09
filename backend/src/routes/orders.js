import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { AppError, asyncHandler } from '../utils/http.js';
import { cancelOrderForUser, createOrderForUser, createShippingLabelForOrder, getOrderForUser, getOrderStats, issueInvoiceForOrder, listOrdersForAdmin, listOrdersForUser, updateOrderStatusAsAdmin } from '../services/orderService.js'; // feat: FEATURE-7

const router = Router();

function parseOrderId(value) {
  const orderId = Number(value);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw new AppError(400, 'ID de pedido invalido.');
  }
  return orderId;
}

router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const result = await createOrderForUser(req.user.uid, req.user.email, req.body || {});
  res.status(201).json(result);
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  res.json({ orders: await listOrdersForUser(req.user.uid, req.user.email) });
}));

router.get('/me/:orderId', requireAuth, asyncHandler(async (req, res) => {
  res.json({ order: await getOrderForUser(parseOrderId(req.params.orderId), req.user.uid, req.user.email) }); // feat: FEATURE-7
}));

router.get('/admin/stats', requireAuth, requireAdmin, asyncHandler(async (_req, res) => {
  res.json(await getOrderStats()); // feat: FEATURE-8
}));

router.get('/', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  res.json(await listOrdersForAdmin(req.query || {}));
}));

router.patch('/:orderId/status', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const result = await updateOrderStatusAsAdmin(parseOrderId(req.params.orderId), req.body?.status, req.user.uid);
  res.json(result);
}));

router.post('/:orderId/invoice', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  res.json(await issueInvoiceForOrder(parseOrderId(req.params.orderId), req.user.uid));
}));

router.post('/:orderId/shipping-label', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  res.json(await createShippingLabelForOrder(parseOrderId(req.params.orderId), req.user.uid, req.body?.carrier));
}));

router.delete('/:orderId', requireAuth, asyncHandler(async (req, res) => {
  res.json(await cancelOrderForUser(parseOrderId(req.params.orderId), req.user.uid, req.user.email));
}));

export default router;
