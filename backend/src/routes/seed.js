import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { ensureProductSeed } from '../services/seedService.js';
import { asyncHandler } from '../utils/http.js';

const router = Router();

router.post('/', requireAuth, requireAdmin, asyncHandler(async (_req, res) => {
  const result = await ensureProductSeed({ force: true, logger: console });
  res.json(result);
}));

export default router;
