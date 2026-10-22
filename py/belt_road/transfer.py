"""Export and merge crawler data; never replace the destination SQLite file."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3

from crawl import connect, crawl_lock
from store import DEFAULT_DB, clean_record, save_location

TABLES = ('crawl_jobs', 'crawl_documents', 'crawl_candidates', 'crawl_site_cases',
          'crawl_site_evidence', 'crawl_place_mentions', 'map_locations')


def export_bundle(db_path, sources_path, output):
    with sqlite3.connect(db_path.resolve().as_uri() + '?mode=ro', uri=True) as db:
        db.row_factory = sqlite3.Row
        db.execute('BEGIN')
        tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        bundle = {'version': 1, 'sources': json.loads(sources_path.read_text()),
                  'tables': {t: [dict(r) for r in db.execute('SELECT * FROM ' + t)] if t in tables else [] for t in TABLES}}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(bundle, ensure_ascii=False))
    output.chmod(0o600)
    return {t: len(rows) for t, rows in bundle['tables'].items()}


def merge(db_path, sources_path, bundle):
    if bundle.get('version') != 1:
        raise ValueError('Unsupported bundle version')
    rows = bundle['tables']
    for row in rows['map_locations']:
        clean_record(json.loads(row['record_json']))
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with crawl_lock(db_path.parent / 'crawl.lock'):
        # Back up before opening through connect(), which can upgrade the schema.
        backup_dir = db_path.parent / 'backups'
        backup_dir.mkdir(exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f')
        backup_path = backup_dir / ('before-import-' + stamp + '.db')
        if db_path.exists():
            with sqlite3.connect(db_path) as src, sqlite3.connect(backup_path) as dst:
                src.backup(dst)
            backup_path.chmod(0o600)
        sources = json.loads(sources_path.read_text()) if sources_path.exists() else []
        if sources_path.exists():
            saved = backup_dir / ('sources-' + stamp + '.json')
            saved.write_bytes(sources_path.read_bytes())
            saved.chmod(0o600)
        by_id = {s['id']: s for s in sources}
        for source in bundle['sources']:
            if source['id'] in by_id:
                existing = by_id[source['id']]
                if existing['allowed_hosts'] != source['allowed_hosts'] or existing['allowed_prefixes'] != source['allowed_prefixes']:
                    raise ValueError('Conflicting source configuration: ' + source['id'])
                existing['seeds'] = list(dict.fromkeys(existing['seeds'] + source['seeds']))
            else:
                sources.append(source)
                by_id[source['id']] = source
        # Persist registry first: failed imports can safely leave extra source entries.
        sources_path.parent.mkdir(parents=True, exist_ok=True)
        temp = sources_path.with_suffix('.json.next')
        temp.write_text(json.dumps(sources, ensure_ascii=False, indent=2) + '\n')
        temp.chmod(0o600)
        temp.replace(sources_path)
        db = connect(db_path)
        counts = dict(jobs_added=0, documents_added=0, mentions_added=0,
                      locations_added=0, locations_updated=0, locations_unchanged=0)
        try:
            with db:
                db.execute('''CREATE TABLE IF NOT EXISTS crawl_place_mentions (
                    id TEXT PRIMARY KEY, document_id INTEGER NOT NULL REFERENCES crawl_documents(id),
                    name TEXT NOT NULL, quote TEXT NOT NULL, text_offset INTEGER NOT NULL,
                    model TEXT NOT NULL, extractor_version TEXT NOT NULL)''')
                jobs, documents = {}, {}
                for row in rows['crawl_jobs']:
                    fields = [k for k in row if k != 'id']
                    counts['jobs_added'] += db.execute('INSERT OR IGNORE INTO crawl_jobs (' + ','.join(fields) + ') VALUES (' + ','.join('?' for _ in fields) + ')', [row[k] for k in fields]).rowcount
                    jobs[row['id']] = db.execute('SELECT id FROM crawl_jobs WHERE url=?', (row['url'],)).fetchone()[0]
                for row in rows['crawl_documents']:
                    fields = ['job_id','final_url','fetched_at','mime_type','content_hash','title','extracted_text','parser_version']
                    values = {**row, 'job_id': jobs[row['job_id']]}
                    counts['documents_added'] += db.execute('INSERT OR IGNORE INTO crawl_documents (' + ','.join(fields) + ') VALUES (' + ','.join('?' for _ in fields) + ')', [values[k] for k in fields]).rowcount
                    documents[row['id']] = db.execute('SELECT id FROM crawl_documents WHERE job_id=? AND content_hash=?', (values['job_id'], row['content_hash'])).fetchone()[0]
                for row in rows['crawl_candidates']:
                    db.execute('INSERT OR IGNORE INTO crawl_candidates(document_id,terms_json,evidence_kind) VALUES(?,?,?)', (documents[row['document_id']], row['terms_json'], row['evidence_kind']))
                for row in rows['crawl_site_cases']:
                    db.execute('INSERT OR IGNORE INTO crawl_site_cases VALUES(?,?,?,?)', tuple(row[k] for k in ('case_key','site_code','country','evidence_level')))
                for row in rows['crawl_site_evidence']:
                    db.execute('INSERT OR IGNORE INTO crawl_site_evidence VALUES(?,?,?,?,?)', (row['case_key'], documents[row['document_id']], row['pdf_page'], row['section'], row['source_classification']))
                for row in rows['crawl_place_mentions']:
                    doc_id = documents[row['document_id']]
                    rid = hashlib.sha256(json.dumps([doc_id, row['name'].casefold(), row['quote']]).encode()).hexdigest()
                    counts['mentions_added'] += db.execute('INSERT OR IGNORE INTO crawl_place_mentions VALUES(?,?,?,?,?,?,?)', (rid, doc_id, row['name'], row['quote'], row['text_offset'], row['model'], row['extractor_version'])).rowcount
                for row in rows['map_locations']:
                    counts['locations_' + save_location(db, json.loads(row['record_json']))] += 1
                if db.execute('PRAGMA foreign_key_check').fetchone():
                    raise ValueError('Foreign-key validation failed')
            counts['backup'] = str(backup_path)
            counts['map_total'] = db.execute('SELECT count(*) FROM map_locations').fetchone()[0]
            return counts
        finally:
            db.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['export', 'import'])
    parser.add_argument('bundle', type=Path)
    parser.add_argument('--db', type=Path, default=DEFAULT_DB)
    parser.add_argument('--sources', type=Path)
    args = parser.parse_args()
    sources = args.sources or args.db.parent / 'sources.json'
    if args.command == 'export':
        result = export_bundle(args.db, sources, args.bundle)
    else:
        result = merge(args.db, sources, json.loads(args.bundle.read_text()))
    print(json.dumps(result))


if __name__ == '__main__':
    main()
