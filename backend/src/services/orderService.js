import crypto from 'node:crypto';
import { getPool, withTransaction } from '../config/mysql.js';
import { AppError } from '../utils/http.js';
import { assertStatusTransition, createOrderSchema, statusSchema, validateWithSchema } from '../utils/validators.js';
import { countOrders, createOrder, getOrderById, listOrders, setInvoice, setShipping, updateOrderStatus } from '../repositories/orderRepository.js';
import { decrementProductSales, getProductsByIds } from '../repositories/productRepository.js';
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

function isOwnedByUser(order, uid, email = '') {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const candidateUserIds = new Set([uid]);
  if (normalizedEmail) candidateUserIds.add(fallbackUidFromEmail(normalizedEmail));
  return candidateUserIds.has(order.userId) || (normalizedEmail && String(order.customer?.email || '').toLowerCase() === normalizedEmail);
}

async function restoreStockForItems(connection, items = []) {
  for (const item of items) {
    if (!item.productId) continue;
    await connection.execute(
      'UPDATE products SET stock = stock + ?, updated_at = UTC_TIMESTAMP() WHERE id = ?', // feat: FUNC-4
      [Number(item.quantity || 1), item.productId]
    );
    await decrementProductSales(connection, item.productId, Number(item.quantity || 1));
  }
}

async function buildTrustedOrderItems(items = []) {
  const requested = new Map();
  for (const item of items) {
    const productId = String(item.productId || '').trim();
    if (!productId) throw new AppError(400, 'Todos os itens do pedido precisam estar vinculados a um produto do catalogo.');
    const quantity = Number(item.quantity || 1);
    requested.set(productId, Number(requested.get(productId) || 0) + quantity);
  }

  const ids = Array.from(requested.keys());
  const products = await getProductsByIds(getPool(), ids);
  const byId = new Map(products.map((product) => [product.id, product]));

  return ids.map((productId) => {
    const product = byId.get(productId);
    if (!product || !product.isActive) throw new AppError(404, `Produto ${productId} nao encontrado.`);
    const quantity = Number(requested.get(productId) || 1);
    if (quantity > 99) throw new AppError(400, `Quantidade invalida para ${product.name}.`);
    return {
      productId,
      name: product.name,
      image: product.image || '',
      price: Number(product.price || 0),
      quantity
    };
  });
}

export async function createOrderForUser(uid, email, payload) {
  const data = validateWithSchema(createOrderSchema, payload || {});
  const { profile } = await getMe(uid);
  if (!profile) throw new AppError(400, 'Perfil do usuario nao encontrado. Complete seu cadastro antes de finalizar a compra.');
  const trustedItems = await buildTrustedOrderItems(data.items);
  const total = trustedItems.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
  if (total <= 0) throw new AppError(400, 'Carrinho invalido.');
  await ensureStockForItems(trustedItems);
  const paymentStatus = String(data.paymentDetails?.status || '').toLowerCase();
  const initialStatus = paymentStatus === 'approved' || data.method === 'teste' ? 'paid' : 'pending';

  const order = {
    userId: uid,
    status: initialStatus,
    method: data.method,
    paymentDetails: data.paymentDetails,
    deliveryAddress: data.deliveryAddress,
    items: trustedItems,
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
    await reserveStock(connection, trustedItems);
    const createdId = await createOrder(connection, order);
    await registerSoldItems(connection, trustedItems);
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
  const page = Math.max(Number(filters.page) || 1, 1);
  const offset = (page - 1) * limit;
  const status = filters.status ? validateWithSchema(statusSchema, String(filters.status).toLowerCase()) : null;
  const customerEmail = filters.customerEmail ? String(filters.customerEmail).trim().toLowerCase() : null; // feat: FUNC-3
  const [orders, total] = await Promise.all([
    listOrders(getPool(), { status, customerEmail, limit, offset }), // feat: FUNC-3
    countOrders(getPool(), { status, customerEmail }) // feat: FUNC-3
  ]);
  const totalPages = Math.max(Math.ceil(total / limit), 1);
  return {
    orders,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1
    }
  };
}

export async function updateOrderStatusAsAdmin(orderId, nextStatus, adminUid) {
  const normalized = validateWithSchema(statusSchema, nextStatus);
  const existing = await getOrderById(getPool(), orderId);
  if (!existing) throw new AppError(404, 'Pedido nao encontrado.');
  assertStatusTransition(existing.status, normalized);
  const shouldRestoreStock = normalized === 'cancelled' && ['pending', 'paid', 'processing'].includes(existing.status); // feat: FUNC-4
  await withTransaction(async (connection) => {
    await updateOrderStatus(connection, orderId, normalized, adminUid);
    if (shouldRestoreStock) await restoreStockForItems(connection, existing.items); // feat: FUNC-4
  });
  return { orderId, status: normalized };
}

export async function issueInvoiceForOrder(orderId, _adminUid) {
  const order = await getOrderById(getPool(), orderId);
  if (!order) throw new AppError(404, 'Pedido nao encontrado.');
  if (!['paid', 'processing', 'shipped', 'delivered'].includes(order.status)) {
    throw new AppError(400, 'So e possivel emitir nota apos confirmacao do pagamento.');
  }
  const invoiceNumber = order.invoice?.number || buildInvoiceNumber(orderId);
  await withTransaction(async (connection) => {
    await setInvoice(connection, orderId, invoiceNumber);
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

export async function cancelOrderForUser(orderId, uid, email = '') {
  const order = await getOrderById(getPool(), orderId);
  if (!order) throw new AppError(404, 'Pedido nao encontrado.');
  if (!isOwnedByUser(order, uid, email)) throw new AppError(403, 'Voce nao pode cancelar este pedido.');
  if (order.status !== 'pending') throw new AppError(400, 'Apenas pedidos pendentes podem ser cancelados pelo cliente.');

  await withTransaction(async (connection) => {
    await updateOrderStatus(connection, orderId, 'cancelled', uid);
    await restoreStockForItems(connection, order.items); // feat: FUNC-4
  });

  return { orderId, status: 'cancelled' };
}

export async function getOrderForUser(orderId, uid, email = '') {
  const order = await getOrderById(getPool(), orderId); // feat: FEATURE-7
  if (!order) throw new AppError(404, 'Pedido não encontrado.');
  if (!isOwnedByUser(order, uid, email)) throw new AppError(403, 'Acesso negado.');
  return order;
}

export async function getOrderStats() {
  const pool = getPool();
  const statuses = ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'];
  const counts = await Promise.all(
    statuses.map(async (status) => [status, await countOrders(pool, { status })]) // feat: FEATURE-8
  );
  return {
    total: await countOrders(pool),
    byStatus: Object.fromEntries(counts)
  };
}
