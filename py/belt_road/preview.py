"""Isolated read-only /belt-road/ preview; never serves the private database."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
import tempfile
import json
import sqlite3
from urllib.parse import urlsplit
from store import DEFAULT_DB, clean_record

ROOT = Path(__file__).resolve().parents[2]


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if urlsplit(self.path).path == '/api/belt-road/locations':
            try:
                with sqlite3.connect(DEFAULT_DB.resolve().as_uri() + '?mode=ro', uri=True) as db:
                    rows = db.execute('SELECT record_json,updated_at FROM map_locations WHERE hidden=0 ORDER BY id LIMIT 501').fetchall()
                cases = [{**clean_record(json.loads(payload)), 'updated_at': updated} for payload, updated in rows[:500]]
                result = {'schema_version': 1, 'generated_at': max((c['updated_at'] for c in cases), default=''), 'locations': cases, 'has_more': len(rows)>500, 'limit': 500}
                status = 200
            except (sqlite3.Error, ValueError, TypeError):
                result, status = {'error': 'Locations unavailable'}, 503
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
            self.send_header('Location', 'https://sosweb.org/' if self.path == '/' else 'https://sosweb.org/map/')
            self.end_headers()
            return
        super().do_GET()

    def log_message(self, *_args):
        pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=18189)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='belt-road-preview-') as directory:
        target = Path(directory)
        shutil.copytree(ROOT / 'docs/belt-road', target / 'belt-road')
        shutil.copytree(ROOT / 'docs/assets/leaflet', target / 'assets/leaflet')
        shutil.copytree(ROOT / 'docs/assets/icons', target / 'assets/icons')
        shutil.copytree(ROOT / 'docs/assets/maplibre', target / 'assets/maplibre')
        for name in ['belt-road.css', 'belt-road.js', 'english-basemap.js']:
            shutil.copy2(ROOT / 'docs/assets' / name, target / 'assets' / name)
        with ThreadingHTTPServer(('127.0.0.1', args.port), partial(Handler, directory=directory)) as server:
            print(f'Belt & Road preview: http://127.0.0.1:{args.port}/belt-road/', flush=True)
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                pass


if __name__ == '__main__':
    main()
