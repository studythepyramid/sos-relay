import { Router } from 'express';
import { createArgument, addReply } from './db.js';
import { regenerateThread, regenerateList } from './render.js';
import { rateLimit, requireJsonWrite } from './middleware.js';
import { requireSession } from './auth.js';

export function argumentRoutes(dbFile, outputDir) {
  const router = Router();

  router.use(rateLimit);
  router.use(requireJsonWrite);
  router.use(requireSession(dbFile));

  // POST /api/argument  { title, body }
  router.post('/', (req, res) => {
    const { title, body, source } = req.body ?? {};
    try {
      const created = createArgument(dbFile, { title, body, ownerToken: req.argumentToken, source });
      regenerateThread(dbFile, created.slug, outputDir);
      regenerateList(dbFile, outputDir);
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
      regenerateThread(dbFile, req.params.slug, outputDir);
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
