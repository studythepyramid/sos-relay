import { Router } from 'express';
import { createArgument, addReply } from './db.js';
import { regenerateThread, regenerateList } from './render.js';

// Minimal placeholder abuse guard — flagged in argument/design.md as a
// pre-launch (not pre-coding) gap: there's no AI moderation or auth yet
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

function rateLimit(req, res, next) {
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

export function argumentRoutes(dbFile) {
  const router = Router();

  router.use(rateLimit);
  router.use((req, res, next) => {
    const token = req.get('X-Argument-Token');
    if (!token || typeof token !== 'string' || token.length < 8 || token.length > 200) {
      return res.status(400).json({ error: 'Missing or invalid X-Argument-Token header' });
    }
    req.argumentToken = token;
    next();
  });

  // POST /api/argument  { title, body }
  router.post('/', (req, res) => {
    const { title, body } = req.body ?? {};
    try {
      const created = createArgument(dbFile, { title, body, ownerToken: req.argumentToken });
      regenerateThread(dbFile, created.slug);
      regenerateList(dbFile);
      res.status(201).json(created);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // POST /api/argument/:slug/reply  { toNodeId, body }
  router.post('/:slug/reply', (req, res) => {
    const { toNodeId, body } = req.body ?? {};
    try {
      const result = addReply(dbFile, {
        slug: req.params.slug,
        toNodeId: Number(toNodeId),
        body,
        authorToken: req.argumentToken,
      });
      regenerateThread(dbFile, req.params.slug);
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
