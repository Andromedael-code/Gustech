import express, { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/http.js';
import { createCatalogProduct, getCatalogOverview, getCatalogProduct, listCatalog, listCategorySummaries, removeCatalogProduct, updateCatalogProduct } from '../services/productService.js';
import { saveUploadedImage } from '../services/uploadService.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const result = await listCatalog(req.query || {});
  res.json(result);
}));

router.get('/admin/all', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const filters = { ...(req.query || {}), includeInactive: true };
  const [result, stats] = await Promise.all([
    listCatalog(filters),
    getCatalogOverview(filters)
  ]);
  res.json({ ...result, stats });
}));

router.get('/meta/categories', asyncHandler(async (_req, res) => {
  res.json({ categories: await listCategorySummaries() });
}));

router.get('/:productId', asyncHandler(async (req, res) => {
  res.json({ product: await getCatalogProduct(req.params.productId) });
}));

router.post('/', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  res.status(201).json({ product: await createCatalogProduct(req.body || {}) });
}));

router.post('/upload-image', express.json({ limit: '15mb' }), requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const relativePath = await saveUploadedImage({
    dataUrl: req.body?.dataUrl,
    originalName: req.body?.filename
  });
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.status(201).json({ url: `${baseUrl}${relativePath}`, path: relativePath });
}));

router.put('/:productId', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  res.json({ product: await updateCatalogProduct(req.params.productId, req.body || {}) });
}));

router.delete('/:productId', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  res.json(await removeCatalogProduct(req.params.productId));
}));

export default router;
