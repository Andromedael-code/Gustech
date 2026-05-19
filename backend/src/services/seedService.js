import { getPool, withTransaction } from '../config/mysql.js';
import { defaultProducts } from '../data/defaultProducts.js';
import { countProducts, insertProductsIfMissing } from '../repositories/seedRepository.js';
import { refreshAllProductReviewAggregates } from '../repositories/productRepository.js';

let seedPromise;
let lastSeedResult = null;

export async function ensureProductSeed({ force = false, logger = console } = {}) {
  if (lastSeedResult && !force) return lastSeedResult;
  if (seedPromise && !force) return seedPromise;

  seedPromise = (async () => {
    const pool = getPool();
    const totalBefore = await countProducts(pool);
    const result = await withTransaction((connection) => insertProductsIfMissing(connection, defaultProducts));
    await withTransaction((connection) => refreshAllProductReviewAggregates(connection));
    const totalAfter = await countProducts(pool);

    if (result.inserted > 0) {
      logger.info?.(`[seed] ${result.inserted} produto(s) inserido(s) automaticamente em MySQL.`);
    } else if (totalBefore > 0) {
      logger.info?.('[seed] Catalogo ja estava alinhado com os produtos padrao.');
    }

    lastSeedResult = { seeded: result.inserted > 0, total: totalAfter, inserted: result.inserted };
    return lastSeedResult;
  })();

  try {
    return await seedPromise;
  } finally {
    seedPromise = null;
  }
}
