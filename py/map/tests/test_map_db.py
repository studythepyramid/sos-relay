import tempfile
import unittest
from pathlib import Path

from db import connect, create_pin, initialize, list_pins


class MapStorageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / 'genone.db'
        initialize(self.path)

    def create(self, **changes):
        values = dict(latitude=64.123456789123, longitude=-21.987654321987,
                      message='Need water', contact='must not be saved')
        values.update(changes)
        return create_pin(self.path, **values)

    def test_precision_persistence_and_anonymous_default(self):
        pin = self.create()
        initialize(self.path)
        stored = list_pins(self.path, south=60, north=70, west=-30, east=-10)
        self.assertEqual(stored, [pin])
        self.assertEqual(stored[0]['latitude'], 64.123456789123)
        self.assertIsNone(stored[0]['contact'])
        with connect(self.path) as db:
            columns = {row['name'] for row in db.execute('PRAGMA table_info(sos_pins)')}
        self.assertEqual(
            columns,
            {'id', 'latitude', 'longitude', 'message', 'contact', 'created_at', 'processed_at'},
        )

    def test_opt_in_contact_and_parameterized_text(self):
        text = "'); DROP TABLE sos_pins; -- <script>alert(1)</script>"
        pin = self.create(message=text, share_contact=True, contact='public handle')
        stored = list_pins(self.path, south=-90, north=90, west=-180, east=180)
        self.assertEqual(stored, [pin])
        self.assertEqual(stored[0]['contact'], 'public handle')

    def test_cross_antimeridian_and_pagination(self):
        self.create(latitude=0, longitude=179)
        self.create(latitude=0, longitude=-179)
        self.create(latitude=0, longitude=0)
        bounds = dict(south=-10, north=10, west=170, east=-170)
        self.assertEqual(len(list_pins(self.path, **bounds)), 2)
        first = list_pins(self.path, **bounds, limit=1)
        second = list_pins(self.path, **bounds, limit=1, offset=1)
        self.assertNotEqual(first[0]['id'], second[0]['id'])

    def test_invalid_input_never_persists(self):
        for changes in [dict(latitude=float('nan')), dict(longitude=float('inf')),
                        dict(latitude=True), dict(latitude=91), dict(message='  '),
                        dict(message='x' * 601), dict(share_contact='false'),
                        dict(share_contact=True, contact='x' * 201)]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                self.create(**changes)
        self.assertEqual(list_pins(self.path, south=-90, north=90, west=-180, east=180), [])


if __name__ == '__main__':
    unittest.main()
