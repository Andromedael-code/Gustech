import express from 'express';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { httpLogger, logger } from './config/logger.js';
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
import utilsRouter from './routes/utils.js';
import wishlistRouter from './routes/wishlist.js';

const app = express();

app.disable('x-powered-by');
app.disable('etag');
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } })); // fix: SEC-1
app.use(cors({
  origin: env.corsOrigins,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'x-user-id', 'x-user-email', 'x-user-role'],
  exposedHeaders: ['Retry-After', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']
}));
app.use('/uploads', express.static(fileURLToPath(new URL('../uploads/', import.meta.url)), {
  maxAge: '30d',
  immutable: true
}));
app.use(httpLogger);
app.use((req, res, next) => {
  if (req.path === '/api/products/upload-image') return next();
  return express.json({ limit: '1mb' })(req, res, next);
});
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use('/api', apiRateLimit);

app.get('/health', async (_req, res, next) => {
  try {
    const start = Date.now(); // feat: FUNC-2
    await getPool().query('SELECT 1');
    const dbLatencyMs = Date.now() - start; // feat: FUNC-2
    res.json({
        ok: true,
        version: process.env.npm_package_version || '2.0.0',
        uptime: Math.floor(process.uptime()),
        database: env.dbClient,
        environment: env.nodeEnv,
        dbLatencyMs // feat: FUNC-2
      });
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
app.use('/api/utils', utilsRouter);
app.use('/api/seed', seedRouter);
app.use(notFound);
app.use(errorHandler);

initializeApplication()
  .then(() => {
    const server = app.listen(env.port, () => {
      logger.info({ port: env.port }, 'GusTech backend iniciado');
    });

    server.on('error', (error) => {
      if (error?.code === 'EADDRINUSE') {
        logger.error({ port: env.port }, 'Porta do backend ja esta em uso. Encerre o processo antigo ou altere PORT no .env.');
        process.exit(1);
      }
      logger.error({ err: error }, 'Falha no servidor HTTP');
      process.exit(1);
    });
  })
  .catch((error) => {
    logger.error({ err: error }, 'Falha ao inicializar a aplicacao');
    process.exit(1);
  });
