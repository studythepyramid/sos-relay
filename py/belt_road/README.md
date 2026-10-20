# /belt-road/ — first local implementation

The page is a static, read-only Leaflet map of public reports of victim
communications. It uses the existing vendored Leaflet and OpenStreetMap tiles.
It is not a user SOS intake, a live-danger service or a death count.

This first slice includes one manually source-checked historical report concerning
Tai Chang, Myanmar. It displays a regional map centre and illustrative 30 km area,
not an exact building or statistical confidence bound. No direct Belt and Road
project relationship has been established for this record. Source attribution
is a separate matter from independently verifying the reported account.

A bounded discovery crawler is implemented in `crawl.py`; its discoveries stay
in a separate private database. The catalogue importer is the boundary for
reviewed, fully extracted candidates. It accepts fully extracted candidate records, not raw pages or
incomplete place descriptions. Rejected batches make no partial changes. A future
fetch/discovery queue must retain raw retrieval metadata and incomplete candidates
outside the public site; this importer is not that crawler/archive.

## Files and architecture

- `docs/belt-road/index.html`: canonical route /belt-road/, also served by MkDocs.
- `docs/assets/belt-road.js`: fetch public JSON, render skulls/areas, search,
  case/source details, shareable `?case=<stable-id>` URL and map controls.
- `docs/assets/belt-road.css`: map-first desktop layout and stacked phone layout.
- `catalog.py`: validated draft import, explicit publication/withdrawal and
  atomic static export; Python standard library only.
- `var/belt-road.db`: private local collection database, ignored by git and
  outside static roots. Separate from genone.db to isolate collection writes
  and avoid changing SOS/account/argument storage in this slice.
- `docs/belt-road/cases.json`: generated public projection, safe for static hosting.
- `seed.json`: reproducible manual source seed. It contains no victim identity,
  original private message, precise building coordinates or fabricated cases.

## Data structure

Crawler adapters emit a JSON array using the shape in `seed.json`:

- `id`: stable lowercase record slug; never derive solely from a person's name.
- `title`, `country`, `summary`: neutral report/site description and attribution.
- `reported_on`: source report date, not an invented precise incident date.
- `communication`: what public reporting says about the communication and its form.
- `current_status`: temporal limitation; a historical plea is not a current receipt.
- `collection_method`: `crawler` or `manual_seed`; importer does not mislabel seeds.
- `location`: latitude/longitude, `region` or `site` precision, radius in metres,
  human-readable label, and an explicit account of the geolocation basis.
- `sources[]`: HTTPS URL, title, publisher, publication/access dates, source kind
  and bounded text describing exactly what it supports. At least one
  `victim_message_report` and one `location_context` source are required.

The importer constructs a fixed allowlist. Unknown input fields are discarded;
caller-supplied review/publication fields have no effect. Public evidence status
is currently fixed to `Publicly reported` and Belt and Road status to
`Not established`. Other statuses require a future explicit schema/review extension.

SQLite v1 stores:

- `br_cases(id, draft_json, draft_updated_at, published_json, published_at,
  reviewed_by, review_note)`: candidate and separately published snapshots.
- `br_audit(id, case_id, action, actor, note, created_at)`: import/publication/
  withdrawal history. Review metadata remains private.
- `schema_migrations(component, version, applied_at)`: belt_road v1.

JSON snapshots deliberately make this small first slice simple; they are not the
proposed million-entity normalized graph. Later normalize sources, claims,
locations, relationships and content/argument targets, with R*Tree viewport
queries. Static export has a 500-record limit to prevent accidental unbounded
mobile downloads; add a viewport API/aggregation before growing beyond it.

## Collection → publication

Run from repository root, using root-level uv (no added dependencies):

```bash
uv run python py/belt_road/catalog.py import py/belt_road/seed.json
uv run python py/belt_road/catalog.py list
uv run python py/belt_road/catalog.py publish tai-chang-public-plea-2025 \
  --reviewed-by YOUR_REVIEWER_NAME \
  --note 'Source, date, location precision and public disclosure checked.'
uv run python py/belt_road/catalog.py export
uv run python py/belt_road/preview.py
```

Import always writes a draft. Reimporting an ID cannot replace its published
snapshot. A reviewer inspects source content, attribution, location precision,
recency and disclosure, then publishes a snapshot. `export` emits only published
snapshots and their review dates; it does not export the database or audit data.
The checked-in source seed was reviewed by Codex, not a human reviewer.

To remove a marker, run `withdraw ID --reviewed-by NAME --note REASON`, then
`export`, rebuild and deploy through the normal site workflow. Withdrawal in
SQLite alone does not retract an existing static export, deployed file, cached
copy or third-party archive. Export, build, and deployment must remain a coupled
publication step. Preview copies files at startup, so restart after an export.

Only the operator's local CLI can import/review. There is no public write API.
Reviewer names are audit labels, not authentication or a guarantee of independent
review. Do not give future crawler workers access to the publication CLI or DB
write permissions without adding an enforced role boundary. Current command
separation prevents accidental publication, not a malicious local operator.

## Page design

Desktop: narrow brand/header, one-line purpose, large global map, 350 px sidebar.
The sidebar begins with search and compact report cards. Selecting a skull/card
opens source details at the same canonical page, using `?case=` for sharing.

Phone: global map first (52% of viewport height), then search/cards and selected
report. Coordinates stay schematic for regional cases: selecting one fits its
area and caps zoom rather than implying a precise building. Skull markers mean
reported coercion, not confirmed deaths. Region areas have dashed outlines.

Dates, attribution and location precision appear with the report; extended
collection details are expandable. Empty/error states do not invent markers.
The initial global view is intentionally sparse because the collection is small.
There are no speculative Belt and Road routes or inferred criminality layers.

Details have a stable `data-content-id="belt-road:<case-id>"` for the planned
site-wide argument target registry. This slice does not implement that registry,
thread creation or embedded arguments. It does not relocate records under
/argument/ or expose a nonfunctional discussion button.

## Checks

```bash
PYTHONPATH=py/belt_road uv run python -m unittest discover -s py/belt_road/tests -v
node --check docs/assets/belt-road.js
uv run mkdocs build -d /tmp/sos-relay-belt-road-build
```

Tests exercise draft/public separation, snapshot preservation across imports,
withdrawal/audit, all-or-nothing batches, source requirements, invalid geometry/
URLs/dates, and publication metadata. Browser QA should cover marker/card
selection, filters, deep links, mobile overflow and unavailable tiles/data.

## Next crawler work

[CRAWLER.md](CRAWLER.md) records researched source seeds, the proposed Python
collector, the missing private discovery/document/candidate queue, and a bounded
first run. Wikipedia is a reference-discovery tool, not an automatic source of
accusation markers. Survivor interviews and publicly reported pleas remain
distinct evidence kinds.

The Belt & Road controls and marker now use a small vendored Lucide SVG sprite
from the user-linked tmp/icons collection; its license ships in docs/assets/icons/.
