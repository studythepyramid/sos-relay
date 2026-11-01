"""Restyle installed Door HTML without rebuilding or replacing translations.

Run against a staged copy, then use install.py to install with backups.
"""
import argparse
from pathlib import Path
import re

from publish import note_link


def refresh(public):
    templates = Path(__file__).parent / 'templates'
    for language in ('en', 'ru', 'fa', 'zh'):
        path = public / ('index.html' if language == 'en' else f'{language}/index.html')
        page = path.read_text()
        if 'href="/assets/site-theme.css"' not in page:
            page = page.replace('</title>', '</title>\n<link rel="icon" href="/assets/site-favicon.png">\n<link rel="stylesheet" href="/assets/site-theme.css">', 1)
        page = page.replace('<body>', '<body data-md-color-scheme="slate">', 1)
        brand = re.search(r'^<a class="brand".*</a>$', (templates / 'page.html').read_text(), re.M)[0]
        page = re.sub(r'<a class="brand"[^>]*>.*?</a>', lambda m: brand, page, count=1)
        base = '/tecNotes/door/' + ('' if language == 'en' else language + '/')
        page = re.sub(r'href="([^"]+)"', lambda m: 'href="' + note_link(m[1], base) + '"', page)
        path.write_text(page)
    (public / 'door.css').write_text((templates / 'door.css').read_text())


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('public', type=Path)
    refresh(parser.parse_args().public)
