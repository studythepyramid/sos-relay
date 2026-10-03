import { Router } from 'express';
import { getIdentity, setDisplayName } from './db.js';
import { identicon } from './identicon.js';
import { rateLimit, requireJsonWrite } from './middleware.js';
import { register, login, logout, startSession, requireSession } from './auth.js';

export function userRoutes(dbFile) {
  const router = Router();
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(rateLimit, requireJsonWrite);
  for (const action of ['register', 'login']) {
    router.post('/' + action, async (req, res, next) => {
      try {
        const { username, password } = req.body ?? {};
        const user = await (action === 'register' ? register : login)(dbFile, username, password);
        if (!user) return res.status(401).json({ error: 'Invalid username or password' });
        startSession(dbFile, user, req, res);
        res.status(action === 'register' ? 201 : 200).json({ username: user.username });
      } catch (error) {
        if (/^(Username|Password)/.test(error.message)) return res.status(400).json({ error: error.message });
        next(error);
      }
    });
  }
  router.post('/logout', (req, res) => {
    logout(dbFile, req, res);
    res.json({ ok: true });
  });
  router.use(requireSession(dbFile));
  const profile = req => ({
    username: req.user.username,
    displayName: getIdentity(dbFile, req.argumentToken)?.display_name ?? req.user.username,
    avatarSvg: identicon(req.argumentToken, 56),
  });
  router.get('/', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(profile(req));
  });
  router.post('/', (req, res) => {
    try {
      setDisplayName(dbFile, req.argumentToken, req.body?.displayName);
      res.json(profile(req));
    } catch (error) { res.status(400).json({ error: error.message }); }
  });
  return router;
}
