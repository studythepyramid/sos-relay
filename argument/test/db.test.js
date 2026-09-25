import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  initialize, createArgument, addReply, getArgument, listArguments,
  labelForToken, classifyRelation, closeAll,
} from '../src/db.js';

function tempDb() {
  const dir = mkdtempSync(path.join(tmpdir(), 'argument-test-'));
  return path.join(dir, 'test.db');
}

test('classifyRelation is the length-100 placeholder', () => {
  assert.equal(classifyRelation('short'), 'noise');
  assert.equal(classifyRelation('x'.repeat(101)), 'support');
});

test('labelForToken is deterministic', () => {
  assert.equal(labelForToken('same-token'), labelForToken('same-token'));
});

test('createArgument creates a thread with a root claim node', () => {
  const dbFile = tempDb();
  initialize(dbFile);
  const created = createArgument(dbFile, {
    title: 'Static typing catches more bugs',
    body: 'Because of X, Y, Z.',
    ownerToken: 'owner-token-123',
  });
  assert.match(created.slug, /^\d{6}-\d{2}-static-typing-catches-more-bugs-\d{4}$/);

  const argumentRow = getArgument(dbFile, created.slug);
  assert.equal(argumentRow.nodes.length, 1);
  assert.equal(argumentRow.nodes[0].relation, null); // root claim has no edge
  closeAll();
});

test('addReply creates a node and a classified edge', () => {
  const dbFile = tempDb();
  initialize(dbFile);
  const created = createArgument(dbFile, {
    title: 'Microservices reduce risk',
    body: 'Root claim body.',
    ownerToken: 'owner-a',
  });
  const argumentRow = getArgument(dbFile, created.slug);
  const rootId = argumentRow.nodes[0].id;

  const reply = addReply(dbFile, {
    slug: created.slug,
    toNodeId: rootId,
    body: 'A short reply.',
    authorToken: 'replier-b',
  });
  assert.equal(reply.relation, 'noise'); // under 100 bytes

  const after = getArgument(dbFile, created.slug);
  assert.equal(after.nodes.length, 2);
  const replyNode = after.nodes.find((n) => n.id === reply.nodeId);
  assert.equal(replyNode.relation, 'noise');
  assert.equal(replyNode.to_node_id, rootId);
  closeAll();
});

test('listArguments reflects participant counts and ordering', () => {
  const dbFile = tempDb();
  initialize(dbFile);
  const a = createArgument(dbFile, { title: 'Thread A', body: 'Claim A', ownerToken: 'owner-a' });
  createArgument(dbFile, { title: 'Thread B', body: 'Claim B', ownerToken: 'owner-b' });
  const rootA = getArgument(dbFile, a.slug).nodes[0].id;
  addReply(dbFile, { slug: a.slug, toNodeId: rootA, body: 'A reply that pushes thread A to the top.', authorToken: 'someone-else' });

  const rows = listArguments(dbFile);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].slug, a.slug); // most recent activity first
  assert.equal(rows[0].participants, 2);
  closeAll();
});

test('addReply rejects an unknown parent node', () => {
  const dbFile = tempDb();
  initialize(dbFile);
  const a = createArgument(dbFile, { title: 'Thread', body: 'Claim', ownerToken: 'owner-a' });
  assert.throws(() => addReply(dbFile, { slug: a.slug, toNodeId: 999999, body: 'x', authorToken: 't' }));
  closeAll();
});
