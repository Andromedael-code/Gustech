const WINDOW_MS = 60_000;
const MAX_REQUESTS = 120;
const buckets = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of buckets.entries()) {
    if (now - value.start > WINDOW_MS) buckets.delete(key);
  }
}, WINDOW_MS).unref();

export function apiRateLimit(req, res, next) {
  const key = String(req.ip || req.headers['x-forwarded-for'] || 'unknown');
  const now = Date.now();
  const slot = buckets.get(key);

  if (!slot || now - slot.start > WINDOW_MS) {
    buckets.set(key, { start: now, count: 1 });
    return next();
  }

  slot.count += 1;
  if (slot.count > MAX_REQUESTS) {
    return res.status(429).json({ error: 'Muitas requisições. Tente novamente em instantes.' });
  }

  next();
}
