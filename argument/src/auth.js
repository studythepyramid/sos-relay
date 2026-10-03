import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { connect } from './db.js';

const derive = promisify(scrypt);
const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const lifetime = 30 * 24 * 60 * 60 * 1000;
const hash = value => createHash('sha256').update(value).digest('hex');
export const sessionCookie = 'argument_session';
export const cookieOptions = req => ({
  httpOnly: true, secure: req.secure, sameSite: 'lax', path: '/',
});

export async function register(dbFile, username, password) {
  if (typeof username !== 'string' || !/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
    throw new Error('Username must be 3–32 letters, numbers, or underscores');
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw new Error('Password must be 8–128 characters');
  }
  const salt = randomBytes(16).toString('hex');
  const passwordHash = (await derive(password, salt, 64, options)).toString('hex');
  const db = connect(dbFile);
  const id = randomUUID();
  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO argument_user VALUES (?, ?, ?, ?, ?)').run(id, username, passwordHash, salt, now);
    db.prepare('INSERT INTO argument_identity VALUES (?, ?, ?, ?)').run(id, username, now, now);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    if (db.prepare('SELECT id FROM argument_user WHERE username = ?').get(username)) {
      throw new Error('Username is unavailable');
    }
    throw error;
  }
  return { id, username };
}

export async function login(dbFile, username, password) {
  if (typeof username !== 'string' || username.length > 32 || typeof password !== 'string' || password.length > 128) return null;
  const user = connect(dbFile).prepare('SELECT * FROM argument_user WHERE username = ?').get(username);
  const actual = await derive(password, user?.password_salt ?? '00000000000000000000000000000000', 64, options);
  const expected = user ? Buffer.from(user.password_hash, 'hex') : Buffer.alloc(64);
  if (!timingSafeEqual(actual, expected) || !user) return null;
  return { id: user.id, username: user.username };
}

function cookieToken(req) {
  return (req.headers.cookie ?? '').split(';').map(v => v.trim())
    .find(v => v.startsWith(sessionCookie + '='))?.slice(sessionCookie.length + 1);
}

export function logout(dbFile, req, res) {
  const token = cookieToken(req);
  if (token) connect(dbFile).prepare('DELETE FROM argument_session WHERE token_hash = ?').run(hash(token));
  res.clearCookie(sessionCookie, cookieOptions(req));
}

export function startSession(dbFile, user, req, res) {
  logout(dbFile, req, res);
  const token = randomBytes(32).toString('hex');
  const db = connect(dbFile);
  db.prepare('DELETE FROM argument_session WHERE expires_at <= ?').run(Date.now());
  db.prepare('INSERT INTO argument_session VALUES (?, ?, ?)').run(hash(token), user.id, Date.now() + lifetime);
  res.cookie(sessionCookie, token, { ...cookieOptions(req), maxAge: lifetime });
}

export function requireSession(dbFile, { loginRedirect } = {}) {
  return (req, res, next) => {
    const token = cookieToken(req);
    const user = token && connect(dbFile).prepare(`
      SELECT u.id, u.username FROM argument_session s
      JOIN argument_user u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?
    `).get(hash(token), Date.now());
    if (!user) {
      if (loginRedirect) return res.redirect(302, loginRedirect);
      return res.status(401).json({ error: 'Please register or log in at /user/ before posting.' });
    }
    req.user = user;
    req.argumentToken = user.id;
    next();
  };
}
