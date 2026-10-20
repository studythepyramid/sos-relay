# /belt-road/ — server-owned data

The Leaflet page is code in Git. Case records, source configuration, collection
results and SQLite files are runtime state and must not be committed to GitHub.
`var/` and database/artifact patterns are Git-ignored. All automated tests use
synthetic fixtures, never scraped case records.

## Production architecture

Crawler → private discovery SQLite → source/location review → published SQLite
snapshot → GET /api/belt-road/cases → Leaflet. No Git push or static rebuild is
needed to add, revise or withdraw a published case.

- `/var/lib/sos-relay-crawler/crawl.db`: private research documents/leads, owned
  by sos-crawler; never used directly by the public API.
- `/var/lib/sos-relay-crawler/sources.json`: server-owned crawler allowlist/seeds.
- `/var/lib/sos-relay-map/catalog.db`: reviewed catalogue, owned by admin, outside
  the code checkout and all static document roots.
- `argument/src/beltRoad.js`: read-only API in the existing Node service. Database
  path comes from BELT_ROAD_DB_FILE. The service opens it read-only per request
  and returns an explicit field allowlist from published_json only.
- `docs/belt-road/`: HTML only; no case export is bundled or used as a fallback.
- `docs/assets/belt-road.js`: fetches the API, displays source-attributed skulls,
  groups screen collisions with count badges and preserves `?case=<id>` links.

The separate `/api/belt-road/discoveries` endpoint reads an operator-published
`br_discoveries(id, public_json, published_at)` projection in the same catalogue.
It never opens the private crawler DB. The page shows a discovery count, an
expandable source list, and amber circle markers: solid for publisher-documented,
dashed for publisher-suspected. These remain `needs_review`, with public-message
evidence `not_assessed`; they are not reviewed skull reports. Classification is
the publisher's historical assessment, not a current danger finding.

`publish_discoveries.py` validates the supported report totals and stored page
references, then copies only site codes, classifications, citations and locations
rounded to two decimals. Its 2 km display area is illustrative, not a confidence
bound. No original messages, names, extracted text, internal errors or operational
configuration enter the public projection. The API also validates an allowlist.
Both public endpoints are read-only, uncached and bounded to 500 records.

The API sends Cache-Control: no-store. Missing/unreadable storage returns 503;
no new empty DB is created. Drafts, audit/reviewer metadata and arbitrary crawler
fields cannot enter the public projection. POST is rejected. Reads are capped
at 500 reports and explicitly report has_more; viewport queries and aggregation
must replace this pilot limit as the catalogue grows.

## Catalogue structure

`br_cases(id, draft_json, draft_updated_at, published_json, published_at,
reviewed_by, review_note)` keeps draft and published snapshots separate.
`br_audit` records import/publication/withdrawal decisions. `schema_migrations`
tracks belt_road v1. An import cannot overwrite the published snapshot.

Candidate fields: stable ID, neutral title/country/summary, report date, public
communication description, temporal limitations, collection method, location
coordinates/precision/radius/basis and sources with publication/access dates and
bounded statements of what each supports. Distinct source counts deduplicate
URLs: a communication and its location supported by one article is one source.

Each public skull requires attributable public communication and place context.
Regional markers are editorial centres with explicitly illustrative areas, not
precise buildings, statistical confidence bounds or current victim whereabouts.
Historical sources do not establish current activity. A public plea conveyed
while reportedly confined is distinguishable from a later interview describing
a message, and neither is presented as a hosted original leaked chat. No direct
Belt and Road relationship is inferred from geography or nationality.

## Operator workflow on Lightsail

Keep extracted candidate files privately on the server, then run:

```bash
python3 /opt/sos-relay/py/belt_road/catalog.py \
  --db /var/lib/sos-relay-map/catalog.db import /private/path/candidates.json
python3 /opt/sos-relay/py/belt_road/catalog.py \
  --db /var/lib/sos-relay-map/catalog.db publish CASE_ID \
  --reviewed-by REVIEWER --note 'Sources, date, location and disclosure checked.'
```

The next API request sees the publication immediately. Use `withdraw CASE_ID`
with reviewer/note to remove a case from subsequent reads. No static export or
rebuild is involved. The optional `export` command defaults to ignored
var/belt-road-export.json for private inspection/transfer; never write it under
docs/ or commit it. Public readers can of course retain copies of already public
information after a later withdrawal.

`catalog.py` is a trusted local operator tool, not an authentication boundary.
The fetch worker has no permission to write the reviewed catalogue. Automated
collection alone does not publish allegations.

## Preview, tests and future work

A local preview reads the ignored local var/belt-road.db through a read-only
preview API; never serves the DB itself:

```bash
uv run python py/belt_road/preview.py
PYTHONPATH=py/belt_road uv run python -m unittest discover -s py/belt_road/tests -v
cd argument
npm test
```

Source provenance and generic content IDs are ready for later discussion
integration; no embedded argument/thread feature is implemented yet. The stable
content ID is belt-road:<case-id>, and canonical URLs remain /belt-road/?case=ID.

See OPERATIONS.md for the Lightsail crawler service and CRAWLER.md for its intended
expansion. No schedule is enabled. Lucide icons are vendored code assets with the
license retained in docs/assets/icons/; pages do not depend on the local symlink.

## Report profile adapter

The collection worker now supports a source-coded site table adapter in profiles.py.
It stores distinct site candidates and page evidence in the private discovery DB,
with documented/suspected publisher classifications kept separate. The target
counts these sites rather than documents. It does not publish them to the map.
See OPERATIONS.md for target limits, Poppler and private inspection commands.
