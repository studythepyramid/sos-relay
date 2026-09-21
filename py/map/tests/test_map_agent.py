import tempfile
import unittest
from pathlib import Path

from agent import process_once
from db import connect, create_pin, initialize


class AgentTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / 'genone.db'
        initialize(self.path)

    def create(self, **changes):
        values = dict(latitude=1.0, longitude=2.0, message='need water')
        values.update(changes)
        return create_pin(self.path, **values)

    def test_processes_unprocessed_pin_and_marks_it_done(self):
        pin = self.create()
        done, failed = process_once(self.path, process_fn=lambda text: f'[EN] {text}')
        self.assertEqual((done, failed), (1, 0))
        with connect(self.path) as db:
            row = dict(db.execute('SELECT * FROM sos_pins WHERE id = ?', (pin['id'],)).fetchone())
            result = dict(db.execute(
                'SELECT * FROM sos_pin_agent_results WHERE pin_id = ?', (pin['id'],)
            ).fetchone())
        self.assertIsNotNone(row['processed_at'])
        self.assertEqual(result['kind'], 'translation_en')
        self.assertEqual(result['result'], '[EN] need water')

    def test_already_processed_pin_is_skipped(self):
        self.create()
        process_once(self.path, process_fn=lambda text: f'[EN] {text}')
        done, failed = process_once(self.path, process_fn=lambda text: 'should not run')
        self.assertEqual((done, failed), (0, 0))

    def test_failure_leaves_pin_unprocessed_for_retry(self):
        pin = self.create()

        def boom(text):
            raise RuntimeError('vendor API down')

        done, failed = process_once(self.path, process_fn=boom)
        self.assertEqual((done, failed), (0, 1))
        with connect(self.path) as db:
            row = dict(db.execute('SELECT * FROM sos_pins WHERE id = ?', (pin['id'],)).fetchone())
        self.assertIsNone(row['processed_at'])

        done, failed = process_once(self.path, process_fn=lambda text: 'ok now')
        self.assertEqual((done, failed), (1, 0))

    def test_empty_result_is_a_failure_not_saved(self):
        self.create()
        done, failed = process_once(self.path, process_fn=lambda text: '   ')
        self.assertEqual((done, failed), (0, 1))

    def test_multiple_pins_processed_in_creation_order(self):
        self.create(message='first')
        self.create(latitude=3.0, longitude=4.0, message='second')
        seen = []
        done, failed = process_once(self.path, process_fn=lambda text: seen.append(text) or f'[EN] {text}')
        self.assertEqual((done, failed), (2, 0))
        self.assertEqual(seen, ['first', 'second'])


if __name__ == '__main__':
    unittest.main()
