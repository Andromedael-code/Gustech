import express from 'express';
import path from 'node:path';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { getPool } from './config/mysql.js';
import { initializeApplication } from './bootstrap/initApp.js';
import { apiRateLimit } from './middleware/rateLimit.js';
import { errorHandler, notFound } from './middleware/errors.js';
import cartRouter from './routes/cart.js';
import ordersRouter from './routes/orders.js';
import productsRouter from './routes/products.js';
import reviewsRouter from './routes/reviews.js';
import seedRouter from './routes/seed.js';
import storefrontRouter from './routes/storefront.js';
import usersRouter from './routes/users.js';
import wishlistRouter from './routes/wishlist.js';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: env.corsOrigins,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'x-user-id', 'x-user-email', 'x-user-role']
}));
app.use(express.json({ limit: '15mb' }));
app.use('/uploads', express.static(path.resolve(process.cwd(), 'backend', 'uploads'), {
  maxAge: '30d',
  immutable: true
}));
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use('/api', apiRateLimit);

app.get('/health', async (_req, res, next) => {
  try {
    await getPool().query('SELECT 1');
    res.json({ ok: true, database: 'mysql', firebase: false });
  } catch (error) {
    next(error);
  }
});

app.use('/api/users', usersRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/products', productsRouter);
app.use('/api/storefront', storefrontRouter);
app.use('/api/cart', cartRouter);
app.use('/api/wishlist', wishlistRouter);
app.use('/api/seed', seedRouter);
app.use(notFound);
app.use(errorHandler);

initializeApplication()
  .then(() => {
    app.listen(env.port, () => {
      console.log(`GusTech backend on :${env.port}`);
    });
  })
  .catch((error) => {
    console.error('Falha ao inicializar a aplicação:', error);
    process.exit(1);
  });
