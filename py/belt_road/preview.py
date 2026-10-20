"""Isolated read-only /belt-road/ preview; never serves the private database."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
import tempfile

ROOT = Path(__file__).resolve().parents[2]


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
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
