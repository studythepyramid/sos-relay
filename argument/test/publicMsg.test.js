import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import { initialize, connect, closeAll } from '../src/db.js';
import { register, startSession } from '../src/auth.js';
import { initializePublicMsg, cleanupPublicMsg, publicMsgRoutes, countWords } from '../src/publicMsg.js';

test('private guest intake, retry safety, persistent quotas, account tier, and retention', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'public-msg-'));
  const dbFile = path.join(dir, 'test.db');
  initialize(dbFile);
  initializePublicMsg(dbFile);
  const DAY = 86400000;
  let now = Math.floor(Date.now() / DAY) * DAY + 3600000;
  const app = express();
  app.use(express.json({ limit: '64kb' }));
  app.use('/messages', publicMsgRoutes(dbFile, { clock: () => now }));
  const user = await register(dbFile, 'Tester', 'test-password-123');
  app.get('/test-login', (req, res) => { startSession(dbFile, user, req, res); res.json({ ok: true }); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const read = cookie => fetch(base + '/messages', { headers: { Cookie: cookie || '' } });
  const post = (cookie, body, key, extra = {}) => fetch(base + '/messages', {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-Argument-Request': '1', ...extra },
    body: JSON.stringify({ body, requestKey: key }),
  });
  const key = n => `retry-key-test-${String(n).padStart(8, '0')}`;
  try {
    const first = await read();
    const cookie = first.headers.get('set-cookie').split(';')[0];
    assert.match(first.headers.get('set-cookie'), /HttpOnly/);
    assert.equal(first.headers.get('cache-control'), 'no-store');
    const initial = await first.json();
    assert.equal(initial.quota.messages, 10);
    assert.equal(initial.quota.words, 3000);
    assert.equal(initial.location, null);
    assert.equal(initial.reference.length, 12);
    assert.notEqual(initial.reference, cookie.split('=')[1]);
    assert.ok(countWords('中国历史 English history') > 2);
    assert.equal((await post(cookie, 'test', key(0), { 'X-Argument-Request': '' })).status, 403);
    assert.equal((await post(cookie, 'x'.repeat(12001), key(0))).status, 400);
    const sent = await post(cookie, '<script>alert(1)</script> hello world', key(1));
    assert.equal(sent.status, 201);
    const result = await sent.json();
    assert.equal(result.status, 'pending');
    assert.equal((await post(cookie, '<script>alert(1)</script> hello world', key(1))).status, 200);
    assert.equal((await post(cookie, 'different', key(1))).status, 409);
    const fast = await post(cookie, 'message two', key(2));
    assert.equal(fast.status, 429);
    assert.ok(Number(fast.headers.get('retry-after')) > 0);
    const other = await read();
    assert.deepEqual((await other.json()).messages, []);
    now += 61000;
    assert.equal((await post(cookie, '<script>alert(1)</script> hello world', key(2))).status, 409);
    for (let n = 2; n <= 10; n++) {
      now += 61000;
      assert.equal((await post(cookie, `message ${n}`, key(n))).status, 201);
    }
    now += 61000;
    assert.equal((await post(cookie, 'eleventh', key(11))).status, 429);
    // New router/process memory cannot reset SQLite-backed message quotas.
    assert.equal((await (await read(cookie)).json()).quota.remainingMessages, 0);
    assert.equal(connect(dbFile).prepare('SELECT COUNT(*) AS n FROM public_msg').get().n, 10);
    const loggedIn = await fetch(base + '/test-login');
    const accountCookie = loggedIn.headers.getSetCookie().find(c => /Max-Age=2592000/.test(c)).split(';')[0];
    const account = await (await read(accountCookie)).json();
    assert.equal(account.registered, true);
    assert.equal(account.quota.messages, 20);
    assert.equal(account.quota.words, 6000);
    assert.deepEqual(account.messages, []);
    now = Math.floor(now / DAY) * DAY + DAY + 3600000;
    const allowance = await (await read(cookie)).json();
    assert.equal(allowance.quota.remainingMessages, 10);
    assert.equal((await post(cookie, 'a '.repeat(3001), key(12))).status, 429);
    assert.equal((await post(cookie, 'a '.repeat(3000), key(12))).status, 201);
    assert.equal((await (await read(cookie)).json()).quota.remainingWords, 0);
    assert.equal((await post(cookie, 'one more', key(13))).status, 429);
    // No raw network address is stored by this component.
    const network = connect(dbFile).prepare('SELECT fingerprint FROM public_msg_network').all();
    assert.ok(network.every(row => /^[a-f0-9]{64}$/.test(row.fingerprint)));
    connect(dbFile).prepare("UPDATE public_msg SET status = 'rejected' WHERE id = ?").run(result.id);
    cleanupPublicMsg(dbFile, now + 8 * DAY);
    assert.equal(connect(dbFile).prepare('SELECT 1 FROM public_msg WHERE id = ?').get(result.id), undefined);
    assert.equal(connect(dbFile).prepare('SELECT COUNT(*) AS n FROM public_msg_guest').get().n, 0);
    assert.equal(connect(dbFile).prepare('SELECT COUNT(*) AS n FROM public_msg_network').get().n, 0);
    assert.equal(connect(dbFile).prepare('SELECT COUNT(*) AS n FROM public_msg_network_key').get().n, 0);
    cleanupPublicMsg(dbFile, now + 31 * DAY);
    assert.equal(connect(dbFile).prepare('SELECT COUNT(*) AS n FROM public_msg').get().n, 0);
  } finally {
    await new Promise(resolve => server.close(resolve));
    closeAll();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('network guard bounds creation of fresh guest sessions', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'public-msg-network-'));
  const dbFile = path.join(dir, 'test.db');
  initialize(dbFile);
  initializePublicMsg(dbFile);
  const app = express();
  app.use('/messages', publicMsgRoutes(dbFile));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/messages`;
    for (let n = 0; n < 120; n++) assert.equal((await fetch(url)).status, 200);
    assert.equal((await fetch(url)).status, 429);
    assert.equal(connect(dbFile).prepare('SELECT COUNT(*) AS n FROM public_msg_guest').get().n, 120);
  } finally {
    await new Promise(resolve => server.close(resolve));
    closeAll();
    rmSync(dir, { recursive: true, force: true });
  }
});
