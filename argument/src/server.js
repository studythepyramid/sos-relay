import path from 'node:path';
import express from 'express';
import { initialize } from './db.js';
import { regenerateAll } from './render.js';
import { argumentRoutes } from './routes.js';
import { userRoutes } from './userRoutes.js';
import {adminRoutes, adminPage} from './admin.js';
import {cleanupAdminAudit} from './adminAccess.js';
import { newArgumentPage } from './pageRoutes.js';
import { dbPath, port, siteDir, beltRoadDbPath, repoRoot } from './settings.js';
import { beltRoadRoutes } from './beltRoad.js';
import { initializePublicMsg, cleanupPublicMsg, publicMsgRoutes } from './publicMsg.js';

initialize(dbPath);
initializePublicMsg(dbPath);
cleanupAdminAudit(dbPath);
setInterval(() => cleanupAdminAudit(dbPath), 3600000).unref();
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
// Caddy serves the homepage in production; Node-only previews open the live site.
app.get('/', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.redirect(302, 'https://sosweb.org/');
});
// Same favicon URL as Caddy's static site, also available in Node-only previews.
app.get('/assets/site-favicon.png', (_req, res) => {
  res.sendFile(path.join(repoRoot, 'docs/assets/site-favicon.png'));
});
app.use('/api/belt-road', beltRoadRoutes(beltRoadDbPath));
app.use('/api/publicMsg', express.json({ limit: '64kb' }), publicMsgRoutes(dbPath));
app.use('/publicMsg', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('Referrer-Policy', 'same-origin');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'");
  next();
}, express.static(path.join(siteDir, 'publicMsg')));
app.use(express.json({ limit: '48kb' }));
app.use('/api/admin', adminRoutes(dbPath));
app.use('/admin', adminPage(dbPath, path.join(repoRoot, 'argument/admin')));
app.use('/api/argument', argumentRoutes(dbPath));
app.use('/api/user', userRoutes(dbPath));
app.use('/argument/new', newArgumentPage(dbPath, siteDir));

// Local dev convenience only: in production Caddy serves `argument/site`
// directly, except /argument/new which must check the session first. Serving the static files
// here too provides a local preview of the Node pages without Caddy;
// the homepage route above opens the public site. site/user/ holds the profile page, so mounting it
// at /user works with no prefix-stripping either locally or in Caddy.
app.use('/argument', express.static(siteDir));
app.use('/user', express.static(path.join(siteDir, 'user')));

app.listen(port, '127.0.0.1', () => {
  console.log(`argument service listening on 127.0.0.1:${port}`);
  console.log(`  db:   ${dbPath}`);
  console.log(`  site: ${siteDir}`);
});
