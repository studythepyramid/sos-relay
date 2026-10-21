"""One-time migration from the old two-DB pipeline; source databases are read-only."""
import argparse
import json
from pathlib import Path
import sqlite3
from crawl import connect
from profiles import parse_tables
from store import profile_record, save_location


def migrate(crawl_file, catalog_file, destination):
    destination = Path(destination)
    if destination.exists():
        raise ValueError('Destination exists; choose a new path to avoid overwriting runtime data')
    destination.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(Path(crawl_file).resolve().as_uri() + '?mode=ro', uri=True) as old:
        with sqlite3.connect(destination) as target:
            old.backup(target)
    db = connect(destination)
    try:
        with sqlite3.connect(Path(catalog_file).resolve().as_uri() + '?mode=ro', uri=True) as old:
            published = old.execute('SELECT published_json FROM br_cases WHERE published_json IS NOT NULL').fetchall()
            discoveries = old.execute('SELECT public_json FROM br_discoveries').fetchall()
        with db:
            for (payload,) in published:
                save_location(db, {**json.loads(payload), 'source_classification': 'reported'})
            for (payload,) in discoveries:
                row = json.loads(payload)
                save_location(db, profile_record({'case_key': row['id'], 'site_code': row['site_code'],
                    'country': row['country'], 'evidence_level': row['classification'],
                    'location': row['location'], 'pdf_page': row['pdf_page'], 'section': row['section']},
                    row['source_url'], row['publisher'], row['source_title']))
            # Recover mappable source rows collected before the old publication step.
            for document in db.execute('SELECT id,final_url,extracted_text FROM crawl_documents WHERE mime_type=?', ('application/pdf',)).fetchall():
                evidence = {r[0] for r in db.execute('SELECT case_key FROM crawl_site_evidence WHERE document_id=?', (document['id'],))}
                for row in parse_tables(document['extracted_text'], include_locations=True):
                    if row['case_key'] in evidence:
                        save_location(db, profile_record(row, document['final_url']))
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise ValueError('Migration integrity check failed')
        return {'locations': db.execute('SELECT count(*) FROM map_locations').fetchone()[0],
                'jobs': db.execute('SELECT count(*) FROM crawl_jobs').fetchone()[0],
                'documents': db.execute('SELECT count(*) FROM crawl_documents').fetchone()[0]}
    finally:
        db.close()
        destination.chmod(0o600)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--crawl-db', required=True)
    parser.add_argument('--catalog-db', required=True)
    parser.add_argument('--destination', required=True)
    args = parser.parse_args()
    print(json.dumps(migrate(args.crawl_db, args.catalog_db, args.destination)))
