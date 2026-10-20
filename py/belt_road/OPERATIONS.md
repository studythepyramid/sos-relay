# Testing the crawler on Lightsail

Public page: https://sosweb.org/belt-road/

The website shows only reviewed catalogue exports. The crawler's test results
are private and are inspected over SSH, not through a public admin endpoint.

## What this first crawler actually does

Python standard library; compatible with the VPS's Python 3.11. Reads the small
allowlisted sources.json registry, respects robots.txt, fetches bounded HTML/PDF
responses, extracts HTML text and approved report links, and saves private
research leads. Content hashes and source URLs are retained with each observation.

A research lead is a matching document, not a verified site or victim message.
It contains no generated coordinates or automatic abuse allegation. PDF URLs,
metadata and hashes are recorded, but PDF text parsing and original-file archiving
are not implemented. No Wikipedia adapter, LLM extraction, conditional refresh,
review UI or automatic marker publication is implemented yet.

The crawler uses `/var/lib/sos-relay-crawler/crawl.db` on Lightsail, separate from
both the production application and the private map catalogue. Its three tables
are crawl_jobs, crawl_documents and crawl_candidates. No public write API exists.

## Manual test service (no timer)

The root-owned systemd unit is versioned in deploy/sos-relay-crawler.service.
A dedicated sos-crawler user owns only its private state directory. Read/write
access to application state is blocked. Each service run attempts at most four
source jobs, seed depth only, with 3-second minimum per-host spacing, 15-second
request timeout, 4 MiB response limit, 128 MiB RAM limit and 180-second service
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
uv run python py/belt_road/crawl.py --db /tmp/belt-road-crawl-test.db run --max-documents 4 --max-depth 0
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
