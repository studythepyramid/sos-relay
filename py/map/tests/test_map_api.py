import functools
import http.client
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import tempfile
import threading
import unittest
from uuid import uuid4

from db import initialize
from preview import PreviewHandler


class MapAPITests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / 'genone.db'
        initialize(self.path)
        class Handler(PreviewHandler):
            database = self.path
        self.server = ThreadingHTTPServer(('127.0.0.1', 0),
            functools.partial(Handler, directory=self.tmp.name))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.cleanup)

    def cleanup(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.tmp.cleanup()

    def request(self, method='GET', body=None, headers=None, path='/api/sos/pins'):
        conn = http.client.HTTPConnection('127.0.0.1', self.server.server_port)
        try:
            conn.request(method, path, json.dumps(body) if body is not None else None,
                         headers or {'Content-Type': 'application/json'})
            response = conn.getresponse()
            return response.status, json.loads(response.read())
        finally:
            conn.close()

    def test_save_reload_and_idempotent_retry(self):
        body = dict(id=str(uuid4()), latitude=64.123456789123, longitude=-21.1,
                    message='TEST: water needed', contact='discard this', created_at='fake')
        status, saved = self.request('POST', body)
        self.assertEqual(status, 201)
        self.assertIsNone(saved['pin']['contact'])
        self.assertNotEqual(saved['pin']['created_at'], 'fake')
        self.assertEqual(self.request('POST', body), (201, saved))
        initialize(self.path)
        status, result = self.request()
        self.assertEqual(status, 200)
        self.assertEqual(result['pins'], [saved['pin']])
        self.assertIsNone(result['next_offset'])
        body['message'] = 'different'
        self.assertEqual(self.request('POST', body)[0], 400)
        self.assertEqual(len(self.request()[1]['pins']), 1)

    def test_validation_and_cross_origin_rejection(self):
        body = dict(latitude=0, longitude=0, message='test')
        self.assertEqual(self.request('POST', dict(body, latitude=91))[0], 400)
        self.assertEqual(self.request('POST', [], None)[0], 400)
        self.assertEqual(self.request('POST', body, {'Content-Type': 'text/plain'})[0], 415)
        self.assertEqual(self.request('POST', body, {
            'Content-Type': 'application/json', 'Origin': 'https://example.com'})[0], 403)
        self.assertEqual(self.request(headers={'Host': 'example.com'})[0], 403)
        self.assertEqual(self.request(path='/api/sos/pins?south=91')[0], 400)
        self.assertEqual(self.request()[1]['pins'], [])


if __name__ == '__main__':
    unittest.main()
