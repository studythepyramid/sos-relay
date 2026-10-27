import {audit} from './audit.js';
export const AUTO_REASON = 'approved by auto';
export const AUTO_ACTOR = {id: 'system:auto-approval', username: 'Auto approval'};
export const DEFAULT_REASONS = {
  message: {reviewed: 'Reviewed by administrator.', rejected: 'Rejected by administrator.', pending: 'Returned to pending review.'},
  argument: {reviewed: 'Argument reviewed by administrator.', pending: 'Argument returned to pending review.'},
  user: {role: 'Updated user role.', access: 'Updated account access.', sessions: 'Signed out account sessions.', displayName: 'Updated display name.', password: 'Reset account password.', create: 'Created user account.'},
};
export function autoApproveAll(db) {
  return db.prepare("SELECT value FROM admin_settings WHERE key='auto_approve_all'").get()?.value === 'true';
}
export function automaticDetails(db, details) {
  return autoApproveAll(db) ? {...details, reason: AUTO_REASON, approval: 'auto_approve'} : details;
}
export function autoReview(db, type, id) {
  if (!autoApproveAll(db)) return false;
  const message = type === 'message';
  const table = message ? 'public_msg_review' : 'argument_review';
  const key = message ? 'message_id' : 'argument_id';
  const row = db.prepare(`SELECT decision,revision FROM ${table} WHERE ${key}=?`).get(id);
  // Rejected and already reviewed content is not changed by enabling the mode.
  if (row && row.decision !== 'pending') return false;
  db.prepare(`INSERT INTO ${table} (${key},decision,reviewed_by,reviewed_at,revision) VALUES (?,'reviewed',?,?,?)
    ON CONFLICT(${key}) DO UPDATE SET decision=excluded.decision,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at,revision=excluded.revision`)
    .run(id, AUTO_ACTOR.id, Date.now(), (row?.revision || 0) + 1);
  audit(db, AUTO_ACTOR, type + '.review', type, id, {from: 'pending', to: 'reviewed', reason: AUTO_REASON, approval: 'auto_approve'});
  return true;
}
export function approvePending(db) {
  const messages = db.prepare(`SELECT p.id FROM public_msg p LEFT JOIN public_msg_review r ON r.message_id=p.id WHERE COALESCE(r.decision,p.status)='pending'`).all();
  const arguments_ = db.prepare(`SELECT a.id FROM argument a LEFT JOIN argument_review r ON r.argument_id=a.id WHERE a.status='public' AND COALESCE(r.decision,'pending')='pending'`).all();
  let messagesCount = 0, argumentsCount = 0;
  for (const row of messages) if (autoReview(db, 'message', row.id)) messagesCount++;
  for (const row of arguments_) if (autoReview(db, 'argument', row.id)) argumentsCount++;
  return {messages: messagesCount, arguments: argumentsCount};
}
