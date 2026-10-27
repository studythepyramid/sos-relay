import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {initialize, connect, closeAll} from '../src/db.js';
import {initializePublicMsg} from '../src/publicMsg.js';
import {reviewMessages} from '../src/review-messages.js';

test('operator review filters and orders messages without exposing internal identifiers or mutating data', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'public-msg-review-'));
  const file = path.join(directory, 'test.db');
  try {
    initialize(file); initializePublicMsg(file);
    const db = connect(file);
    db.prepare('INSERT INTO argument_user VALUES (?, ?, ?, ?, ?)').run('account-id', 'Example', 'private-hash', 'private-salt', '2026-10-26');
    const insert = db.prepare('INSERT INTO public_msg (id, owner, request_key, body, words, body_hash, status, created_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)');
    insert.run('a', 'guest:private-token', 'private-key-a', 'Old pending', 'private-body-hash-a', 'pending', 1000);
    insert.run('b', 'user:account-id', 'private-key-b', 'New pending', 'private-body-hash-b', 'pending', 2000);
    insert.run('c', 'guest:other-private-token', 'private-key-c', 'Rejected', 'private-body-hash-c', 'rejected', 3000);
    const before = db.prepare('SELECT * FROM public_msg ORDER BY id').all();
    assert.deepEqual(reviewMessages(file).map(row => row.id), ['a', 'b']);
    const newest = reviewMessages(file, {status: 'all', order: 'newest', limit: 2});
    assert.deepEqual(newest.map(row => row.id), ['c', 'b']);
    assert.equal(newest[1].username, 'Example');
    assert.equal(newest[1].senderType, 'account');
    assert.equal(newest[0].senderType, 'guest');
    assert.equal(newest[1].createdAt, '1970-01-01T00:00:02.000Z');
    assert.ok(!JSON.stringify(newest).includes('private-'));
    assert.deepEqual(db.prepare('SELECT * FROM public_msg ORDER BY id').all(), before);
    for (const options of [{status: 'invalid'}, {limit: 0}, {limit: 201}, {order: 'bad'}]) {
      assert.throws(() => reviewMessages(file, options));
    }
    const missing = path.join(directory, 'missing.db');
    assert.throws(() => reviewMessages(missing));
    assert.equal(existsSync(missing), false);
  } finally { closeAll(); rmSync(directory, {recursive: true, force: true}); }
});
