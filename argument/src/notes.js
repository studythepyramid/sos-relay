// Titled text or Markdown notes by logged-in users; see argument/notes.md.
// Pending text lives only in SQLite. An administrator's approval writes
// docs/notes/<file>.md and rebuilds the site, so an unrelated rebuild can
// never publish a note nobody approved.
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { connect, getIdentity } from './db.js';
import { requireSession } from './auth.js';
import { rateLimit, requireJsonWrite } from './middleware.js';
import { atomicAdmin, audit, operatorNote, problem } from './adminAccess.js';
import { DEFAULT_REASONS } from './approval.js';
import { notesDir as defaultNotesDir } from './settings.js';

const DAY = 86400000;
export const NOTE_LIMITS = { title: 200, body: 100000, perDay: 20 };
const FORMATS = ['md', 'txt'];
const FILE_NAME = /^\d{6}-[a-z0-9-]+-[0-9a-f]{8}\.md$/;

export function initializeNotes(dbFile) {
  connect(dbFile).exec(`
    CREATE TABLE IF NOT EXISTS note (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, request_key TEXT NOT NULL,
      file_name TEXT NOT NULL UNIQUE, title TEXT NOT NULL, body TEXT NOT NULL,
      format TEXT NOT NULL CHECK(format IN ('md','txt')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','rejected','removed')),
      revision INTEGER NOT NULL DEFAULT 1,
      live INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, published_at INTEGER,
      UNIQUE(owner_id, request_key)
    );
    CREATE INDEX IF NOT EXISTS note_owner_time ON note(owner_id, created_at);
  `);
}

const FENCE_OPEN = /^ {0,3}(?:(`{3,})[^`]*|(~{3,}).*)$/;
// Same shape as Python-Markdown's backtick pattern, so only real code spans are skipped.
const CODE_SPAN = /(?<![\\`])(`+)(?!`)(.+?)(?<!`)\1(?!`)/g;

// Returns why a Markdown body is refused, or null. scripts/user_notes.py
// sanitizes the built HTML again; this check gives the writer an early answer.
export function unsafeMarkdown(text) {
  const lines = text.split('\n'), outside = [];
  for (let i = 0; i < lines.length; i++) {
    const open = lines[i].match(FENCE_OPEN);
    if (open) {
      const mark = open[1] || open[2];
      const closing = new RegExp(`^ {0,3}\\${mark[0]}{${mark.length},}\\s*$`);
      const end = lines.findIndex((line, j) => j > i && closing.test(line));
      if (end !== -1) { i = end; continue; }
    }
    outside.push(lines[i].replace(CODE_SPAN, ''));
  }
  const rest = outside.join('\n');
  if (/<[A-Za-z!/?]/.test(rest)) return 'Raw HTML is not allowed in Markdown notes. Put code in backticks or a fenced code block.';
  if (/&(#|[A-Za-z][A-Za-z0-9]*;)/.test(rest)) return 'Character references such as &amp; or &#60; are only allowed inside code.';
  const targets = [...rest.matchAll(/\]\(\s*<?([^)]*)/g), ...rest.matchAll(/^ {0,3}\[[^\]]+\]:\s*<?(\S+)/gm)];
  if (targets.some(([, url]) => /^(javascript|vbscript|data):/i.test(url.replace(/[\u0000-\u0020]+/g, ''))))
    return 'javascript:, vbscript:, and data: links are not allowed.';
  return null;
}

export function validateNote({ title, body, format } = {}) {
  if (!FORMATS.includes(format)) throw problem(400, 'Choose Markdown or plain text.');
  if (typeof title !== 'string' || typeof body !== 'string') throw problem(400, 'A note needs a title and contents.');
  const cleanTitle = title.normalize('NFC').trim();
  if (!cleanTitle || [...cleanTitle].length > NOTE_LIMITS.title || /[\u0000-\u001f\u007f]/.test(cleanTitle))
    throw problem(400, `Enter a title on one line, up to ${NOTE_LIMITS.title} characters.`);
  // MkDocs puts the title into <title> without escaping.
  if (/[<>&"]/.test(cleanTitle)) throw problem(400, 'Titles cannot contain < > & or ".');
  const cleanBody = body.normalize('NFC').replace(/\r\n?/g, '\n').replace(/\s+$/u, '');
  if (!cleanBody.trim() || [...cleanBody].length > NOTE_LIMITS.body)
    throw problem(400, `Enter the contents, up to ${NOTE_LIMITS.body.toLocaleString('en')} characters.`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(cleanBody)) throw problem(400, 'The contents include control characters.');
  if (format === 'md') {
    const reason = unsafeMarkdown(cleanBody);
    if (reason) throw problem(400, reason);
  }
  return { title: cleanTitle, body: cleanBody, format };
}

const escapeHtml = text => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const escapeInline = text => escapeHtml(text).replace(/[\\`*_{}[\]()#+\-.!|~]/g, '\\$&');

function fileNameFor(title, id, now) {
  const slug = title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'note';
  return `${new Date(now).toISOString().slice(2, 10).replaceAll('-', '')}-${slug}-${id.slice(0, 8)}.md`;
}

export const noteUrl = fileName => `/notes/${fileName.slice(0, -3)}/`;

export function noteMarkdown(note, author, approvedAt) {
  const content = note.format === 'md' ? note.body
    : `<div class="user-note-text" style="white-space: pre-wrap">${escapeHtml(note.body)}</div>`;
  return `---\nsos_user_note: true\n---\n\n# ${escapeInline(note.title)}\n\n${content}\n\n---\n\n` +
    `*Note by ${escapeInline(author)} · approved ${new Date(approvedAt).toISOString().slice(0, 10)}*\n`;
}

function authorName(dbFile, ownerId) {
  const user = connect(dbFile).prepare('SELECT username FROM argument_user WHERE id = ?').get(ownerId);
  return getIdentity(dbFile, ownerId)?.display_name || user?.username || 'Former account';
}

function writeNote(notesDir, fileName, content) {
  if (!FILE_NAME.test(fileName)) throw problem(500, 'Unexpected note file name.');
  mkdirSync(notesDir, { recursive: true });
  // A dotfile, so a concurrent MkDocs build never picks up the half-written copy.
  const temp = path.join(notesDir, `.${fileName}.tmp`);
  writeFileSync(temp, content, { mode: 0o644 });
  renameSync(temp, path.join(notesDir, fileName));
}

function removeNote(notesDir, fileName) {
  if (!FILE_NAME.test(fileName)) throw problem(500, 'Unexpected note file name.');
  rmSync(path.join(notesDir, fileName), { force: true });
}

const listFields = `n.id, n.title, n.format, n.status, n.revision, n.live, n.file_name AS fileName,
  n.created_at AS createdAt, n.updated_at AS updatedAt, n.published_at AS publishedAt, u.username`;
const withUrl = row => row && ({ ...row, live: !!row.live, url: row.live ? noteUrl(row.fileName) : null });

export function notesRoutes(dbFile, { clock = Date.now } = {}) {
  const router = Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  router.use(requireJsonWrite);
  router.use((req, res, next) => (req.method === 'POST' ? rateLimit(req, res, next) : next()));

  router.get('/published', (_req, res) => {
    const rows = connect(dbFile).prepare(`SELECT n.title, n.file_name AS fileName, n.owner_id AS ownerId, n.published_at AS publishedAt
      FROM note n WHERE n.live = 1 ORDER BY n.published_at DESC LIMIT 200`).all();
    res.json({ notes: rows.map(({ fileName, ownerId, ...row }) => ({ ...row, url: noteUrl(fileName), author: authorName(dbFile, ownerId) })) });
  });

  router.use(requireSession(dbFile));
  const isAdmin = req => req.user.role === 'admin';
  const findOwned = (req, id) => {
    const note = connect(dbFile).prepare(`SELECT ${listFields}, n.body, n.owner_id AS ownerId FROM note n
      LEFT JOIN argument_user u ON u.id = n.owner_id WHERE n.id = ?`).get(id);
    if (!note || (note.ownerId !== req.user.id && !isAdmin(req))) throw problem(404, 'Note not found.');
    return note;
  };

  router.get('/', (req, res) => {
    const all = req.query.all === '1' && isAdmin(req);
    const rows = connect(dbFile).prepare(`SELECT ${listFields} FROM note n LEFT JOIN argument_user u ON u.id = n.owner_id
      WHERE ? OR n.owner_id = ? ORDER BY n.updated_at DESC LIMIT 200`).all(all ? 1 : 0, req.user.id);
    res.json({ username: req.user.username, admin: isAdmin(req), notes: rows.map(withUrl) });
  });

  router.get('/:id', (req, res, next) => {
    try {
      const { ownerId, ...note } = findOwned(req, req.params.id);
      res.json(withUrl(note));
    } catch (error) { next(error); }
  });

  router.post('/', (req, res, next) => {
    try {
      const { requestKey } = req.body ?? {};
      if (typeof requestKey !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(requestKey)) throw problem(400, 'A valid retry key is required.');
      const note = validateNote(req.body), now = clock(), db = connect(dbFile);
      db.exec('BEGIN IMMEDIATE');
      try {
        const existing = db.prepare('SELECT id, title, body FROM note WHERE owner_id = ? AND request_key = ?').get(req.user.id, requestKey);
        if (existing) {
          db.exec('COMMIT');
          if (existing.title !== note.title || existing.body !== note.body) throw problem(409, 'This retry key belongs to another note.');
          return res.json({ id: existing.id, repeated: true });
        }
        const today = db.prepare('SELECT count(*) AS n FROM note WHERE owner_id = ? AND created_at >= ?').get(req.user.id, Math.floor(now / DAY) * DAY).n;
        if (today >= NOTE_LIMITS.perDay) throw problem(429, `You can create up to ${NOTE_LIMITS.perDay} notes per UTC day. Editing existing notes still works.`);
        const id = randomUUID();
        db.prepare(`INSERT INTO note (id, owner_id, request_key, file_name, title, body, format, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, req.user.id, requestKey, fileNameFor(note.title, id, now), note.title, note.body, note.format, now, now);
        db.exec('COMMIT');
        res.status(201).json({ id, status: 'pending', revision: 1 });
      } catch (error) {
        if (db.isTransaction) db.exec('ROLLBACK');
        throw error;
      }
    } catch (error) { next(error); }
  });

  router.post('/:id', (req, res, next) => {
    try {
      const current = findOwned(req, req.params.id);
      const { revision } = req.body ?? {};
      if (!Number.isInteger(revision)) throw problem(400, 'The note revision is required.');
      const note = validateNote(req.body);
      const changed = connect(dbFile).prepare(`UPDATE note SET title = ?, body = ?, format = ?, status = 'pending',
        revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ? RETURNING revision`)
        .get(note.title, note.body, note.format, clock(), current.id, revision);
      if (!changed) throw problem(409, 'This note changed in another tab or was reviewed. Reload it before saving.');
      res.json({ id: current.id, status: 'pending', revision: changed.revision, live: !!current.live });
    } catch (error) { next(error); }
  });

  router.use((error, _req, res, _next) => {
    if (!error.status) console.error(error);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Notes request failed.' });
  });
  return router;
}

// Mounted inside adminRoutes, after its requireAdmin guard.
export function adminNoteRoutes(router, dbFile, { notesDir = defaultNotesDir, rebuildSite }) {
  initializeNotes(dbFile);
  const from = 'FROM note n LEFT JOIN argument_user u ON u.id = n.owner_id';
  router.get('/notes', (req, res, next) => {
    try {
      const status = req.query.status ?? 'pending', order = req.query.order ?? 'oldest', search = req.query.search ?? '';
      const page = Number(req.query.page ?? 1), limit = Number(req.query.limit ?? 20);
      if (!['pending', 'published', 'rejected', 'removed', 'all'].includes(status) || !['oldest', 'newest'].includes(order) ||
        typeof search !== 'string' || search.length > 100 || !Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100)
        throw problem(400, 'Invalid note filter.');
      const db = connect(dbFile), direction = order === 'oldest' ? 'ASC' : 'DESC';
      const filter = "WHERE (?='all' OR n.status=?) AND (instr(lower(n.title),lower(?))>0 OR instr(lower(n.body),lower(?))>0)";
      const args = [status, status, search.trim(), search.trim()];
      const total = db.prepare(`SELECT count(*) AS n ${from} ${filter}`).get(...args).n;
      const rows = db.prepare(`SELECT ${listFields}, substr(n.body,1,200) AS excerpt ${from} ${filter}
        ORDER BY n.updated_at ${direction}, n.id ${direction} LIMIT ? OFFSET ?`).all(...args, limit, (page - 1) * limit);
      res.json({ notes: rows.map(withUrl), total, page, limit });
    } catch (error) { next(error); }
  });
  router.get('/notes/:id', (req, res, next) => {
    try {
      const row = connect(dbFile).prepare(`SELECT ${listFields}, n.body ${from} WHERE n.id = ?`).get(req.params.id);
      if (!row) throw problem(404, 'Note not found.');
      res.json(withUrl(row));
    } catch (error) { next(error); }
  });
  router.post('/notes/:id/review', (req, res, next) => {
    try {
      const { decision, revision, reason } = req.body ?? {};
      if (!['published', 'rejected', 'removed'].includes(decision) || !Number.isInteger(revision)) throw problem(400, 'Invalid note decision.');
      const note = operatorNote(reason, DEFAULT_REASONS.note[decision]);
      const touchedFile = atomicAdmin(dbFile, req.adminUser, (db, actor) => {
        const row = db.prepare('SELECT * FROM note WHERE id = ?').get(req.params.id);
        if (!row) throw problem(404, 'Note not found.');
        if (row.revision !== revision) throw problem(409, 'This note changed after you opened it. Reload before deciding.');
        const now = Date.now();
        if (decision === 'published') {
          writeNote(notesDir, row.file_name, noteMarkdown(row, authorName(dbFile, row.owner_id), now));
          db.prepare("UPDATE note SET status='published', live=1, published_at=?, revision=revision+1 WHERE id=?").run(now, row.id);
        } else if (decision === 'removed') {
          removeNote(notesDir, row.file_name);
          db.prepare("UPDATE note SET status='removed', live=0, revision=revision+1 WHERE id=?").run(row.id);
        } else {
          db.prepare("UPDATE note SET status='rejected', revision=revision+1 WHERE id=?").run(row.id);
        }
        audit(db, actor, 'note.review', 'note', row.id, { title: row.title, from: row.status, to: decision, reason: note });
        return decision !== 'rejected';
      });
      if (touchedFile) rebuildSite();
      res.json({ ok: true });
    } catch (error) { next(error); }
  });
}

export function noteCounts(dbFile) {
  initializeNotes(dbFile);
  const rows = connect(dbFile).prepare('SELECT status, count(*) AS n FROM note GROUP BY status').all();
  return Object.fromEntries(rows.map(row => [row.status, row.n]));
}
