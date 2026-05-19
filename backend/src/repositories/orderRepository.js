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

  for (const item of order.items) {
    await connection.execute(
      `INSERT INTO order_items (order_id, product_id, name, image_url, unit_price, quantity, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
      [orderId, item.productId || null, item.name, item.image || null, item.price, item.quantity]
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

function parseJsonObject(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export async function getOrderById(connection, orderId) {
  const [orders] = await connection.execute(
    `SELECT id, user_id AS userId, status, payment_method AS method, payment_details_json, total_amount AS total,
      customer_username, customer_name, customer_email, customer_cpf, customer_phone,
      invoice_number AS invoiceNumber, invoice_status AS invoiceStatus, invoice_issued_at AS invoiceIssuedAt,
      shipping_label_code AS shippingLabelCode, shipping_carrier AS shippingCarrier, shipping_generated_at AS shippingGeneratedAt,
      created_at AS createdAt, updated_at AS updatedAt
     FROM orders WHERE id = ? LIMIT 1`,
    [orderId]
  );
  const order = orders[0];
  if (!order) return null;

  const [items] = await connection.execute(
    `SELECT product_id AS productId, name, image_url AS image, unit_price AS price, quantity
     FROM order_items WHERE order_id = ? ORDER BY id ASC`,
    [orderId]
  );
  const [timeline] = await connection.execute(
    `SELECT status, changed_by AS changedBy, created_at AS at FROM order_timeline WHERE order_id = ? ORDER BY id ASC`,
    [orderId]
  );
  const [addresses] = await connection.execute(
    `SELECT label, street, number, neighborhood, zip, complement
     FROM order_addresses WHERE order_id = ? LIMIT 1`,
    [orderId]
  );

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
    deliveryAddress: addresses[0] || null,
    invoice: order.invoiceNumber ? { number: order.invoiceNumber, fiscalStatus: order.invoiceStatus, issuedAt: order.invoiceIssuedAt } : null,
    shipping: order.shippingLabelCode ? { labelCode: order.shippingLabelCode, carrier: order.shippingCarrier, generatedAt: order.shippingGeneratedAt } : null
  };
}

export async function listOrders(connection, { userId = null, userIds = [], customerEmail = null, status = null, limit = 20 } = {}) {
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

  let sql = `SELECT id FROM orders ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;
  if (status) {
    sql += `${where.length ? ' AND' : ' WHERE'} status = ?`;
    params.push(status);
  }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);
  const [rows] = await connection.execute(sql, params);
  const results = [];
  for (const row of rows) {
    results.push(await getOrderById(connection, row.id));
  }
  return results;
}

export async function updateOrderStatus(connection, orderId, nextStatus, adminUid) {
  await connection.execute('UPDATE orders SET status = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?', [nextStatus, orderId]);
  await appendOrderTimeline(connection, orderId, nextStatus, adminUid);
}

export async function setInvoice(connection, orderId, invoiceNumber, adminUid) {
  await connection.execute(
    `UPDATE orders
     SET invoice_number = ?, invoice_status = 'issued', invoice_issued_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP()
     WHERE id = ?`,
    [invoiceNumber, orderId]
  );
  await appendOrderTimeline(connection, orderId, 'processing', adminUid);
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
