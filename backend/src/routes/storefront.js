import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { getAdminHomeConfig, getPublicHomeConfig, saveAdminHomeConfig } from '../services/storefrontService.js';
import { asyncHandler } from '../utils/http.js';

const router = Router();

router.get('/home', asyncHandler(async (_req, res) => {
  res.json({ config: await getPublicHomeConfig() });
}));

router.get('/admin/home', requireAuth, requireAdmin, asyncHandler(async (_req, res) => {
  res.json(await getAdminHomeConfig());
}));

router.put('/admin/home', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  res.json({ config: await saveAdminHomeConfig(req.body || {}) });
}));

export default router;
