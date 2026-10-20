// Public projection of server-owned reviewed snapshots. No import/publication API.
import { Router } from 'express';
import { DatabaseSync } from 'node:sqlite';

const MAX_CASES = 500;
function string(value, limit = 2000) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) throw new Error('Invalid published record');
  return value;
}
function sourceUrl(value) {
  const url = new URL(string(value));
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid source URL');
  return url.href;
}
export function publicBeltRoadCase(payload, reviewedAt) {
  const row = JSON.parse(payload);
  const location = row.location;
  if (!location || !Number.isFinite(location.latitude) || Math.abs(location.latitude) > 90 ||
      !Number.isFinite(location.longitude) || Math.abs(location.longitude) > 180 ||
      !['region', 'site'].includes(location.precision) || !Number.isFinite(location.radius_m) ||
      location.radius_m < 100 || location.radius_m > 500000 ||
      (location.precision === 'region' && location.radius_m < 1000)) throw new Error('Invalid location');
  if (!Array.isArray(row.sources) || row.sources.length < 1 || row.sources.length > 20) throw new Error('Invalid sources');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(string(row.id, 100))) throw new Error('Invalid ID');
  return {
    id: row.id, title: string(row.title, 200), country: string(row.country, 100),
    summary: string(row.summary, 1500), reported_on: string(row.reported_on, 10),
    evidence_status: 'Publicly reported', current_status: string(row.current_status, 400),
    communication: string(row.communication, 500), belt_road_status: 'Not established',
    collection_method: ['manual_seed', 'crawler'].includes(row.collection_method) ? row.collection_method : 'manual_seed',
    location: { latitude: location.latitude, longitude: location.longitude,
      precision: location.precision, radius_m: location.radius_m,
      label: string(location.label, 200), basis: string(location.basis, 700) },
    sources: row.sources.map(source => ({ url: sourceUrl(source.url),
      title: string(source.title, 300), publisher: string(source.publisher, 200),
      published_on: string(source.published_on, 10), accessed_on: string(source.accessed_on, 10),
      kind: ['victim_message_report', 'location_context', 'context'].includes(source.kind) ? source.kind : 'context',
      supports: string(source.supports, 1000) })),
    reviewed_at: string(reviewedAt, 100),
  };
}

export function beltRoadRoutes(dbFile) {
  const router = Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  router.get('/cases', (req, res) => {
    let db;
    try {
      // Read-only open: a missing catalogue must produce an error, never an empty new DB.
      db = new DatabaseSync(dbFile, { readOnly: true });
      const rows = db.prepare(`SELECT published_json,published_at FROM br_cases
        WHERE published_json IS NOT NULL ORDER BY id LIMIT ?`).all(MAX_CASES + 1);
      const cases = rows.slice(0, MAX_CASES).map(row => publicBeltRoadCase(row.published_json, row.published_at));
      const updatedAt = cases.reduce((latest, row) => row.reviewed_at > latest ? row.reviewed_at : latest, '');
      res.json({ schema_version: 1, generated_at: updatedAt || new Date().toISOString(),
        cases, has_more: rows.length > MAX_CASES, limit: MAX_CASES });
    } catch {
      res.status(503).json({ error: 'Published reports are temporarily unavailable. Try again.' });
    } finally {
      if (db) db.close();
    }
  });
  router.all('/cases', (req, res) => res.set('Allow', 'GET, HEAD').status(405).json({ error: 'Read-only endpoint' }));
  return router;
}
