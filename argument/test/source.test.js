import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {initialize, connect, createArgument, getArgument, closeAll} from '../src/db.js';
import {normalizeSource, sourceReturnUrl} from '../src/source.js';
import {renderThread, regenerateAll} from '../src/render.js';

const source = {
  url: 'https://sosweb.org/history_notes/example/#section', title: 'History <notes>',
  quote: '中文 — فارسی <script>alert(1)</script>', prefix: 'Before', suffix: 'After',
  anchor: 'section', language: 'fa', capturedAt: '2026-10-26T12:00:00.000Z',
};
test('source attachments migrate existing data, persist independently, and escape output', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'argument-source-'));
  const file = path.join(directory, 'test.db');
  try {
    initialize(file);
    const old = createArgument(file, {title: 'Existing', body: 'An ordinary claim', ownerToken: 'owner'});
    // Simulate a pre-feature database, then run the idempotent migration twice.
    connect(file).exec("DROP TABLE argument_source; DELETE FROM schema_migrations WHERE component='argument' AND version=4");
    initialize(file); initialize(file);
    assert.equal(getArgument(file, old.slug).source, null);
    const created = createArgument(file, {title: 'A question', body: 'My own contribution', ownerToken: 'owner', source});
    const row = getArgument(file, created.slug);
    assert.equal(row.source.quote, source.quote);
    assert.equal(row.source.url, 'https://sosweb.org/history_notes/example/');
    assert.equal(row.nodes[0].body, 'My own contribution');
    const html = renderThread(row);
    assert.match(html, /History &lt;notes&gt;/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.ok(!html.includes(source.quote));
    assert.deepEqual(JSON.parse(decodeURIComponent(new URL(sourceReturnUrl(row.source)).hash.slice(13))), {
      quote: source.quote, prefix: source.prefix, suffix: source.suffix, anchor: source.anchor,
    });
    const count = connect(file).prepare('SELECT count(*) AS n FROM argument').get().n;
    assert.throws(() => createArgument(file, {title: 'Bad', body: 'Text', ownerToken: 'owner', source: {...source, url: 'https://evil.example/'}}));
    assert.throws(() => createArgument(file, {title: 'Bad', body: 'x'.repeat(4001), ownerToken: 'owner', source}));
    assert.equal(connect(file).prepare('SELECT count(*) AS n FROM argument').get().n, count);
    // A late insertion failure must roll back both thread and root node.
    connect(file).exec("CREATE TRIGGER reject_source BEFORE INSERT ON argument_source BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    assert.throws(() => createArgument(file, {title: 'Rollback', body: 'Text', ownerToken: 'owner', source}));
    assert.equal(connect(file).prepare('SELECT count(*) AS n FROM argument').get().n, count);
  } finally { closeAll(); rmSync(directory, {recursive: true, force: true}); }
});

test('source validation restricts URLs, lengths, and malformed snapshots', () => {
  for (const url of ['javascript:alert(1)', 'https://sosweb.org.evil.example/', 'https://user@sosweb.org/',
    'http://sosweb.org/', 'https://sosweb.org:8443/', 'https://sosweb.org/api/user', 'https://sosweb.org/my/private',
    'https://sosweb.org/tecNotes/.secret']) {
    assert.throws(() => normalizeSource({...source, url}), url);
  }
  for (const bad of [{quote: 'x'.repeat(2001)}, {quote: ''}, {capturedAt: 'not-a-date'}, {prefix: []}]) {
    assert.throws(() => normalizeSource({...source, ...bad}));
  }
  assert.equal(normalizeSource(null), null);
});

test('authenticated API publishes attachments and ordinary threads into an isolated output directory', async () => {
  const {default: express} = await import('express');
  const {argumentRoutes} = await import('../src/routes.js');
  const {userRoutes} = await import('../src/userRoutes.js');
  const {readFileSync} = await import('node:fs');
  const directory = mkdtempSync(path.join(tmpdir(), 'argument-source-api-'));
  const file = path.join(directory, 'test.db');
  const output = path.join(directory, 'site');
  initialize(file);
  const app = express(); app.use(express.json({limit: '48kb'}));
  app.use('/api/user', userRoutes(file));
  app.use('/api/argument', argumentRoutes(file, output));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const post = (route, body, header = '1') => fetch(base + route, {
    method: 'POST', headers: {'Content-Type': 'application/json', 'X-Argument-Request': header, Cookie: cookie},
    body: JSON.stringify(body),
  });
  try {
    const payload = {title: 'About this passage', body: 'What is the evidence?', source};
    assert.equal((await post('/api/argument', payload)).status, 401);
    const registered = await post('/api/user/register', {username: 'SourceTest', password: 'test-password'});
    assert.equal(registered.status, 201);
    cookie = registered.headers.getSetCookie().find(c => /Max-Age=2592000/.test(c)).split(';')[0];
    assert.equal((await post('/api/argument', payload, '')).status, 403);
    const invalid = await post('/api/argument', {...payload, source: {...source, url: 'https://example.org/'}});
    assert.equal(invalid.status, 400);
    assert.equal(connect(file).prepare('SELECT count(*) AS n FROM argument').get().n, 0);
    const posted = await post('/api/argument', payload);
    assert.equal(posted.status, 201);
    const created = await posted.json();
    assert.match(readFileSync(path.join(output, created.slug, 'index.html'), 'utf8'), /Quoted passage/);
    const ordinary = await post('/api/argument', {title: 'Ordinary thread', body: 'No attachment'});
    assert.equal(ordinary.status, 201);
    assert.equal(getArgument(file, (await ordinary.json()).slug).source, null);
    assert.match(readFileSync(path.join(output, 'index.html'), 'utf8'), /Ordinary thread/);
    regenerateAll(file, output);
    const index = readFileSync(path.join(output, 'index.html'), 'utf8');
    assert.match(index, /<a href="\/">sosweb\.org<\/a>/);
    assert.match(index, /<a href="\/argument\/" aria-current="page">argument<\/a>/);
    assert.match(readFileSync(path.join(output, created.slug, 'index.html'), 'utf8'), /Quoted passage/);
  } finally {
    await new Promise(resolve => server.close(resolve)); closeAll();
    rmSync(directory, {recursive: true, force: true});
  }
});
