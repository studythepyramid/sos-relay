import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { beltRoadRoutes } from '../src/beltRoad.js';

const fixture = () => ({ id: 'fictional-test', title: 'Fictional test record', country: 'Test country',
  summary: 'Synthetic test fixture only.', reported_on: '2025-01-01',
  current_status: 'Fictional test', communication: 'Synthetic test', collection_method: 'manual_seed',
  location: {latitude: 10, longitude: 20, precision: 'region', radius_m: 10000, label: 'Synthetic region', basis: 'Test geometry'},
  sources: [{url: 'https://example.org/source', title: 'Synthetic source', publisher: 'Test publisher',
    published_on: '2025-01-01', accessed_on: '2025-01-02', kind: 'victim_message_report', supports: 'Fixture'}] });

async function setup(t, create = true) {
  const dir = mkdtempSync(path.join(tmpdir(), 'belt-road-api-'));
  const dbFile = path.join(dir, 'catalog.db');
  let writer;
  if (create) {
    writer = new DatabaseSync(dbFile);
    writer.exec('CREATE TABLE br_cases(id TEXT PRIMARY KEY,draft_json TEXT,published_json TEXT,published_at TEXT,reviewed_by TEXT,review_note TEXT)');
  }
  const app = express(); app.use('/api/belt-road', beltRoadRoutes(dbFile));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    if (writer) writer.close();
    rmSync(dir, {recursive:true, force:true});
  });
  return { writer, dbFile, url: `http://127.0.0.1:${server.address().port}/api/belt-road/cases` };
}

test('API exposes only published snapshots and refreshes immediately after withdrawal', async t => {
  const {writer,url} = await setup(t);
  const record = {...fixture(), raw_message: 'PRIVATE', victim_name: 'PRIVATE', reviewer: 'PRIVATE'};
  record.location.private_notes = 'PRIVATE'; record.sources[0].private_notes = 'PRIVATE';
  writer.prepare('INSERT INTO br_cases VALUES(?,?,?,?,?,?)').run(record.id, '{"draft":"PRIVATE"}', JSON.stringify(record), '2025-01-03', 'PRIVATE', 'PRIVATE');
  writer.prepare('INSERT INTO br_cases VALUES(?,?,?,?,?,?)').run('unpublished', JSON.stringify(record), null, null, 'PRIVATE', 'PRIVATE');
  const response = await fetch(url);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  const data = await response.json();
  assert.equal(data.cases.length,1);
  assert.equal(data.has_more,false);
  assert.equal(data.cases[0].reviewed_at,'2025-01-03');
  assert(!JSON.stringify(data).includes('PRIVATE'));
  writer.prepare('UPDATE br_cases SET published_json=NULL WHERE id=?').run(record.id);
  assert.equal((await (await fetch(url)).json()).cases.length,0);
  assert.equal((await fetch(url,{method:'POST'})).status,405);
});

test('missing database gives 503 without creating a file', async t => {
  const {url,dbFile}=await setup(t,false);
  assert.equal((await fetch(url)).status,503);
  assert.equal(existsSync(dbFile),false);
});

test('bounded read signals additional results and never publishes draft rows', async t => {
  const {writer,url}=await setup(t);
  const insert=writer.prepare('INSERT INTO br_cases VALUES(?,?,?,?,?,?)');
  for(let i=0;i<501;i++) {
    const row={...fixture(),id:`fictional-test-${String(i).padStart(3,'0')}`};
    insert.run(row.id,'{}',JSON.stringify(row),'2025-01-03',null,null);
  }
  const data=await (await fetch(url)).json();
  assert.equal(data.cases.length,500); assert.equal(data.has_more,true);
});

test('invalid published source URLs fail closed without leaking storage errors', async t => {
  const {writer,url}=await setup(t);
  const row=fixture();row.sources[0].url='javascript:alert(1)';
  writer.prepare('INSERT INTO br_cases VALUES(?,?,?,?,?,?)').run(row.id,'{}',JSON.stringify(row),'2025-01-03',null,null);
  const response=await fetch(url);assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{error:'Published reports are temporarily unavailable. Try again.'});
});

test('discovery projection is separate, read-only and excludes private fields', async t => {
  const {writer,url} = await setup(t);
  const endpoint = url.replace('/cases', '/discoveries');
  assert.deepEqual((await (await fetch(endpoint)).json()).discoveries, []);
  writer.exec('CREATE TABLE br_discoveries(id TEXT PRIMARY KEY,public_json TEXT,published_at TEXT)');
  const row = {id:'synthetic:ZZ01',site_code:'ZZ01',country:'Fictional country',
    classification:'source_suspected',review_status:'needs_review',message_evidence:'not_assessed',
    location:{latitude:12,longitude:104,radius_m:2000,private_notes:'PRIVATE'},
    pdf_page:10,source_url:'https://example.org/report.pdf',publisher:'Synthetic publisher',
    source_title:'Synthetic report',section:'Annex III',raw_text:'PRIVATE'};
  writer.prepare('INSERT INTO br_discoveries VALUES(?,?,?)').run(row.id,JSON.stringify(row),'2026-01-01');
  const response = await fetch(endpoint);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  const data = await response.json();
  assert.equal(data.discoveries.length,1);
  assert.equal(data.discoveries[0].classification,'source_suspected');
  assert(!JSON.stringify(data).includes('PRIVATE'));
  assert.equal((await (await fetch(url)).json()).cases.length,0);
  assert.equal((await fetch(endpoint,{method:'POST'})).status,405);
  row.source_url='javascript:alert(1)';
  writer.prepare('UPDATE br_discoveries SET public_json=?').run(JSON.stringify(row));
  assert.equal((await fetch(endpoint)).status,503);
});
