import { Router } from 'express';
import { asyncHandler } from '../utils/http.js';
import { lookupCep } from '../services/cepService.js';

const router = Router();

router.get('/cep/:cep', asyncHandler(async (req, res) => {
  res.json(await lookupCep(req.params.cep));
}));

export default router;
