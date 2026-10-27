// Operator-only CLI. Never mounted on the web server or exposed as an API.
import {DatabaseSync} from 'node:sqlite';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';
import {dbPath} from './settings.js';

export function reviewMessages(file = dbPath, {status = 'pending', limit = 20, order = 'oldest'} = {}) {
  if (!['pending', 'reviewed', 'published', 'rejected', 'expired', 'all'].includes(status)) throw new Error('Invalid status');
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error('Limit must be between 1 and 200');
  if (!['oldest', 'newest'].includes(order)) throw new Error('Order must be oldest or newest');
  const direction = order === 'newest' ? 'DESC' : 'ASC';
  const db = new DatabaseSync(file, {readOnly: true});
  try {
    return db.prepare(`SELECT p.id, COALESCE(r.decision,p.status) AS status, p.kind, p.words, p.created_at AS createdAt,
      CASE WHEN r.reviewed_by='system:auto-approval' THEN 'auto_approve' END AS approval,
      CASE WHEN r.reviewed_by='system:auto-approval' THEN 'approved by auto' END AS reviewNote,
      CASE WHEN p.owner LIKE 'user:%' THEN 'account' ELSE 'guest' END AS senderType,
      u.username, p.body
      FROM public_msg p LEFT JOIN public_msg_review r ON r.message_id=p.id LEFT JOIN argument_user u ON p.owner = 'user:' || u.id
      WHERE (? = 'all' OR COALESCE(r.decision,p.status) = ?)
      ORDER BY p.created_at ${direction}, p.id ${direction} LIMIT ?`)
      .all(status, status, limit)
      .map(row => ({...row, createdAt: new Date(row.createdAt).toISOString()}));
  } finally { db.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const {values} = parseArgs({options: {
      status: {type: 'string', default: 'pending'}, limit: {type: 'string', default: '20'},
      order: {type: 'string', default: 'oldest'}, help: {type: 'boolean'},
    }});
    if (values.help) {
      console.log('Read-only inbox review\nUsage: node src/review-messages.js [--status pending|reviewed|published|rejected|expired|all] [--limit 1..200] [--order oldest|newest]\nOutputs private message data as JSON. Does not approve, reject, edit, or delete messages.');
    } else {
      const messages = reviewMessages(dbPath, {...values, limit: Number(values.limit)});
      // JSON escapes terminal control characters contained in untrusted messages.
      console.log(JSON.stringify({status: values.status, order: values.order, count: messages.length, messages}, null, 2));
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
