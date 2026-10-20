import copy
import json
from pathlib import Path
import tempfile
import unittest

from catalog import connect, export_records, import_records, publish, validate, withdraw

SEED = {
    'id': 'fictional-test', 'title': 'Fictional fixture', 'country': 'Test country',
    'summary': 'Synthetic test only', 'reported_on': '2025-01-01',
    'current_status': 'Test fixture', 'communication': 'Synthetic communication',
    'collection_method': 'manual_seed',
    'location': {'latitude': 10, 'longitude': 20, 'precision': 'region', 'radius_m': 10000,
                 'label': 'Synthetic region', 'basis': 'Test geometry'},
    'sources': [
        {'url': 'https://example.org/test', 'title': 'Synthetic source', 'publisher': 'Test publisher',
         'published_on': '2025-01-01', 'accessed_on': '2025-01-02',
         'kind': kind, 'supports': 'Synthetic test'}
        for kind in ['victim_message_report', 'location_context']
    ],
}


class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db = Path(self.tmp.name) / 'catalog.db'
        self.out = Path(self.tmp.name) / 'public.json'
        self.record = copy.deepcopy(SEED)

    def exported(self):
        export_records(self.db, self.out)
        return json.loads(self.out.read_text())['cases']

    def test_import_is_private_and_export_is_allowlisted(self):
        self.record['victim_name'] = 'PRIVATE'
        self.record['raw_message'] = 'PRIVATE'
        self.record['reviewed_by'] = 'FORGED'
        import_records(self.db, [self.record])
        self.assertEqual(self.exported(), [])
        publish(self.db, self.record['id'], 'reviewer', 'Checked sources and location')
        result = self.exported()[0]
        self.assertNotIn('PRIVATE', json.dumps(result))
        self.assertNotIn('reviewed_by', result)
        self.assertEqual(result['evidence_status'], 'Publicly reported')

    def test_reimport_cannot_replace_reviewed_snapshot(self):
        import_records(self.db, [self.record])
        publish(self.db, self.record['id'], 'reviewer', 'Checked')
        original = self.exported()[0]['summary']
        self.record['summary'] = 'An unreviewed change'
        import_records(self.db, [self.record])
        self.assertEqual(self.exported()[0]['summary'], original)
        publish(self.db, self.record['id'], 'reviewer', 'Checked revision')
        self.assertEqual(self.exported()[0]['summary'], self.record['summary'])

    def test_withdraw_removes_public_record_and_keeps_audit(self):
        import_records(self.db, [self.record])
        publish(self.db, self.record['id'], 'reviewer', 'Checked')
        withdraw(self.db, self.record['id'], 'reviewer', 'Location disputed')
        self.assertEqual(self.exported(), [])
        with connect(self.db) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM br_audit').fetchone()[0], 3)
            self.assertEqual(db.execute('SELECT count(*) FROM br_cases').fetchone()[0], 1)

    def test_invalid_batch_cannot_partially_import(self):
        bad = copy.deepcopy(self.record)
        bad['id'] = 'another-case'
        bad['location']['latitude'] = 91
        with self.assertRaises(ValueError):
            import_records(self.db, [self.record, bad])
        self.assertEqual(self.exported(), [])

    def test_requires_public_communication_and_location_sources(self):
        for kind in ['victim_message_report', 'location_context']:
            record = copy.deepcopy(self.record)
            record['sources'] = [s for s in record['sources'] if s['kind'] != kind]
            with self.subTest(kind=kind), self.assertRaises(ValueError):
                validate(record)

    def test_invalid_coordinates_links_and_precision_rejected(self):
        for value in [True, float('nan'), float('inf'), 91]:
            record = copy.deepcopy(self.record)
            record['location']['latitude'] = value
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate(record)
        for value in ['javascript:alert(1)', 'https://user:secret@example.org', '/local']:
            record = copy.deepcopy(self.record)
            record['sources'][0]['url'] = value
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate(record)
        self.record['location']['radius_m'] = 100
        with self.assertRaises(ValueError):
            validate(self.record)

    def test_reviewer_note_required_and_unknown_case_rejected(self):
        import_records(self.db, [self.record])
        for rid, actor, note in [(self.record['id'], '', 'Checked'), (self.record['id'], 'reviewer', ''), ('missing', 'reviewer', 'Checked')]:
            with self.subTest(rid=rid, actor=actor, note=note), self.assertRaises(ValueError):
                publish(self.db, rid, actor, note)
        self.assertEqual(self.exported(), [])

    def test_duplicate_ids_and_invalid_dates_rejected(self):
        with self.assertRaises(ValueError):
            import_records(self.db, [self.record, self.record])
        self.record['reported_on'] = 'yesterday'
        with self.assertRaises(ValueError):
            validate(self.record)


if __name__ == '__main__':
    unittest.main()
