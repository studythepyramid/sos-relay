import {connect} from './db.js';
import {sessionUser} from './auth.js';
import {audit} from './audit.js';
import {autoApproveAll, AUTO_REASON, automaticDetails} from './approval.js';
export {audit} from './audit.js';

export function problem(status, message) { return Object.assign(new Error(message), {status}); }
export function accessUser(db, id) {
  return db.prepare(`SELECT u.id,u.username,COALESCE(a.role,'user') AS role,COALESCE(a.disabled,0) AS disabled
    FROM argument_user u LEFT JOIN argument_user_access a ON a.user_id=u.id WHERE u.id=?`).get(id);
}
export function activeAdmins(db) {
  return db.prepare("SELECT count(*) AS n FROM argument_user_access WHERE role='admin' AND disabled=0").get().n;
}
export function requireAdmin(dbFile, {page = false} = {}) {
  return (req, res, next) => {
    const user = sessionUser(dbFile, req);
    if (!user) return page ? res.redirect(302, '/user/?next=%2Fadmin%2F') : res.status(401).json({error: 'Log in to access administration.'});
    if (user.role !== 'admin') return page
      ? res.status(403).type('html').send('<!doctype html><title>Admin access required</title><h1>Admin access required</h1><p>This account has no administrator access.</p><a href="/user/">Your account</a> · <a href="/">SOS Relay home</a>')
      : res.status(403).json({error: 'Administrator access required.'});
    req.adminUser = user;
    next();
  };
}
export function atomicAdmin(dbFile, actor, work) {
  const db = connect(dbFile); db.exec('BEGIN IMMEDIATE');
  try {
    const current = accessUser(db, actor.id);
    if (!current || current.disabled || current.role !== 'admin') throw problem(403, 'Administrator access changed. Please reload.');
    const result = work(db, current); db.exec('COMMIT'); return result;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function operatorNote(value, fallback = 'Approved by administrator.') {
  if (value == null || (typeof value === 'string' && !value.trim())) return fallback;
  if (typeof value !== 'string' || !value.trim() || value.length > 500) throw problem(400, 'Enter an operator note, up to 500 characters.');
  return value.trim();
}
export function actionNote(db, value, fallback) {
  return autoApproveAll(db) ? AUTO_REASON : operatorNote(value, fallback);
}
export function changeRole(db, actor, target, role, reason, {ssh = false} = {}) {
  if (!['user', 'admin'].includes(role)) throw problem(400, 'Invalid role.');
  if (!ssh && target.id === actor.id && role !== 'admin') throw problem(400, 'You cannot remove your own admin access.');
  if (target.role === 'admin' && !target.disabled && role !== 'admin' && activeAdmins(db) <= 1) throw problem(400, 'Keep at least one active administrator.');
  db.prepare(`INSERT INTO argument_user_access (user_id,role,disabled,updated_at) VALUES (?,?,0,?)
    ON CONFLICT(user_id) DO UPDATE SET role=excluded.role,updated_at=excluded.updated_at`)
    .run(target.id, role, new Date().toISOString());
  audit(db, actor, 'user.role', 'user', target.id, automaticDetails(db, {username: target.username, from: target.role, to: role, reason}));
}
export function cleanupAdminAudit(dbFile, now = Date.now()) {
  connect(dbFile).prepare('DELETE FROM admin_audit WHERE created_at < ?').run(now - 90 * 86400000);
}
