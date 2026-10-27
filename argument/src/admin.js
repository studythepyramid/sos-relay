import path from 'node:path';
import {siteDir} from './settings.js';
import {regenerateAll, regenerateThread} from './render.js';
import {randomUUID} from 'node:crypto';
import express from 'express';
import {connect, getIdentity, setDisplayName} from './db.js';
import {hashPassword, validateUsername} from './auth.js';
import {autoApproveAll, approvePending, DEFAULT_REASONS, AUTO_ACTOR, automaticDetails} from './approval.js';
import {rateLimit, requireJsonWrite} from './middleware.js';
import {requireAdmin, atomicAdmin, accessUser, activeAdmins, audit, changeRole, operatorNote, actionNote, problem} from './adminAccess.js';

export function adminHeaders(_req, res, next) {
  res.set('Cache-Control', 'no-store');
  res.set('Referrer-Policy', 'same-origin');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'");
  next();
}
export function adminPage(dbFile, directory) {
  const router = express.Router();
  router.use(adminHeaders, requireAdmin(dbFile, {page: true}), express.static(path.resolve(directory), {fallthrough: false}));
  return router;
}
function paging(query) {
  const page = query.page ?? '1', limit = query.limit ?? '20', search = query.search ?? '';
  if (typeof page !== 'string' || !/^\d+$/.test(page) || +page < 1 || +page > 100000 ||
      typeof limit !== 'string' || !/^\d+$/.test(limit) || +limit < 1 || +limit > 100 ||
      typeof search !== 'string' || search.length > 100) throw problem(400, 'Invalid pagination or search.');
  return {page: +page, limit: +limit, search: search.trim(), offset: (+page - 1) * +limit};
}
const userSelect = `SELECT u.id,u.username,u.created_at AS createdAt,
  COALESCE(i.display_name,u.username) AS displayName,COALESCE(a.role,'user') AS role,
  COALESCE(a.disabled,0) AS disabled,
  (SELECT count(*) FROM argument_session s WHERE s.user_id=u.id AND s.expires_at>?) AS sessions
  FROM argument_user u LEFT JOIN argument_identity i ON i.token=u.id
  LEFT JOIN argument_user_access a ON a.user_id=u.id`;
const messageFrom = `FROM public_msg p LEFT JOIN public_msg_review r ON r.message_id=p.id
  LEFT JOIN argument_user u ON p.owner='user:'||u.id`;
const messageFields = `p.id,p.created_at AS createdAt,p.words,p.kind,COALESCE(r.decision,p.status) AS status,
  u.username,CASE WHEN p.owner LIKE 'user:%' THEN 'account' ELSE 'guest' END AS senderType,
  COALESCE(r.revision,0) AS revision,r.reviewed_at AS reviewedAt,
  CASE WHEN r.reviewed_by='system:auto-approval' AND r.decision='reviewed' THEN 'auto_approve' END AS approval,
  CASE WHEN r.reviewed_by='system:auto-approval' AND r.decision='reviewed' THEN 'approved by auto' END AS reviewNote`;

export function adminRoutes(dbFile, {outputDir = siteDir} = {}) {
  const router = express.Router();
  router.use(adminHeaders, requireAdmin(dbFile), requireJsonWrite);
  router.use((req, res, next) => ['GET','HEAD'].includes(req.method) ? next() : rateLimit(req, res, next));
  router.get('/', (req, res) => {
    const db = connect(dbFile);
    const users = db.prepare(`SELECT count(*) AS total,sum(COALESCE(a.disabled,0)) AS disabled
      FROM argument_user u LEFT JOIN argument_user_access a ON a.user_id=u.id`).get();
    const messageCounts = db.prepare(`SELECT COALESCE(r.decision,p.status) AS status,count(*) AS count ${messageFrom} GROUP BY COALESCE(r.decision,p.status)`).all();
    const events = db.prepare('SELECT id,actor_name AS actorName,action,target_type AS targetType,target_id AS targetId,details_json,created_at AS createdAt FROM admin_audit ORDER BY id DESC LIMIT 15').all()
      .map(({details_json, ...row}) => ({...row, details: JSON.parse(details_json)}));
    const settings = db.prepare("SELECT value,revision FROM admin_settings WHERE key='auto_approve_all'").get();
    const argumentCounts = db.prepare("SELECT COALESCE(r.decision,'pending') AS status,count(*) AS n FROM argument a LEFT JOIN argument_review r ON r.argument_id=a.id WHERE a.status='public' GROUP BY COALESCE(r.decision,'pending')").all();
    res.json({settings: {auto_approve_all: settings?.value === 'true', revision: settings?.revision || 0}, defaultReasons: DEFAULT_REASONS, arguments: Object.fromEntries(argumentCounts.map(row => [row.status,row.n])), user: {id: req.adminUser.id, username: req.adminUser.username}, users: {...users, disabled: users.disabled || 0, admins: activeAdmins(db)}, messages: Object.fromEntries(messageCounts.map(row => [row.status, row.count])), events});
  });
  router.get('/settings', (_req, res) => {
    const row = connect(dbFile).prepare("SELECT value,revision FROM admin_settings WHERE key='auto_approve_all'").get();
    res.json({auto_approve_all: row?.value === 'true', revision: row?.revision || 0});
  });
  router.post('/settings', (req, res, next) => {
    try {
      const {auto_approve_all, revision, reason} = req.body ?? {};
      if (typeof auto_approve_all !== 'boolean' || !Number.isInteger(revision) || revision < 0) throw problem(400, 'Invalid approval setting.');
      const result = atomicAdmin(dbFile, req.adminUser, (db, actor) => {
        const previous = db.prepare("SELECT value,revision FROM admin_settings WHERE key='auto_approve_all'").get();
        if ((previous?.revision || 0) !== revision) throw problem(409, 'Approval settings changed in another tab. Reload before changing them.');
        db.prepare(`INSERT INTO admin_settings (key,value,revision,updated_by,updated_at) VALUES ('auto_approve_all',?,?,?,?)
          ON CONFLICT(key) DO UPDATE SET value=excluded.value,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
          .run(String(auto_approve_all), revision + 1, actor.id, Date.now());
        const counts = auto_approve_all ? approvePending(db) : {messages: 0, arguments: 0};
        audit(db, actor, 'settings.auto_approve_all', 'setting', 'auto_approve_all', {
          from: previous?.value === 'true', to: auto_approve_all, ...counts,
          reason: operatorNote(reason, auto_approve_all ? 'Enabled automatic approval.' : 'Disabled automatic approval.'),
        });
        return {auto_approve_all, revision: revision + 1, approved: counts};
      });
      if (result.approved.arguments) regenerateAll(dbFile, outputDir);
      res.json(result);
    } catch (error) { next(error); }
  });
  router.get('/users', (req, res, next) => {
    try {
      const p = paging(req.query), db = connect(dbFile);
      const filter = 'WHERE instr(lower(u.username),lower(?))>0 OR instr(lower(COALESCE(i.display_name,u.username)),lower(?))>0';
      const rows = db.prepare(`${userSelect} ${filter} ORDER BY u.created_at DESC,u.username COLLATE NOCASE LIMIT ? OFFSET ?`).all(Date.now(), p.search, p.search, p.limit, p.offset);
      const total = db.prepare(`SELECT count(*) AS n FROM argument_user u LEFT JOIN argument_identity i ON i.token=u.id ${filter}`).get(p.search, p.search).n;
      res.json({users: rows, page: p.page, limit: p.limit, total});
    } catch (error) { next(error); }
  });
  router.post('/users', async (req, res, next) => {
    try {
      const {username, password, displayName, reason} = req.body ?? {};
      const note = operatorNote(reason, DEFAULT_REASONS.user.create); validateUsername(username);
      if (displayName != null && (typeof displayName !== 'string' || !displayName.trim() || displayName.length > 40)) throw problem(400, 'Display name must contain 1–40 characters.');
      const {passwordHash, salt} = await hashPassword(password);
      const result = atomicAdmin(dbFile, req.adminUser, (db, actor) => {
        if (db.prepare('SELECT 1 FROM argument_user WHERE username=?').get(username)) throw problem(400, 'Username already exists.');
        const id = randomUUID(), now = new Date().toISOString();
        db.prepare('INSERT INTO argument_user (id,username,password_hash,password_salt,created_at) VALUES (?,?,?,?,?)').run(id, username, passwordHash, salt, now);
        db.prepare('INSERT INTO argument_identity VALUES (?,?,?,?)').run(id, displayName?.trim() || username, now, now);
        audit(db, actor, 'user.create', 'user', id, automaticDetails(db, {username, reason: note}));
        return {id, username};
      });
      res.status(201).json(result);
    } catch (error) { next(error); }
  });
  router.post('/users/:id', async (req, res, next) => {
    try {
      const {action, reason} = req.body ?? {}, note = operatorNote(reason, DEFAULT_REASONS.user[action] || 'Updated account.');
      let credentials;
      if (action === 'password') credentials = await hashPassword(req.body.password);
      const result = atomicAdmin(dbFile, req.adminUser, (db, actor) => {
        const target = accessUser(db, req.params.id);
        if (!target) throw problem(404, 'Account not found.');
        const details = automaticDetails(db, {username: target.username, reason: note});
        if (action === 'role') {
          changeRole(db, actor, target, req.body.role, note);
        } else if (action === 'access') {
          const disabled = req.body.disabled;
          if (typeof disabled !== 'boolean') throw problem(400, 'Invalid account state.');
          if (disabled && target.id === actor.id) throw problem(400, 'You cannot disable your own account.');
          if (disabled && target.role === 'admin' && !target.disabled && activeAdmins(db) <= 1) throw problem(400, 'Keep at least one active administrator.');
          db.prepare(`INSERT INTO argument_user_access (user_id,role,disabled,updated_at) VALUES (?,'user',?,?)
            ON CONFLICT(user_id) DO UPDATE SET disabled=excluded.disabled,updated_at=excluded.updated_at`).run(target.id, +disabled, new Date().toISOString());
          if (disabled) db.prepare('DELETE FROM argument_session WHERE user_id=?').run(target.id);
          audit(db, actor, 'user.access', 'user', target.id, {...details, disabled});
        } else if (action === 'sessions') {
          db.prepare('DELETE FROM argument_session WHERE user_id=?').run(target.id);
          audit(db, actor, 'user.sessions', 'user', target.id, details);
        } else if (action === 'displayName') {
          const from = getIdentity(dbFile, target.id)?.display_name || target.username;
          setDisplayName(dbFile, target.id, req.body.displayName);
          audit(db, actor, 'user.displayName', 'user', target.id, {...details, from, to: req.body.displayName.trim()});
        } else if (action === 'password') {
          db.prepare('UPDATE argument_user SET password_hash=?,password_salt=? WHERE id=?').run(credentials.passwordHash, credentials.salt, target.id);
          db.prepare('DELETE FROM argument_session WHERE user_id=?').run(target.id);
          audit(db, actor, 'user.password', 'user', target.id, details);
        } else throw problem(400, 'Unknown account action.');
        return {ok: true, signedOut: target.id === actor.id && ['sessions','password'].includes(action)};
      });
      res.json(result);
    } catch (error) { next(error); }
  });
  router.get('/arguments', (req, res, next) => {
    try {
      const p = paging(req.query), status = req.query.status ?? 'pending', order = req.query.order ?? 'oldest';
      if (!['pending','reviewed','all'].includes(status) || !['oldest','newest'].includes(order)) throw problem(400, 'Invalid argument filter.');
      const db = connect(dbFile), direction = order === 'oldest' ? 'ASC' : 'DESC';
      const from = `FROM argument a LEFT JOIN argument_review r ON r.argument_id=a.id JOIN argument_node n ON n.id=a.root_node_id`;
      const filter = `WHERE a.status='public' AND (?='all' OR COALESCE(r.decision,'pending')=?) AND (instr(lower(a.title),lower(?))>0 OR instr(lower(n.body),lower(?))>0)`;
      const args = [status,status,p.search,p.search];
      const total = db.prepare(`SELECT count(*) AS n ${from} ${filter}`).get(...args).n;
      const rows = db.prepare(`SELECT a.id,a.slug,a.title,a.created_at AS createdAt,n.body,n.author_label AS author,
        COALESCE(r.decision,'pending') AS status,COALESCE(r.revision,0) AS revision,
        CASE WHEN r.reviewed_by='system:auto-approval' THEN 'auto_approve' END AS approval,
        CASE WHEN r.reviewed_by='system:auto-approval' THEN 'approved by auto' END AS reviewNote
        ${from} ${filter} ORDER BY a.created_at ${direction},a.id ${direction} LIMIT ? OFFSET ?`).all(...args,p.limit,p.offset);
      res.json({arguments: rows, total, page: p.page, limit: p.limit});
    } catch (error) { next(error); }
  });
  router.post('/arguments/:id/review', (req, res, next) => {
    try {
      const {decision, revision, reason} = req.body ?? {};
      if (!['pending','reviewed'].includes(decision) || !Number.isInteger(revision) || revision < 0) throw problem(400, 'Invalid argument review.');
      atomicAdmin(dbFile, req.adminUser, (db, actor) => {
        const row = db.prepare("SELECT a.id,COALESCE(r.decision,'pending') AS status,COALESCE(r.revision,0) AS revision FROM argument a LEFT JOIN argument_review r ON r.argument_id=a.id WHERE a.id=? AND a.status='public'").get(req.params.id);
        if (!row) throw problem(404, 'Argument not found.');
        if (row.revision !== revision) throw problem(409, 'Another reviewer changed this argument. Reload before deciding.');
        const automatic = autoApproveAll(db);
        if (automatic && decision === 'pending') throw problem(400, 'Turn off automatic approval before returning an argument to pending.');
        const note = actionNote(db, reason, DEFAULT_REASONS.argument[decision]);
        db.prepare(`INSERT INTO argument_review (argument_id,decision,reviewed_by,reviewed_at,revision) VALUES (?,?,?,?,?)
          ON CONFLICT(argument_id) DO UPDATE SET decision=excluded.decision,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at,revision=excluded.revision`)
          .run(row.id, decision, automatic ? AUTO_ACTOR.id : actor.id, Date.now(), revision + 1);
        audit(db, actor, 'argument.review', 'argument', row.id, automaticDetails(db, {from: row.status, to: decision, reason: note}));
      });
      const argument = connect(dbFile).prepare('SELECT slug FROM argument WHERE id=?').get(req.params.id);
      regenerateThread(dbFile, argument.slug, outputDir);
      res.json({ok: true});
    } catch (error) { next(error); }
  });
  router.get('/messages', (req, res, next) => {
    try {
      const p = paging(req.query), status = req.query.status ?? 'pending', order = req.query.order ?? 'oldest';
      if (!['pending','reviewed','rejected','published','expired','all'].includes(status) || !['oldest','newest'].includes(order)) throw problem(400, 'Invalid message filter.');
      const db = connect(dbFile), direction = order === 'oldest' ? 'ASC' : 'DESC';
      const filter = "WHERE (?='all' OR COALESCE(r.decision,p.status)=?) AND instr(lower(p.body),lower(?))>0";
      const args = [status, status, p.search];
      const total = db.prepare(`SELECT count(*) AS n ${messageFrom} ${filter}`).get(...args).n;
      const rows = db.prepare(`SELECT ${messageFields},substr(p.body,1,200) AS excerpt ${messageFrom} ${filter} ORDER BY p.created_at ${direction},p.id ${direction} LIMIT ? OFFSET ?`).all(...args, p.limit, p.offset);
      res.json({messages: rows, total, page: p.page, limit: p.limit});
    } catch (error) { next(error); }
  });
  router.get('/messages/:id', (req, res, next) => {
    try {
      const row = connect(dbFile).prepare(`SELECT ${messageFields},p.body ${messageFrom} WHERE p.id=?`).get(req.params.id);
      if (!row) throw problem(404, 'Message no longer available.');
      res.json(row);
    } catch (error) { next(error); }
  });
  router.post('/messages/:id/review', (req, res, next) => {
    try {
      const {decision, revision, reason} = req.body ?? {};
      if (!['pending','reviewed','rejected'].includes(decision) || !Number.isInteger(revision) || revision < 0) throw problem(400, 'Invalid decision or message revision.');
      atomicAdmin(dbFile, req.adminUser, (db, actor) => {
        const note = actionNote(db, reason, DEFAULT_REASONS.message[decision]);
        const automatic = autoApproveAll(db);
        if (automatic && decision === 'pending') throw problem(400, 'Turn off automatic approval before returning a message to pending.');
        const row = db.prepare(`SELECT ${messageFields} ${messageFrom} WHERE p.id=?`).get(req.params.id);
        if (!row) throw problem(404, 'Message no longer available.');
        if (row.revision !== revision) throw problem(409, 'Another reviewer changed this message. Reload before deciding.');
        db.prepare(`INSERT INTO public_msg_review (message_id,decision,reviewed_by,reviewed_at,revision) VALUES (?,?,?,?,?)
          ON CONFLICT(message_id) DO UPDATE SET decision=excluded.decision,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at,revision=excluded.revision`)
          .run(row.id, decision, automatic && decision === 'reviewed' ? AUTO_ACTOR.id : actor.id, Date.now(), revision + 1);
        db.prepare('UPDATE public_msg SET status=? WHERE id=?').run(decision === 'rejected' ? 'rejected' : 'pending', row.id);
        audit(db, actor, 'message.review', 'message', row.id, automaticDetails(db, {from: row.status, to: decision, reason: note}));
      });
      res.json({ok: true});
    } catch (error) { next(error); }
  });
  router.use((error, _req, res, _next) => {
    const validation = /^(Username|Password|Display name)/.test(error.message);
    res.status(error.status || (validation ? 400 : 500)).json({error: error.status || validation ? error.message : 'Administration request failed.'});
  });
  return router;
}
