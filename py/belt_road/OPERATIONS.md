# Crawler operations

The current foreground workflow is documented in [README.md](README.md).
Start there for the command, limits, shared DB, source configuration and retries.

The old `sos-relay-crawler.service` workflow is retired. Do not start it: it used
the old crawler user, separate DB and cumulative 100-site stopping condition.
The normal command is now run as `admin`:

```bash
cd /opt/sos-relay
python3 py/belt_road/crawl.py run --max-jobs 100 --max-seconds 300
```

No crawler timer or service is required. The website's own application service
continues to serve the read-only API against the same DB the crawler writes.
