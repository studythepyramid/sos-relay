import { Router } from 'express';
import { getIdentity, setDisplayName } from './db.js';
import { identicon } from './identicon.js';
import { rateLimit, requireToken } from './middleware.js';

export function userRoutes(dbFile) {
  const router = Router();

  router.use(rateLimit);
  router.use(requireToken);

  // GET /api/user — the caller's own profile (or the not-yet-registered
  // default), plus a rendered avatar preview so the page doesn't need to
  // duplicate the identicon algorithm in client-side JS.
  router.get('/', (req, res) => {
    const identity = getIdentity(dbFile, req.argumentToken);
    res.json({
      token: req.argumentToken,
      displayName: identity?.display_name ?? null,
      avatarSvg: identicon(req.argumentToken, 56),
    });
  });

  // POST /api/user  { displayName }
  router.post('/', (req, res) => {
    const { displayName } = req.body ?? {};
    try {
      const identity = setDisplayName(dbFile, req.argumentToken, displayName);
      res.status(200).json({
        token: req.argumentToken,
        displayName: identity.display_name,
        avatarSvg: identicon(req.argumentToken, 56),
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
