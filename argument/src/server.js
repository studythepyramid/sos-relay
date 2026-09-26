import path from 'node:path';
import express from 'express';
import { initialize } from './db.js';
import { regenerateAll } from './render.js';
import { argumentRoutes } from './routes.js';
import { userRoutes } from './userRoutes.js';
import { dbPath, port, siteDir } from './settings.js';

initialize(dbPath);
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
app.use(express.json({ limit: '16kb' }));
app.use('/api/argument', argumentRoutes(dbPath));
app.use('/api/user', userRoutes(dbPath));

// Local dev convenience only: in production Caddy serves `argument/site`
// directly (see argument/design.md's Caddy block) and this app only ever
// sees /api/argument/* and /api/user requests. Serving the static files
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
