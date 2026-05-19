import { ensureSchema, getPool } from '../config/mysql.js';
import { ensureProductSeed } from '../services/seedService.js';

export async function initializeApplication() {
  await ensureSchema();
  await getPool().query('SELECT 1');
  await ensureProductSeed({ logger: console });
}
