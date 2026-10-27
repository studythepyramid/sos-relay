import { Router } from 'express';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { connect } from './db.js';
import { cookieOptions, sessionUser } from './auth.js';
import {autoReview, AUTO_REASON} from './approval.js';
import { requireJsonWrite } from './middleware.js';

const DAY = 86400000;
const COOKIE = 'public_msg_session';
const digest = value => createHash('sha256').update(value).digest('hex');
const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
export const countWords = text => [...segmenter.segment(text)].filter(s => s.isWordLike).length;
export const limitsFor = registered => ({ messages: registered ? 20 : 10, words: registered ? 6000 : 3000 });

export function initializePublicMsg(dbFile) {
  const db = connect(dbFile);
  db.exec(`
    CREATE TABLE IF NOT EXISTS public_msg_guest (
      token_hash TEXT PRIMARY KEY, reference TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS public_msg (
      id TEXT PRIMARY KEY, owner TEXT NOT NULL, request_key TEXT NOT NULL,
      body TEXT NOT NULL, words INTEGER NOT NULL, body_hash TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'remark' CHECK(kind IN ('remark','sos')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','rejected','expired')),
      created_at INTEGER NOT NULL, UNIQUE(owner, request_key)
    );
    CREATE INDEX IF NOT EXISTS public_msg_owner_time ON public_msg(owner, created_at);
    CREATE TABLE IF NOT EXISTS public_msg_review (
      message_id TEXT PRIMARY KEY REFERENCES public_msg(id) ON DELETE CASCADE,
      decision TEXT NOT NULL CHECK(decision IN ('pending','reviewed','rejected')),
      reviewed_by TEXT NOT NULL, reviewed_at INTEGER NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS public_msg_quota (
      owner TEXT NOT NULL, day INTEGER NOT NULL, messages INTEGER NOT NULL,
      words INTEGER NOT NULL, PRIMARY KEY(owner, day)
    );
    CREATE TABLE IF NOT EXISTS public_msg_network_key (day INTEGER PRIMARY KEY, secret TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS public_msg_network (
      fingerprint TEXT NOT NULL, window INTEGER NOT NULL, hits INTEGER NOT NULL,
      expires_at INTEGER NOT NULL, PRIMARY KEY(fingerprint, window)
    );
  `);
  cleanupPublicMsg(dbFile);
}

export function cleanupPublicMsg(dbFile, now = Date.now()) {
  const db = connect(dbFile);
  db.prepare('DELETE FROM public_msg_guest WHERE expires_at <= ?').run(now);
  db.prepare('DELETE FROM public_msg_network WHERE expires_at <= ?').run(now);
  db.prepare('DELETE FROM public_msg_network_key WHERE day < ?').run(Math.floor(now / DAY) - 1);
  db.prepare('DELETE FROM public_msg_quota WHERE day < ?').run(Math.floor(now / DAY) - 1);
  db.prepare("DELETE FROM public_msg WHERE created_at < ? OR (status = 'rejected' AND created_at < ?)")
    .run(now - 30 * DAY, now - 7 * DAY);
}

function identity(dbFile, req, res, now) {
  const db = connect(dbFile);
  const user = sessionUser(dbFile, req);
  if (user) return { owner: 'user:' + user.id, registered: true, reference: 'account-' + digest(user.id).slice(0, 12), username: user.username };
  const token = (req.headers.cookie ?? '').split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  let row = /^[a-f0-9]{64}$/.test(token ?? '') && db.prepare('SELECT * FROM public_msg_guest WHERE token_hash = ? AND expires_at > ?').get(digest(token), now);
  if (!row) {
    const fresh = randomBytes(32).toString('hex');
    row = { token_hash: digest(fresh), reference: randomBytes(6).toString('hex'), expires_at: now + 7 * DAY };
    db.prepare('INSERT INTO public_msg_guest VALUES (?, ?, ?)').run(row.token_hash, row.reference, row.expires_at);
    res.cookie(COOKIE, fresh, { ...cookieOptions(req), maxAge: 7 * DAY });
  }
  return { owner: 'guest:' + row.token_hash, registered: false, reference: row.reference, username: null };
}

function quota(dbFile, person, now) {
  const db = connect(dbFile);
  const day = Math.floor(now / DAY);
  const used = db.prepare('SELECT messages, words FROM public_msg_quota WHERE owner = ? AND day = ?').get(person.owner, day) ?? { messages: 0, words: 0 };
  const limits = limitsFor(person.registered);
  const last = db.prepare('SELECT MAX(created_at) AS time FROM public_msg WHERE owner = ?').get(person.owner).time;
  return { ...limits, usedMessages: used.messages, usedWords: used.words, resetsAt: (day + 1) * DAY,
    retryAt: last ? last + 60000 : 0, remainingMessages: Math.max(0, limits.messages - used.messages), remainingWords: Math.max(0, limits.words - used.words) };
}

export function publicMsgRoutes(dbFile, { clock = Date.now } = {}) {
  const router = Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  router.use((req, res, next) => {
    const now = clock();
    cleanupPublicMsg(dbFile, now);
    const db = connect(dbFile);
    const day = Math.floor(now / DAY);
    db.prepare('INSERT OR IGNORE INTO public_msg_network_key VALUES (?, ?)').run(day, randomBytes(32).toString('hex'));
    const secret = db.prepare('SELECT secret FROM public_msg_network_key WHERE day = ?').get(day).secret;
    const fingerprint = createHmac('sha256', secret).update(req.ip || 'unknown').digest('hex');
    // Bound all intake API traffic, including session creation and invalid submissions.
    for (const [window, max, end] of [[Math.floor(now / 60000), 120, now + 120000], [-day - 1, 1000, (day + 2) * DAY]]) {
      const row = db.prepare(`INSERT INTO public_msg_network VALUES (?, ?, 1, ?)
        ON CONFLICT(fingerprint, window) DO UPDATE SET hits = hits + 1 RETURNING hits`).get(fingerprint, window, end);
      if (row.hits > max) {
        const retryAt = window >= 0 ? (window + 1) * 60000 : (day + 1) * DAY;
        return res.set('Retry-After', String(Math.max(1, Math.ceil((retryAt - now) / 1000))))
          .status(429).json({ error: 'This network has reached a temporary traffic limit. Shared networks may include other visitors.', retryAt });
      }
    }
    req.msgPerson = identity(dbFile, req, res, now);
    next();
  });
  router.use(requireJsonWrite);

  router.get('/', (req, res) => {
    const person = req.msgPerson;
    const messages = connect(dbFile).prepare(`SELECT p.id, p.body, p.words, COALESCE(r.decision,p.status) AS status, p.created_at AS createdAt, CASE WHEN r.reviewed_by='system:auto-approval' THEN 'auto_approve' END AS approval, CASE WHEN r.reviewed_by='system:auto-approval' THEN 'approved by auto' END AS reviewNote FROM public_msg p LEFT JOIN public_msg_review r ON r.message_id=p.id WHERE p.owner = ? ORDER BY p.created_at DESC, p.id DESC LIMIT 50`).all(person.owner);
    res.json({ ip: req.ip, location: null, reference: person.reference, registered: person.registered, username: person.username,
      quota: quota(dbFile, person, clock()), messages });
  });

  router.post('/', (req, res) => {
    const now = clock();
    const person = req.msgPerson;
    const { body, requestKey } = req.body ?? {};
    if (typeof body !== 'string' || !body.trim() || [...body].length > 12000) return res.status(400).json({ error: 'Enter plain text, up to 12,000 characters.' });
    if (typeof requestKey !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(requestKey)) return res.status(400).json({ error: 'A valid retry key is required.' });
    const text = body.trim().normalize('NFC');
    const words = countWords(text);
    const db = connect(dbFile);
    const hash = digest(text.replace(/\s+/gu, ' '));
    db.exec('BEGIN IMMEDIATE');
    try {
      const existing = db.prepare('SELECT id, body FROM public_msg WHERE owner = ? AND request_key = ?').get(person.owner, requestKey);
      if (existing) {
        db.exec('COMMIT');
        return existing.body === text ? res.json({ id: existing.id, repeated: true }) : res.status(409).json({ error: 'This retry key belongs to another message.' });
      }
      const q = quota(dbFile, person, now);
      const reject = (message, retryAt) => {
        db.exec('ROLLBACK');
        return res.set('Retry-After', String(Math.max(1, Math.ceil((retryAt - now) / 1000))))
          .status(429).json({ error: message, retryAt, quota: q });
      };
      if (q.remainingMessages === 0 || words > q.remainingWords) return reject('Daily message or word allowance reached. Create an account or log in for a larger allowance, or wait for the reset.', q.resetsAt);
      if (q.retryAt > now) return reject('Please wait 60 seconds between messages.', q.retryAt);
      if (db.prepare('SELECT 1 FROM public_msg WHERE owner = ? AND body_hash = ? AND created_at >= ?').get(person.owner, hash, now - DAY)) {
        db.exec('ROLLBACK');
        return res.status(409).json({ error: 'You already submitted this text in the last 24 hours.' });
      }
      const counts = db.prepare("SELECT COUNT(*) AS total, SUM(created_at >= ?) AS today FROM public_msg").get(Math.floor(now / DAY) * DAY);
      if (counts.total >= 5000 || counts.today >= 1000) return reject('The review inbox is temporarily full. Please try later.', now + 3600000);
      const id = randomUUID();
      db.prepare('INSERT INTO public_msg (id, owner, request_key, body, words, body_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, person.owner, requestKey, text, words, hash, now);
      const automaticallyReviewed = autoReview(db, 'message', id);
      db.prepare(`INSERT INTO public_msg_quota VALUES (?, ?, 1, ?)
        ON CONFLICT(owner, day) DO UPDATE SET messages = messages + 1, words = words + excluded.words`)
        .run(person.owner, Math.floor(now / DAY), words);
      db.exec('COMMIT');
      res.status(201).json({ id, status: automaticallyReviewed ? 'reviewed' : 'pending', approval: automaticallyReviewed ? 'auto_approve' : null, reviewNote: automaticallyReviewed ? AUTO_REASON : null, quota: quota(dbFile, person, now) });
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });
  return router;
}
