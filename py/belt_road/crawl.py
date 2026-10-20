"""Bounded public-source research crawler. Never writes the map publication catalogue."""
import argparse
from datetime import datetime, timezone
import hashlib
from html.parser import HTMLParser
import ipaddress
import json
from pathlib import Path
import re
import socket
import sqlite3
import time
from urllib import error, parse, request, robotparser

VERSION = '1'
ROOT = Path(__file__).resolve().parents[2]
USER_AGENT = 'SOSRelayResearch/0.1 (+https://sosweb.org/belt-road/)'
MAX_BYTES = 4 * 1024 * 1024
MAX_TEXT = 250000
TERMS = ('scam', 'traffick', 'forced labour', 'forced labor', 'coerced', 'plea', 'survivor')


def now():
    return datetime.now(timezone.utc).isoformat()


def canonical(url):
    p = parse.urlsplit(url)
    if p.scheme != 'https' or not p.hostname or p.username or p.password or p.port not in (None, 443):
        raise ValueError('Only public HTTPS URLs without credentials are supported')
    return parse.urlunsplit(('https', p.netloc.lower(), p.path or '/', p.query, ''))


def allowed(url, source, robots=False):
    try:
        p = parse.urlsplit(canonical(url))
        return p.hostname in source['allowed_hosts'] and (robots and p.path == '/robots.txt' or any(p.path.startswith(prefix) for prefix in source['allowed_prefixes']))
    except (ValueError, TypeError):
        return False


def public_destination(url):
    host = parse.urlsplit(url).hostname
    addresses = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
        raise ValueError('Non-public network destination rejected')


class RedirectGuard(request.HTTPRedirectHandler):
    def __init__(self, source, robots=False):
        self.source, self.robots = source, robots

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not allowed(newurl, self.source, self.robots):
            raise ValueError('Redirect outside approved source paths')
        public_destination(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class TextPage(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts, self.links, self.title = [], [], []
        self.skip, self.in_title, self.link = 0, False, None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ('script', 'style', 'noscript', 'nav', 'header', 'footer'):
            self.skip += 1
        if tag == 'title':
            self.in_title = True
        if tag == 'a' and not self.skip:
            self.link = [attrs.get('href', ''), []]
        if tag in ('p', 'div', 'section', 'article', 'h1', 'h2', 'h3', 'li', 'br') and not self.skip:
            self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'noscript', 'nav', 'header', 'footer'):
            self.skip = max(0, self.skip - 1)
        if tag == 'title':
            self.in_title = False
        if tag == 'a' and self.link:
            self.links.append((self.link[0], ' '.join(self.link[1])))
            self.link = None

    def handle_data(self, value):
        if self.in_title:
            self.title.append(value)
        if not self.skip:
            self.parts.append(value)
            if self.link:
                self.link[1].append(value)

    def text(self):
        return '\n'.join(' '.join(line.split()) for line in ''.join(self.parts).splitlines() if line.strip())[:MAX_TEXT]


def connect(path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA journal_mode=WAL')
    db.executescript('''
        CREATE TABLE IF NOT EXISTS crawl_jobs (
            id INTEGER PRIMARY KEY, source_id TEXT NOT NULL, url TEXT NOT NULL UNIQUE,
            depth INTEGER NOT NULL, discovered_from TEXT, status TEXT NOT NULL DEFAULT 'queued',
            attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, fetched_at TEXT
        );
        CREATE TABLE IF NOT EXISTS crawl_documents (
            id INTEGER PRIMARY KEY, job_id INTEGER NOT NULL REFERENCES crawl_jobs(id),
            final_url TEXT NOT NULL, fetched_at TEXT NOT NULL, mime_type TEXT NOT NULL,
            content_hash TEXT NOT NULL, title TEXT, extracted_text TEXT NOT NULL,
            parser_version TEXT NOT NULL, UNIQUE(job_id,content_hash)
        );
        CREATE TABLE IF NOT EXISTS crawl_candidates (
            id INTEGER PRIMARY KEY, document_id INTEGER NOT NULL REFERENCES crawl_documents(id),
            terms_json TEXT NOT NULL, evidence_kind TEXT NOT NULL DEFAULT 'research_lead',
            review_status TEXT NOT NULL DEFAULT 'needs_review',
            UNIQUE(document_id)
        );
    ''')
    db.execute('PRAGMA foreign_keys=ON')
    return db


def enqueue(db, source, url, depth=0, parent=None):
    if not allowed(url, source):
        return False
    url = canonical(url)
    # No arbitrary query URL expansion: tracking/search loops are not research.
    if depth and parse.urlsplit(url).query:
        return False
    db.execute('INSERT OR IGNORE INTO crawl_jobs(source_id,url,depth,discovered_from) VALUES(?,?,?,?)',
               (source['id'], url, depth, parent))
    return True


class Fetcher:
    def __init__(self, delay=3, timeout=15):
        self.delay, self.timeout = delay, timeout
        self.last_request, self.robots = {}, {}

    def fetch(self, url, source, robots=False):
        if not allowed(url, source, robots):
            raise ValueError('URL outside approved source paths')
        public_destination(url)
        host = parse.urlsplit(url).hostname
        wait = self.delay - (time.monotonic() - self.last_request.get(host, 0))
        if wait > 0:
            time.sleep(wait)
        self.last_request[host] = time.monotonic()
        # Ignore environment proxies and use the system certificate trust store.
        opener = request.build_opener(request.ProxyHandler({}), RedirectGuard(source, robots))
        req = request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept-Encoding': 'identity'})
        with opener.open(req, timeout=self.timeout) as response:
            body = response.read(MAX_BYTES + 1)
            if len(body) > MAX_BYTES:
                raise ValueError('Response exceeds 4 MiB limit')
            if response.headers.get('Content-Encoding', 'identity') not in ('identity', ''):
                raise ValueError('Compressed responses are not supported by this pilot')
            return response.geturl(), response.headers.get_content_type(), body

    def permitted(self, url, source):
        p = parse.urlsplit(url)
        origin = f'{p.scheme}://{p.netloc}'
        if origin not in self.robots:
            robots_url = origin + '/robots.txt'
            parser = robotparser.RobotFileParser(robots_url)
            try:
                _, _, body = self.fetch(robots_url, source, robots=True)
                parser.parse(body.decode('utf-8', 'replace').splitlines())
            except error.HTTPError as exc:
                if exc.code == 404:
                    parser.parse([])
                else:
                    raise ValueError(f'robots.txt unavailable (HTTP {exc.code}); fetch skipped') from None
            except (OSError, ValueError) as exc:
                raise ValueError(f'robots.txt unavailable; fetch skipped ({type(exc).__name__})') from None
            self.robots[origin] = parser
        parser = self.robots[origin]
        crawl_delay = parser.crawl_delay(USER_AGENT)
        rate = parser.request_rate(USER_AGENT)
        if crawl_delay:
            self.delay = max(self.delay, crawl_delay)
        if rate:
            self.delay = max(self.delay, rate.seconds / rate.requests)
        return parser.can_fetch(USER_AGENT, url)


def discover_links(page, base, source):
    for href, label in page.links:
        target = parse.urljoin(base, href)
        if allowed(target, source) and any(term in (target + ' ' + label).lower() for term in source['link_terms']):
            yield canonical(target)


def run(db, sources, fetcher, limit=6, max_depth=1):
    by_id = {source['id']: source for source in sources}
    for source in sources:
        for seed in source['seeds']:
            enqueue(db, source, seed)
    db.commit()
    counts = {'fetched': 0, 'blocked': 0, 'failed': 0, 'leads': 0}
    for _ in range(limit):
        row = db.execute("SELECT * FROM crawl_jobs WHERE status='queued' ORDER BY depth,id LIMIT 1").fetchone()
        if not row:
            break
        source = by_id.get(row['source_id'])
        if source is None:
            # A removed registry entry must not leave the queue stuck.
            db.execute("UPDATE crawl_jobs SET status='disabled' WHERE id=?", (row['id'],))
            db.commit()
            continue
        try:
            if not fetcher.permitted(row['url'], source):
                db.execute("UPDATE crawl_jobs SET status='blocked',last_error='Disallowed by robots.txt',attempts=attempts+1 WHERE id=?", (row['id'],))
                db.commit()
                counts['blocked'] += 1
                continue
            final_url, mime, body = fetcher.fetch(row['url'], source)
            digest = hashlib.sha256(body).hexdigest()
            page = None
            if mime in ('text/html', 'application/xhtml+xml'):
                page = TextPage()
                page.feed(body.decode('utf-8', 'replace'))
                extracted, title = page.text(), ' '.join(page.title)[:500]
            elif mime == 'application/pdf':
                # PDF evidence needs a reviewed parser stage; do not execute external tools here.
                extracted, title = '', 'PDF discovered; text extraction pending'
            elif mime == 'text/plain':
                extracted, title = body.decode('utf-8', 'replace')[:MAX_TEXT], ''
            else:
                raise ValueError('Unsupported document type')
            with db:
                db.execute('''INSERT OR IGNORE INTO crawl_documents
                    (job_id,final_url,fetched_at,mime_type,content_hash,title,extracted_text,parser_version)
                    VALUES(?,?,?,?,?,?,?,?)''',
                           (row['id'], final_url, now(), mime, digest, title, extracted, VERSION))
                document = db.execute('SELECT id FROM crawl_documents WHERE job_id=? AND content_hash=?', (row['id'], digest)).fetchone()[0]
                terms = [term for term in TERMS if term in extracted.lower()]
                if terms or mime == 'application/pdf':
                    before = db.total_changes
                    db.execute('INSERT OR IGNORE INTO crawl_candidates(document_id,terms_json) VALUES(?,?)', (document, json.dumps(terms)))
                    counts['leads'] += db.total_changes - before
                if page and row['depth'] < max_depth:
                    for link in list(dict.fromkeys(discover_links(page, final_url, source)))[:20]:
                        enqueue(db, source, link, row['depth'] + 1, row['url'])
                db.execute("UPDATE crawl_jobs SET status='fetched',fetched_at=?,last_error=NULL,attempts=attempts+1 WHERE id=?", (now(), row['id']))
            counts['fetched'] += 1
        except (OSError, ValueError, error.URLError) as exc:
            # Avoid dumping response bodies, query strings or extracted text into logs.
            message = f'HTTP {exc.code}' if isinstance(exc, error.HTTPError) else str(exc)[:200] if isinstance(exc, ValueError) else type(exc).__name__
            with db:
                db.execute("UPDATE crawl_jobs SET status='failed',last_error=?,attempts=attempts+1 WHERE id=?", (message, row['id']))
            counts['failed'] += 1
    return counts


def status(db):
    return {
        'jobs': dict(db.execute('SELECT status,count(*) FROM crawl_jobs GROUP BY status').fetchall()),
        'documents': db.execute('SELECT count(*) FROM crawl_documents').fetchone()[0],
        'research_leads': db.execute('SELECT count(*) FROM crawl_candidates').fetchone()[0],
        'published_by_crawler': 0,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', type=Path, default=ROOT / 'var/belt-road-crawl.db')
    sub = parser.add_subparsers(dest='command', required=True)
    crawl = sub.add_parser('run')
    crawl.add_argument('--sources', type=Path, default=Path(__file__).with_name('sources.json'))
    crawl.add_argument('--max-documents', type=int, choices=range(1, 21), default=6, metavar='1..20')
    crawl.add_argument('--max-depth', type=int, choices=[0, 1], default=1)
    crawl.add_argument('--delay', type=float, default=3)
    sub.add_parser('status')
    sub.add_parser('retry-failed')
    listing = sub.add_parser('list')
    listing.add_argument('--limit', type=int, default=20)
    args = parser.parse_args()
    db = connect(args.db)
    try:
        if args.command == 'run':
            if args.delay < 2 or not args.delay < 60:
                parser.error('--delay must be at least 2 and below 60 seconds')
            sources = json.loads(args.sources.read_text())
            print(json.dumps(run(db, sources, Fetcher(args.delay), args.max_documents, args.max_depth)))
        elif args.command == 'retry-failed':
            with db:
                changed = db.execute("UPDATE crawl_jobs SET status='queued' WHERE status='failed' AND attempts<3").rowcount
            print(json.dumps({'requeued': changed, 'attempt_limit': 3}))
        elif args.command == 'list':
            if not 1 <= args.limit <= 100:
                parser.error('--limit must be 1..100')
            for row in db.execute('''SELECT j.id,j.source_id,j.status,j.last_error,j.url,d.title
                FROM crawl_jobs j LEFT JOIN crawl_documents d ON d.job_id=j.id
                ORDER BY j.id LIMIT ?''', (args.limit,)):
                print(json.dumps(dict(row), ensure_ascii=False))
        print(json.dumps(status(db)))
    finally:
        db.close()


if __name__ == '__main__':
    main()
