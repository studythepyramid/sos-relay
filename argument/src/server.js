import path from 'node:path';
import express from 'express';
import { initialize } from './db.js';
import { regenerateAll } from './render.js';
import { argumentRoutes } from './routes.js';
import { userRoutes } from './userRoutes.js';
import { newArgumentPage } from './pageRoutes.js';
import { dbPath, port, siteDir } from './settings.js';
import { initializePublicMsg, cleanupPublicMsg, publicMsgRoutes } from './publicMsg.js';

initialize(dbPath);
initializePublicMsg(dbPath);
setInterval(() => cleanupPublicMsg(dbPath), 3600000).unref();
// Regenerate every page on startup, not just the list: a code deploy
// (template change) needs to reach already-existing threads too, not
// just ones that happen to get a new reply after the restart.
regenerateAll(dbPath);

const app = express();
// Only Caddy, running on the same box, ever connects directly (service
// binds 127.0.0.1 only) — trusting the loopback hop specifically lets
// Express read the real client IP from X-Forwarded-For for rate limiting,
// without trusting an arbitrary forwarded header from the open internet.
app.set('trust proxy', 'loopback');
app.use('/api/publicMsg', express.json({ limit: '64kb' }), publicMsgRoutes(dbPath));
app.use('/publicMsg', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('Referrer-Policy', 'same-origin');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'");
  next();
}, express.static(path.join(siteDir, 'publicMsg')));
app.use(express.json({ limit: '16kb' }));
app.use('/api/argument', argumentRoutes(dbPath));
app.use('/api/user', userRoutes(dbPath));
app.use('/argument/new', newArgumentPage(dbPath, siteDir));

// Local dev convenience only: in production Caddy serves `argument/site`
// directly, except /argument/new which must check the session first. Serving the static files
// here too means `npm start` alone is a complete local preview, no Caddy
// required. site/user/ physically holds the profile page, so mounting it
// at /user works with no prefix-stripping either locally or in Caddy.
app.use('/argument', express.static(siteDir));
app.use('/user', express.static(path.join(siteDir, 'user')));

app.listen(port, '127.0.0.1', () => {
  console.log(`argument service listening on 127.0.0.1:${port}`);
  console.log(`  db:   ${dbPath}`);
  console.log(`  site: ${siteDir}`);
});
