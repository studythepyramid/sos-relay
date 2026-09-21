# Map Tasks — SOS Location Map

Status: local frontend + SQLite persistence implemented (2026-09-21); public deployment and property filter pending.
Scope: message-first SOS intake by text or voice, with a public map for
locating reported needs. A person requesting help should not have to fill
out a structured form or operate a map before sending a message. The map
is one view of a wider offline-first relay system; DOOR connectivity,
delayed delivery and agent follow-up are part of its design.

## Context

`sos-relay`'s whole purpose is emergency communication under
shutdown/censorship conditions (see `mkdocs.yml` site description,
`docs/doors.2026-09.md`). This feature is being scoped as a parallel work
track — handed to a separate agent (Codex) to build while other tracks
(the history-notes translator, etc.) continue elsewhere, partly as a test
of cross-agent parallel task management. This started as a greenfield
feature; the first frontend preview and SQLite storage module now exist. The user has prototyped map
functionality once before in an unrelated game-dev context — not reusable
here, no code carries over.

## Primary input — send a message, not a form

User decision, 2026-09-21: people in distress may have little time, mobility,
attention or equipment. They cannot be expected to sit at a computer or
scroll through a phone questionnaire. The existing coordinate/description
form is a tested first-stage prototype, not the intended primary SOS flow.

- Show a large **Record a voice message** control (tap to start/stop, without
  requiring a continuous hold), a simple **Type a message** alternative and
  one obvious **Send SOS** action. Neither microphone nor keyboard is required
  if the other input is available. Handle denied microphone access plainly.
- Accept short, incomplete, unstructured messages. Do not require categories,
  identity, contact information, a transcript or answers to AI questions.
  The system organizes information after accepting the message.
- Save captured content durably on the device and show a short, accurate
  receipt: saved locally, awaiting a DOOR, or received by server. Do not
  claim local durability until the write succeeds; browser memory is not enough.
- Offer device location with permission, without making permission a submission
  gate. Also accept a spoken/typed place description; manual map selection is
  optional. Missing location must not block SOS intake or relay delivery.
- Distinguish a reported emergency location from the sender's device location:
  the user may be reporting on someone elsewhere. Preserve exact supplied
  coordinates and their source. Do not manufacture a precise pin from an
  ambiguous place name or treat model-inferred coordinates as confirmed.
- A message can be received without a map pin. Publish the pin once the
  location is sufficiently established and passes the agreed property check;
  show "message received; location needed for map" when appropriate. This
  changes intake requirements, not the existing public-map restriction.
- Preserve and queue original voice even when transcription/model services
  are unavailable. Transcription can happen locally or after delivery; keep
  the original and mark the transcript as derived and potentially mistaken.
  Define bounded recording size, durable audio storage and resumable transfer;
  do not silently discard audio when a limit or network failure is reached.
- Follow up conversationally, optionally by voice. Ask at most one short,
  useful clarification at a time, and allow no answer. Follow-up is not a
  prerequisite for saving or relaying the initial SOS.
- Keep public/private disclosure brief and visible beside Send, with more
  detail available separately. Voice recordings and private chat are not
  automatically public: explicitly define what the user chose to publish,
  and do not publish an inferred summary without that choice.
- The map primarily helps viewers/helpers understand where needs are. A person
  requesting help should be able to send without opening it or scrolling
  through its controls. Keep optional details and advanced tools secondary.

These are next-stage requirements. Current UI still uses the original form;
voice capture, automatic location, transcription and client-side durable
outbox are not implemented. The present database requires coordinates and
text: introduce a separate intake record with optional location and text/audio
content before claiming support for location-free or voice-only messages.

## System anchor — DOOR and offline-first operation

Source: `~/dev/checklist.md`, read 2026-09-21, together with
`docs/doors.2026-09.md`. The checklist requires a local assistant that starts
and works offline, cached knowledge/models, network-channel establishment,
and access to larger remote models when connectivity returns. It also
calls for local/long-distance relays and independently hosted copies that
can exchange signals. These are system requirements; the current map
preview implements only local server persistence.

**DOOR** means an available communication route toward an SOS relay or
backend. It is separate from a private conversation link: a link identifies
where to resume; a DOOR makes reaching that destination possible. Direct
Internet access can be a DOOR. Circumvention connections and a reachable
relay with onward connectivity are other potential routes. A configured
proxy, a Wi-Fi connection or a successful unrelated web request does not
prove that our SOS endpoint is reachable.

Design for three operating conditions:

- **Connected, possibly censored:** use a working DOOR to submit and retrieve
  receipts/replies. Test the intended endpoint, not just general connectivity.
- **Intermittent:** preserve a durable local outbox and conversation history;
  exchange small messages, acknowledgments and missing updates during short
  connection windows. Reconnection must not require starting over.
- **Total upstream shutdown:** the remote server and its AI cannot converse
  with a disconnected user. The local assistant and cached knowledge keep
  working. Record SOS drafts and exact coordinates locally; optionally hand
  encrypted relay bundles to nearby peers or an available physical transport.
  Delivery remains pending until some relay obtains an onward route. Neither
  AI nor a circumvention setting can create a missing physical connection.

Bluetooth, local Wi-Fi, radio/LoRa and removable-media exchange are possible
transport work tracks from the checklist, not implemented capabilities or
interchangeable protocols. Define and test each adapter's actual payload,
range, platform support and receipt mechanism before depending on it.

DOOR instructions, bootstrap software, verified configuration packages and
small knowledge/model bundles must be distributable before an outage, with
an offline/manual installation path. Do not put the only recovery guide
behind the blocked site. Treat the tools in `docs/doors.2026-09.md` as a
catalog to evaluate locally, not a guarantee of current regional availability.
Do not automatically download a large model over a scarce connection.

### Local assistant and DOOR manager

The client-side assistant owns offline help and connection recovery; the
backend agent cannot control a device it cannot reach. Start with an Ubuntu
client, then adapt for Android and other platforms as in the checklist.

- Keep a small local model and a versioned, sourced knowledge base available.
  Basic message capture, outbox and receipt display must also work with no LLM.
- Have a deterministic DOOR manager report endpoint reachability, last
  successful exchange, retry state and adapter failure categories. The local
  model can explain these results and propose suitable configured routes.
- Operate installed, user-authorized adapters with bounded retries, backoff,
  battery/data limits and reversible configuration changes. Do not grant SOS
  text or a retrieved document the ability to execute arbitrary host commands.
- Prioritize the SOS envelope and receipt before map imagery, chat history or
  model downloads. Manual coordinate entry must work without online tiles;
  optional offline maps need a separately licensed/distributable data source.
- Keep DOOR credentials and connection diagnostics on the client where
  possible. Do not attach sender network addresses, device IDs or complete
  route histories to public pins or backend AI prompts.

### Delivery states and honest receipts

Track independent facts rather than a single ambiguous "sent" flag:

- **Saved on this device:** durably queued locally; nobody else is confirmed
  to have received it. Browser memory alone does not satisfy this state.
- **Accepted by a relay:** a named relay instance acknowledged custody;
  server receipt/publication remains unconfirmed.
- **Received by server:** backend committed the message and returned a
  verifiable receipt, correlated with the original message ID.
- **Published on map:** server confirms that the exact-location public pin
  exists. This is distinct from private intake and from a rescuer seeing it.
- **Reply available / retrieved:** backend saved a reply; client separately
  acknowledges retrieving it when a DOOR becomes available.
- **Human acknowledgment:** a real helper explicitly acknowledged the case.
  Do not infer dispatch, rescue or resolution from any previous state.

Retries, lookup failures, model failures and disconnected status should be
shown alongside these facts without erasing an earlier valid receipt.
Closing the client must not silently mark a case resolved.

Future client outbox records need a stable message UUID, text and/or an
audio reference, optional exact coordinates with source or a location
description, explicit public/contact choices, schema version and an untrusted
client timestamp. Add authoritative server receipt time on arrival. Apply
idempotency to delayed/repeated deliveries, including multiple relays, and
use per-conversation cursors to retrieve only missing replies. Keep immutable
message/update IDs; do not resolve conflicting updates by unreliable device
clocks. Bound relay bundle size, lifetime and forwarding hops, and verify
integrity/receipts. Expiry must visibly mean "not delivered," not success.

Choose the relay envelope, encryption/key distribution and receipt-verification
protocol before implementing peer or clone synchronization. Forward bundles,
not SQLite files: those files will also contain private chats and argument
accounts. A peer custody receipt cannot substitute for a backend receipt.

## Backend AI agent — proposed responsibilities and execution

The backend assistant is an asynchronous case worker. It must not be in the
critical path for saving an SOS, issuing a receipt or publishing an eligible
pin. A worker service can wait for durable jobs; model inference runs only
when a job needs it. No continuously running model conversation is required.
These responsibilities are proposed design; no AI worker is running yet.

### Deterministic server responsibilities

Validate bounded input, deduplicate delivery, commit intake, issue a receipt,
maintain publication state and store conversation messages. Produce factual
receipt text directly from committed records. Enqueue the follow-up job in
the same database transaction as the event that triggers it, so a crash
cannot save the SOS but lose its follow-up work.

Keep the existing property restriction for public pins. Offline capture and
private intake must not discard a signal because OSM is unavailable. An
unchecked intake receipt must explicitly say "received; map publication not
confirmed." Decide the outstanding property-lookup outage policy before
public launch; do not silently bypass the restriction or describe waiting
for a lookup as AI moderation. An accepted location publishes immediately,
without an AI or human review queue.

### Agent task contract

1. **Read verified case state.** Receive a case-scoped job containing the
   message, relevant conversation and server receipt/publication facts.
   Never invent delivery, map visibility, a connection or responder activity.
2. **Offer optional follow-up.** In the user's language, ask only for missing
   information that materially helps: kind of assistance, people affected,
   location clarification and changes since the original report. Do not
   delay the original SOS, require identity or repeatedly ask known answers.
   Ask one short question at a time; accept silence or a voice reply. Organize
   free-form input without requiring the user to approve a structured form.
3. **Help using the knowledge base.** Retrieve relevant sourced guidance;
   distinguish cached material, user reports, verified updates and model
   suggestions. Show source/date and uncertainty where they matter. Offer
   local/offline alternatives when the DOOR is unavailable; urgent assistance
   must not depend on fact-checking or debate in the argument subsystem.
4. **Prepare updates and human handoff.** Draft a concise case summary or
   proposed map update. Keep follow-up conversation private by default;
   publish additional information or send it to a named outside recipient
   only under the user's explicit sharing choice. Preserve original facts
   and corrections instead of silently overwriting the initial SOS.
5. **Maintain continuity.** Store replies for later retrieval, resume from
   durable case history, and honor pause/stop requests. No unsolicited
   repeated questioning when the user is disconnected. Escalate uncertainty
   to an available human reviewer without claiming one is present or notified
   until the corresponding system acknowledgment exists.

The agent is not an emergency dispatcher, automatic truth judge, publication
moderator, or remote shell. SOS messages, retrieved pages and conversation
text are untrusted input; they cannot redefine its tools or permissions.
Expose narrow case-scoped read, retrieval and reply/proposal tools, not raw
SQL, unrestricted network access or infrastructure credentials. It must not
access other users' private cases or the argument subsystem's account data.

### Worker lifecycle and failure behavior

Proposed events: `sos.received`, `conversation.message_received`, explicit
`followup.requested`, and verified publication/human-status changes. Treat
state notifications separately from model jobs; deduplicate by event ID
and skip already handled or superseded work.

Use durable job states `queued`, `leased`, `completed`, `retry_due`,
`failed`, `cancelled`. Claim a bounded lease in a short SQLite transaction;
release the database lock before inference or network calls. Expired leases
are recoverable after a crash. Commit the reply and job completion together,
with a unique job/reply key to prevent duplicate replies after a retry.

Set per-job deadlines, bounded retry/backoff and per-case token/turn budgets.
A model outage leaves the receipt and map usable and shows "assistant
unavailable; message saved." Failed jobs remain visible to operators without
logging private message bodies, access tokens or sender IPs. Backend polling
and browser polling must back off; a continuous socket is optional, never a
requirement for delivery or resume.

### Private conversation access and model boundary

Return an unguessable case capability separately from the public pin ID.
Knowing a pin ID must not grant chat access. A saved private link or recovery
code allows anonymous resume; possession grants access, so the UI must say
not to share it. Store token hashes, support revocation, and keep secrets out
of server access logs, referrers, analytics, public map data and model prompts.
Use a reviewed fragment-to-auth exchange or equivalent rather than putting
bearer secrets into ordinary URL paths/query strings. Lost anonymous
capabilities cannot be recovered through an account that does not exist.

Private from map visitors does not automatically mean end-to-end encrypted
from the backend/model. Clearly state who can read chat content. If an
external model provider is selected, disclose what would leave the server
and obtain the user's choice before sending private conversation content.
A server-hosted model and a client-local model are separate deployment
options; no particular provider has been selected. Model failure or refusal
must never prevent the underlying signal from being saved or relayed.

### Proposed SQLite additions — not migrated yet

Continue using shared `genone.db` with subsystem-specific migrations:

- `sos_cases`: intake/message ID, server receipt time, publication status
  and optional public pin reference. Keep private intake separate from the
  existing public `sos_pins` representation.
- `sos_messages`: case, message UUID, role/source, text and/or audio reference,
  derived transcript with provenance, visibility, client time and server time;
  stable sequence for incremental retrieval. Define private audio storage,
  size limits, retention and access separately from public map assets.
- `sos_capabilities`: case-scoped token hashes, scope and revocation state.
- `sos_events` / `sos_agent_jobs`: deduplicated events, lease/retry state,
  deadlines and references to replies, without copying unnecessary content.
- `sos_receipts`: message-correlated evidence of backend/publication or
  human acknowledgment; do not manufacture evidence from AI-generated text.

The offline client's durable outbox is a separate local store. Its technology,
retention, encryption and export/recovery behavior need explicit design.
Define retention/deletion for private transcripts and relay bundles before
collecting them; do not assume indefinite retention or that deletion can
retract already-public copies. Keep all `argument_*` identities separate.

## Crisis-mapping projects — reference for later

These are candidates to examine; no integration is implemented.

- **Ushahidi** — crowdsourced incident reports and maps. Consider a read-only,
  authorized report feed from a specific deployment; there is no single global
  shared Ushahidi map. See [features](https://www.ushahidi.com/features/) and the
  [posts / GeoJSON API](https://docs.ushahidi.com/v3-ushahidi-platform-rest-api-documentation/v3/posts).
  Check that deployment's API compatibility and access permissions first.
- **Sahana Eden** — humanitarian coordination of requests, organizations and
  resources. A possible later step is authorized handoff to a partner organization
  already using it. See [Sahana products](https://sahanafoundation.org/products/).
- **HOT (Humanitarian OpenStreetMap Team)** — supports OpenStreetMap geographic
  data. Examine Tasking Manager, Export Tool / Raw Data API, and **ChatMap**
  (messages to maps). See the [HOT tools summary](https://docs.hotosm.org/projects/tools-summary/).

Candidate order: HOT/OSM geographic context and studying ChatMap first;
a read-only public report feed next; Sahana partner handoff later.

Keep transient SOS reports separate from base geography and private conversations;
preserve each report's source, time and status. External-service failure must not
block SOS intake, and a handoff is not confirmation of rescue. OSM is not an
authoritative source of ownership or live facility status. Offline maps need
permitted download sources: do not bulk-download standard `tile.openstreetmap.org`
tiles; see the [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/).

## Assigned workspace and runtime decisions

The user's latest instructions supersede the earlier proposed root-level
`map/` layout:

- `py/map/` — map Python source, preview server, tests and implementation notes.
- `docs/map/index.html` — frontend page, served directly by MkDocs.
- `docs/assets/sos-map.js`, `docs/assets/sos-map.css` — frontend behavior/style.
- `docs/assets/leaflet/` — vendored Leaflet 1.9.4 and its license.
- `var/genone.db` — initialized local SQLite database, outside served files
  and ignored by Git. The fixed database filename is `genone.db`.
- Root-level `uv` manages Python execution/dependencies; do not use pip.
- Preview: <http://127.0.0.1:18188/map/>. Keep the existing static server
  on port `8001` untouched.
- Start from the repository root: `uv run python py/map/preview.py`.
  The preview copies only map assets into a temporary serving directory at
  startup; restart it after frontend edits. Site links point to port `8001`.

SQLite will also support the future AI-assisted argument/fact-checking
subsystem described in `argument/design.md`. Keep its tables and account
attribution separate from anonymous SOS pins; do not link SOS submissions
to argument identities. Argument functionality is outside this map slice.

## Threat model / design principles (agreed — read before implementing, not just once)

These came out of an explicit safety discussion and should shape every
implementation decision:

1. **Location precision: full, never blurred.** An SOS is only useful if
   rescuers/helpers can find the exact spot. Do not round or fuzz
   coordinates for "safety" — that breaks the feature's actual function.
2. **Identity is what gets stripped, not location.** The real protection
   lever is removing anything that could identify the *sender* — no
   account requirement to submit, no device fingerprinting, no IP
   logging/retention server-side — when the user opts to stay anonymous
   (which is the default). Spend the safety budget there, not on
   degrading location data.
3. **Speed over gatekeeping.** The deepest threat this system defends
   against is someone being unable to get an SOS out at all. Submission
   and publication must be immediate — no moderation gate blocks a
   message from appearing. Abuse/spam handling, if needed, is
   flag-and-review *after* publish, never block-and-wait *before* publish.
4. **Transparency over false safety.** At the moment of submitting, the UI
   must plainly state what becomes publicly visible (exact location,
   message text, timestamp) and what is *not* collected (no account, no
   device ID) when anonymous. Also disclose: this tool does not anonymize
   the sender's network path — their ISP/network observer can still see
   they connected to this site unless they're already using one of the
   circumvention tools in `docs/doors.2026-09.md`. Don't imply a guarantee
   the app can't back up.
5. **Visibility: fully public map**, no access-gating on who can view it.
   Reach/speed is prioritized over restricting the audience.

## Feature scope (V1)

- Interactive map: pan, zoom.
- Primary intake: send text or voice with an implicit receipt timestamp;
  structured fields and exact location are not prerequisites for intake.
- Optional map flow: visitors can still drop a pin and describe the need.
  Unlocated messages remain valid intake while location is clarified.
- Anonymous by default; revealing contact/identity info is opt-in, never
  opt-out.
- Eligible, located pins publish immediately, no AI/human review queue.
  A receipt for an unlocated message must not claim that a pin is published.
- **Location restriction**: marking is blocked on locations classified as
  private property (buildings, residential/owned parcels); unrestricted on
  open/unowned terrain (deserts, oceans, wilderness, public land). See
  below for the technical approach — this is a best-effort filter, not a
  legal guarantee, and must be documented as such in the UI.

## Backend hosting decision

The user selected SQLite and expects the VPS to support a persistent
backend later. Proceed with that architecture; static-only hosting is no
longer the working assumption. Access the VPS using `ssh lightsail.a`.
Actual service configuration and deployment have not been inspected or
changed as part of this work.

`design.md` already describes a future Flask + Gunicorn service behind
Caddy. Implement create-pin and viewport-list APIs against `genone.db`,
with the database outside the static document root (proposed VPS path:
`/var/lib/sos-relay/genone.db`). The local preview is connected to SQLite through a loopback-only test API;
this is not a public deployment.

## Private-property filtering — technical approach

There's no reliable, complete, global land-ownership dataset available.
Practical approach: use OpenStreetMap tags as an approximate proxy.

- **Blocked** (best-effort): points inside a `building=*` footprint, or
  `landuse=residential` / `landuse=commercial` / `landuse=industrial`
  polygons.
- **Allowed**: `natural=desert|water|wood|wetland`, `landuse=forest`,
  unclassified/no-data areas, open ocean, and anywhere else not matched
  by the blocked set.
- Will have false positives and false negatives — OSM coverage is
  inconsistent, especially outside well-mapped regions. Document this
  limitation in the submission flow rather than presenting the filter as
  authoritative.
- Implementation: query an OSM data source (Overpass API for a live
  lookup, or a bundled/self-hosted extract if avoiding a live third-party
  dependency at submission time is preferred) before accepting a pin.

## Current implementation — 2026-09-21

- [x] Leaflet frontend with pan/zoom, click-to-select, draggable selection,
  map-center selection and manual coordinate entry without intentional rounding.
- [x] Description field, explicit optional contact sharing, and privacy/network
  disclosures. No account requirement or device identifier in the map code.
- [x] Clearly labeled local test: messages save to `var/genone.db` and reload
  across browser sessions. No SOS is dispatched or published to the Internet.
  Earlier in-memory messages require retyping; the user accepted this.
- [x] Network tile-provider disclosure, attribution and map-load error text.
- [x] MkDocs navigation link to the preview.
- [x] SQLite storage foundation in `py/map/db.py`: exact numeric coordinates,
  optional contact, server timestamp, viewport queries including dateline
  crossing, bounded pagination, WAL and component-specific migration records.
- [x] Local `var/genone.db` initialized. No sender IP/device/account fields
  in the SOS schema. This alone does not establish a no-logging deployment.
- [x] Preview server started on `18188`; HTTP response verified.

### Verification completed

- Six storage/API tests pass using root-level `uv`: precision and persistence,
  anonymous contact suppression, explicit contact opt-in and safe text
  storage, dateline/pagination behavior, invalid-input rejection, HTTP save/read,
  idempotent retries and cross-origin rejection. Tests use temporary databases.
- JavaScript syntax check passes.
- MkDocs build completes; existing unrelated documentation/link warnings remain.
- Browser automation has no available browser connection in this session.
  Visual layout, mobile behavior and interactive browser flow have not yet
  been verified by automation. The user has viewed and tested the initial
  map and saved three test messages, whose contents were read back from
  SQLite and confirmed by the user. Mobile and disconnect testing remain.

## Remaining implementation

- [x] User tested the map and first-stage message-to-database flow; three
  saved messages were read back and confirmed.
- [ ] Replace primary form flow with minimal text/voice input and optional
  location; add intake storage that accepts voice-only/unlocated messages.
- [ ] Test the new flow on mobile, including microphone/location permission
  denial, unavailable transcription and interrupted voice transfer.
- [x] Implement local persistent create-pin and viewport-list HTTP endpoints.
  Validate input, use server timestamps, and deduplicate unchanged retries
  by message UUID. No delete endpoint; existing messages are retained.
- [ ] Implement the server-side OSM private-property approximation before
  accepting public submissions; the current storage function does not check it.
- [ ] Choose the OSM source and resolve lookup-failure behavior. A successful
  no-data lookup is distinct from an outage. The proposed retryable failure
  preserves the draft but needs review against the speed requirement.
- [x] Wire the local frontend to SQLite API with pending, failed and saved
  states; retain failed drafts and reload saved messages on page load.
- [ ] Enable public publication only after server-side location checking and
  production service configuration are implemented.
- [ ] Verify cross-browser/client persistence and API round trips.
- [ ] Add post-publication abuse flag/review handling as needed.
- [ ] Verify backend/proxy/hosting logging configuration before claiming no
  sender-IP retention. Disclose any external location-check provider.
- [ ] Configure and test the dynamic service on the VPS; no deployment yet.

## Checkpoints and current handoff

- SQLite/backend direction accepted by the user; VPS capabilities still
  require operational verification before deployment.
- Frontend map UI: human visual/UX review before merging.
- Private-property filter: manually spot-check blocked/allowed points,
  including polygon boundaries/holes, before production use.
- Build, storage and API behavior should be mechanically verified.
- The user viewed the map and requested database persistence after testing
  three in-memory messages. They agreed to retype these messages.
- The user saved three messages and confirmed the database readback.
- Current design adds message-first text/voice intake to the DOOR/shutdown
  model and backend agent tasks. The current form remains a tested prototype.
  No AI worker, offline client, peer relay or VPS service has been deployed.

## Next slices and acceptance checks

1. **Message-first intake, receipt and anonymous case access:** build the
   minimal text/voice flow and optional-location intake model. Test sending
   without a map, denied location/microphone access, missing transcription,
   and preservation of original audio. Implement intake/publication states,
   deterministic receipts and private resume capability before AI. Test that
   a public pin ID cannot read chat, retries create one intake, and an OSM
   failure never produces a false map-publication confirmation.
2. **Disconnect-safe client:** durable outbox, locally available instructions,
   endpoint reachability and incremental sync. Test cold start without Internet,
   client restart with unsent work, missing tiles, server outage and a dropped
   acknowledgment after commit. Reconnect must produce one server message.
3. **Backend agent worker:** implement the task contract with a fake model
   first, then the chosen local/server/external model arrangement. Test crash
   recovery, duplicate events, unavailable models, malicious message instructions,
   user stop and delayed reply retrieval. No AI failure can undo SOS acceptance.
4. **First DOOR adapter and field test:** choose an actual supported client
   route and bootstrap package. Verify endpoint reachability, bounded retries,
   manual recovery and usability on the target device/network. Do not mark
   "Internet available" based solely on connection to a local access point.
5. **Total-shutdown relay experiment:** two offline clients and one intermittently
   connected gateway; validate custody versus backend receipts, duplicate bundles,
   tampering, expiry, return replies and eventual delivery. With no onward route,
   the only valid result is a retained pending signal and local assistance.
6. **Production readiness:** property-filter spot checks, private-data lifecycle,
   logging verification, human handoff semantics and deploy/service validation.
   Do not publish current test records as real emergencies when migrating.

The detailed order can be adjusted with the user. These are planned work,
not claims that the present browser preview can start offline or establish
DOOR connections. Keep the three saved test records and the current preview
unchanged while reviewing this design.
