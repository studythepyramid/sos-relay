"""Isolated read-only /belt-road/ preview; never serves the private database."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
import tempfile
import json
import sqlite3
from urllib.parse import urlsplit
from catalog import DEFAULT_DB, validate

ROOT = Path(__file__).resolve().parents[2]


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if urlsplit(self.path).path == '/api/belt-road/cases':
            try:
                with sqlite3.connect(DEFAULT_DB.resolve().as_uri() + '?mode=ro', uri=True) as db:
                    rows = db.execute('SELECT published_json,published_at FROM br_cases WHERE published_json IS NOT NULL ORDER BY id LIMIT 501').fetchall()
                cases = [{**validate(json.loads(payload)), 'reviewed_at': reviewed} for payload, reviewed in rows[:500]]
                result = {'schema_version': 1, 'generated_at': max((c['reviewed_at'] for c in cases), default=''), 'cases': cases, 'has_more': len(rows)>500, 'limit': 500}
                status = 200
            except (sqlite3.Error, ValueError, TypeError):
                result, status = {'error': 'Published reports unavailable'}, 503
            body = json.dumps(result).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path in ('/', '/map/'):
            self.send_response(302)
            self.send_header('Location', 'http://127.0.0.1:8001/' if self.path == '/' else 'http://127.0.0.1:18188/map/')
            self.end_headers()
            return
        super().do_GET()

    def log_message(self, *_args):
        pass


def main():
    with tempfile.TemporaryDirectory(prefix='belt-road-preview-') as directory:
        target = Path(directory)
        shutil.copytree(ROOT / 'docs/belt-road', target / 'belt-road')
        shutil.copytree(ROOT / 'docs/assets/leaflet', target / 'assets/leaflet')
        shutil.copytree(ROOT / 'docs/assets/icons', target / 'assets/icons')
        for name in ['belt-road.css', 'belt-road.js']:
            shutil.copy2(ROOT / 'docs/assets' / name, target / 'assets' / name)
        with ThreadingHTTPServer(('127.0.0.1', 18189), partial(Handler, directory=directory)) as server:
            print('Belt & Road preview: http://127.0.0.1:18189/belt-road/', flush=True)
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                pass


if __name__ == '__main__':
    main()
