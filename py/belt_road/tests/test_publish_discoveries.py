"""Migration/integration checks for the replacement of the old publication step."""
import json
from pathlib import Path
import sqlite3
import tempfile
import time
import unittest
from unittest.mock import patch
from crawl import connect, run, crawl_lock
from migrate import migrate
from profiles import parse_tables, save_cases
from store import save_location
from test_crawl import SOURCE, FakeFetcher

TABLE = 'ANNEX II\nINTERVENTIONS LIST\nZZ01 12.1234,104.1234 Synthetic\fANNEX III\nSUSPICIOUS LOCATIONS\nYY01 12.5678,104.5678 Synthetic'


class SimplePipelineTests(unittest.TestCase):
    def test_crawl_writes_map_without_publication_and_deduplicates(self):
        class PdfFetcher(FakeFetcher):
            def fetch(self, url, source):
                self.calls.append(url)
                return url, 'application/pdf', b'%PDF-synthetic'
        with tempfile.TemporaryDirectory() as tmp:
            db = connect(Path(tmp)/'data.db')
            rows = parse_tables(TABLE, include_locations=True)
            source = {**SOURCE, 'profile_adapter': 'synthetic-test'}
            fetcher = PdfFetcher()
            with patch('crawl.extract_profiles', return_value=(rows,TABLE)):
                counts=run(db,[source],fetcher,limit=1,artifacts=Path(tmp)/'artifacts')
                self.assertEqual(counts['locations_added'],2)
                self.assertEqual(db.execute('SELECT count(*) FROM map_locations').fetchone()[0],2)
                self.assertEqual(run(db,[source],fetcher,limit=1)['fetched'],0)
                # A per-run site target must still work when the DB already contains sites.
                db.execute("UPDATE crawl_jobs SET status='queued'");db.commit()
                counts=run(db,[source],fetcher,limit=1,max_new_sites=1,artifacts=Path(tmp)/'artifacts')
                self.assertEqual(counts['fetched'],1)
                self.assertEqual(counts['locations_added'],0)
            record=json.loads(db.execute('SELECT record_json FROM map_locations ORDER BY id').fetchone()[0])
            self.assertIn('#page=',record['sources'][0]['url'])
            self.assertNotIn('review_status',record)
            self.assertNotIn('extracted_text',record)
            db.close()

    def test_runtime_deadline_keeps_unfinished_job_retryable(self):
        class SlowFetcher(FakeFetcher):
            def fetch(self,url,source):
                time.sleep(1)
                return super().fetch(url,source)
        db=connect(':memory:')
        counts=run(db,[SOURCE],SlowFetcher(),limit=10,max_seconds=.03)
        self.assertEqual(counts['stop_reason'],'time_limit')
        self.assertEqual(counts['fetched'],0)
        self.assertEqual(db.execute('SELECT status FROM crawl_jobs').fetchone()[0],'queued')
        self.assertEqual(db.execute('SELECT count(*) FROM map_locations').fetchone()[0],0)
        db.close()

    def test_migration_preserves_progress_ids_sources_and_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); crawl=root/'crawl.db';catalog=root/'catalog.db';target=root/'data.db'
            db=connect(crawl)
            db.execute("INSERT INTO crawl_jobs(id,source_id,url,depth,status) VALUES(1,'synthetic','https://example.org/report.pdf',0,'fetched')")
            db.execute('INSERT INTO crawl_documents VALUES(1,1,?,?,?,?,?,?,?)',
                       ('https://example.org/report.pdf','test','application/pdf','test','test',TABLE,'2'))
            save_cases(db,1,parse_tables(TABLE));db.commit();db.close()
            with sqlite3.connect(catalog) as old:
                old.execute('CREATE TABLE br_cases(published_json TEXT)')
                old.execute('CREATE TABLE br_discoveries(public_json TEXT)')
                old.execute('INSERT INTO br_discoveries VALUES(?)',(json.dumps({
                    'id':'amnesty:KH:ZZ01','site_code':'ZZ01','country':'Cambodia',
                    'classification':'source_documented','location':{'latitude':12.12,'longitude':104.12,'radius_m':2000},
                    'pdf_page':159,'section':'Annex II','source_url':'https://example.org/report.pdf',
                    'publisher':'Test publisher','source_title':'Synthetic report (2026)'}),))
            result=migrate(crawl,catalog,target)
            self.assertEqual(result,{'locations':2,'jobs':1,'documents':1})
            db=connect(target)
            record=json.loads(db.execute("SELECT record_json FROM map_locations WHERE id='source-amnesty-kh-zz01'").fetchone()[0])
            self.assertEqual(record['sources'][0]['url'],'https://example.org/report.pdf#page=159')
            record['sources']=[{**record['sources'][0],'url':'https://example.org/second'}]
            save_location(db,record)
            updated=json.loads(db.execute('SELECT record_json FROM map_locations WHERE id=?',(record['id'],)).fetchone()[0])
            self.assertEqual(len(updated['sources']),2)
            db.close()
            with self.assertRaises(ValueError):migrate(crawl,catalog,target)
            with sqlite3.connect(crawl) as old:
                self.assertIsNone(old.execute("SELECT name FROM sqlite_master WHERE name='br_cases'").fetchone())

    def test_second_foreground_crawler_cannot_take_same_lock(self):
        with tempfile.TemporaryDirectory() as tmp:
            with crawl_lock(Path(tmp)/'crawl.lock'):
                with self.assertRaises(ValueError):
                    with crawl_lock(Path(tmp)/'crawl.lock'):pass
