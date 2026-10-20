# SOS Relay — project log

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




