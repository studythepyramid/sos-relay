# Testing the crawler on Lightsail

Public page: https://sosweb.org/belt-road/

The website reads reviewed server-owned SQLite snapshots through /api/belt-road/cases. The crawler's test results
are private and are inspected over SSH, not through a public admin endpoint.

## What this first crawler actually does

Python standard library; compatible with the VPS's Python 3.11. Reads the server-owned
/var/lib/sos-relay-crawler/sources.json allowlist, respects robots.txt, fetches bounded HTML/PDF
responses, extracts HTML text and approved report links, and saves private
research leads. Content hashes and source URLs are retained with each observation.

A research lead is a matching document, not a verified site or victim message.
It contains no generated coordinates or automatic abuse allegation. Supported report PDFs are archived by hash in the private artifacts/ directory.
The amnesty-kh-2026 adapter uses pdftotext on pages 159–176, extracting site IDs
from Annex II and III. Other PDFs remain document leads without automatic parsing. No Wikipedia adapter, LLM extraction, conditional refresh,
review UI or automatic marker publication is implemented yet.

The crawler uses `/var/lib/sos-relay-crawler/crawl.db` on Lightsail, separate from
both the production application and the private map catalogue. Its three tables
are crawl_jobs, crawl_documents and crawl_candidates. No public write API exists.

## Manual test service (no timer)

The root-owned systemd unit is versioned in deploy/sos-relay-crawler.service.
A dedicated sos-crawler user owns only its private state directory. Read/write
access to application state is blocked. Each service run attempts at most 100
source jobs, up to one link level from each seed, and stops when the private
site-case collection reaches at least 100 distinct source-coded sites, with 3-second minimum per-host spacing, 15-second
request timeout, 4 MiB default response limit (up to 32 MiB only for an approved report source),
256 MiB RAM limit and 1800-second service
timeout. HTTP or robots failures are recorded rather than bypassed.

```bash
ssh lightsail.a 'sudo systemctl start --no-block sos-relay-crawler'
ssh lightsail.a 'sudo systemctl status sos-relay-crawler --no-pager'
ssh lightsail.a 'sudo journalctl -u sos-relay-crawler -n 30 --no-pager'
ssh lightsail.a 'sudo -u sos-crawler python3 /opt/sos-relay/py/belt_road/crawl.py --db /var/lib/sos-relay-crawler/crawl.db status'
ssh lightsail.a 'sudo -u sos-crawler python3 /opt/sos-relay/py/belt_road/crawl.py --db /var/lib/sos-relay-crawler/crawl.db list'
```

A successful oneshot normally becomes inactive (dead), with exit status 0.
Inspect counts: HTTP failures can be recorded during a successful bounded run.
Repeated runs resume queued work and do not refetch completed seeds. A failed job
can be explicitly requeued up to three attempts:

```bash
ssh lightsail.a 'sudo -u sos-crawler python3 /opt/sos-relay/py/belt_road/crawl.py --db /var/lib/sos-relay-crawler/crawl.db retry-failed'
```

Do not run the CLI and service concurrently. Robots-disallowed jobs are not
requeued by retry-failed. Before expanding to link depth one or more documents,
inspect actual source outcomes. No timer or unattended retry loop is enabled.

## Reproduce with an isolated test database

From the local repository (this makes real network requests):

```bash
uv run python py/belt_road/crawl.py --db /tmp/belt-road-crawl-test.db run --sources /private/path/sources.json --max-documents 12 --max-depth 1
uv run python py/belt_road/crawl.py --db /tmp/belt-road-crawl-test.db status
uv run python py/belt_road/crawl.py --db /tmp/belt-road-crawl-test.db list
```

Offline deterministic tests use temporary SQLite databases and fake fetchers:

```bash
PYTHONPATH=py/belt_road uv run python -m unittest discover -s py/belt_road/tests -v
```

Reading raw extracted document text or inspecting the SQLite file should be done
privately as the dedicated user. Do not copy crawl.db into docs/ or static output.
A source that blocks the worker remains a failed/blocked source; request permitted
access or select another source, rather than bypassing its restrictions.

Case and discovery databases, extracted JSON and operational source configuration
belong to server state, never GitHub. The API service environment drop-in is
deploy/sos-relay-argument-belt-road.conf. See README.md for catalogue publication.

## Site-level collection target

`--target-cases 100` counts distinct keys in crawl_site_cases, not matching
documents, article URLs or map markers. A source document may contain many sites.
The unit stops after a complete source document crosses the target, so collecting
more than 100 is expected; rows are never truncated to manufacture an exact count.

Each site retains its source classification (`source_documented` or
`source_suspected`), review state and unassessed victim-message evidence.
crawl_site_evidence retains the source document and PDF page. Classification is
attributed to the publisher, not an independent finding or a current danger score.
Coordinates used to recognize table rows are not copied into site-case records.
The reviewed public map catalogue remains separate.

On Debian, the supported PDF adapter needs poppler-utils (`pdftotext`). It runs
in a subprocess with a 45-second timeout and restricted systemd permissions.
The adapter checks both table totals before importing any sites. Synthetic tests
cover section boundaries, row IDs, code variants, duplicates and target stopping.

After deployment, inspect cases privately:

```bash
ssh lightsail.a 'sudo -u sos-crawler python3 /opt/sos-relay/py/belt_road/crawl.py --db /var/lib/sos-relay-crawler/crawl.db cases --limit 150'
```

No site candidates become public skulls automatically. They still need individual
source/message/location and disclosure review under the existing map criteria.
