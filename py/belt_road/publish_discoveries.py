"""Operator-only publication of attributed research discoveries, not reviewed cases.

Only source codes, classifications, rounded locations and citations leave the crawl
database. Neither crawler state nor extracted report text is served by the API.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
from urllib.parse import urlsplit
from profiles import parse_tables


def project(crawl, document_id):
    document = crawl.execute('SELECT final_url,extracted_text FROM crawl_documents WHERE id=?',
                             (document_id,)).fetchone()
    if document is None:
        raise ValueError('Document not found')
    url, text = document
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or parsed.hostname != 'www.amnesty.org.au' or parsed.username or parsed.password:
        raise ValueError('Unsupported report publisher')
    rows = parse_tables(text, include_locations=True)
    counts = {kind: sum(row['evidence_level'] == kind for row in rows)
              for kind in ('source_documented', 'source_suspected')}
    if counts != {'source_documented': 86, 'source_suspected': 36}:
        raise ValueError('Report table totals do not match; no discoveries published')
    evidence = {(key, page, classification) for key, page, classification in crawl.execute(
        'SELECT case_key,pdf_page,source_classification FROM crawl_site_evidence WHERE document_id=?',
        (document_id,))}
    records = []
    for row in rows:
        if (row['case_key'], row['pdf_page'], row['evidence_level']) not in evidence:
            raise ValueError('Source page evidence mismatch; no discoveries published')
        records.append({'id': row['case_key'], 'site_code': row['site_code'],
                        'country': row['country'], 'classification': row['evidence_level'],
                        'review_status': 'needs_review', 'message_evidence': 'not_assessed',
                        'location': row['location'], 'pdf_page': row['pdf_page'],
                        'source_url': url, 'publisher': 'Amnesty International',
                        'source_title': 'Falling Through the Cracks (2026)',
                        'section': row['section']})
    return records


def publish(crawl_file, catalog_file, document_id):
    with sqlite3.connect(Path(crawl_file).resolve().as_uri() + '?mode=ro', uri=True) as crawl:
        records = project(crawl, document_id)
    # Never create a new catalogue at a mistyped path.
    with sqlite3.connect(Path(catalog_file).resolve().as_uri() + '?mode=rw', uri=True) as catalog:
        catalog.execute('''CREATE TABLE IF NOT EXISTS br_discoveries
            (id TEXT PRIMARY KEY, public_json TEXT NOT NULL, published_at TEXT NOT NULL)''')
        published_at = datetime.now(timezone.utc).isoformat()
        catalog.executemany('INSERT OR REPLACE INTO br_discoveries VALUES(?,?,?)',
                            [(row['id'], json.dumps(row), published_at) for row in records])
    return len(records)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--crawl-db', required=True)
    parser.add_argument('--catalog-db', required=True)
    parser.add_argument('--document-id', required=True, type=int)
    args = parser.parse_args()
    print(json.dumps({'discoveries_published': publish(args.crawl_db, args.catalog_db, args.document_id)}))
