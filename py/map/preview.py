"""Run an isolated map preview: uv run python py/map/preview.py."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import tempfile
import shutil
import json
import sqlite3
from urllib.parse import urlsplit, parse_qs
from db import DEFAULT_PATH, initialize, create_pin, list_pins


ROOT = Path(__file__).resolve().parents[2]


class PreviewHandler(SimpleHTTPRequestHandler):
    database = DEFAULT_PATH

    def json_response(self, status, data):
        body = json.dumps(data, allow_nan=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def local_request(self):
        port = self.server.server_port
        hosts = (f'127.0.0.1:{port}', f'localhost:{port}')
        origin = self.headers.get('Origin')
        return (self.headers.get('Host') in hosts
                and (origin is None or origin == f'http://{self.headers.get("Host")}')
                and self.headers.get('Sec-Fetch-Site') != 'cross-site')

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/api/sos/pins':
            if not self.local_request():
                return self.json_response(403, {'error': 'Local same-origin access only'})
            try:
                query = parse_qs(urlsplit(self.path).query)
                bounds = {key: float(query.get(key, [value])[0]) for key, value in
                          dict(south=-90, west=-180, north=90, east=180).items()}
                offset = int(query.get('offset', [0])[0])
                rows = list_pins(self.database, **bounds, limit=200, offset=offset)
                return self.json_response(200, {'pins': rows, 'next_offset': offset + 200 if len(rows) == 200 else None})
            except (ValueError, OverflowError):
                return self.json_response(400, {'error': 'Invalid viewport or offset'})
            except sqlite3.Error:
                return self.json_response(503, {'error': 'Database unavailable. Try again.'})
        if path in ('/', '/doors.2026-09/'):
            self.send_response(302)
            self.send_header('Location', f'http://127.0.0.1:8001{path}')
            self.end_headers()
            return
        super().do_GET()

    def do_POST(self):
        if urlsplit(self.path).path != '/api/sos/pins':
            return self.json_response(404, {'error': 'Unknown endpoint'})
        if not self.local_request():
            return self.json_response(403, {'error': 'Local same-origin access only'})
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            return self.json_response(415, {'error': 'Send application/json'})
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 8192:
                return self.json_response(413, {'error': 'Request must be 1–8192 bytes'})
            self.connection.settimeout(10)
            data = json.loads(self.rfile.read(size))
            if not isinstance(data, dict):
                raise ValueError('Expected an object')
            # Local test endpoint only: OSM checking is deliberately not yet wired.
            pin = create_pin(self.database, latitude=data.get('latitude'),
                             longitude=data.get('longitude'), message=data.get('message'),
                             share_contact=data.get('share_contact', False), contact=data.get('contact'),
                             pin_id=data.get('id'))
            return self.json_response(201, {'pin': pin})
        except (ValueError, UnicodeError) as error:
            return self.json_response(400, {'error': str(error)})
        except TimeoutError:
            return self.json_response(408, {'error': 'Request timed out'})
        except sqlite3.Error:
            return self.json_response(503, {'error': 'Database unavailable. Keep your draft and retry.'})

    def log_message(self, *_args):
        # No visitor address or request-path logs, even in the preview.
        pass


def main():
    initialize()
    with tempfile.TemporaryDirectory(prefix='sos-map-preview-') as directory:
        target = Path(directory)
        shutil.copytree(ROOT / 'docs/map', target / 'map')
        shutil.copytree(ROOT / 'docs/assets/leaflet', target / 'assets/leaflet')
        for filename in ('sos-map.js', 'sos-map.css'):
            shutil.copy2(ROOT / 'docs/assets' / filename, target / 'assets' / filename)
        def handler(*args, **kwargs):
            return PreviewHandler(*args, directory=directory, **kwargs)
        with ThreadingHTTPServer(('127.0.0.1', 18188), handler) as server:
            print('Map preview: http://127.0.0.1:18188/map/', flush=True)
            print('Local test messages saved to var/genone.db; no public SOS dispatch. Ctrl+C to stop.', flush=True)
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                pass


if __name__ == '__main__':
    main()
