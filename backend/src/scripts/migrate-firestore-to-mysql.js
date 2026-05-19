import fs from 'node:fs/promises';
import { initFirebaseAdmin } from '../config/firebase.js';
import { getPool, withTransaction } from '../config/mysql.js';
import { upsertUserProfile, replaceAddresses } from '../repositories/userRepository.js';
import { createOrder } from '../repositories/orderRepository.js';
import { createReview } from '../repositories/reviewRepository.js';

async function run() {
  initFirebaseAdmin();
  const admin = (await import('../config/firebase.js')).admin;
  const db = admin.firestore();
  await fs.access(new URL('../db/schema.sql', import.meta.url));
  console.log('Starting migration...');

  const usersSnap = await db.collection('users').get();
  for (const doc of usersSnap.docs) {
    const user = doc.data() || {};
    await withTransaction(async (connection) => {
      await upsertUserProfile(connection, doc.id, {
        email: user.email || '',
        username: user.username || user.name || `user_${doc.id.slice(0, 6)}`,
        name: user.name || user.username || 'Cliente',
        cpf: user.cpf || '00000000000',
        phone: user.phone || '0000000000'
      });
      const addresses = Array.isArray(user.addresses) ? user.addresses : [];
      if (addresses.length) {
        await replaceAddresses(connection, doc.id, addresses.map((item, index) => ({
          ...item,
          id: item.id || `addr_${index}_${Date.now()}`,
          label: item.label || 'Endereço',
          complement: item.complement || '',
          isDefault: Boolean(item.isDefault)
        })));
      }
    });
  }

  const ordersSnap = await db.collection('orders').get();
  for (const doc of ordersSnap.docs) {
    const order = doc.data() || {};
    await withTransaction(async (connection) => {
      await createOrder(connection, {
        userId: order.userId,
        status: order.status || 'pending',
        method: order.method || 'pix',
        paymentDetails: order.paymentDetails || {},
        total: Number(order.total || 0),
        customer: order.customer || { username: '', name: '', email: '', cpf: '', phone: '' },
        deliveryAddress: order.deliveryAddress || { label: 'Entrega', street: '', number: '', neighborhood: '', zip: '', complement: '' },
        items: Array.isArray(order.items) ? order.items : []
      });
    });
  }

  const productsSnap = await db.collection('products').get();
  for (const product of productsSnap.docs) {
    const reviewsSnap = await product.ref.collection('reviews').get();
    for (const reviewDoc of reviewsSnap.docs) {
      const review = reviewDoc.data() || {};
      try {
        await withTransaction(async (connection) => {
          await createReview(connection, {
            userId: review.userId,
            productId: product.id,
            name: review.name || 'Cliente',
            rating: Number(review.rating || 5),
            comment: String(review.comment || '').slice(0, 1000)
          });
        });
      } catch {
        // skip duplicates / invalid rows
      }
    }
  }

  await getPool().end();
  console.log('Migration complete.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
