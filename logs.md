# SOS Relay — project log

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




