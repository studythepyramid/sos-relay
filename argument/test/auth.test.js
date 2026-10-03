import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import { initialize, connect, closeAll } from '../src/db.js';
import { userRoutes } from '../src/userRoutes.js';
import { requireSession, login } from '../src/auth.js';
import { newArgumentPage } from '../src/pageRoutes.js';
import { siteDir } from '../src/settings.js';

test('registration, authentication, CSRF guard, expiry, and logout', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'argument-auth-'));
  const dbFile = path.join(dir, 'test.db');
  initialize(dbFile);
  const app = express();
  app.use(express.json());
  app.use('/api/user', userRoutes(dbFile));
  app.use('/argument/new', newArgumentPage(dbFile, siteDir));
  app.post('/protected', requireSession(dbFile), (req, res) => res.json({ id: req.user.id }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const post = (url, data, headers = {}) => fetch(base + url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Argument-Request': '1', Cookie: cookie, ...headers }, body: JSON.stringify(data),
  });
  const page = url => fetch(base + url, { headers: { Cookie: cookie }, redirect: 'manual' });
  const credentials = { username: 'Alice', password: 'abcdefgh' };
  try {
    for (const url of ['/argument/new', '/argument/new/', '/argument/new/index.html']) {
      const response = await page(url);
      assert.equal(response.status, 302);
      assert.equal(response.headers.get('location'), '/user/?next=%2Fargument%2Fnew%2F');
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.doesNotMatch(await response.text(), /id="new-claim"/);
    }
    assert.equal((await post('/api/user/register', credentials, { 'X-Argument-Request': '' })).status, 403);
    assert.equal((await post('/protected', {}, { 'X-Argument-Token': 'legacy-token' })).status, 401);
    assert.equal((await post('/api/user/register', { ...credentials, password: 'abcdefg' })).status, 400);
    const registered = await post('/api/user/register', credentials);
    assert.equal(registered.status, 201);
    const cookies = registered.headers.getSetCookie();
    const session = cookies.find(c => /Max-Age=2592000/.test(c));
    assert.match(session, /HttpOnly/i);
    assert.match(session, /SameSite=Lax/i);
    cookie = session.split(';')[0];
    const account = connect(dbFile).prepare('SELECT * FROM argument_user').get();
    assert.notEqual(account.password_hash, credentials.password);
    const form = await page('/argument/new/');
    assert.equal(form.status, 200);
    assert.equal(form.headers.get('cache-control'), 'no-store');
    assert.match(await form.text(), /id="new-claim"/);
    assert.equal((await post('/protected', {})).status, 200);
    assert.equal((await post('/api/user/register', { ...credentials, username: 'alice' })).status, 400);
    assert.equal(await login(dbFile, 'Alice', 'wrong password'), null);
    assert.equal((await login(dbFile, 'alice', credentials.password)).id, account.id);
    assert.equal((await post('/api/user', { displayName: 'Alice Example' })).status, 200);
    assert.equal((await (await fetch(base + '/api/user', { headers: { Cookie: cookie } })).json()).displayName, 'Alice Example');
    connect(dbFile).prepare('UPDATE argument_session SET expires_at = 0').run();
    assert.equal((await page('/argument/new/')).status, 302);
    assert.equal((await post('/protected', {})).status, 401);
    const loggedIn = await post('/api/user/login', credentials);
    assert.equal(loggedIn.status, 200);
    cookie = loggedIn.headers.getSetCookie().find(c => /Max-Age=2592000/.test(c)).split(';')[0];
    assert.equal((await post('/protected', {})).status, 200);
    assert.equal((await post('/api/user/logout', {})).status, 200);
    assert.equal((await page('/argument/new/')).status, 302);
    assert.equal((await post('/protected', {})).status, 401);
  } finally {
    await new Promise(resolve => server.close(resolve));
    closeAll();
    rmSync(dir, { recursive: true, force: true });
  }
});
