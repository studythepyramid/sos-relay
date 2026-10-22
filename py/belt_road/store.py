"""One server-owned database for crawl progress and source-attributed locations."""
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import re
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
STATE_DIR = Path('/var/lib/sos-relay/belt-road') if ROOT == Path('/opt/sos-relay') else ROOT / 'var/belt-road'
DEFAULT_DB = Path(os.environ.get('BELT_ROAD_DB_FILE', STATE_DIR / 'data.db'))


def now():
    return datetime.now(timezone.utc).isoformat()


def schema(db):
    db.execute('''CREATE TABLE IF NOT EXISTS map_locations (
        id TEXT PRIMARY KEY, record_json TEXT NOT NULL, updated_at TEXT NOT NULL,
        hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0,1)))''')


def text(value, limit, optional=False):
    if optional and value is None:
        return ''
    if not isinstance(value, str) or len(value) > limit or (not optional and not value.strip()):
        raise ValueError('Invalid location text')
    return value.strip()


def clean_record(row):
    """Technical field checks, not a factual assessment of the source's claims."""
    rid = text(row['id'], 100)
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', rid):
        raise ValueError('Invalid location ID')
    loc = row['location']
    if loc is not None:
        latitude, longitude = loc['latitude'], loc['longitude']
        if (type(latitude) not in (int, float) or type(longitude) not in (int, float)
                or not math.isfinite(latitude) or not math.isfinite(longitude)
                or abs(latitude) > 90 or abs(longitude) > 180):
            raise ValueError('Invalid location coordinates')
        radius = loc.get('radius_m', 2000)
        if type(radius) not in (int, float) or not math.isfinite(radius) or not 100 <= radius <= 500000:
            raise ValueError('Invalid display radius')
    classification = row.get('source_classification', 'reported')
    if classification not in ('reported', 'documented', 'suspected'):
        raise ValueError('Invalid source classification')
    if not isinstance(row['sources'], list) or not 1 <= len(row['sources']) <= 20:
        raise ValueError('At least one source citation is required')
    sources = []
    for source in row['sources']:
        url = text(source['url'], 2000)
        parsed = urlsplit(url)
        if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError('Invalid source URL')
        sources.append({'url': url, 'publisher': text(source['publisher'], 200),
                        'title': text(source['title'], 300),
                        'published_on': text(source.get('published_on'), 40, True),
                        'supports': text(source.get('supports'), 1000, True)})
    return {'id': rid, 'title': text(row['title'], 200), 'country': text(row['country'], 100),
            'summary': text(row.get('summary'), 1500, True),
            'reported_on': text(row.get('reported_on'), 40, True),
            'source_classification': classification,
            'communication': text(row.get('communication'), 500, True),
            'current_status': text(row.get('current_status'), 400, True),
            'location': None if loc is None else {'latitude': latitude, 'longitude': longitude, 'radius_m': radius,
                         'precision': 'site' if loc.get('precision') == 'site' else 'region',
                         'label': text(loc.get('label', row['country']), 200),
                         'basis': text(loc.get('basis'), 700, True)},
            'sources': sources}


def save_location(db, record):
    row = clean_record(record)
    existing = db.execute('SELECT record_json FROM map_locations WHERE id=?', (row['id'],)).fetchone()
    if existing:
        sources = {source['url']: source for source in json.loads(existing[0])['sources']}
        sources.update({source['url']: source for source in row['sources']})
        row = clean_record({**row, 'sources': list(sources.values())})
    payload = json.dumps(row, ensure_ascii=False, sort_keys=True)
    if existing and existing[0] == payload:
        return 'unchanged'
    db.execute('''INSERT INTO map_locations(id,record_json,updated_at) VALUES(?,?,?)
        ON CONFLICT(id) DO UPDATE SET record_json=excluded.record_json,updated_at=excluded.updated_at''',
               (row['id'], payload, now()))
    return 'updated' if existing else 'added'


def profile_record(item, source_url, publisher='Amnesty International',
                   source_title='Falling Through the Cracks (2026)'):
    rid = 'source-' + re.sub('[^a-z0-9]+', '-', item['case_key'].lower())
    suspected = item['evidence_level'] == 'source_suspected'
    return {'id': rid, 'title': f"Site {item['site_code']}", 'country': item['country'],
            'summary': f"{publisher} lists this location in {item['section']} of {source_title}.",
            'reported_on': '2026', 'source_classification': 'suspected' if suspected else 'documented',
            'location': {**item['location'], 'precision': 'region',
                         'label': f"{item['country']} · {item['site_code']}",
                         'basis': 'Source coordinates rounded to two decimals. The 2 km display area is illustrative.'},
            'sources': [{'url': source_url.split('#')[0] + f"#page={item['pdf_page']}",
                         'publisher': publisher, 'title': source_title, 'published_on': '2026',
                         'supports': f"{'Suspected' if suspected else 'Documented'} by the source publisher. {item['section']}, PDF page {item['pdf_page']}."}]}
