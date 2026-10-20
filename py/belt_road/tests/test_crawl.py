import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from crawl import allowed, canonical, connect, public_destination, run, status, TextPage

SOURCE = {
    'id': 'test', 'publisher': 'Test publisher',
    'allowed_hosts': ['example.org'], 'allowed_prefixes': ['/reports/'],
    'seeds': ['https://example.org/reports/scam'], 'link_terms': ['scam']
}
BODY = b'''<html><head><title>Scam research</title></head><body>
<nav>Navigation should not become evidence</nav><p>Survivor testimony about forced labour.</p>
<script>alert('Private script')</script><a href="/reports/scam-two">Scam report</a>
<a href="https://evil.example/reports/scam">Unapproved host</a></body></html>'''


class FakeFetcher:
    def __init__(self, permitted=True, fail=False):
        self.allow, self.fail, self.calls = permitted, fail, []

    def permitted(self, url, source):
        return self.allow

    def fetch(self, url, source):
        self.calls.append(url)
        if self.fail:
            raise OSError('Test failure')
        return url, 'text/html', BODY


class CrawlTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db = connect(Path(self.tmp.name) / 'crawl.db')
        self.addCleanup(self.db.close)

    def test_fetch_creates_private_lead_and_bounded_queue(self):
        fetcher = FakeFetcher()
        counts = run(self.db, [SOURCE], fetcher, limit=1)
        self.assertEqual(counts['fetched'], 1)
        self.assertEqual(counts['leads'], 1)
        self.assertEqual(status(self.db)['jobs'], {'fetched': 1, 'queued': 1})
        doc = self.db.execute('SELECT * FROM crawl_documents').fetchone()
        self.assertEqual(doc['content_hash'], hashlib.sha256(BODY).hexdigest())
        self.assertNotIn('Private script', doc['extracted_text'])
        self.assertNotIn('Navigation', doc['extracted_text'])
        lead = self.db.execute('SELECT * FROM crawl_candidates').fetchone()
        self.assertEqual(lead['evidence_kind'], 'research_lead')
        self.assertEqual(lead['review_status'], 'needs_review')
        self.assertEqual(self.db.execute("SELECT count(*) FROM sqlite_master WHERE name='br_cases'").fetchone()[0], 0)

    def test_depth_zero_and_completed_seeds_not_refetched(self):
        fetcher = FakeFetcher()
        run(self.db, [SOURCE], fetcher, limit=4, max_depth=0)
        run(self.db, [SOURCE], fetcher, limit=4, max_depth=0)
        self.assertEqual(len(fetcher.calls), 1)
        self.assertEqual(status(self.db)['documents'], 1)

    def test_robot_disallow_prevents_document_fetch(self):
        fetcher = FakeFetcher(permitted=False)
        counts = run(self.db, [SOURCE], fetcher)
        self.assertEqual(fetcher.calls, [])
        self.assertEqual(counts['blocked'], 1)
        self.assertEqual(status(self.db)['documents'], 0)

    def test_fetch_failure_preserves_queue_and_no_false_success(self):
        counts = run(self.db, [SOURCE], FakeFetcher(fail=True))
        self.assertEqual(counts['failed'], 1)
        self.assertEqual(status(self.db)['documents'], 0)
        self.assertEqual(status(self.db)['jobs'], {'failed': 1})

    def test_host_path_protocol_and_credentials_rejected(self):
        for url in ['http://example.org/reports/scam', 'https://example.org.evil/reports/scam',
                    'https://u:p@example.org/reports/scam', 'https://example.org:8000/reports/scam',
                    'https://example.org/private/scam']:
            with self.subTest(url=url):
                self.assertFalse(allowed(url, SOURCE))
        self.assertTrue(allowed('https://example.org/reports/scam#part', SOURCE))
        self.assertEqual(canonical('https://example.org/reports/scam#part'), 'https://example.org/reports/scam')

    def test_private_and_mixed_dns_addresses_rejected(self):
        for addresses in [['127.0.0.1'], ['169.254.169.254'], ['10.0.0.1'], ['8.8.8.8', '::1']]:
            rows = [(2, 1, 6, '', (address, 443)) for address in addresses]
            with self.subTest(addresses=addresses), patch('crawl.socket.getaddrinfo', return_value=rows), self.assertRaises(ValueError):
                public_destination('https://example.org/reports/scam')

    def test_oversized_extracted_text_is_bounded(self):
        page = TextPage()
        page.feed('<p>' + 'A' * 300000 + '</p>')
        self.assertLessEqual(len(page.text()), 250000)


if __name__ == '__main__':
    unittest.main()
