// Source-attributed map records from the same SQLite database used by the crawler.
import { Router } from 'express';
import { DatabaseSync } from 'node:sqlite';

const MAX_LOCATIONS = 500;
function string(value, limit = 2000, optional = false) {
  if (optional && value == null) return '';
  if (typeof value !== 'string' || value.length > limit || (!optional && !value.trim())) throw new Error('Invalid location text');
  return value;
}
function sourceUrl(value) {
  const url = new URL(string(value));
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid source URL');
  return url.href;
}
export function publicLocation(payload, updatedAt) {
  const row = JSON.parse(payload), location = row.location;
  if ((location !== null && (!location || !Number.isFinite(location.latitude) || Math.abs(location.latitude) > 90 ||
      !Number.isFinite(location.longitude) || Math.abs(location.longitude) > 180 ||
      !Number.isFinite(location.radius_m) || location.radius_m < 100 || location.radius_m > 500000)) ||
      !['reported','documented','suspected'].includes(row.source_classification) ||
      !Array.isArray(row.sources) || !row.sources.length || row.sources.length > 20 ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(string(row.id, 100))) throw new Error('Invalid source location');
  return {
    id: row.id, title: string(row.title, 200), country: string(row.country, 100),
    summary: string(row.summary, 1500, true), reported_on: string(row.reported_on, 40, true),
    source_classification: row.source_classification,
    communication: string(row.communication, 500, true), current_status: string(row.current_status, 400, true),
    location: location === null ? null : {latitude: location.latitude, longitude: location.longitude, radius_m: location.radius_m,
      precision: location.precision === 'site' ? 'site' : 'region',
      label: string(location.label, 200), basis: string(location.basis, 700, true)},
    sources: row.sources.map(source => ({url: sourceUrl(source.url),
      title: string(source.title, 300), publisher: string(source.publisher, 200),
      published_on: string(source.published_on, 40, true), supports: string(source.supports, 1000, true)})),
    updated_at: string(updatedAt, 100)
  };
}

export function beltRoadRoutes(dbFile) {
  const router = Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  router.get('/locations', (req, res) => {
    let db;
    try {
      db = new DatabaseSync(dbFile, {readOnly: true});
      const rows = db.prepare(`SELECT record_json,updated_at FROM map_locations
        WHERE hidden=0 ORDER BY id LIMIT ?`).all(MAX_LOCATIONS + 1);
      const locations = rows.slice(0, MAX_LOCATIONS).map(row => publicLocation(row.record_json, row.updated_at));
      res.json({schema_version: 1, locations, has_more: rows.length > MAX_LOCATIONS, limit: MAX_LOCATIONS,
        generated_at: locations.reduce((last, row) => row.updated_at > last ? row.updated_at : last, '')});
    } catch {
      res.status(503).json({error: 'Locations are temporarily unavailable. Try again.'});
    } finally {if (db) db.close();}
  });
  router.all('/locations', (req, res) => res.set('Allow', 'GET, HEAD').status(405).json({error: 'Read-only endpoint'}));
  return router;
}
