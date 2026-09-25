import express from 'express';
import { initialize } from './db.js';
import { regenerateList } from './render.js';
import { argumentRoutes } from './routes.js';
import { dbPath, port, siteDir } from './settings.js';

initialize(dbPath);
// Make sure the list page exists and is current on startup, in case
// site/ was wiped or this is a fresh checkout.
regenerateList(dbPath);

const app = express();
app.use(express.json({ limit: '16kb' }));
app.use('/api/argument', argumentRoutes(dbPath));

// Local dev convenience only: in production Caddy serves `argument/site`
// directly (see argument/design.md's Caddy block) and this app only ever
// sees /api/argument/* requests. Serving the static files here too means
// `npm start` alone is a complete local preview, no Caddy required.
app.use('/argument', express.static(siteDir));

app.listen(port, '127.0.0.1', () => {
  console.log(`argument service listening on 127.0.0.1:${port}`);
  console.log(`  db:   ${dbPath}`);
  console.log(`  site: ${siteDir}`);
});
