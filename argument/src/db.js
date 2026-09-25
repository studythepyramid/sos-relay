// Shared SQLite storage for the argument subsystem — schema, migrations,
// and the read/write functions. Mirrors py/map/db.py's shape (same
// migrations-table pattern, same retry-safe write style) so the two
// subsystems stay legible side by side even though they're different
// languages sharing one genone.db.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { dbPath as DEFAULT_PATH } from './settings.js';

export { DEFAULT_PATH };

// Deterministic, friendly display names — not identity, just a stable
// label so the same anonymous poster is recognizable across a thread.
// Collisions between different posters are expected and accepted at this
// list size (see argument/design.md, "Identity, quota, and what's
// explicitly deferred past the MVP").
export const WORDLIST = [
  'big-owner', 'dog-owner', 'cat', 'fish', 'Tree', 'Sky', 'Tom', 'Kane', 'Jim', 'Jane',
];

export function labelForToken(token) {
  const hash = crypto.createHash('sha256').update(token).digest();
  return WORDLIST[hash.readUInt32BE(0) % WORDLIST.length];
}

// Placeholder classifier, standing in for the real AI classifier (Phase 3
// of argument/design.md's roadmap). Zero semantic meaning — its only job
// right now is wiring the pipeline (post -> classify -> render -> tag)
// end to end. Swap this one function out later; nothing else changes.
export function classifyRelation(body) {
  return body.trim().length > 100 ? 'support' : 'noise';
}

const connections = new Map();

export function connect(dbFile = DEFAULT_PATH) {
  let db = connections.get(dbFile);
  if (db) return db;
  mkdirSync(path.dirname(dbFile), { recursive: true });
  db = new DatabaseSync(dbFile);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  connections.set(dbFile, db);
  return db;
}

export function closeAll() {
  for (const db of connections.values()) db.close();
  connections.clear();
}

export function initialize(dbFile = DEFAULT_PATH) {
  const db = connect(dbFile);
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      component TEXT NOT NULL,
      version INTEGER NOT NULL,
      applied_at TEXT NOT NULL,
      PRIMARY KEY (component, version)
    );
    CREATE TABLE IF NOT EXISTS argument (
      id INTEGER PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      owner_token TEXT NOT NULL,
      root_node_id INTEGER,
      status TEXT NOT NULL DEFAULT 'public',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS argument_node (
      id INTEGER PRIMARY KEY,
      argument_id INTEGER NOT NULL REFERENCES argument(id),
      author_token TEXT NOT NULL,
      author_label TEXT NOT NULL,
      body TEXT NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 4000),
      node_type TEXT NOT NULL DEFAULT 'claim',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS argument_edge (
      id INTEGER PRIMARY KEY,
      argument_id INTEGER NOT NULL REFERENCES argument(id),
      from_node_id INTEGER NOT NULL REFERENCES argument_node(id),
      to_node_id INTEGER NOT NULL REFERENCES argument_node(id),
      relation TEXT NOT NULL CHECK(relation IN ('attack','support','unrelated','noise')),
      set_by TEXT NOT NULL DEFAULT 'poster',
      reclassified_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_node_argument ON argument_node(argument_id);
    CREATE INDEX IF NOT EXISTS idx_edge_argument ON argument_edge(argument_id);
    CREATE INDEX IF NOT EXISTS idx_edge_from ON argument_edge(from_node_id);
  `);
  const applied = db.prepare(
    "SELECT 1 FROM schema_migrations WHERE component = 'argument' AND version = 1"
  ).get();
  if (!applied) {
    db.prepare("INSERT INTO schema_migrations VALUES ('argument', 1, ?)")
      .run(new Date().toISOString());
  }
  return db;
}

function slugify(title) {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .slice(0, 60)
    .replace(/^-+|-+$/g, '');
  return slug || 'thread';
}

function timestampPrefix(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${String(date.getUTCFullYear()).slice(2)}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}-${p(date.getUTCHours())}`;
}

function randomDigits(n) {
  return String(crypto.randomInt(0, 10 ** n)).padStart(n, '0');
}

// Creates the thread (argument row) and its root claim (node row) as one
// unit. Collision on the random 4-digit slug suffix retries with a fresh
// suffix rather than checking existence first — cheap, and correct under
// concurrent writers, which a check-then-insert isn't.
export function createArgument(dbFile = DEFAULT_PATH, { title, body, ownerToken }) {
  if (typeof title !== 'string' || !title.trim()) throw new Error('Title is required');
  if (typeof body !== 'string' || !body.trim()) throw new Error('Claim body is required');
  if (typeof ownerToken !== 'string' || !ownerToken.trim()) throw new Error('Owner token is required');

  const db = connect(dbFile);
  const now = new Date().toISOString();
  const base = `${timestampPrefix()}-${slugify(title)}`;
  const insertArgument = db.prepare(
    "INSERT INTO argument (slug, title, owner_token, status, created_at) VALUES (?, ?, ?, 'public', ?)"
  );

  let slug;
  let argumentId;
  for (let attempt = 0; attempt < 5; attempt++) {
    slug = `${base}-${randomDigits(4)}`;
    try {
      const info = insertArgument.run(slug, title.trim(), ownerToken, now);
      argumentId = Number(info.lastInsertRowid);
      break;
    } catch (err) {
      if (attempt === 4) throw err;
    }
  }

  const label = labelForToken(ownerToken);
  const nodeInfo = db.prepare(
    `INSERT INTO argument_node (argument_id, author_token, author_label, body, node_type, created_at)
     VALUES (?, ?, ?, ?, 'claim', ?)`
  ).run(argumentId, ownerToken, label, body.trim(), now);
  const rootNodeId = Number(nodeInfo.lastInsertRowid);
  db.prepare('UPDATE argument SET root_node_id = ? WHERE id = ?').run(rootNodeId, argumentId);

  return { id: argumentId, slug, title: title.trim() };
}

// Adds a reply: a node plus the edge pointing at what it replies to.
// relation is decided by classifyRelation() (the MVP placeholder) with
// set_by='poster' — see argument/design.md's "Who sets relation before
// the real AI classifier exists?" note.
export function addReply(dbFile = DEFAULT_PATH, { slug, toNodeId, body, authorToken }) {
  if (typeof body !== 'string' || !body.trim()) throw new Error('Reply body is required');
  if (typeof authorToken !== 'string' || !authorToken.trim()) throw new Error('Author token is required');

  const db = connect(dbFile);
  const argumentRow = db.prepare('SELECT * FROM argument WHERE slug = ?').get(slug);
  if (!argumentRow) throw new Error('Argument not found');
  const parent = db.prepare(
    'SELECT id FROM argument_node WHERE id = ? AND argument_id = ?'
  ).get(toNodeId, argumentRow.id);
  if (!parent) throw new Error('Parent node not found in this argument');

  const now = new Date().toISOString();
  const label = labelForToken(authorToken);
  const nodeInfo = db.prepare(
    `INSERT INTO argument_node (argument_id, author_token, author_label, body, node_type, created_at)
     VALUES (?, ?, ?, ?, 'claim', ?)`
  ).run(argumentRow.id, authorToken, label, body.trim(), now);
  const nodeId = Number(nodeInfo.lastInsertRowid);

  const relation = classifyRelation(body);
  db.prepare(
    `INSERT INTO argument_edge (argument_id, from_node_id, to_node_id, relation, set_by, created_at)
     VALUES (?, ?, ?, ?, 'poster', ?)`
  ).run(argumentRow.id, nodeId, toNodeId, relation, now);

  return { nodeId, relation, argumentId: argumentRow.id, slug: argumentRow.slug };
}

// Everything needed to render one thread top-down, in one query — see
// argument/design.md's "MVP schema" section for why this is the whole
// read path (and what a later AI classifier reads too).
export function getArgument(dbFile = DEFAULT_PATH, slug) {
  const db = connect(dbFile);
  const argumentRow = db.prepare('SELECT * FROM argument WHERE slug = ?').get(slug);
  if (!argumentRow) return null;
  const nodes = db.prepare(`
    SELECT n.id, n.author_label, n.body, n.node_type, n.created_at,
           e.relation, e.to_node_id
    FROM argument_node n
    LEFT JOIN argument_edge e ON e.from_node_id = n.id
    WHERE n.argument_id = ?
    ORDER BY n.created_at, n.id
  `).all(argumentRow.id);
  return { ...argumentRow, nodes };
}

export function listArguments(dbFile = DEFAULT_PATH) {
  const db = connect(dbFile);
  return db.prepare(`
    SELECT a.slug, a.title, a.created_at,
           (SELECT body FROM argument_node WHERE id = a.root_node_id) AS excerpt,
           (SELECT author_label FROM argument_node WHERE id = a.root_node_id) AS owner_label,
           (SELECT COUNT(DISTINCT author_token) FROM argument_node WHERE argument_id = a.id) AS participants,
           (SELECT MAX(created_at) FROM argument_node WHERE argument_id = a.id) AS last_activity
    FROM argument a
    WHERE a.status = 'public'
    ORDER BY last_activity DESC
  `).all();
}
