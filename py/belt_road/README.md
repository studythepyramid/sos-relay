# Belt & Road warning map

This sub-project tests a simple warning map for SOS Relay: gather public reporting
about coercion and trafficking, show source-reported locations as small skulls,
and let people open the sources. SOS Relay offers information and channels for
SOS communication; it does not act as a fact-checking or certifying authority.
The `/belt-road/` name is provisional and does not establish that a mapped site
belongs to a Belt and Road project.

## Run the crawler on Lightsail

Sign in as the existing `admin` user. Run Python directly in the foreground:

```bash
ssh lightsail.a
cd /opt/sos-relay
python3 py/belt_road/crawl.py run --max-jobs 100 --max-seconds 300
```

No Bash function, `sudo`, dedicated crawler account, crawler service, or
publication command is needed. Progress prints in the terminal. Ctrl+C stops
cleanly, and incomplete jobs remain queued. Only one crawler can run against the
same database at a time. The website continues to run through its existing
application service; that service is separate from launching this script.

Inspect counts, job outcomes and source-site evidence:

```bash
python3 py/belt_road/crawl.py status
python3 py/belt_road/crawl.py list --limit 100
python3 py/belt_road/crawl.py cases --limit 150
```

Each run attempts at most `--max-jobs` source jobs and has a wall-clock limit of
`--max-seconds` (defaults: 6 jobs, 600 seconds). `--max-documents` remains an alias
for `--max-jobs`. Optional `--max-new-sites 100` stops after a complete document
brings this run to at least 100 new map records; it does not compare against the
existing database total. A document can contain many sites, so the count can
exceed that target. Limits do not promise that new sites will be found.

The final output includes attempted jobs, fetched documents, failures, new and
updated map locations, elapsed time, and why the run stopped. A failed request
is reported as a failure rather than creating a location. Network timeouts,
request delays, response-size bounds and PDF subprocess bounds remain built in.

## How records reach the map

Find source URLs → fetch → extract locations and citations → save SQLite →
`GET /api/belt-road/locations` → Leaflet map.

There is no review queue, catalogue draft, import or publication snapshot in this
path. Successful supported extraction updates map records in the same transaction
as its document and job state. Reloading the page sees the new results. Technical
checks validate source URLs, coordinates and field sizes; they do not decide
whether a source's claims are true. Publisher classifications such as documented
and suspected remain attributed to that publisher. No `review pending` label or
promise of SOS Relay fact-checking is shown.

Records have stable IDs, rounded/approximate locations and linked citations. A
repeat observation of the same source site updates its record without adding a
second skull, and existing citations are retained. Different source IDs are not
automatically assumed to describe the same physical place. Counts represent
source records, not unique events, deaths or victim totals.

The popup shows the source and a short warning to check the facts yourself.
Source dates, classifications and coordinate context are available in details.
The map stays at the top; collection information stays in the footer. English
country/city names are preferred through OpenFreeMap with a disclosed standard
OSM fallback if vector rendering is unavailable. MapLibre/Leaflet assets are
pinned locally, with licenses and attribution retained.

## One database, one data directory

Production runtime state is in `/var/lib/sos-relay/belt-road/`, owned by `admin`:

- `data.db`: jobs, documents, extracted sites/evidence and map records.
- `sources.json`: source configuration and seed URLs.
- `artifacts/`: downloaded supported report PDFs, named by content hash.
- `crawl.lock`: prevents simultaneous foreground runs; no service is needed.

The CLI automatically uses this directory when deployed at `/opt/sos-relay`.
Local checkouts use ignored `var/belt-road/`. `BELT_ROAD_DB_FILE` or the CLI
`--db PATH` option can override the DB. The API uses the same environment variable.
The sources/artifact defaults are siblings of the chosen DB.

Main tables are `crawl_jobs`, `crawl_documents`, `crawl_candidates`,
`crawl_site_cases`, `crawl_site_evidence`, and `map_locations`. They keep task
progress and document extraction separate within one DB. `map_locations` holds
the current source-attributed result, not a reviewed publication snapshot.
The read-only API returns a field allowlist and never serves jobs, raw document
text, internal errors, or the SQLite file. SQLite WAL and short transactions
allow the API to read while a foreground crawl writes.

Collected records, source configuration, artifacts and DB files stay on the
server, outside the static document root and outside Git. Code deployment does
not carry or replace map data.

To deploy crawler code, commit it and use `git push production main`. The VPS
hook updates Python source without rebuilding the website or restarting the API.
Changes to `pyproject.toml`/`uv.lock` also refresh the Python environment. Updating
source URLs, keywords or collected data on the VPS needs no Git push; reloading
the map reads the current DB. Deployment details are in root `env.cmd.md`.

## Sources, retries and extraction limits

Edit `/var/lib/sos-relay/belt-road/sources.json` as `admin` to add sources or seeds.
Each entry has `id`, `publisher`, `allowed_hosts`, `allowed_prefixes`, `seeds`, and
`link_terms`. Only public HTTPS URLs on those allowed hosts/paths are fetched.
Robots directives are respected. Delays default to three seconds per host;
robots delays may increase this. Downloads default to 4 MiB; an explicitly
configured `max_bytes` can allow up to 32 MiB for a known report.

Completed seeds are skipped. To retry failed requests (up to three attempts):

```bash
python3 py/belt_road/crawl.py retry-failed
python3 py/belt_road/crawl.py run --max-jobs 20 --max-seconds 300
```

To fetch a particular completed source again, find its job ID with `list`, then
use `requeue JOB_ID` before running. Requeue does not override robots blocks.

**Current extraction capability:** the `amnesty-kh-2026` PDF adapter extracts the
coded Cambodia tables in Annex II/III using `pdftotext` (Debian package
`poppler-utils`). It preserves source page numbers and checks table structure and
totals as parser checks. Those results now go straight to the map. Source
configuration may include this `profile_adapter` and a `report_title`.

Other HTML/text/PDF sources are currently fetched and saved as document leads;
they do not produce invented coordinates or automatic skulls. A new report
format needs an extraction adapter. There is no general web-search engine,
Wikipedia adapter, LLM extraction, or recurring schedule in the current crawler.

## Development and migration notes

```bash
PYTHONPATH=py/belt_road python3 -m unittest discover -s py/belt_road/tests
cd argument
npm test
```

Tests use synthetic fixtures, including a crawler-to-Node-API integration check.
`preview.py` serves the map and read-only location API against the local DB.

The old crawler and catalogue DBs were combined once with `migrate.py`. Existing
map IDs/citations and crawl job/document history are preserved. Old files are
retained only as rollback material, not active databases. Migration refuses to
overwrite a destination. `catalog.py` and `publish_discoveries.py` are retired
legacy helpers, not commands for routine use.

`OPERATIONS.md` and `CRAWLER.md` remain as short pointers here. Start with this
README for the current implemented workflow. Future fact-checking, discussion
and additional source adapters can be added when needed.
