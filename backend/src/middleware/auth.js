import { env } from '../config/env.js';
import { AppError } from '../utils/http.js';

function parseDevelopmentToken(rawToken = '') {
  if (!rawToken) return null;

  if (rawToken === 'dev-admin') {
    return { uid: 'dev-admin', email: 'admin@gustech.local', role: 'admin', admin: true };
  }

  if (rawToken === 'dev-user') {
    return { uid: 'dev-user', email: 'user@gustech.local', role: 'user', admin: false };
  }

  try {
    const decoded = JSON.parse(Buffer.from(rawToken, 'base64url').toString('utf8'));
    if (decoded?.uid && decoded?.email) {
      return {
        uid: String(decoded.uid),
        email: String(decoded.email).toLowerCase(),
        role: decoded.role === 'admin' ? 'admin' : 'user',
        admin: decoded.admin === true || decoded.role === 'admin'
      };
    }
  } catch {
    return null;
  }

  return null;
}

export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const headerUserId = String(req.headers['x-user-id'] || '').trim();
    const headerEmail = String(req.headers['x-user-email'] || '').trim().toLowerCase();
    const headerRole = String(req.headers['x-user-role'] || 'user').trim().toLowerCase();

    const parsedToken = parseDevelopmentToken(token);
    if (parsedToken) {
      req.user = parsedToken;
      return next();
    }

    if (env.nodeEnv !== 'production' && headerUserId && headerEmail) {
      req.user = {
        uid: headerUserId,
        email: headerEmail,
        role: headerRole === 'admin' ? 'admin' : 'user',
        admin: headerRole === 'admin'
      };
      return next();
    }

    throw new AppError(
      401,
      env.nodeEnv === 'production'
        ? 'Autenticacao ausente ou invalida.'
        : 'Autenticacao ausente. Use um token local (Bearer dev-user ou Bearer dev-admin) ou os headers x-user-id/x-user-email.'
    );
  } catch (error) {
    next(error);
  }
}

export function requireAdmin(req, _res, next) {
  const normalizedEmail = String(req.user?.email || '').toLowerCase();
  const isAdminByClaim = req.user?.admin === true || req.user?.role === 'admin';
  const isAdminByAllowlist = normalizedEmail && env.adminAllowlist.includes(normalizedEmail);
  if (!isAdminByClaim && !isAdminByAllowlist) {
    return next(new AppError(403, 'Acesso restrito a administradores.'));
  }
  next();
}
