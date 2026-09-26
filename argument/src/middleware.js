// Shared across argumentRoutes and userRoutes — extracted here so both
// routers apply the exact same guard, not two copies that could drift.

// Minimal placeholder abuse guard — flagged in argument/design.md as a
// pre-launch (not pre-coding) gap: there's no AI moderation yet
// (Phase 3), so this is what stands between the public write endpoints
// and a naive spam flood in the meantime. In-memory, per-process, resets
// on restart — good enough at this scale, not a real rate-limit service.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;
const hits = new Map(); // ip -> [timestamp, ...]
setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  for (const [ip, times] of hits) {
    const recent = times.filter((t) => t > cutoff);
    if (recent.length) hits.set(ip, recent); else hits.delete(ip);
  }
}, 5 * 60_000).unref();

export function rateLimit(req, res, next) {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const recent = (hits.get(ip) || []).filter((t) => t > cutoff);
  if (recent.length >= RATE_LIMIT_MAX) {
    return res.status(429).json({ error: 'Too many requests — slow down and try again shortly.' });
  }
  recent.push(now);
  hits.set(ip, recent);
  next();
}

// Every write carries the caller's silent client-side token — the server
// never verifies it (no signup, no password; see argument/design.md's
// identity notes), it just requires one be present so there's something
// to attribute the write to.
export function requireToken(req, res, next) {
  const token = req.get('X-Argument-Token');
  if (!token || typeof token !== 'string' || token.length < 8 || token.length > 200) {
    return res.status(400).json({ error: 'Missing or invalid X-Argument-Token header' });
  }
  req.argumentToken = token;
  next();
}
