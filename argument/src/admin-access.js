import {initialize, connect, closeAll} from './db.js';
import {dbPath} from './settings.js';
import {accessUser, audit, changeRole} from './adminAccess.js';

try {
  const [action, username, ...extra] = process.argv.slice(2);
  if (extra.length || !['list','grant','revoke','enable'].includes(action) || (action !== 'list' && !username) || (action === 'list' && username)) {
    throw new Error('Usage: node src/admin-access.js list | grant USERNAME | revoke USERNAME | enable USERNAME');
  }
  initialize(dbPath);
  const db = connect(dbPath);
  if (action === 'list') {
    console.log(JSON.stringify(db.prepare(`SELECT u.username,a.role,a.disabled FROM argument_user_access a JOIN argument_user u ON u.id=a.user_id WHERE a.role='admin' ORDER BY u.username`).all(), null, 2));
  } else {
    db.exec('BEGIN IMMEDIATE');
    try {
      const id = db.prepare('SELECT id FROM argument_user WHERE username=?').get(username)?.id;
      const target = id && accessUser(db, id);
      if (!target) throw new Error('Account not found. Create it through /user/ first.');
      const actor = {id: 'ssh-operator', username: 'SSH operator'};
      if (action === 'enable') {
        db.prepare('UPDATE argument_user_access SET disabled=0,updated_at=? WHERE user_id=?').run(new Date().toISOString(), id);
        audit(db, actor, 'user.access', 'user', id, {username: target.username, disabled: false, reason: 'Explicit SSH recovery'});
      } else {
        if (action === 'grant' && target.disabled) throw new Error('Account is disabled. Enable it explicitly before granting access.');
        changeRole(db, actor, target, action === 'grant' ? 'admin' : 'user', 'Explicit SSH role command', {ssh: true});
      }
      db.exec('COMMIT'); console.log(`${action}: ${target.username}`);
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { closeAll(); }
