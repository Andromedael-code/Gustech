import crypto from 'node:crypto';
import { getPool, withTransaction } from '../config/mysql.js';
import { AppError } from '../utils/http.js';
import { assertStatusTransition, createOrderSchema, statusSchema, validateWithSchema } from '../utils/validators.js';
import { createOrder, getOrderById, listOrders, setInvoice, setShipping, updateOrderStatus } from '../repositories/orderRepository.js';
import { clearPurchasedItems } from './cartService.js';
import { ensureStockForItems, registerSoldItems, reserveStock } from './productService.js';
import { getMe } from './userService.js';

function buildInvoiceNumber(orderId) {
  const now = new Date();
  const y = String(now.getFullYear()).slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `NF-${y}${m}-${String(orderId).padStart(6, '0')}`;
}

function buildTrackingCode(orderId) {
  return `GT${crypto.createHash('sha1').update(String(orderId)).digest('hex').slice(0, 10).toUpperCase()}BR`;
}

function fallbackUidFromEmail(email = '') {
  return String(email || '').toLowerCase().replace(/[^a-z0-9]/gi, '-');
}

export async function createOrderForUser(uid, email, payload) {
  const data = validateWithSchema(createOrderSchema, payload || {});
  const { profile } = await getMe(uid);
  if (!profile) throw new AppError(400, 'Perfil do usuario nao encontrado. Complete seu cadastro antes de finalizar a compra.');
  const total = data.items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
  if (total <= 0) throw new AppError(400, 'Carrinho invalido.');
  await ensureStockForItems(data.items);

  const order = {
    userId: uid,
    status: 'pending',
    method: data.method,
    paymentDetails: data.paymentDetails,
    deliveryAddress: data.deliveryAddress,
    items: data.items,
    total,
    customer: {
      username: profile.username || '',
      name: profile.name || '',
      email: email || profile.email || '',
      cpf: profile.cpf || '',
      phone: profile.phone || ''
    }
  };

  const orderId = await withTransaction(async (connection) => {
    await reserveStock(connection, data.items);
    const createdId = await createOrder(connection, order);
    await registerSoldItems(connection, data.items);
    return createdId;
  });

  if (Array.isArray(payload.cartItemIds) && payload.cartItemIds.length) {
    await clearPurchasedItems(uid, payload.cartItemIds);
  }

  return { orderId, total, status: order.status };
}

export async function listOrdersForUser(uid, email = '') {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const candidateUserIds = [uid];
  if (normalizedEmail) {
    candidateUserIds.push(fallbackUidFromEmail(normalizedEmail));
  }
  return listOrders(getPool(), {
    userIds: Array.from(new Set(candidateUserIds.filter(Boolean))),
    customerEmail: normalizedEmail || null,
    limit: 100
  });
}

export async function listOrdersForAdmin(filters = {}) {
  const limit = Math.min(Math.max(Number(filters.limit) || 20, 1), 100);
  const status = filters.status ? validateWithSchema(statusSchema, String(filters.status).toLowerCase()) : null;
  return listOrders(getPool(), { status, limit });
}

export async function updateOrderStatusAsAdmin(orderId, nextStatus, adminUid) {
  const normalized = validateWithSchema(statusSchema, nextStatus);
  const existing = await getOrderById(getPool(), orderId);
  if (!existing) throw new AppError(404, 'Pedido nao encontrado.');
  assertStatusTransition(existing.status, normalized);
  await withTransaction(async (connection) => {
    await updateOrderStatus(connection, orderId, normalized, adminUid);
  });
  return { orderId, status: normalized };
}

export async function issueInvoiceForOrder(orderId, adminUid) {
  const order = await getOrderById(getPool(), orderId);
  if (!order) throw new AppError(404, 'Pedido nao encontrado.');
  if (!['paid', 'processing', 'shipped', 'delivered'].includes(order.status)) {
    throw new AppError(400, 'So e possivel emitir nota apos confirmacao do pagamento.');
  }
  const invoiceNumber = order.invoice?.number || buildInvoiceNumber(orderId);
  await withTransaction(async (connection) => {
    await setInvoice(connection, orderId, invoiceNumber, adminUid);
  });
  return { orderId, invoiceNumber };
}

export async function createShippingLabelForOrder(orderId, adminUid, carrier = 'Correios') {
  const order = await getOrderById(getPool(), orderId);
  if (!order) throw new AppError(404, 'Pedido nao encontrado.');
  if (!order.invoice?.number) throw new AppError(400, 'Emita a nota fiscal antes de gerar etiqueta.');
  const shipping = {
    labelCode: order.shipping?.labelCode || buildTrackingCode(orderId),
    carrier: String(carrier || 'Correios').trim().slice(0, 80) || 'Correios'
  };
  const nextStatus = ['pending', 'paid'].includes(order.status) ? 'processing' : order.status;
  await withTransaction(async (connection) => {
    await setShipping(connection, orderId, shipping, adminUid, nextStatus);
  });
  return { orderId, shipping };
}
