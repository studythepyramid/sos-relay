"""Local DDGS search → source registry → foreground Belt & Road crawler.

Adapted from localllm/py/search.py and py/websearch/ddgs.py; no LLM required.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time
from urllib.parse import urlsplit
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'py/belt_road'))
from crawl import canonical, connect, crawl_lock, enqueue
from store import DEFAULT_DB


def search_text(query, max_results=8, backend='auto'):
    from ddgs import DDGS
    DDGS.threads = 1
    return [dict(title=str(r.get('title') or ''),
                 url=str(r.get('href') or r.get('url') or ''),
                 snippet=str(r.get('body') or r.get('snippet') or ''))
            for r in DDGS(timeout=15).text(query, max_results=max_results, backend=backend)]


def write_json(path, value):
    temporary = path.with_suffix('.json.next')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


def register(db_path, sources_path, hits):
    """Persist source configuration before queueing; URL uniqueness makes retries safe."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    sources_path.parent.mkdir(parents=True, exist_ok=True)
    with crawl_lock(db_path.parent / 'crawl.lock'):
        sources = json.loads(sources_path.read_text()) if sources_path.exists() else []
        # Keep existing configured adapters and jobs usable in the shared local DB.
        original = db_path.parent / 'sources.json'
        if original.exists() and original.resolve() != sources_path.resolve():
            known = {s['id'] for s in sources}
            sources.extend(s for s in json.loads(original.read_text()) if s['id'] not in known)
        accepted, skipped = [], []
        for hit in hits:
            try:
                url = canonical(hit['url'])
            except (ValueError, TypeError, KeyError):
                skipped.append(hit.get('url', ''))
                continue
            host = urlsplit(url).hostname
            source = next((s for s in sources if url in s['seeds']), None)
            if source is None:
                sid = 'web-' + hashlib.sha256(host.encode()).hexdigest()[:16]
                source = next((s for s in sources if s['id'] == sid), None)
                if source is None:
                    source = dict(id=sid, publisher=host, allowed_hosts=[host],
                                  allowed_prefixes=['/'], seeds=[],
                                  link_terms=['scam', 'traffick', 'forced labour', 'forced labor'])
                    sources.append(source)
                if url not in source['seeds']:
                    source['seeds'].append(url)
            accepted.append((source, url))
        write_json(sources_path, sources)
        db = connect(db_path)
        try:
            before = db.total_changes
            with db:
                for source, url in accepted:
                    enqueue(db, source, url)
            return dict(queued=db.total_changes - before, skipped_urls=skipped)
        finally:
            db.close()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('queries', nargs='*', help='Quote each search phrase')
    parser.add_argument('--url', action='append', default=[], help='Direct HTTPS seed; repeatable')
    parser.add_argument('--max-results', type=int, choices=range(1, 51), default=8, metavar='1..50')
    parser.add_argument('--backend', default='auto')
    parser.add_argument('--search-delay', type=float, default=5)
    parser.add_argument('--out-dir', type=Path, default=ROOT / 'tmp/belt-road/search')
    parser.add_argument('--sources', type=Path, default=ROOT / 'tmp/belt-road/sources.json')
    parser.add_argument('--db', type=Path, default=DEFAULT_DB)
    parser.add_argument('--crawl', action='store_true')
    parser.add_argument('--max-jobs', type=int, choices=range(1, 501), default=20, metavar='1..500')
    parser.add_argument('--max-seconds', type=int, choices=range(1, 86401), default=300, metavar='1..86400')
    parser.add_argument('--delay', type=float, default=5)
    args = parser.parse_args(argv)
    if not args.queries and not args.url:
        parser.error('Supply a query or --url')
    if not 2 <= args.search_delay < 60 or not 2 <= args.delay < 60:
        parser.error('Delays must be at least 2 and below 60 seconds')
    args.out_dir.mkdir(parents=True, exist_ok=True)
    errors = 0
    try:
        # Serializes search batches using this output directory, including their pauses.
        with crawl_lock(args.out_dir / 'search.lock'):
            batches = [(q, None) for q in args.queries]
            if args.url:
                batches.append((None, [dict(url=u, title='', snippet='') for u in args.url]))
            for index, (query, hits) in enumerate(batches):
                if index and query:
                    time.sleep(args.search_delay)
                record = dict(query=query, backend=args.backend, searched_at=datetime.now(timezone.utc).isoformat())
                try:
                    record['hits'] = hits if hits is not None else search_text(query, args.max_results, args.backend)
                except Exception as exc:
                    record.update(hits=[], error=str(exc))
                    errors += 1
                output = args.out_dir / (datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S') + '-' + uuid.uuid4().hex[:12] + '.json')
                write_json(output, record)
                result = register(args.db, args.sources, record['hits'])
                print(json.dumps(dict(output=str(output), query=query, hits=len(record['hits']),
                                      error=record.get('error'), **result)), flush=True)
        if args.crawl:
            result = subprocess.run([sys.executable, str(ROOT / 'py/belt_road/crawl.py'),
                '--db', str(args.db), 'run', '--sources', str(args.sources),
                '--max-depth', '0', '--max-jobs', str(args.max_jobs),
                '--max-seconds', str(args.max_seconds), '--delay', str(args.delay)])
            if result.returncode:
                return result.returncode
        return 1 if errors else 0
    except (OSError, ValueError) as exc:
        print(f'Search pipeline: {exc}', file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print('Stopped; saved results and queued jobs are retained.', file=sys.stderr)
        return 130


if __name__ == '__main__':
    raise SystemExit(main())
