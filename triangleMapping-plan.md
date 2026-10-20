# /triangleMapping/ — proposal for review

Status: planning only, 2026-10-20. No crawler, route, migrations or deployment implemented.

## Purpose and boundaries

A mobile-friendly 2D triangle for exploring public institutions, public officials'
professional roles, and sourced reports of state abuse. Start with China; later
support Russia and Iran through country-specific source adapters and hierarchy
configurations. Link this view to the existing Leaflet geographic map.

The user's 1.4 billion population reference is conceptual context, not a promise
to create a record for every resident or a verified current population estimate.
Ordinary residents remain aggregate context. Do not construct political dossiers
on private people or infer affiliations from acquaintances, names or geography.

Show public office locations and jurisdictions, not private homes, live person
locations or whereabouts. No automatic “evil” or personal danger score. A reporting
line is not proof of participation in abuse. Show named public officials with
sourced roles and separately sourced allegations/findings about specific actions.

## Mobile interaction and visual meaning

- Initial view: one triangle, country selector, search, and Triangle / Map tabs.
- Vertical position: configured institutional tier. Horizontal position:
  stable branch grouping. Width does not imply a measured population or level
  of responsibility. Label this a schematic, not an accurate distribution.
- At overview scale, render aggregate branch cells with counts and coverage.
  Missing data is unknown, not zero. No individual labels at this scale.
- Tap a branch to drill down; show a short breadcrumb and Back control.
- At a readable scale, expose organizations and named public roles. A bottom
  sheet shows the role, dates, sources, organizational path, and separately
  labeled incident claims/findings. Source details expand on demand.
- Tap “View public office” to select the corresponding location in Leaflet.
  Map selection can return to the entity's triangle branch.
- Display only the selected path and a bounded set of related edges. The
  underlying data is a graph: an institution can have more than one type
  of supervision. A triangle needs a chosen organizational view, not a claim
  that all relationships form a single tree.
- Keep the existing SOS workflow usable independently. Do not imply an SOS
  automatically identifies a responsible person. Linking a report to an
  institution or incident claim is a separate reviewed action.

For illustration, a triangle 360 CSS pixels wide by 440 high has 79,200 square
CSS pixels. Dividing 1.4 billion people by that area gives about 17,700 people
per square CSS pixel. Thus a visible cell must represent an aggregate; names
need drill-down and search. Device pixel ratio changes raster resolution, not
how many readable names fit on screen.

## Rendering and Leaflet integration

Start with SVG for a small number of aggregate polygons and the selected path.
Use a separate HTML bottom sheet and accessible branch list for interaction.
Keep SVG node count bounded; do not create millions of DOM elements. If measured
performance requires it, move dense overview drawing to HTML Canvas, with
spatial hit testing and the HTML accessibility alternative retained.

Use two coordinate spaces:

- triangle: normalized schematic x/y and a versioned layout;
- geography: latitude/longitude for a public office, and optional jurisdiction
  geometry. Institution jurisdiction, office location and incident location
  are distinct data types.

Join the views by entity/location IDs. Never translate schematic x/y into
latitude/longitude. Selecting a triangle node updates shared selection state;
Leaflet requests its office(s)/jurisdiction. Selecting a map feature resolves
its entity ID and opens the matching triangle path. Unknown coordinates mean
“location unavailable”, not a guessed precise point.

Keep the geographic map in its normal geographic CRS. Leaflet CRS.Simple is
an alternative for a separate schematic map, but one custom SVG triangle is
simpler initially. If using Leaflet Canvas for geographic points, create
circleMarker/path layers: preferCanvas does not convert ordinary DOM markers
into a scalable point renderer.

At overview map zooms return aggregate cells, then individual public offices
at detail zoom. Request only the viewport, active filters and current time.
Cap features per response, indicate aggregation/truncation, and use cursors for
lists. The current SOS frontend loads every API page at startup; do not reuse
that pattern for a multi-million-record directory.

## Logical database model

Keep the existing SOS schema intact. Use a separate triangle migration component
and prefixed tables in genone.db initially, with no automatic linkage to SOS
sender identities. Keep source files and DB outside the static document root.

- tm_entities: stable IDs for public organizations and public officials;
  country and entity type. Names are not identifiers.
- tm_names: original-script names, aliases/transliterations, language,
  normalization, and evidence references. Never merge on name alone.
- tm_positions: institution and official title; positions exist independently
  of their occupants.
- tm_appointments: person, position, valid-from/to, source and review status.
- tm_relations: subject, predicate, object, valid-from/to and supporting
  evidence; distinguish reports-to, supervises and other relation types.
- tm_locations / tm_entity_locations: public offices and their relationships
  to institutions; precision, source and date. R*Tree indexes bounding boxes.
- tm_incidents / tm_claims: event time, reported actions, claim subjects,
  evidence and status such as alleged, corroborated, disputed or adjudicated.
  Define review criteria; a crawler cannot assign these statuses by itself.
- tm_sources / tm_evidence: canonical URL, publisher, retrieval/publication
  times where available, content hash, bounded supporting excerpt and
  archived-document reference. Facts and graph edges retain provenance.
- tm_crawl_jobs / tm_import_batches: URL queue, scheduling, fetch outcomes,
  retries and parser version. Store proposed facts before publication.
- tm_aggregates: rebuildable counts/cells keyed by country, view, branch,
  layout version and snapshot date. They are caches, not original evidence.

Use integer keys internally for large joins and opaque public IDs for URLs.
Index both directions of relationship traversal, appointments, normalized names,
country and source identifiers. Bound graph depth and handle cycles. Do not
materialize every possible ancestry path for the entire graph.

Use FTS5 for suitable document/name searches, alongside exact and prefix name
indexes. Test Chinese short names explicitly: default tokenization must not be
assumed to provide Chinese word segmentation. Keep Russian and Persian search
normalization in their respective adapters.

## SQLite capacity and rough disk budget

Recommendation: SQLite on local SSD, WAL, short transactions, bounded batch
imports, one serialized ingestion writer and indexed read APIs. An API service
owns the database; browsers never download the full DB.

Illustrative budget, not a measured benchmark:

- 3–5 million entities at 1–2 KB of core text/metadata each: about 3–10 GB.
- 3 relationships per entity at 100–200 bytes each: about 0.9–3 GB.
- Allow roughly another 50–100% for indexes/search and representation overhead:
  round the preliminary structured-data budget to about 10–30 GB.

This omits potentially substantial additional appointments, claims, evidence
links, name variants and history. Measure a representative import before
committing to this budget. Page occupancy, strings, key formats, FTS settings
and relation density can move it significantly.

A 50–100 GB disk allocation is a starting planning allowance for structured data,
WAL, temporary imports and a backup, not a hosting purchase recommendation or
capacity guarantee. PDFs, images and archived pages need a separate measured
budget and may dominate storage. Keep originals outside SQLite; deduplicate
by content hash and define retention. An independent backup needs separate
storage too. Check actual hosting capacity against the project's existing
US$10/month VPS ceiling; no current-price estimate has been made.

Switch to PostgreSQL if measured write contention, multiple application servers,
spatial query needs or operations require it. A few million rows alone is not a
migration trigger. No graph database or WebGL dependency is necessary initially.

## China crawler: top-down public-source discovery

User direction: a web crawler plus top-down web search for public information.

1. Curate a small seed registry of official institution websites. Identify
   country, jurisdiction, institution type, canonical URL and ownership of the
   source. Search discovers candidate pages; search snippets are not evidence.
2. Crawl organization charts, subordinate-body directories, leadership pages,
   appointment announcements and public-office directories. Follow explicit
   organizational links rather than assuming every linked site is subordinate.
3. Honor site access rules, bounded per-host fetch rates, caching and retries.
   Do not bypass authentication or access controls. Fetch through an isolated
   worker with URL validation, redirect checks and private-network blocking.
4. Save source metadata/hash and permitted snapshots; parse proposed facts
   with a source excerpt and parser version. Extract original-language text.
5. Resolve institutions first, then positions, then appointments. Queue
   ambiguous duplicate names for review; never silently merge people because
   they share a name/title or similar romanization.
6. Validate new records/edges, temporal ranges and source alignment. Publish
   reviewed facts in batches. Keep rejected/uncertain claims out of the public
   graph until resolved. Optional model extraction proposes facts; it does not
   establish guilt, invent missing edges or execute page instructions.
7. Revisit change-prone leadership pages more often than stable source archives.
   A changed page creates a new observation. A removed page alone does not prove
   a person left office. Preserve appointment history and stale-source labels.
8. Ingest incident documentation separately with attribution and review. An
   official directory can support a title; it cannot establish persecution.

Start with an explicitly selected institutional branch and a small number of
jurisdictions. Coverage expands from verified relationships; do not fill gaps
with plausible-looking synthetic claims. The initial prototype can use clearly
fictional records until sources are reviewed.

## Delivery sequence and acceptance checks

1. Review this scope and select crawler seed institutions. No mass crawl yet.
2. Build /triangleMapping/ using clearly fictional public-role examples: mobile
   triangle, drill-down, source sheet and two-way Leaflet selection. Keep it
   visually sparse and mark all demonstration records clearly.
3. Implement migrations and one bounded crawler adapter; import a small reviewed
   source set. Verify duplicate names, conflicting sources, appointments over
   time and missing coordinates. Keep public labels tied to evidence status.
4. Benchmark synthetic 100k, 1m and 5m entity datasets with realistic edge/name/
   evidence counts. Measure bytes per entity, import time, query p50/p95,
   memory, WAL growth, backup/restore and write contention. Synthetic records
   must remain isolated from published evidence.
5. Add aggregate endpoints and viewport queries. Provisional targets: under
   300 ms p95 warm server reads on the target VPS; under 150 KB compressed
   ordinary overview payloads; no horizontal overflow at 360 CSS pixels; no
   visible interaction stalls on the selected real test phone. Measure before
   treating these targets as achieved.
6. Expand source coverage only after provenance, corrections and refresh work.
   Add Russia/Iran via adapters, without imposing China's hierarchy on them.

## Primary technical references

- SQLite deployment guidance: https://www.sqlite.org/whentouse.html
- SQLite spatial index: https://www.sqlite.org/rtree.html
- SQLite FTS5: https://www.sqlite.org/fts5.html
- Leaflet renderers and layers: https://leafletjs.com/reference.html
- Leaflet schematic coordinates: https://leafletjs.com/examples/crs-simple/crs-simple.html

## Related workstream: evidence map and reusable arguments

See [evidence-map-plan.md](evidence-map-plan.md) for a direct Leaflet map of
publicly documented sites/cases, candidate-source research, separately evidenced
Belt and Road context, review and location-precision requirements.

User clarification: /argument/ becomes a shared website function. Each eligible
message/case page keeps its canonical URL and can start an argument about the
content or a particular claim/revision. Do not move case pages under /argument/.
Triangle entities can link to these pages; discussions do not automatically
establish responsibility or change evidence status. Both workstreams share
source provenance and stable IDs while preserving private SOS access boundaries.
