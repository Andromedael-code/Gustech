export async function createOrder(connection, order) {
  const [result] = await connection.execute(
    `INSERT INTO orders (user_id, status, payment_method, payment_details_json, total_amount, customer_username, customer_name, customer_email, customer_cpf, customer_phone, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
    [order.userId, order.status, order.method, JSON.stringify(order.paymentDetails || {}), order.total, order.customer.username, order.customer.name, order.customer.email, order.customer.cpf, order.customer.phone]
  );
  const orderId = result.insertId;

  await connection.execute(
    `INSERT INTO order_addresses (order_id, label, street, number, neighborhood, zip, complement, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
    [orderId, order.deliveryAddress.label || 'Entrega', order.deliveryAddress.street, order.deliveryAddress.number, order.deliveryAddress.neighborhood, order.deliveryAddress.zip, order.deliveryAddress.complement || '']
  );

  if (order.items.length > 0) { // fix: BUG-5
    const placeholders = order.items.map(() => '(?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())').join(', ');
    const values = order.items.flatMap((item) => [
      orderId,
      item.productId || null,
      item.name,
      item.image || null,
      item.price,
      item.quantity
    ]);
    await connection.execute(
      `INSERT INTO order_items (order_id, product_id, name, image_url, unit_price, quantity, created_at, updated_at)
       VALUES ${placeholders}`,
      values
    );
  }

  await appendOrderTimeline(connection, orderId, order.status, order.userId);
  return orderId;
}

export async function appendOrderTimeline(connection, orderId, status, byUserId) {
  await connection.execute(
    `INSERT INTO order_timeline (order_id, status, changed_by, created_at)
     VALUES (?, ?, ?, UTC_TIMESTAMP())`,
    [orderId, status, byUserId]
  );
}

const ORDER_COLUMNS = `id, user_id AS userId, status, payment_method AS method, payment_details_json, total_amount AS total,
  customer_username, customer_name, customer_email, customer_cpf, customer_phone,
  invoice_number AS invoiceNumber, invoice_status AS invoiceStatus, invoice_issued_at AS invoiceIssuedAt,
  shipping_label_code AS shippingLabelCode, shipping_carrier AS shippingCarrier, shipping_generated_at AS shippingGeneratedAt,
  created_at AS createdAt, updated_at AS updatedAt`;

function parseJsonObject(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function buildOrder(order, { items = [], timeline = [], address = null } = {}) {
  return {
    ...order,
    paymentDetails: parseJsonObject(order.payment_details_json),
    payment_details_json: undefined,
    customer: {
      username: order.customer_username,
      name: order.customer_name,
      email: order.customer_email,
      cpf: order.customer_cpf,
      phone: order.customer_phone
    },
    items,
    timeline,
    deliveryAddress: address,
    invoice: order.invoiceNumber ? { number: order.invoiceNumber, fiscalStatus: order.invoiceStatus, issuedAt: order.invoiceIssuedAt } : null,
    shipping: order.shippingLabelCode ? { labelCode: order.shippingLabelCode, carrier: order.shippingCarrier, generatedAt: order.shippingGeneratedAt } : null
  };
}

async function withDedicatedConnection(poolOrConnection, callback) {
  if (typeof poolOrConnection?.getConnection !== 'function') {
    return callback(poolOrConnection);
  }

  const connection = await poolOrConnection.getConnection();
  try {
    return await callback(connection);
  } finally {
    connection.release();
  }
}

function pushOrderFilters({ userId = null, userIds = [], customerEmail = null, status = null } = {}) {
  const params = [];
  const normalizedUserIds = Array.from(new Set([...(userId ? [userId] : []), ...(Array.isArray(userIds) ? userIds : [])].filter(Boolean)));
  const where = [];

  if (normalizedUserIds.length === 1 && customerEmail) {
    where.push('(user_id = ? OR customer_email = ?)');
    params.push(normalizedUserIds[0], customerEmail);
  } else if (normalizedUserIds.length > 1 && customerEmail) {
    where.push(`(user_id IN (${normalizedUserIds.map(() => '?').join(', ')}) OR customer_email = ?)`);
    params.push(...normalizedUserIds, customerEmail);
  } else if (normalizedUserIds.length === 1) {
    where.push('user_id = ?');
    params.push(normalizedUserIds[0]);
  } else if (normalizedUserIds.length > 1) {
    where.push(`user_id IN (${normalizedUserIds.map(() => '?').join(', ')})`);
    params.push(...normalizedUserIds);
  } else if (customerEmail) {
    where.push('customer_email = ?');
    params.push(customerEmail);
  }

  if (status) {
    where.push('status = ?');
    params.push(status);
  }

  return { where, params };
}

async function hydrateOrders(connection, orders = []) {
  if (!orders.length) return [];

  const orderIds = orders.map((order) => order.id);
  const placeholders = orderIds.map(() => '?').join(', ');

  const [items] = await connection.execute(
    `SELECT order_id AS orderId, product_id AS productId, name, image_url AS image, unit_price AS price, quantity
     FROM order_items WHERE order_id IN (${placeholders}) ORDER BY order_id ASC, id ASC`,
    orderIds
  );
  const [timeline] = await connection.execute(
    `SELECT order_id AS orderId, status, changed_by AS changedBy, created_at AS at
     FROM order_timeline WHERE order_id IN (${placeholders}) ORDER BY order_id ASC, id ASC`,
    orderIds
  );
  const [addresses] = await connection.execute(
    `SELECT order_id AS orderId, label, street, number, neighborhood, zip, complement
     FROM order_addresses WHERE order_id IN (${placeholders}) ORDER BY order_id ASC, id ASC`,
    orderIds
  );

  const itemsByOrder = new Map();
  items.forEach((item) => {
    const { orderId, ...itemData } = item;
    const list = itemsByOrder.get(item.orderId) || [];
    list.push(itemData);
    itemsByOrder.set(item.orderId, list);
  });

  const timelineByOrder = new Map();
  timeline.forEach((entry) => {
    const { orderId, ...timelineEntry } = entry;
    const list = timelineByOrder.get(entry.orderId) || [];
    list.push(timelineEntry);
    timelineByOrder.set(entry.orderId, list);
  });

  const addressByOrder = new Map();
  addresses.forEach((address) => {
    if (!addressByOrder.has(address.orderId)) {
      const { orderId, ...addressData } = address;
      addressByOrder.set(address.orderId, addressData);
    }
  });

  return orders.map((order) => buildOrder(order, {
    items: itemsByOrder.get(order.id) || [],
    timeline: timelineByOrder.get(order.id) || [],
    address: addressByOrder.get(order.id) || null
  }));
}

export async function getOrderById(connection, orderId) {
  return withDedicatedConnection(connection, async (dedicatedConnection) => {
    const [orders] = await dedicatedConnection.execute(
      `SELECT ${ORDER_COLUMNS} FROM orders WHERE id = ? LIMIT 1`,
      [orderId]
    );
    const hydrated = await hydrateOrders(dedicatedConnection, orders);
    return hydrated[0] || null;
  });
}

export async function listOrders(poolOrConnection, { limit = 20, offset = 0, ...filters } = {}) {
  return withDedicatedConnection(poolOrConnection, async (connection) => {
    const { where, params } = pushOrderFilters(filters);
    params.push(limit, offset); // fix: BUG-2
    const [rows] = await connection.execute(
      `SELECT ${ORDER_COLUMNS}
       FROM orders
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      params
    );
    return hydrateOrders(connection, rows);
  });
}

export async function countOrders(poolOrConnection, filters = {}) {
  return withDedicatedConnection(poolOrConnection, async (connection) => {
    const { where, params } = pushOrderFilters(filters);
    const [rows] = await connection.execute(
      `SELECT COUNT(*) AS total
       FROM orders
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`,
      params
    );
    return Number(rows[0]?.total || 0);
  });
}

export async function updateOrderStatus(connection, orderId, nextStatus, adminUid) {
  await connection.execute('UPDATE orders SET status = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?', [nextStatus, orderId]);
  await appendOrderTimeline(connection, orderId, nextStatus, adminUid);
}

export async function setInvoice(connection, orderId, invoiceNumber) {
  await connection.execute(
    `UPDATE orders
     SET invoice_number = ?, invoice_status = 'issued', invoice_issued_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP()
     WHERE id = ?`,
    [invoiceNumber, orderId]
  );
}

export async function setShipping(connection, orderId, shipping, adminUid, nextStatus) {
  await connection.execute(
    `UPDATE orders
     SET shipping_label_code = ?, shipping_carrier = ?, shipping_generated_at = UTC_TIMESTAMP(), status = ?, updated_at = UTC_TIMESTAMP()
     WHERE id = ?`,
    [shipping.labelCode, shipping.carrier, nextStatus, orderId]
  );
  await appendOrderTimeline(connection, orderId, nextStatus, adminUid);
}
