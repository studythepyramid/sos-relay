import sqlite3
import tempfile
import unittest
from pathlib import Path
from publish_discoveries import project, publish
from crawl import connect
from profiles import parse_tables, save_cases


class DiscoveryPublicationTests(unittest.TestCase):
    def test_attributed_projection_preserves_review_status_and_catalogue(self):
        table = 'ANNEX II\nINTERVENTIONS LIST\n'
        table += '\n'.join(f'ZZ{i:02d} 12.1234,104.1234 Synthetic' for i in range(86))
        table += '\fANNEX III\nSUSPICIOUS LOCATIONS\n'
        table += '\n'.join(f'YY{i:02d} 12.5678,104.5678 Synthetic' for i in range(36))
        with tempfile.TemporaryDirectory() as tmp:
            crawl_file = Path(tmp)/'crawl.db'
            catalog_file = Path(tmp)/'catalog.db'
            db = connect(crawl_file)
            db.execute("INSERT INTO crawl_jobs(id,source_id,url,depth) VALUES(1,'synthetic','https://example.org',0)")
            db.execute('INSERT INTO crawl_documents VALUES(1,1,?,?,?,?,?,?,?)',
                       ('https://www.amnesty.org.au/synthetic.pdf','test','application/pdf','test','test',table,'2'))
            save_cases(db,1,parse_tables(table))
            db.commit()
            with sqlite3.connect(catalog_file) as catalog:
                catalog.execute('CREATE TABLE br_cases(id TEXT)')
                catalog.execute("INSERT INTO br_cases VALUES('reviewed-existing')")
            self.assertEqual(publish(crawl_file,catalog_file,1),122)
            self.assertEqual(publish(crawl_file,catalog_file,1),122)
            with sqlite3.connect(catalog_file) as catalog:
                self.assertEqual(catalog.execute('SELECT count(*) FROM br_discoveries').fetchone()[0],122)
                self.assertEqual(catalog.execute('SELECT id FROM br_cases').fetchone()[0],'reviewed-existing')
            record=project(db,1)[0]
            self.assertEqual(record['review_status'],'needs_review')
            self.assertEqual(record['location']['latitude'],12.12)
            self.assertNotIn('extracted_text',record)
            db.execute('DELETE FROM crawl_site_evidence WHERE pdf_page=159')
            with self.assertRaises(ValueError):
                project(db,1)
            db.close()
