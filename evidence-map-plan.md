# Evidence map and site-wide argument function — proposal

Planning update: 2026-10-20. No crawler, schema, route or public markers implemented.
Related: [triangleMapping-plan.md](triangleMapping-plan.md).

## Goal

A direct Leaflet view of publicly documented facilities and incidents involving
online scam operations, trafficking into forced criminality, and other separately
substantiated abuses. Belt and Road projects/corridors are optional geographic
context and separately evidenced relationships, not proof of criminal activity.

The unit on the map is a documented site/case, not “Chinese occupants.” Nationality,
ethnicity, language, building appearance or Chinese ownership does not establish
criminal activity. Occupants of scam facilities can include trafficking victims;
do not label everyone in a building as a perpetrator. Do not compile private
residences or personal whereabouts based on these characteristics.

Start with scam-operation and trafficking cases with attributable public sources.
Organ trafficking/forced organ removal allegations are a separate claim category;
never infer them from scam activity, a hospital location, rumors or a shared owner.
Each claim requires its own evidence and review. Country/corridor-level reporting
does not justify placing a marker on a particular building.

## Updated argument architecture — user clarification

Upgrade /argument/ into a reusable website function. Messages, case pages and
other content keep their canonical URLs; they are not relocated under /argument/.
Each message page is ready to start arguments. Reuse the argument engine and UI
across content types; the existing argument landing page can remain an index.

- Each content object has a stable ID and canonical page. A “Discuss / Start an
  argument” action is available on eligible public message/case pages.
- An argument targets the whole message or an explicit claim/source anchor.
  Replies can support, challenge or qualify a claim and cite evidence.
- A case page contains multiple distinct claims. Different claim anchors can
  have separate arguments; repeated starts must not accidentally duplicate
  the same intended thread.
- Keep threads lazy: prepare the action for every message, but create a thread
  only when somebody starts one. Do not generate empty discussions in bulk.
- Associate content and arguments using stable IDs, not mutable page titles or
  URL text. A registry records content type, ID, canonical URL and visibility.
- Bind threads to content revisions and stable anchors. On edits, retain the
  original quoted claim/revision and mark obsolete anchors; never silently
  attach an old rebuttal to different words.
- Map popups open the canonical case/message page. Its discussion is available
  inline or in a panel; a separate page is optional, not the content's home.
- An argument reply is not itself a verified finding. Votes, reply volume,
  automated relation labels and agreement do not establish truth or guilt.
- Public discussions are available only for eligible public content. Private
  SOS messages, drafts and source identities inherit their access restrictions;
  “every message is ready” must not silently publish them. Recheck authorization
  on reads and writes, including attachments/quotes/notifications if added.

Existing implementation facts: argument/src/routes.js provides authenticated
thread creation/replies; argument/src/render.js generates standalone thread
pages. It does not currently implement generic content targets, revision anchors,
embedded discussions or an evidence-verification workflow. Those are planned
upgrades. Preserve existing threads and URLs during migration.

## Search, collection and publication workflow

1. Collect candidate reports from attributable sources: courts, public
   enforcement actions, UN bodies, reputable investigations and public corporate
   records where relevant. Record publisher, dates, source URL and document hash.
2. Extract separate propositions: site identity, reported activity, incident
   date, reported operator, public ownership, and any claimed Belt and Road link.
   Search snippets and generated summaries are discovery aids, not evidence.
3. Resolve aliases and duplicate reporting. Reposts of one story do not count
   as independent corroboration. Preserve originals, translations and corrections.
4. Geolocate only what the sources establish. Store coordinate source, method,
   precision/uncertainty and review status separately from the activity claim.
   A city-only source gets a city-level area, not a precise building pin. Do not
   discover a private person's location by triangulating personal fragments.
5. Keep candidates in a review queue. A reviewer decides whether the evidence
   supports public display, with visible attribution and claim status. Show
   allegations as allegations and adjudicated findings with their scope/date.
6. Publish the reviewed case at its canonical URL; expose its map representation
   only after the location and publication reviews pass. Offer corrections and
   preserve change history. Automatic collection is separate from publication.
7. Recheck dated reports: distinguish historical activity, reported closure and
   current evidence. An old raid does not establish current operations, and a
   missing update does not prove closure or safety.

Do not expose victim identities, shelters, witnesses or unpublished rescue
locations. Exact facility geometry is published only when already attributable
in public reporting and appropriate after review. Generalize or withhold it when
needed; the public map should not reveal new sensitive locations.

## Belt and Road context

Store project identity, country, public project geometry/location, source and
relevant dates separately. Represent relationship types explicitly: a documented
project participant, a sourced ownership link, or mere spatial proximity. Each
has its own supporting record. Proximity must never be presented as funding,
organizational control, causation or evidence of a crime.

Allow cases without a demonstrated Belt and Road connection. This avoids forcing
all evidence into the initial geographic hypothesis. An absent link is unknown
or unsupported, not an invitation to generate a plausible connection.

## Map UI and API

- Map first; compact filters for geography, activity category, evidence status,
  date and separately sourced project relationship. Hide extended text until
  a marker is selected. Do not label this a map of current personal danger.
- Popup/bottom sheet: site name, attributed reported activity, dates, evidence
  status, coordinate precision, and “Read case / Discuss”.
- Use clusters/aggregate cells at overview zoom. Return only viewport features
  with limits and explicit aggregation/truncation. Avoid downloading all cases.
- Display approximate locations as areas/uncertainty shapes. Use building outlines
  only when verified; OSM footprints establish geometry, not criminal use.
- Differentiate institution offices, case sites and SOS markers. Linking one to
  another requires an explicit sourced relationship, not automatic proximity.
- Geography, time and selected case can be preserved in shareable links. Private
  source details and precise unpublished coordinates never enter public responses.

Working route name for review: /evidenceMap/. The triangle stays /triangleMapping/.
Both can select the same organization/site records through stable IDs.

## Database additions

Use SQLite and the shared evidence/entity model proposed for triangleMapping.
Keep explicit migrations and prefixes; keep databases outside static web roots.

- case records: stable case ID, neutral title, canonical content ID, dates and
  publication status; sites can have multiple cases across time.
- site geometries: point/area, uncertainty, source, review and public precision;
  keep public generalized geometry separate from restricted source geometry.
- case claims: subject, predicate, object/text, event time and evidence status.
- claim evidence: supporting, contradicting or contextual source references,
  excerpts, provenance and independent-source grouping.
- project/site/entity links: relationship type, evidence, dates and review.
- generic content registry: message/case/entity content type, ID, canonical URL,
  visibility and revision references.
- argument targets: argument ID, content ID, revision and optional claim anchor.
  Use a registry FK or explicit validated associations rather than unchecked
  polymorphic IDs. Support multiple targeted discussions without URL coupling.
- review decisions, corrections and audit history, with restricted reviewer
  metadata where appropriate.

The source of truth for publication/evidence status is a reviewed record, not
argument sentiment. The crawler proposes records and never publishes accusations
or creates public argument threads automatically.

## First implementation slices

1. Extend argument storage with generic content/revision targets; preserve
   existing thread IDs and pages. Add a reusable Start argument / discussion
   component to eligible public message pages first.
2. Build a fictional-case Leaflet prototype linked to canonical case pages and
   embedded discussions. No real accusation markers in the prototype.
3. Manually review a small source set on documented scam facilities/trafficking;
   resolve site identity and location before importing public map data.
4. Add candidate-source crawling and a review queue. Evaluate evidence coverage,
   false site matches and duplicate sources before expanding collection.
5. Add independently sourced Belt and Road context. Expand abuse categories
   only when category-specific evidence standards and review are ready.

Acceptance checks: correct source attribution; no precise pin from city-only
reporting; private-content permissions enforced; thread targets survive edits;
no argument automatically changes a claim to a verified finding; corrections
propagate to map/cache; readable phone view; no uncontrolled crawler publication.

## Initial research references

These establish the scam/trafficking research topic, not any particular building,
Belt and Road link, or organ-removal allegation:

- OHCHR, 2023 briefing on online scam operations and trafficking into forced
  criminality in Southeast Asia:
  https://www.bangkok.ohchr.org/reports/online-scam-operations-and-trafficking-forced-criminality-southeast-asia-recommendations
- INTERPOL, 30 June 2025 update on trafficking-fueled scam centres, including
  coerced workers and geographic expansion:
  https://www.interpol.int/News-and-Events/News/2025/INTERPOL-releases-new-information-on-globalization-of-scam-centres

## First implementation update — /belt-road/

User priority: build /belt-road/ first. A local static Leaflet page and private
SQLite candidate/publication CLI now exist; see [implementation details](py/belt_road/README.md).
The first manually checked seed represents a public report of a victim plea from
Tai Chang, using a regional location. No automated crawler, site-wide argument
upgrade or production deployment has been performed. Case pages remain at
/belt-road/?case=<id>, ready for later argument targeting by stable content ID.
The initial SQLite database is separate from user messages; later normalization
and viewport APIs replace the small static JSON projection as coverage grows.

## Architecture correction — server-owned catalogue

User requirement: no database files or scraped map data in GitHub. /belt-road/
reads GET /api/belt-road/cases from the reviewed SQLite catalogue on lightsail.a.
The collection database and catalogue remain separate, outside static roots.
Publishing and withdrawing cases update SQLite and take effect on the next API
request; they do not require a Git push, JSON export or site rebuild. Earlier
static-export descriptions in this proposal are superseded by this correction.
