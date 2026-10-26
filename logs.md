# SOS Relay — project log

## 2026-10-26

**Published a read-only download folder and a projects page.**

- `/share/` is served by Caddy from `/var/sos-share/`. The directory sits
  outside the MkDocs output, so a site rebuild does not delete it. Visitors
  can list and download files. Uploads are by SSH or scp. The Node service
  is not on this path.
- The homepage, which MkDocs builds from `za-index.md`, links to Shared
  files and to Projects.
- `docs/projects.html` lists linput, vim, and English learning. The hand
  and Vim pictures are both 128×128 and shown at 64×64, so the icons match.
- `docs/` holds site pages. `docs/mymd` points at `/my/md/`, the technical
  notes that sync to the site. The rest of `/my/` stays off the web.

Cursor edited on 2026 1026

## 2026-10-22

**Refreshed the local English map preview.**

- Found the long-running port 18189 preview serving an old snapshot without
  `english-basemap.js` (404). Restarted that preview with current assets.
- Preview now serves allowed map assets directly with no-store headers, rather
  than copying a startup snapshot. Private DB/source files remain inaccessible.


**Added red question marks for uncertain reports.**

- Reported/suspected source records use red question marks; source-documented
  records retain skulls. Popups link sources and disclose uncertainty without a
  review queue. Neither marker is an SOS Relay factual verdict.
- Saved place mentions now become public reports automatically during extraction.
  Existing named sites reuse geometry; sourced runtime place anchors support
  approximate areas. Reports without positions remain visible with sources in
  the same list. Added anchors for Myawaddy, Mong La and Shan State locally.
- Python and Node allowlists accept explicit null geometry while still checking
  source URLs and supplied coordinates. Added a configurable local preview port.
- Validation: 33 Python tests and 19 Node tests passed; browser checks cover red
  markers, source popups, unplaced reports and mobile display.


**Uploaded local crawler results to Lightsail.**

- Added `transfer.py` export/import commands and documented SSH transfer.
  Tested duplicate imports and preservation of existing jobs in a temporary DB.
- Backed up the VPS database and source registry, then merged three jobs,
  three documents, seven quoted mentions and six map locations. Document IDs
  were remapped and source configuration merged; no Git data commit or rebuild.
- Production map count increased from 127 to 133. Backup:
  `/var/lib/sos-relay/belt-road/backups/before-import-20261022T054411894028.db`.


**Extracted local source-coordinate locations and tested Ollama assistance.**

- Added `py/belt_road/extract.py` with a narrow Myanmar Witness/CIR caption
  adapter. Six named source-coordinate locations now exist in the local map DB;
  repeat extraction reports six unchanged records. Coordinates are rounded with
  source-caption citations; transfer/rescue locations are not mapped.
- Added optional local Ollama structured extraction with quoted evidence,
  overlapping chunks, resumable per-model/version caching and raw output under
  ignored `tmp/belt-road/extraction/`. Mentions stay in the same SQLite DB as
  leads; model output never supplies map geometry.
- Tested `qwen2.5:latest` against the saved IJM article. Tightened validation
  after its first pass included a rescue destination. Final run saved two quoted
  leads and rejected one unsupported-role quote. Exact quotation does not by
  itself prove a place is a danger site; LLM leads are not automatic markers.
- Validation: 32 Python tests passed; live local Ollama extraction succeeded.
  No VPS upload or deployment performed. Commands documented in README.md.


**Added local DDGS search → crawler pipeline.**

- Adapted localllm's search wrapper into `py/search.py`, without Ollama.
  Added DDGS to project dependencies and the lockfile.
- Saves timestamped query/hit/error JSON and cumulative source configuration in
  ignored `tmp/belt-road/`; queues deduplicated URLs in the existing local DB.
  Supports direct URL seeds, sequential queries and optional bounded foreground
  crawling. Keeps existing source adapters; no VPS data upload or deployment.
- Documented commands and resume paths in `py/belt_road/README.md`. Search
  examples use topics and locations, not rescuers' names.
- Validation: 28 Python tests passed. Live topic-only search returned three
  results; crawling fetched two documents/leads, with one robots DNS failure.
  No locations were created: these article formats have no location adapter.

## 2026-10-21

**Simplified the Belt & Road warning-map pipeline.**

- Combined crawler progress/documents and map results in one admin-owned SQLite
  database at `/var/lib/sos-relay/belt-road/data.db`. Migration preserved all
  127 map IDs/citations, 11 jobs and six documents; old DBs/configuration are
  backed up under the new state directory.
- The foreground crawler writes supported extracted locations directly to the
  map table. Removed mandatory catalogue/review/publication steps and retired
  the crawler systemd unit. Normal runs use Python as admin, with per-run job
  and wall-clock limits, progress output and a single-run lock.
- Replaced the two map API formats with read-only `/api/belt-road/locations`.
  Popups now link the source and ask users to check the facts themselves.
  Removed review promises; publisher classifications remain source-attributed.
- Made README.md the sub-project introduction and command reference, retaining
  the other Markdown files as short pointers. Retired legacy publication CLIs.
- Validation: 25 Python tests, 18 Node tests (including direct crawler-to-API
  integration), JavaScript syntax and MkDocs build passed. Runtime data and
  databases remain server-owned and excluded from Git.

**Made Git deployments selective for faster crawler updates.**

- Added a versioned post-receive hook that compares against the last successful
  deployment. Crawler Python updates only refresh the checkout; Python/Node
  dependency updates, MkDocs builds, TTS assets and API restarts run only when
  their inputs change or required artifacts are missing.
- Serialized deployments, skipped superseded/non-main pushes, and retained the
  successful revision on failure so later pushes retry unfinished steps.
- Installed the hook on Lightsail with the old hook backed up. Crawl data and
  SQLite remain outside Git and need no deployment. Updated env.cmd.md and the
  crawler README with the normal push command and optional full rebuild.
- Validation: ten isolated Git/deployment integration tests and Bash syntax
  passed, covering crawler-only updates, site/backend/dependency changes,
  deletions, superseded pushes, missing output and failed-deployment recovery.

## 2026-10-20

**Belt & Road crawler collected 122 distinct site candidates on Lightsail.**

- Reached the 100-candidate target using Amnesty International's 2026
  Cambodia report: 86 publisher-documented sites and 36 suspected sites.
  These are source classifications, not independent verification by SOS Relay.
- Added source-code deduplication, PDF page references, bounded PDF parsing,
  private artifact storage, and a target-based stopping condition. All 122
  candidates remain `needs_review`; public victim-message evidence has not
  been assessed. The public map still contains five reviewed cases.
- Crawl state, source configuration, report artifacts, and the published
  SQLite catalogue stay on Lightsail. No database or scraped records were
  added to Git. The API reads the server-owned published catalogue.
- Updated the manual crawler service to target 100 candidates with memory,
  CPU, and runtime limits. No recurring crawl schedule was enabled.
- Set both map brand links and the documentation homepage explicitly to
  `https://sosweb.org/` so they do not inherit a localhost preview origin.
- Validation: 20 Python tests passed, MkDocs built successfully, and the
  generated homepage, map, Belt & Road, and documentation logo links were
  checked. The crawl completed with 122 distinct keys and 122 page references.

**Crawler discoveries made visible separately from reviewed reports.**

- Added a public discovery API, visible result counts, a source-page list,
  and an optional map layer with distinct publisher-documented/suspected circles.
- Added an operator-only SQLite projection of source codes, classifications,
  rounded locations and PDF citations. Private crawl text/configuration stay
  on Lightsail; publication does not change candidate review states or skull cases.
- Validated the real stored report projection: 122 sites, including 86
  publisher-documented and 36 suspected sites. Locations remain approximate;
  current activity, public-message evidence and BRI links are not established.
- Validation: 22 Python tests and 18 Node tests passed. JavaScript syntax and
  the MkDocs build were checked; no collected records were added to Git.

**Unified the Belt & Road map and added English-first labels.**

- Replaced the separate Reports/Discoveries panels with one 127-record location
  list, search, detail view and Show all control. Every source record has a small
  skull; source classifications and pending-review status remain visible.
- Added OpenFreeMap's OpenStreetMap-based vector basemap through locally pinned
  MapLibre/Leaflet browser assets with their licenses and visible attribution.
  Labels prefer English, then Latin-script/local names where English is missing.
  No account, API key or paid service was added. A disclosed standard OSM fallback
  remains available automatically if English rendering cannot load.
- Browser checks passed for unified counts/markers, evidence-status searches,
  citations, deep links, mobile layout, independent API failure/retry, and map
  fallback. JavaScript syntax checks and MkDocs build passed. Runtime records and
  databases remain on Lightsail and were not added to Git.

**Moved crawler information below the map.**

- Put the live crawler count/classification summary, introduction and About
  text in a footer below the map and unified location list. The map now begins
  directly below the site header; all 127 source records remain available.
- Checked desktop/mobile layout and retained record/skull counts in the browser.
  JavaScript syntax and MkDocs build passed. No runtime database was changed.

## 2026-10-16

Edited by za and Codex.

- Updated the static-site layout: centered desktop containers use 80% of
  the available width, reserving at least 10% per side, with a 1280px cap.
- Below the desktop breakpoint, reading content flows in one vertical
  column with at least 3px gutters per side; navigation remains collapsible.
- Published the stylesheet and rebuilt MkDocs successfully. The live
  stylesheet was checked; browser visual review remains with za.

## 2026-10-15

Edited by za and Codex.

**Static-site updates completed and deployed.**

- Technical notes are served at `/tecNotes/` from the VPS `/my/md/`
  directory. Earlier `/mymd/` and `/my/md/` URLs redirect there. Parent
  `/my/` URLs remain blocked. No local `/my/` notes were synced during
  these changes; obsolete notes folders await za's review.
- Added the supplied PNG as the site favicon and header logo. Replaced
  the blue theme with the dark green palette used by `/argument/`.
- The homepage now reads root-level `za-index.md` through a MkDocs hook.
  Preserved za's edits, merged the `/tmp/ind` draft, and published the
  latest homepage. The deployment hook uses `scripts/build-site.sh`.
- Added reciprocal language links for all 109 history-note translation
  pairs and index links labeled `/ Chinese + English`. The existing
  paragraph interleaving and authored history documents were not edited.
- Added SSH, rsync, publishing boundaries, and build instructions to
  `env.cmd.md`. Updated `design.md` with the phased roadmap, $10/month
  VPS ceiling, anonymous-intake requirements, and translation follow-up.
  `todo.md` remains controlled by za and requires explicit permission
  before editing; it was not changed.

**Initial anonymous text inbox implemented and deployed at `/publicMsg/`.**

- Form first, then the abuse/privacy notice and private submission history.
  Displays server-observed IP and a short non-secret session reference.
  Location is explicitly unavailable; no third-party lookup is performed.
- Guest allowance: 10 messages and 3,000 segmented words per UTC day.
  Initial registered tier: 20 messages and 6,000 words. Both retain a
  60-second cooldown, 12,000-character cap, and moderation requirement.
- Added persistent SQLite quotas, network traffic limits, inbox caps,
  duplicate checks, idempotent retries, warnings, and account links.
  Existing username/password sessions work without changing registration.
- All submissions are private and pending. Own history is shown on the
  same page; there is no public feed, Agent reviewer, or SOS dispatch yet.
- No raw IP is stored with messages. Network fingerprints/counters expire
  within 48 hours, guest sessions after seven days, and messages after
  30 days (rejected messages after seven days from submission). Cleanup
  runs on requests, startup, and hourly. Notices distinguish active-store
  deletion from backup/storage erasure.
- All 13 Node tests passed locally and on the VPS. Verified the live form,
  assets, secure cookie, private/no-store history, allowance, homepage
  link, existing sections, and `/my/` blocking. No live test message was
  submitted. Browser visual review was unavailable and is left to za.
- Implementation and remaining reviewer/SOS work are documented in
  `argument/publicMsg.md`. No paid AI service or dependency was added.

Existing MkDocs warnings about the homepage's missing `old.index.md`
target and a history document's placeholder `URL` remain for later cleanup.

## 2026-09-21

**SOS map and first-stage message-to-database flow implemented and tested.**

- Local map at `http://127.0.0.1:18188/map/`: pan/zoom, pin selection,
  exact coordinates and message submission. Existing port `8001` unchanged.
- Messages persist through the local API to `var/genone.db`. The user added
  three test messages; all three were read back from SQLite and confirmed.
- Six storage/API tests pass; JavaScript syntax and the MkDocs build were
  checked. Python source/tests are in `py/map/`, using root-level `uv`.
- Updated `map-tasks.md` with DOOR/total-shutdown operation, backend AI tasks
  and the next input design: send text or voice with minimal interaction;
  no required questionnaire or map selection before intake.

This is a local test stage. Voice input, offline client/relay, AI worker,
property filtering and public VPS deployment remain planned work.

## 2026-09-19

**Domain registered: `sosweb.org`**

- Registrar: Google Cloud Domains (project `studythepyramid`), reselling
  through Squarespace
- Registered: 2026-09-19
- **Expires: 2027-09-19 — renew before this date or the domain lapses**
- DNS: Cloud DNS zone `sosweb-org`, A record → `13.125.209.14` (Lightsail VPS)
- Contact privacy: `redacted-contact-data` (hidden from public WHOIS)
- Renewal check: `gcloud domains registrations describe sosweb.org --project=studythepyramid --format="value(expireTime)"`

Caddy on the VPS switched from serving `:80` to serving `sosweb.org`
directly — automatic HTTPS is enabled and working (confirmed via 308
redirect to HTTPS); actual cert issuance was pending DNS propagation at
time of writing. From this point on, the site can be treated as a normal
HTTPS website for full-stack testing.




