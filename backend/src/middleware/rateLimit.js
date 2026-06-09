// AVISO: Este rate limiter usa memoria local (Map). // fix: BUG-4
// Em ambientes multi-processo (cluster, PM2, multiplos containers),
// cada instancia mantem seu proprio contador.
// Para producao com multiplas instancias, substitua por um store Redis
// (ex: rate-limit-redis + express-rate-limit).
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 120;
const buckets = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of buckets.entries()) {
    if (now - value.start > WINDOW_MS) buckets.delete(key);
  }
}, WINDOW_MS).unref();

function setRateLimitHeaders(res, slot, now) {
  const resetMs = slot.start + WINDOW_MS;
  const remaining = Math.max(MAX_REQUESTS - slot.count, 0);
  res.set('X-RateLimit-Limit', String(MAX_REQUESTS));
  res.set('X-RateLimit-Remaining', String(remaining));
  res.set('X-RateLimit-Reset', String(Math.ceil(resetMs / 1000)));
  if (remaining <= 0) {
    res.set('Retry-After', String(Math.max(Math.ceil((resetMs - now) / 1000), 1)));
  }
}

export function apiRateLimit(req, res, next) {
  const key = String(req.ip || req.headers['x-forwarded-for'] || 'unknown');
  const now = Date.now();
  const slot = buckets.get(key);

  if (!slot || now - slot.start > WINDOW_MS) {
    const freshSlot = { start: now, count: 1 };
    buckets.set(key, freshSlot);
    setRateLimitHeaders(res, freshSlot, now);
    return next();
  }

  slot.count += 1;
  setRateLimitHeaders(res, slot, now);
  if (slot.count > MAX_REQUESTS) {
    const retryAfter = Math.max(Math.ceil((slot.start + WINDOW_MS - now) / 1000), 1); // fix: CODE-4
    return res.status(429).json({
      error: 'Muitas requisições. Tente novamente em instantes.',
      retryAfter // fix: CODE-4
    });
  }

  next();
}
