# SOS Relay backend foundation

SQLite is the chosen database for both the map and the future argument
subsystem (user decision, 2026-09-21). The local preview now saves and loads test messages through a loopback-only
HTTP API. The public API and property classifier are not ready for deployment.

Use one database outside the static site, for example
`/var/lib/sos-relay/genone.db`. Never put it under `docs/` or `site/`.
`py/map/db.py` → `initialize(path)` creates the map schema and enables WAL.
Connections enable foreign keys and a five-second busy timeout. Writes use
short transactions; no location-service request should hold a transaction.
Back up a live database using SQLite's backup API, not just copying its
main file while WAL writes are active.

## Shared storage boundaries

- `schema_migrations(component, version, applied_at)` tracks migrations
  separately for each subsystem. Current map schema is `sos`, version 1.
- `sos_pins` stores exact numeric coordinates, message, optional explicit
  contact, server timestamp and a random pin ID. No account foreign key,
  sender IP, user agent, device ID or session identifier.
- Reserve `argument_*` for argument nodes, source anchors, edges, attribution
  and human reviews. Their identity model belongs to that subsystem. Do not
  infer links from argument accounts to anonymous map submissions.
- No argument tables are created until its data model is settled. Existing
  `argument/design.md` remains the design anchor; this map work does not
  implement the AI argument assistant.

## Next integration slice

Use the Flask + Gunicorn service already proposed in `design.md`, behind
Caddy, with same-origin routes:

- `GET /api/sos/pins? south,west,north,east,limit,offset` (actual query uses
  standard `key=value&...` syntax): viewport read, bounded pagination, and
  explicit indication when more results exist. Handle dateline crossing.
- `POST /api/sos/pins`: validate coordinates and bounded plain text; perform
  the OSM restriction check; commit and return the visible pin immediately.
  No account, CAPTCHA or moderation queue. Ignore supplied contact unless
  `share_contact` is explicitly true. Never trust client timestamps.
- Add post-publication flag/review separately; a flag should not silently
  become a pre-publication gate.

`create_pin` is an internal storage function, **not** a public submission
endpoint: callers must perform the OSM check before calling it. Block
building footprints and residential/commercial/industrial polygons. Permit
successful lookups with no matching blocked polygon. Handle multipolygon
holes and boundaries. A timeout is not an empty successful lookup: show a
retryable failure, retain the draft, and do not falsely report publication.
Keep lookup timeouts short; prefer a local OSM extract for availability.
This failure policy follows the brief's restriction requirement and needs
review against its speed requirement before launch.

If a remote Overpass instance is used, send coordinates from the backend;
do not forward client IPs, messages or contact information. Disclose that
the provider sees the selected coordinates. Browser tile requests still
expose the visitor's network address and viewed region to the tile provider.

Before live use: verify API, Caddy, Gunicorn, hosting and error-reporting
configuration do not retain sender IPs or request bodies. Do not advertise
"no IP logging" based only on this storage schema. Spot-check OSM filtering
against actual blocked/allowed sites and obtain the brief's visual review.

## Local verification

```bash
PYTHONPATH=py/map uv run python -m unittest discover -s py/map/tests -v
node --check docs/assets/sos-map.js
uv run mkdocs build -d /tmp/sos-relay-map-preview
```

Serve just `docs/map/` and `docs/assets/` for a frontend review. It is a
persistent local test: refreshing reloads saved messages from `var/genone.db`. The library is vendored
Leaflet 1.9.4 (BSD-2-Clause license alongside it); OSM tiles load over the
network, with attribution and normal browser caching. No bulk/offline tile
downloads. References: [Leaflet quick start](https://leafletjs.com/examples/quick-start/)
and [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/).

## Project conventions

Python source, tests and preview tooling live in `py/map/`. Frontend files
remain in `docs/map/` and `docs/assets/` so MkDocs can serve them directly.
Use root-level `uv` for Python execution and dependencies; do not use pip.
The shared SQLite filename is `genone.db` (a valid SQLite filename).
Local default: `var/genone.db`, outside the static document root.
VPS access: `ssh lightsail.a`; dynamic hosting is planned for later.

Start the isolated map preview from the repository root:

```bash
uv run python py/map/preview.py
```

Open <http://127.0.0.1:18188/map/>. Port 8001 belongs to the existing
static server and is left alone. The preview serves only map assets and
redirects site-navigation links to the existing server on port 8001.
It does not expose the database or other repository files.

## Local persistence update

`preview.py` now implements `GET` and `POST /api/sos/pins` for local testing.
It initializes `var/genone.db`, validates input, uses server timestamps and
keeps contact only when explicitly opted in. UUID message IDs make unchanged
retries idempotent. GET supports viewport bounds and paginated reads; the
small local preview loads all pages. Host/origin checks restrict browser
access to localhost, and request logging is disabled. Tests use temporary
databases, never the real message database.

The page reports success only after SQLite commits, retains failed drafts,
and reloads saved pins on startup. There is no delete API or clear-database
button. Old in-memory pins must be retyped after upgrading the page.

This standard-library server is for local testing only. It remains bound to
127.0.0.1 and must not be exposed publicly: it has no OSM restriction checker
or production service configuration. The public deployment work above remains.
