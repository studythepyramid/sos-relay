"""Legacy catalogue helpers retained for old-data tests; retired from the live pipeline."""
import argparse
from contextlib import contextmanager
from datetime import date, datetime, timezone
import json
import math
from pathlib import Path
import re
import sqlite3
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = ROOT / 'var' / 'belt-road.db'
DEFAULT_EXPORT = ROOT / 'var' / 'belt-road-export.json'


def now():
    return datetime.now(timezone.utc).isoformat()


def text(value, field, limit=1000):
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise ValueError(f'{field}: expected non-empty text, at most {limit} characters')
    return value.strip()


def choice(value, field, options):
    if value not in options:
        raise ValueError(f'{field}: expected one of {", ".join(options)}')
    return value


def iso_date(value, field):
    value = text(value, field, 10)
    if date.fromisoformat(value).isoformat() != value:
        raise ValueError(f'{field}: expected YYYY-MM-DD')
    return value


def url(value):
    value = text(value, 'source URL', 2000)
    parsed = urlsplit(value)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('source URL: expected an HTTPS URL without credentials')
    return value


def validate(record):
    """Construct an allowlisted public record; never export arbitrary crawler fields."""
    if not isinstance(record, dict):
        raise ValueError('Each record must be an object')
    rid = text(record.get('id'), 'id', 100)
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', rid):
        raise ValueError('id: use a stable lowercase slug')
    location = record.get('location')
    if not isinstance(location, dict):
        raise ValueError('location: expected an object')
    coords = {}
    for key, limit in [('latitude', 90), ('longitude', 180)]:
        value = location.get(key)
        if type(value) not in (int, float) or not math.isfinite(value) or not -limit <= value <= limit:
            raise ValueError(f'location.{key}: invalid coordinate')
        coords[key] = value
    precision = choice(location.get('precision'), 'precision', ['region', 'site'])
    radius = location.get('radius_m')
    if type(radius) not in (int, float) or not math.isfinite(radius) or not 100 <= radius <= 500000:
        raise ValueError('radius_m: expected 100–500000 metres')
    if precision == 'region' and radius < 1000:
        raise ValueError('Regional locations need an uncertainty radius of at least 1000 metres')
    sources = record.get('sources')
    if not isinstance(sources, list) or not 1 <= len(sources) <= 20:
        raise ValueError('sources: expected 1–20 source records')
    clean_sources = []
    for source in sources:
        if not isinstance(source, dict):
            raise ValueError('source: expected an object')
        clean_sources.append({
            'url': url(source.get('url')),
            'title': text(source.get('title'), 'source title', 300),
            'publisher': text(source.get('publisher'), 'publisher', 200),
            'published_on': iso_date(source.get('published_on'), 'source publication date'),
            'accessed_on': iso_date(source.get('accessed_on'), 'source access date'),
            'kind': choice(source.get('kind'), 'source kind', ['victim_message_report', 'location_context', 'context']),
            'supports': text(source.get('supports'), 'source support', 1000),
        })
    if not any(s['kind'] == 'victim_message_report' for s in clean_sources):
        raise ValueError('A public report of a victim communication is required')
    if not any(s['kind'] == 'location_context' for s in clean_sources):
        raise ValueError('An attributable location-context source is required')
    return {
        'id': rid,
        'title': text(record.get('title'), 'title', 200),
        'country': text(record.get('country'), 'country', 100),
        'summary': text(record.get('summary'), 'summary', 1500),
        'reported_on': iso_date(record.get('reported_on'), 'report date'),
        'evidence_status': 'Publicly reported',
        'current_status': text(record.get('current_status'), 'current status', 400),
        'communication': text(record.get('communication'), 'communication description', 500),
        'belt_road_status': 'Not established',
        'location': {**coords, 'precision': precision, 'radius_m': radius,
                     'label': text(location.get('label'), 'location label', 200),
                     'basis': text(location.get('basis'), 'location basis', 700)},
        'sources': clean_sources,
        'collection_method': choice(record.get('collection_method'), 'collection method', ['manual_seed', 'crawler']),
    }


@contextmanager
def connect(path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=5)
    db.row_factory = sqlite3.Row
    try:
        db.execute('PRAGMA journal_mode=WAL')
        db.executescript('''
            CREATE TABLE IF NOT EXISTS schema_migrations (
                component TEXT NOT NULL, version INTEGER NOT NULL, applied_at TEXT NOT NULL,
                PRIMARY KEY(component,version)
            );
            CREATE TABLE IF NOT EXISTS br_cases (
                id TEXT PRIMARY KEY, draft_json TEXT NOT NULL,
                draft_updated_at TEXT NOT NULL, published_json TEXT,
                published_at TEXT, reviewed_by TEXT, review_note TEXT
            );
            CREATE TABLE IF NOT EXISTS br_audit (
                id INTEGER PRIMARY KEY, case_id TEXT NOT NULL,
                action TEXT NOT NULL, actor TEXT NOT NULL, note TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
        ''')
        with db:
            db.execute("INSERT OR IGNORE INTO schema_migrations VALUES ('belt_road',1,?)", (now(),))
            yield db
    finally:
        db.close()


def import_records(path, records):
    if not isinstance(records, list) or not 1 <= len(records) <= 1000:
        raise ValueError('Import a JSON array of 1–1000 records per batch')
    # Validate the entire batch before changing the database.
    clean = [validate(record) for record in records]
    if len({record['id'] for record in clean}) != len(clean):
        raise ValueError('Duplicate IDs in import batch')
    with connect(path) as db:
        for record in clean:
            db.execute('''INSERT INTO br_cases(id,draft_json,draft_updated_at) VALUES(?,?,?)
                ON CONFLICT(id) DO UPDATE SET draft_json=excluded.draft_json,
                draft_updated_at=excluded.draft_updated_at''',
                       (record['id'], json.dumps(record, ensure_ascii=False), now()))
            db.execute('INSERT INTO br_audit(case_id,action,actor,note,created_at) VALUES(?,?,?,?,?)',
                       (record['id'], 'import', record['collection_method'], 'Draft only', now()))
    return len(clean)


def publish(path, rid, actor, note):
    actor, note = text(actor, 'reviewer', 200), text(note, 'review note', 2000)
    with connect(path) as db:
        row = db.execute('SELECT draft_json FROM br_cases WHERE id=?', (rid,)).fetchone()
        if not row:
            raise ValueError('Unknown case ID')
        payload = json.dumps(validate(json.loads(row['draft_json'])), ensure_ascii=False)
        db.execute('UPDATE br_cases SET published_json=?,published_at=?,reviewed_by=?,review_note=? WHERE id=?',
                   (payload, now(), actor, note, rid))
        db.execute('INSERT INTO br_audit(case_id,action,actor,note,created_at) VALUES(?,?,?,?,?)',
                   (rid, 'publish', actor, note, now()))


def withdraw(path, rid, actor, note):
    actor, note = text(actor, 'reviewer', 200), text(note, 'review note', 2000)
    with connect(path) as db:
        if not db.execute('SELECT 1 FROM br_cases WHERE id=?', (rid,)).fetchone():
            raise ValueError('Unknown case ID')
        db.execute('UPDATE br_cases SET published_json=NULL,published_at=NULL WHERE id=?', (rid,))
        db.execute('INSERT INTO br_audit(case_id,action,actor,note,created_at) VALUES(?,?,?,?,?)',
                   (rid, 'withdraw', actor, note, now()))


def export_records(path, output):
    with connect(path) as db:
        rows = db.execute('SELECT published_json,published_at FROM br_cases WHERE published_json IS NOT NULL ORDER BY id').fetchall()
        if len(rows) > 500:
            raise ValueError('Static preview is limited to 500 reports; add a viewport API before expanding publication')
        records = [{**validate(json.loads(row['published_json'])), 'reviewed_at': row['published_at']} for row in rows]
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    body = {'schema_version': 1, 'generated_at': now(), 'cases': records}
    temporary = output.with_suffix(output.suffix + '.tmp')
    temporary.write_text(json.dumps(body, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(output)
    return len(records)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', type=Path, default=DEFAULT_DB)
    sub = parser.add_subparsers(dest='command', required=True)
    imp = sub.add_parser('import')
    imp.add_argument('file', type=Path)
    for name in ['publish', 'withdraw']:
        review = sub.add_parser(name)
        review.add_argument('id')
        review.add_argument('--reviewed-by', required=True)
        review.add_argument('--note', required=True)
    exp = sub.add_parser('export')
    exp.add_argument('--output', type=Path, default=DEFAULT_EXPORT)
    sub.add_parser('list')
    args = parser.parse_args()
    try:
        if args.command == 'import':
            print(f'Imported {import_records(args.db, json.loads(args.file.read_text()))} draft(s); published snapshots unchanged.')
        elif args.command in ('publish', 'withdraw'):
            globals()[args.command](args.db, args.id, args.reviewed_by, args.note)
            print(f'{args.command}: {args.id}. The API reads the current published snapshot directly.')
        elif args.command == 'export':
            print(f'Exported {export_records(args.db, args.output)} reviewed case(s) to {args.output}')
        else:
            with connect(args.db) as db:
                for row in db.execute('SELECT id,published_json IS NOT NULL AS published FROM br_cases ORDER BY id'):
                    print(f'{row["id"]}\t{"published snapshot + draft" if row["published"] else "draft only"}')
    except (ValueError, TypeError, OSError, sqlite3.Error) as error:
        parser.exit(1, f'{error}\n')


if __name__ == '__main__':
    raise SystemExit('Legacy catalogue commands are retired. Run crawl.py directly; see README.md.')
