import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import express from 'express';
import {beltRoadRoutes} from '../src/beltRoad.js';
const fixture=()=>({id:'fictional-test',title:'Fictional test record',country:'Test country',summary:'Synthetic fixture',reported_on:'2026',source_classification:'suspected',location:{latitude:12,longitude:104,radius_m:2000,precision:'region',label:'Synthetic region'},sources:[{url:'https://example.org/report#page=10',title:'Synthetic source',publisher:'Test publisher',supports:'Synthetic claim'}]});
async function setup(t,create=true){
 const dir=mkdtempSync(path.join(tmpdir(),'belt-road-api-')),dbFile=path.join(dir,'data.db');let writer;
 if(create){writer=new DatabaseSync(dbFile);writer.exec('CREATE TABLE map_locations(id TEXT PRIMARY KEY,record_json TEXT NOT NULL,updated_at TEXT NOT NULL,hidden INTEGER DEFAULT 0)')}
 const app=express();app.use('/api/belt-road',beltRoadRoutes(dbFile));const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));if(writer)writer.close();rmSync(dir,{recursive:true,force:true})});
 return {writer,dbFile,url:`http://127.0.0.1:${server.address().port}/api/belt-road/locations`};
}
test('direct results appear immediately, preserving citations and excluding private fields',async t=>{
 const {writer,url}=await setup(t);const row={...fixture(),raw_text:'PRIVATE',reviewer:'PRIVATE'};row.location.private_notes='PRIVATE';row.sources[0].private_notes='PRIVATE';
 writer.prepare('INSERT INTO map_locations VALUES(?,?,?,0)').run(row.id,JSON.stringify(row),'2026-01-01');const response=await fetch(url);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 const data=await response.json();assert.equal(data.locations.length,1);assert.equal(data.locations[0].source_classification,'suspected');assert.equal(data.locations[0].sources[0].url,'https://example.org/report#page=10');assert(!JSON.stringify(data).includes('PRIVATE'));
 writer.prepare('UPDATE map_locations SET hidden=1 WHERE id=?').run(row.id);assert.equal((await(await fetch(url)).json()).locations.length,0);assert.equal((await fetch(url,{method:'POST'})).status,405);
});
test('missing DB fails without creating an empty file',async t=>{const {url,dbFile}=await setup(t,false);assert.equal((await fetch(url)).status,503);assert.equal(existsSync(dbFile),false)});
test('bounded reads signal remaining records',async t=>{const {writer,url}=await setup(t);const insert=writer.prepare('INSERT INTO map_locations VALUES(?,?,?,0)');for(let i=0;i<501;i++){const row={...fixture(),id:`fixture-${i}`};insert.run(row.id,JSON.stringify(row),'2026-01-01')}const data=await(await fetch(url)).json();assert.equal(data.locations.length,500);assert.equal(data.has_more,true)});
test('invalid source URLs fail closed without exposing SQLite details',async t=>{const {writer,url}=await setup(t);const row=fixture();row.sources[0].url='javascript:alert(1)';writer.prepare('INSERT INTO map_locations VALUES(?,?,?,0)').run(row.id,JSON.stringify(row),'2026-01-01');const response=await fetch(url);assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'Locations are temporarily unavailable. Try again.'})});
test('Python crawler result appears through Node API without import or publication',async t=>{
 const {dbFile,url}=await setup(t);
 const script=`import sys\nfrom pathlib import Path\nfrom unittest.mock import patch\nfrom crawl import connect,run\nfrom profiles import parse_tables\ndb=connect(sys.argv[1])\nsource={'id':'synthetic','publisher':'Synthetic publisher','allowed_hosts':['example.org'],'allowed_prefixes':['/'],'seeds':['https://example.org/report.pdf'],'link_terms':[],'profile_adapter':'synthetic'}\ntext='ANNEX II\\nINTERVENTIONS LIST\\nZZ01 12.1234,104.1234 Synthetic row'\nclass Fetcher:\n def permitted(self,*args):return True\n def fetch(self,url,*args):return url,'application/pdf',b'%PDF-synthetic'\nwith patch('crawl.extract_profiles',return_value=(parse_tables(text,include_locations=True),text)):\n result=run(db,[source],Fetcher(),limit=1,artifacts=Path(sys.argv[1]).parent/'artifacts')\n assert result['locations_added']==1,result\ndb.close()\n`;
 const result=spawnSync('python3',['-c',script,dbFile],{cwd:fileURLToPath(new URL('../../py/belt_road',import.meta.url)),encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 const data=await(await fetch(url)).json();assert.equal(data.locations.length,1);assert.equal(data.locations[0].id,'source-amnesty-kh-zz01');assert.equal(data.locations[0].sources[0].url,'https://example.org/report.pdf#page=159');assert.equal(data.locations[0].location.latitude,12.12);
});

test('unplaced reports remain public with their sources',async t=>{
 const {writer,url}=await setup(t); const row={...fixture(),location:null};
 writer.prepare('INSERT INTO map_locations VALUES(?,?,?,0)').run(row.id,JSON.stringify(row),'2026-01-01');
 const response=await fetch(url); assert.equal(response.status,200);
 const data=await response.json();assert.equal(data.locations[0].location,null);
 assert.equal(data.locations[0].sources[0].url,row.sources[0].url);
});
