import crypto from 'crypto';

export function timingSafeEqualStr(a, b) {
  const ah = crypto.createHash('sha256').update(String(a)).digest();
  const bh = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ah, bh);
}

// Server-to-server guard for /charge-on-miss. Fail closed if no secret configured.
export function makeRequireChargeSecret(secret) {
  return function requireChargeSecret(req, res, next) {
    if (!secret) return res.status(503).json({ error: 'Charging is not configured (CHARGE_SECRET unset).' });
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
    if (!m || !timingSafeEqualStr(m[1], secret)) return res.status(401).json({ error: 'Unauthorized' });
    next();
  };
}

// Verifies a Supabase access token and attaches the user. Client-facing endpoints.
export function makeRequireUser(client) {
  return async function requireUser(req, res, next) {
    try {
      if (!client) return res.status(503).json({ error: 'Auth not configured' });
      const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
      if (!m) return res.status(401).json({ error: 'Unauthorized' });
      const { data, error } = await client.auth.getUser(m[1]);
      if (error || !data?.user) return res.status(401).json({ error: 'Unauthorized' });
      req.userId = data.user.id;
      req.userEmail = data.user.email;
      next();
    } catch (e) { res.status(401).json({ error: 'Unauthorized' }); }
  };
}
