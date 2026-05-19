import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { confirmMyPhoneVerification, startMyPhoneVerification } from '../services/phoneVerificationService.js';
import { asyncHandler } from '../utils/http.js';
import { createAdmin, getAdmins, getMe, saveMyAddresses, saveMyProfile } from '../services/userService.js';

const router = Router();

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const data = await getMe(req.user.uid);
  res.json(data);
}));

router.put('/me/profile', requireAuth, asyncHandler(async (req, res) => {
  const result = await saveMyProfile(req.user.uid, req.user.email, req.body || {});
  res.json(result);
}));

router.post('/me/phone-verification/start', requireAuth, asyncHandler(async (req, res) => {
  const result = await startMyPhoneVerification(req.user.uid, req.body || {});
  res.json(result);
}));

router.post('/me/phone-verification/confirm', requireAuth, asyncHandler(async (req, res) => {
  const result = await confirmMyPhoneVerification(req.user.uid, req.user.email, req.body || {});
  res.json(result);
}));

router.put('/me/addresses', requireAuth, asyncHandler(async (req, res) => {
  const result = await saveMyAddresses(req.user.uid, req.body || {});
  res.json(result);
}));

router.get('/admins', requireAuth, requireAdmin, asyncHandler(async (_req, res) => {
  res.json({ admins: await getAdmins() });
}));

router.post('/admins', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const result = await createAdmin(req.user.uid, req.body?.email);
  res.status(201).json(result);
}));

export default router;
