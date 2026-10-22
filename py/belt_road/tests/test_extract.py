import unittest
from extract import CIR_URL, source_locations, validated_mentions, chunks


class ExtractionTests(unittest.TestCase):
    def test_caption_binding_ignores_other_coordinates_and_foreign_sources(self):
        text = ('An image of KK Park [16.629936, 98.555437], a scam compound.\n'
                'Claims of people moved from KK Park at [16.630574, 98.537467].\n'
                'An interview in Mae Sot [16.7, 98.5].\n'
                'Geolocation of TTM Park in Myawaddy at [16.715281, 98.494753].')
        records = source_locations(dict(final_url=CIR_URL, extracted_text=text))
        self.assertEqual([r['title'] for r in records], ['KK Park', 'TTM Park'])
        self.assertEqual(records[0]['location']['latitude'], 16.63)
        self.assertIn('[16.629936, 98.555437]', records[0]['sources'][0]['supports'])
        self.assertEqual(source_locations(dict(final_url='https://other.example/', extracted_text=text)), [])

    def test_out_of_country_coordinate_rejected(self):
        with self.assertRaises(ValueError):
            source_locations(dict(final_url=CIR_URL,
                extracted_text='An image of KK Park [45.123, 98.555437]'))

    def test_only_verbatim_quote_and_bound_name_retained(self):
        quote = 'Apollo Campus is described as a scam compound.'
        valid, rejected = validated_mentions({'places': [
            {'name': 'Apollo Campus', 'quote': quote},
            {'name': 'KK Park', 'quote': quote},
            {'name': 'Apollo Campus', 'quote': 'Apollo Campus held 100000 people.'},
            {'name': 10, 'quote': quote},
            {'name': 'Mae Sot', 'quote': 'People were handed over to authorities in Mae Sot.'}]}, quote)
        self.assertEqual(len(valid), 1)
        self.assertEqual(rejected, 4)
        self.assertEqual(valid[0]['offset'], 0)

    def test_chunks_cover_tail_with_original_offsets(self):
        text = 'x' * 13000 + 'The last paragraph.'
        parts = list(chunks(text))
        self.assertTrue(parts[-1][1].endswith('The last paragraph.'))
        for offset, chunk in parts:
            self.assertEqual(chunk, text[offset:offset + 6000])

    def test_mentions_relay_without_geometry_or_factual_verdict(self):
        from crawl import connect
        from extract import publish_mentions
        import tempfile
        from pathlib import Path
        import json
        with tempfile.TemporaryDirectory() as folder:
            db = connect(Path(folder) / 'data.db')
            db.execute("INSERT INTO crawl_jobs(id,source_id,url,depth) VALUES(1,'test','https://example.org/',0)")
            db.execute("INSERT INTO crawl_documents(id,job_id,final_url,fetched_at,mime_type,content_hash,title,extracted_text,parser_version) VALUES(1,1,'https://example.org/','2026','text/html','hash','Source','Example report','v1')")
            db.execute('CREATE TABLE crawl_place_mentions(id TEXT,document_id INTEGER,name TEXT,quote TEXT)')
            db.execute("INSERT INTO crawl_place_mentions VALUES('test',1,'Unknown place','The source alleges forced labour in Unknown place.')")
            result = publish_mentions(db, {})
            self.assertEqual(result['added'],1)
            row = json.loads(db.execute('SELECT record_json FROM map_locations').fetchone()[0])
            self.assertIsNone(row['location'])
            self.assertEqual(row['sources'][0]['url'],'https://example.org/')
            self.assertEqual(publish_mentions(db,{})['unchanged'],1)
            db.close()
