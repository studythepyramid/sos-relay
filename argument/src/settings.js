// Loads argument/settings.toml. Paths in that file are relative to the
// repo root; resolved here from this module's own file location so the
// result doesn't depend on the process's launch cwd (systemd or otherwise).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';

const srcDir = path.dirname(fileURLToPath(import.meta.url));
export const argumentDir = path.dirname(srcDir);
export const repoRoot = path.dirname(argumentDir);

const raw = readFileSync(path.join(argumentDir, 'settings.toml'), 'utf8');
const parsed = parse(raw);

export const dbPath = path.resolve(repoRoot, parsed.db_file ?? 'var/genone.db');
export const port = parsed.port ?? 8000;
export const siteDir = path.join(argumentDir, 'site');

// Catalogue data is server-owned and never bundled into the static site.
export const beltRoadDbPath = process.env.BELT_ROAD_DB_FILE || path.join(repoRoot, 'var/belt-road.db');
