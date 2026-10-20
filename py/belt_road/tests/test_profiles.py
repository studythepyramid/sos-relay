import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch
from profiles import parse_tables, save_cases
from crawl import connect, run
from test_crawl import SOURCE, FakeFetcher

# Entirely synthetic source table fixtures, never scraped records.
TABLE = '''ANNEX II
SCAMMING COMPOUNDS AND
INTERVENTIONS LIST
\f
1 ZZ01 10.1111, 100.1111 Fictional row
2 ZZZ02 10.2222 100.2222 Fictional row
3 ZZ03H 10.3333,100.3333 Fictional row
Text mentioning ZZ04 is not a row.
\f
ANNEX III
SUSPICIOUS LOCATIONS
\f
ZZ04 10.4444, 100.4444 Fictional row
'''


class ProfileTests(unittest.TestCase):
    def test_numbered_rows_extended_codes_and_source_sections(self):
        rows = parse_tables(TABLE, first_page=10)
        self.assertEqual([r['site_code'] for r in rows], ['ZZ01','ZZZ02','ZZ03H','ZZ04'])
        self.assertEqual([r['evidence_level'] for r in rows], ['source_documented']*3+['source_suspected'])
        self.assertEqual(rows[0]['pdf_page'],11)
        self.assertEqual(rows[-1]['pdf_page'],13)
        self.assertNotIn('latitude',rows[0])
        self.assertNotIn('longitude',rows[0])

    def test_narrative_and_toc_are_not_site_cases(self):
        self.assertEqual(parse_tables('13 ANNEX II SCAMMING COMPOUNDS AND INTERVENTIONS LIST\nZZ01 10.1111,100.1111'), [])
        self.assertEqual(parse_tables('ZZ01 is mentioned in a story about a site'), [])

    def test_conflicting_source_classifications_fail(self):
        with self.assertRaises(ValueError):
            parse_tables(TABLE.replace('ZZ04 10.4444', 'ZZ01 10.4444'))

    def test_deduplicates_sites_and_preserves_evidence_pages(self):
        db=connect(':memory:')
        try:
            db.execute("INSERT INTO crawl_jobs(id,source_id,url,depth) VALUES(1,'test','https://example.org/report',0)")
            db.execute("INSERT INTO crawl_documents(id,job_id,final_url,fetched_at,mime_type,content_hash,title,extracted_text,parser_version) VALUES(1,1,'https://example.org/report','test','application/pdf','hash','test','test','2')")
            rows=parse_tables(TABLE)
            self.assertEqual(save_cases(db,1,rows),4)
            self.assertEqual(save_cases(db,1,rows),0)
            self.assertEqual(db.execute('SELECT count(*) FROM crawl_site_cases').fetchone()[0],4)
            self.assertEqual(db.execute('SELECT count(*) FROM crawl_site_evidence').fetchone()[0],4)
            self.assertTrue(all(r[0]=='needs_review' for r in db.execute('SELECT review_status FROM crawl_site_cases')))
            self.assertTrue(all(r[0]=='not_assessed' for r in db.execute('SELECT message_evidence FROM crawl_site_cases')))
            fetcher=FakeFetcher()
            run(db,[SOURCE],fetcher,limit=10,target_cases=4)
            self.assertEqual(fetcher.calls,[])
        finally:
            db.close()

    def test_report_validation_failure_never_creates_site_cases(self):
        class PdfFetcher(FakeFetcher):
            def fetch(self, url, source):
                return url, 'application/pdf', b'%PDF-synthetic-fixture'
        db=connect(':memory:')
        try:
            with tempfile.TemporaryDirectory() as tmp, patch('crawl.extract_profiles', side_effect=ValueError('Table totals do not match')):
                counts=run(db,[{**SOURCE,'profile_adapter':'synthetic-test'}],PdfFetcher(),
                           limit=1,target_cases=100,artifacts=Path(tmp))
            self.assertEqual(counts['failed'],1)
            self.assertEqual(db.execute('SELECT count(*) FROM crawl_site_cases').fetchone()[0],0)
            self.assertEqual(db.execute('SELECT count(*) FROM crawl_documents').fetchone()[0],0)
        finally:
            db.close()


if __name__ == '__main__':
    unittest.main()
