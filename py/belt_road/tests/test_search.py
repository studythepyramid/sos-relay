import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('sos_search', Path(__file__).resolve().parents[2] / 'search.py')
search = importlib.util.module_from_spec(spec)
spec.loader.exec_module(search)


class SearchTests(unittest.TestCase):
    def test_repeated_hits_preserve_jobs_and_adapter(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            db = root / 'data.db'
            sources = root / 'tmp/sources.json'
            (root / 'sources.json').write_text(json.dumps([dict(id='report', publisher='Example',
                allowed_hosts=['example.org'], allowed_prefixes=['/'], seeds=['https://example.org/report'],
                link_terms=[], profile_adapter='amnesty-kh-2026')]))
            hits = [dict(url='https://example.org/report#page=1'), dict(url='https://example.org/new'),
                    dict(url='https://example.org/new'), dict(url='http://example.org/no')]
            self.assertEqual(search.register(db, sources, hits)['queued'], 2)
            self.assertEqual(search.register(db, sources, hits)['queued'], 0)
            saved = json.loads(sources.read_text())
            self.assertEqual(saved[0]['profile_adapter'], 'amnesty-kh-2026')
            connection = search.connect(db)
            self.assertEqual(connection.execute('select count(*) from crawl_jobs').fetchone()[0], 2)
            connection.close()

    def test_failure_saved_and_next_query_queued(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            with patch.object(search, 'search_text', side_effect=[RuntimeError('rate limit'),
                    [dict(url='https://example.org/scam', title='Report', snippet='scam')]]), \
                    patch.object(search.time, 'sleep') as sleep:
                result = search.main(['topic one', 'topic two', '--db', str(root / 'data.db'),
                    '--out-dir', str(root / 'search'), '--sources', str(root / 'sources.json')])
            self.assertEqual(result, 1)
            self.assertEqual(len(list((root / 'search').glob('*.json'))), 2)
            sleep.assert_called_once_with(5)
            db = search.connect(root / 'data.db')
            self.assertEqual(db.execute('select count(*) from crawl_jobs').fetchone()[0], 1)
            db.close()

    def test_crawl_receives_same_db_and_sources(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            with patch.object(search.subprocess, 'run') as run:
                run.return_value.returncode = 0
                result = search.main(['--url', 'https://example.org/scam', '--crawl',
                    '--db', str(root / 'data.db'), '--out-dir', str(root / 'search'),
                    '--sources', str(root / 'sources.json')])
            self.assertEqual(result, 0)
            command = run.call_args.args[0]
            self.assertEqual(command[command.index('--db') + 1], str(root / 'data.db'))
            self.assertEqual(command[command.index('--sources') + 1], str(root / 'sources.json'))
            self.assertEqual(command[command.index('--max-depth') + 1], '0')
