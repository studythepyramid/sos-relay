import { Router } from 'express';
import { createArgument, addReply } from './db.js';
import { regenerateThread, regenerateList } from './render.js';
import { rateLimit, requireToken } from './middleware.js';

export function argumentRoutes(dbFile) {
  const router = Router();

  router.use(rateLimit);
  router.use(requireToken);

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
