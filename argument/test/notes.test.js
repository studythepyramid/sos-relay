import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import { initialize, connect, closeAll } from '../src/db.js';
import { register, startSession } from '../src/auth.js';
import { initializePublicMsg } from '../src/publicMsg.js';
import { accessUser, changeRole } from '../src/adminAccess.js';
import { adminRoutes } from '../src/admin.js';
import { initializeNotes, notesRoutes, unsafeMarkdown, validateNote, noteMarkdown } from '../src/notes.js';
import { repoRoot } from '../src/settings.js';

test('Markdown check refuses raw HTML, references, and script links outside real code', () => {
  for (const text of [
    'hi <img src=x onerror=alert(1)>',
    '<!-- hidden -->',
    '[x](jav&#97;script:alert(1))',
    '[x](javascript:alert(1))',
    '[x]( java\tscript:alert(1))',
    '[x]: data:text/html,boom',
    '`<img src=x onerror=alert(1)>``',
    '\\`<img src=x onerror=alert(1)>`',
    '```\n<img src=x onerror=alert(1)>',
    '``` a`b\n<b>x</b>\n```',
    'R&amp;D',
  ]) assert.ok(unsafeMarkdown(text), text);
  for (const text of [
    'Plain words, a < b, data: is fine in prose, R&D too.',
    'Inline `<b>bold</b>` and ``a`<i>`b`` code.',
    '```html\n<script>alert(1)</script>\n&amp;\n```',
    '~~~~\n<div>\n~~~~',
    '[site](https://sosweb.org/) and ![pic](/assets/site-icon.png)',
  ]) assert.equal(unsafeMarkdown(text), null, text);
  assert.throws(() => validateNote({ title: '</title><b>', body: 'x', format: 'txt' }), /cannot contain/);
  assert.throws(() => validateNote({ title: 'two\nlines', body: 'x', format: 'txt' }), /one line/);
  assert.throws(() => validateNote({ title: 't', body: '   ', format: 'txt' }), /contents/);
  assert.throws(() => validateNote({ title: 't', body: 'x', format: 'html' }), /Markdown or plain text/);
  assert.throws(() => validateNote({ title: 't', body: 'x'.repeat(100001), format: 'txt' }), /100,000/);
  assert.deepEqual(validateNote({ title: ' T ', body: 'a\r\nb  \n\n', format: 'txt' }), { title: 'T', body: 'a\nb', format: 'txt' });
  const plain = noteMarkdown({ title: '*T* [x](y)', body: '<script>x</script>\n\n# h', format: 'txt' }, '<b>za</b>', Date.UTC(2026, 10, 13));
  assert.match(plain, /^---\nsos_user_note: true\n---\n\n# \\\*T\\\* \\\[x\\\]\\\(y\\\)\n/);
  assert.match(plain, /<div class="user-note-text" style="white-space: pre-wrap">&lt;script&gt;x&lt;\/script&gt;\n\n# h<\/div>/);
  assert.match(plain, /Note by &lt;b&gt;za&lt;\/b&gt; · approved 2026-11-13/);
});

test('build hook rebuilds note HTML from an allow-list', { skip: !existsSync(path.join(repoRoot, '.venv/bin/python')) }, () => {
  const html = '<p>a<img src=x onerror=alert(1)><a href="jav&#97;script:x">l</a><script>bad()</script></p><div class="user-note-text" style="white-space: pre-wrap">&lt;b&gt;</div><svg><g onload=x></g></svg><h2 id="h">H<a class="headerlink" href="#h">¶</a></h2>';
  const run = spawnSync(path.join(repoRoot, '.venv/bin/python'), ['-c', 'import sys; from user_notes import sanitize; print(sanitize(sys.stdin.read()), end="")'],
    { input: html, env: { ...process.env, PYTHONPATH: path.join(repoRoot, 'scripts') }, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, '<p>a<img src="x"><a>l</a></p><div class="user-note-text" style="white-space: pre-wrap">&lt;b&gt;</div><h2 id="h">H<a class="headerlink" href="#h">¶</a></h2>');
});

test('only authors and admins edit; approval writes docs/notes and rebuilds; edits wait for review', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'sos-notes-'));
  const file = path.join(dir, 'test.db'), notesDir = path.join(dir, 'docs-notes');
  initialize(file); initializePublicMsg(file); initializeNotes(file);
  const owner = await register(file, 'Owner', 'owner-password');
  const member = await register(file, 'Member', 'member-password');
  const other = await register(file, 'Other', 'other-password');
  const db = connect(file);
  changeRole(db, { id: 'ssh-operator', username: 'SSH operator' }, accessUser(db, owner.id), 'admin', 'Bootstrap', { ssh: true });
  let builds = 0;
  const app = express();
  app.set('trust proxy', 'loopback');
  app.use('/api/notes', express.json({ limit: '512kb' }), notesRoutes(file));
  app.use(express.json());
  app.use('/api/admin', adminRoutes(file, { outputDir: path.join(dir, 'generated'), notesDir, rebuildSite: () => builds++ }));
  app.get('/test-session/:id', (req, res) => { startSession(file, accessUser(db, req.params.id), req, res); res.json({ ok: true }); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let ip = 0;
  const headers = cookie => ({ Cookie: cookie, 'X-Forwarded-For': `203.0.113.${(ip++ % 200) + 1}` });
  const read = (url, cookie = '') => fetch(base + url, { headers: headers(cookie) });
  const post = (url, data, cookie = '', extra = {}) => fetch(base + url, { method: 'POST',
    headers: { ...headers(cookie), 'Content-Type': 'application/json', 'X-Argument-Request': '1', ...extra }, body: JSON.stringify(data) });
  const session = async user => (await read('/test-session/' + user.id)).headers.getSetCookie().find(c => c.includes('Max-Age=2592000')).split(';')[0];
  const key = n => `note-retry-key-${String(n).padStart(6, '0')}`;
  try {
    const admin = await session(owner), writer = await session(member), stranger = await session(other);
    assert.equal((await read('/api/notes')).status, 401);
    assert.deepEqual(await (await read('/api/notes/published')).json(), { notes: [] });
    const draft = { title: 'Water points', body: 'First **draft**.', format: 'md' };
    assert.equal((await post('/api/notes', { ...draft, requestKey: key(1) })).status, 401);
    assert.equal((await post('/api/notes', { ...draft, requestKey: key(1) }, writer, { 'X-Argument-Request': '' })).status, 403);
    assert.equal((await post('/api/notes', { ...draft, body: '<b>x</b>', requestKey: key(1) }, writer)).status, 400);
    const created = await post('/api/notes', { ...draft, requestKey: key(1) }, writer);
    assert.equal(created.status, 201);
    const { id } = await created.json();
    assert.deepEqual(await (await post('/api/notes', { ...draft, requestKey: key(1) }, writer)).json(), { id, repeated: true });
    assert.equal((await post('/api/notes', { ...draft, body: 'other', requestKey: key(1) }, writer)).status, 409);
    assert.ok(!existsSync(notesDir), 'pending notes never reach docs/');

    assert.equal((await read('/api/notes/' + id, stranger)).status, 404);
    assert.equal((await post('/api/notes/' + id, { ...draft, revision: 1 }, stranger)).status, 404);
    assert.equal((await post('/api/notes/' + id, { ...draft, revision: 9 }, writer)).status, 409);
    const edited = await post('/api/notes/' + id, { ...draft, body: 'Second version.', revision: 1 }, writer);
    assert.equal((await edited.json()).revision, 2);
    assert.equal((await (await read('/api/notes', stranger)).json()).notes.length, 0);
    assert.equal((await (await read('/api/notes?all=1', stranger)).json()).notes.length, 0);
    assert.equal((await (await read('/api/notes?all=1', admin)).json()).notes.length, 1);

    assert.equal((await read('/api/admin/notes', writer)).status, 403);
    assert.equal((await (await read('/api/admin', admin)).json()).notes.pending, 1);
    assert.equal((await (await read('/api/admin/notes', admin)).json()).total, 1);
    assert.equal((await post(`/api/admin/notes/${id}/review`, { decision: 'published', revision: 1 }, admin)).status, 409);
    assert.equal((await post(`/api/admin/notes/${id}/review`, { decision: 'published', revision: 2, reason: 'Looks good' }, admin)).status, 200);
    assert.equal(builds, 1);
    const [fileName] = connect(file).prepare('SELECT file_name FROM note WHERE id=?').all(id).map(row => row.file_name);
    assert.match(fileName, /^\d{6}-water-points-[0-9a-f]{8}\.md$/);
    const page = path.join(notesDir, fileName);
    assert.match(readFileSync(page, 'utf8'), /^---\nsos_user_note: true\n---\n\n# Water points\n\nSecond version\.\n/);
    const listed = (await (await read('/api/notes/published')).json()).notes;
    assert.deepEqual(listed.map(note => [note.title, note.url, note.author]), [['Water points', `/notes/${fileName.slice(0, -3)}/`, 'Member']]);

    const latest = (await (await read('/api/notes/' + id, writer)).json()).revision;
    const pendingEdit = await (await post('/api/notes/' + id, { ...draft, body: 'Third version.', revision: latest }, writer)).json();
    assert.equal(pendingEdit.live, true);
    assert.match(readFileSync(page, 'utf8'), /Second version/, 'the approved version stays until the edit is approved');
    assert.equal((await post(`/api/admin/notes/${id}/review`, { decision: 'rejected', revision: pendingEdit.revision }, admin)).status, 200);
    assert.equal(builds, 1);
    assert.match(readFileSync(page, 'utf8'), /Second version/);
    const afterReject = (await (await read('/api/admin/notes/' + id, admin)).json());
    assert.deepEqual([afterReject.status, afterReject.live], ['rejected', true]);
    assert.equal((await post(`/api/admin/notes/${id}/review`, { decision: 'removed', revision: afterReject.revision }, admin)).status, 200);
    assert.equal(builds, 2);
    assert.ok(!existsSync(page));
    assert.deepEqual((await (await read('/api/notes/published')).json()).notes, []);
    const audit = connect(file).prepare("SELECT details_json FROM admin_audit WHERE action='note.review' ORDER BY id").all().map(row => JSON.parse(row.details_json));
    assert.deepEqual(audit.map(row => row.to), ['published', 'rejected', 'removed']);
    assert.equal(audit[0].reason, 'Looks good');

    const plainResponse = await post('/api/notes', { title: 'Code', body: '<script>alert(1)</script>', format: 'txt', requestKey: key(2) }, writer);
    const plain = await plainResponse.json();
    assert.equal((await post(`/api/admin/notes/${plain.id}/review`, { decision: 'published', revision: 1 }, admin)).status, 200);
    const plainFile = connect(file).prepare('SELECT file_name FROM note WHERE id=?').get(plain.id).file_name;
    assert.match(readFileSync(path.join(notesDir, plainFile), 'utf8'), /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);

    const insert = connect(file).prepare(`INSERT INTO note (id, owner_id, request_key, file_name, title, body, format, created_at, updated_at)
      VALUES (?, ?, ?, ?, 't', 'b', 'txt', ?, ?)`);
    for (let n = 3; n < 20; n++) insert.run('filler-' + n, member.id, key(n), `261113-filler-${String(n).padStart(8, '0')}.md`, Date.now(), Date.now());
    assert.equal((await post('/api/notes', { title: 'Twentieth', body: 'b', format: 'txt', requestKey: key(20) }, writer)).status, 201);
    assert.equal((await post('/api/notes', { title: 'One more', body: 'b', format: 'txt', requestKey: key(21) }, writer)).status, 429);
  } finally {
    await new Promise(resolve => server.close(resolve));
    closeAll();
    rmSync(dir, { recursive: true, force: true });
  }
});
