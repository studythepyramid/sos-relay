# SOS Relay — Phase 1 Design

## Scope and roadmap — 2026-10-15

Edited by za and Codex.

[todo.md](todo.md) records the long-term vision, not a commitment to
implement every idea in the current phase. The project must grow through
many small, reviewable steps. **todo.md is controlled by za. Do not edit
it without explicit permission from za.** This design documents agreed
decisions; it does not authorize changes to that roadmap file.

The working sequence is:

1. **Useful static site:** improve categories, navigation, a site map,
   readable technical notes, and a predictable publishing process. Locate
   and review existing translations before designing or running another
   translation workflow.
2. **One complete SOS workflow:** accept a report, review it, display an
   appropriate map marker, and support expiry or resolution. Define how
   unreliable connectivity and misleading reports are handled before
   expanding the service.
3. **Controlled community participation:** introduce limited anonymous
   text remarks and SOS submissions, then gradually consider persistent
   identities and user-controlled data. Anonymous SOS intake belongs to
   the SOS workflow; broader community features can follow separately.

Paid storage, media hosting, chat groups, AI agents/token bridges, avatar
builders, and financial features are longer-term ideas requiring separate
scope and design decisions. Their presence in `todo.md` does not make
them requirements for the next release. Existing experiments do not
change that priority order.

### Operating budget

The VPS budget ceiling is **US$10 per month**, not a one-time cost.
Prefer text-first features and bounded resource use. Before adding a
service, estimate its compute, storage, and bandwidth needs against that
ceiling. The treatment of domain renewal, backups, and other non-VPS
charges still needs an explicit decision; the ceiling is a requirement,
not a claim that current total costs have been verified.

### Anonymous submissions and abuse controls

Initial implementation update, 2026-10-15. Edited by za and Codex.

The text inbox is now implemented at `/publicMsg/` on the existing Node
service, with persistent limits and private own-message history. The
form appears above the abuse/privacy notice. Guests receive 10 messages
and 3,000 segmented words per UTC day; the initial account tier receives
20 messages and 6,000 words. Both have a 60-second cooldown and text-size,
network, duplicate, and inbox-capacity checks. Location is unavailable;
only the current server-observed IP and a non-secret session reference
are displayed. Raw IPs are not stored by the inbox. Network counters
expire within 48 hours, guest sessions after seven days, and messages
after 30 days (rejected content after seven days from submission).

All messages remain private and pending. Agent/manual moderation tools,
public publication, and an SOS workflow are not implemented. Full details
and retention limitations are in [argument/publicMsg.md](argument/publicMsg.md).
The following requirements continue to guide later phases:

- Anonymous remarks and anonymous SOS messages use the same controlled
  text-submission channel. Identify SOS reports explicitly so they can
  receive priority handling without bypassing abuse controls.
- Anonymous users may submit **text only**, without attachments or media.
  Bound message length, submission frequency, cumulative submissions per
  time window, and duplicate/repeated pasting. Exact thresholds remain to
  be chosen and tested.
- Explain limits and moderation before submission. Show warnings as users
  approach limits and a clear retry time when temporarily rate-limited.
  Enforce limits on the server, not just in the browser.
- Without accounts, a session is not a reliable unique person. Combine
  anonymous-session limits, network-address limits, duplicate detection,
  and service-wide limits. Account for people sharing a network so a
  single address is not automatically treated as a single person.
- Submissions may be held for review, redacted, rejected, or removed by
  the system. Submission does not guarantee publication or indefinite
  retention. Users have no entitlement to bypass moderation, evade
  limits, flood the service, or interfere with its operation.
- Distinguish redaction from rewriting: remove personal information or
  abusive material where appropriate, but do not silently change the
  meaning of an SOS report. Mark edited content. Keep originals only for
  a defined, short review period with restricted access; decide the
  retention period before launch.
- Define prohibited conduct concretely: threats, harassment, fraud,
  impersonation, spam, coordinated manipulation, and attacks on the
  service. Political disagreement alone is not evidence of abuse.

### Identity and user-owned data — later steps

Persistent identities should add capabilities gradually. Public keys can
prove control of an identity, but do not by themselves solve lost-device
recovery, impersonation, or one person creating many identities. Those
need separate design decisions before promising durable accounts.

Translate “user data belongs to the user” into explicit export, deletion,
visibility, and retention policies. Explain how those policies interact
with moderation and anonymous submissions before accepting long-lived
user content or offering paid space.

## Purpose

A public relay/knowledge-base site for the SOS project: signal relay for
emergencies under internet shutdown/censorship conditions, plus a
multi-language knowledge base (translated notebooks, GFW-bypass docs, etc).
See `~/dev/checklist.md` for the full project background.

## Domain

- Chosen: `sosweb.org`
- Registrar: Google Cloud Domains, project `studythepyramid`
- Registration steps + contact YAML template: `~/dev/domain-register.md`
- Contact privacy: `redacted-contact-data` (WHOIS-hidden); registrant should
  use a PO box / dedicated email, not home address, given the project's
  threat model — see notes in `domain-register.md`

## VPS

- Host: AWS Lightsail, `admin@13.125.209.14`, SSH alias `lightsail.a`
  (`~/.ssh/config`)
- Auth: passwordless via `~/.ssh/id_ed25519` (default key, added alongside
  the original `LightsailDefaultKey-ap-northeast-2.pem`)
- Local dotfiles (`.bashrc`, `.inputrc`, `.vimrc`, `~/.vim/`) copied over so
  the same editing environment is available directly on the box

## License

- `LICENSE` = "SOS Relay Ethical License", derived from Hippocratic
  License 3.0 (github.com/EthicalSource/hippocratic-license-3), not an
  OSI/DFSG "open source" license — source-available with conduct-based use
  restrictions.
- Core HL3 human-rights clauses (killing, slavery, torture, discrimination,
  due process, arbitrary detention, privacy, indigenous rights) plus:
  - §3.1.11 Mass Surveillance
  - §3.1.12 Media (violence promotion)
  - §3.1.15 Internet Censorship (national/regional firewalls)
  - §3.1.16 Freedom of Expression and Press
  - §3.1.17 Distress Signal Protection (jamming/spoofing/targeting senders)
- Enforcement: HL3's own termination (§7), private right of action (§4),
  and equitable relief (§8.2) mechanics carried over — this is what gives
  the ethical clauses actual teeth against reachable violators. No license
  stops an adversary who ignores courts; that's a separate opsec problem,
  not a licensing one.

## Static site (phase 1) — MkDocs + Material

Reusing the theme already proven in `~/dev/localllm/mkdocs.yml`, trimmed of
that project's userdocs/aispace staging (not needed here).

### Repo structure

```
sos-relay/
├── LICENSE
├── design.md
├── mkdocs.yml
├── docs/                  # markdown source — this is what you edit/commit
│   ├── index.md
│   ├── about.md
│   └── kb/                # translated knowledge-base articles later
│       ├── en/
│       └── cn/
├── .gitignore             # already excludes /site, .venv, __pycache__
└── site/                  # BUILD OUTPUT — gitignored, regenerated on deploy
```

### VPS layout

```
/opt/sos-relay.git/        # bare repo — deploy target, post-receive hook lives here
/opt/sos-relay/            # working tree, checked out by the hook
/opt/sos-relay/site/       # mkdocs build output — what Caddy actually serves
/var/sos-share/            # public downloads at /share/ — not inside site/, so builds do not delete it
/my/  →  /home/admin/my/   # private parent; only md/ is published
```

Publication boundary updated 2026-10-15. Edited by za and Codex.

Only `/my/md/*` is eligible for upload from the local `/my/` tree. Never
upload or publish the parent `/my/`, `/my/*.md`, or other sibling content.
The VPS serves `/my/md/` directly at `https://sosweb.org/tecNotes/`, with
directory browsing and raw Markdown files. Old `/mymd/` and `/my/md/` URLs redirect
there; the public URL is independent of the filesystem path. Other
`/my/` URLs are explicitly blocked by Caddy.

Some folders inside `/my/md/` are obsolete leftovers. za will review them
before further syncing or cleanup; do not infer that all folders should
be retained, uploaded, or deleted. Avoid symlinks that expose files outside
the notes tree. See [env.cmd.md](env.cmd.md) for SSH, rsync, and build
commands. This replaces the earlier description of all notes as private
test fixtures; the parent directory remains private.

## CI/CD — push-to-deploy

No CI service needed for phase 1. Deploy = one `git push`:

```bash
# one-time setup on VPS
ssh lightsail.a 'sudo mkdir -p /opt/sos-relay.git /opt/sos-relay && \
  sudo chown admin:admin /opt/sos-relay.git /opt/sos-relay && \
  git init --bare /opt/sos-relay.git'

# one-time setup locally
git remote add production admin@lightsail.a:/opt/sos-relay.git
```

`/opt/sos-relay.git/hooks/post-receive`:
```bash
#!/bin/bash
set -e
GIT_WORK_TREE=/opt/sos-relay git checkout -f main
cd /opt/sos-relay
./scripts/fetch-tts-assets.sh
mkdocs build
```

Deploy:
```bash
git push production main
```

No restart step — `site/` is static, `file_server` reads straight off
disk, so overwriting it is a live, zero-downtime update.

## Serving — Caddy

Chosen over nginx/Apache for automatic HTTPS (no manual `certbot` setup);
the original minimal phase-1 configuration is shown below for context.
It is not the complete live configuration: the VPS also has scoped notes,
redirect, private-path blocking, and application routes. Do not replace
the live `/etc/caddy/Caddyfile` with this example.

```
sosweb.org {
    root * /opt/sos-relay/site
    file_server
    encode gzip
}
```

## Phase 1.1 — TTS/STT for static pages (client-side, no backend)

Status: model weights staged and downloadable; blocked on the WASM engine
build (Emscripten, one-time, see corrections below) — in progress, not
delayed, waiting on that build being done by hand.

Goal: a read-along voice tutor that works from a static site with **no
backend at all** — no server-side compute, no third-party cloud API. All
inference happens in the visitor's own browser.

### Why not the browser's built-in Web Speech API

Tested first since it needs zero setup (`speechSynthesis` /
`SpeechRecognition`). Confirmed broken on this Linux/Chromium setup:
`SpeechRecognition` returned `(error: network)` — it's cloud-based, phones
home to Google's servers, and fails exactly the kind of network conditions
this project is built around. `speechSynthesis` returned
`(tts error: synthesis-failed)` — Chromium's Linux TTS backend is
independently unreliable even with `espeak-ng`/`speech-dispatcher`
installed at the OS level. Neither is a foundation worth building on here.

### Chosen engine: sherpa-onnx-wasm

- **Correction from initial research**: there is no prebuilt WASM bundle
  download. The official HF Space demos exist and work in a real browser,
  but their raw files are blocked to anonymous scripted downloads by HF's
  Xet storage backend (401, platform-side, not a permissions issue with
  the repo) — no GitHub release of the bundle exists either. The bundle
  has to be **built from source once**, via Emscripten
  (`build-wasm-simd-tts.sh` in `k2-fsa/sherpa-onnx`, requires emsdk
  pinned to `4.0.23` per the script's own comment), then hosted as
  static files — a one-time build step, not a per-deploy one, but real
  setup that was originally assumed away. Model weights are unaffected —
  piper voices download fine from GitHub Releases with no auth issue.
- **Second correction, found reading the actual build script/CMakeLists**:
  the official build **bakes one specific voice model into the `.wasm`
  binary at compile time** via Emscripten's
  `--preload-file wasm/tts/assets@.` — you manually place `model.onnx` +
  `tokens.txt` + `espeak-ng-data/` into `wasm/tts/assets/` *before*
  building, and the build refuses to proceed without them
  (`CMakeLists.txt` has a `FATAL_ERROR` guard on their absence). This is
  the opposite of "generic engine + runtime-loadable voice," which is
  what the Phase 1.1 model-delivery design above assumed. Three ways to
  reconcile this once we're ready to build, not yet decided between:
  1. Accept one fixed voice per build (simplest — build once with the
     already-staged `en_US-amy-low` voice)
  2. Patch the C++/JS source to load the model from a runtime-fetched
     buffer instead of the preloaded virtual filesystem (real engineering,
     not just running the script)
  3. Build a separate bundle per voice (no source changes, but each
     bundle re-includes the full onnxruntime WASM core, so hosting cost
     multiplies per voice/language offered)
- Piper voices are natively bundled into sherpa-onnx's TTS model zoo (not a
  separate integration) — light weight (tens of MB/voice) compared to
  alternatives.
- Considered and set aside for now: `kokoro-js` — real package, decent
  quality, but requires an npm/bundler build step (reintroduces exactly
  the tooling fuss avoided by using MkDocs's `extra_javascript` over a
  Node SSG) and larger downloads (86MB+ even quantized). Revisit only if
  sherpa-onnx voice quality proves unsatisfying.

### Model delivery — two paths, not one

Client-side inference shifts the failure mode from "unknown API errors"
to "can the browser finish/keep a 100–300MB download," which is its own
real problem on this project's target networks:

1. **Cache API / Service Worker** — seamless when it works, but eviction
   is the browser's call (storage-pressure LRU eviction,
   `navigator.storage.persist()` is only a request, not a guarantee), and
   **private/incognito mode doesn't persist Cache API storage across the
   session at all**.
2. **Manual save + reload** (fallback, and arguably the primary path
   given the audience) — a plain `<a download>` link puts the `.onnx`
   file in the user's real Downloads folder; `<input type="file">` (or
   File System Access API on Chrome/Edge) loads it back via
   `arrayBuffer()` straight into `InferenceSession.create()`, no network
   involved. Survives private mode (downloaded files aren't part of the
   "leave no trace" promise) and enables **peer-to-peer distribution** —
   one person downloads it once, others get it via USB/local
   transfer/sneakernet without touching the network at all. Add a
   SHA-256 checksum check before loading a user-supplied file, since it
   may arrive hand-to-hand rather than fresh from the server.

### Capabilities-probe guide page (next to build)

A step-by-step `docs/guide/tts-stt.md` page that runs a small JS
capability check on load and adapts its instructions to what the visitor's
browser actually supports, rather than assuming. Checks:

- WebAssembly + WASM SIMD (picks which sherpa-onnx build to fetch)
- `navigator.gpu` (WebGPU) — optional acceleration path
- `'caches' in window`, `navigator.storage.estimate()` (warn before a
  200MB+ download if free space looks insufficient),
  `navigator.storage.persist()`
- File System Access API vs. plain `<input type="file">` fallback
- `navigator.mediaDevices.getUserMedia` + `AudioContext` (raw mic capture
  for local ASR — different from, and independent of, the old built-in
  `SpeechRecognition` we're moving away from)

Each check renders as a pass/fail row, and the page's subsequent
steps (download → load → test TTS → test STT) are gated/adapted on the
results rather than assuming one code path fits every browser.

## Administration dashboard — 2026-10-26

`/admin/` is the operator dashboard for account management and the private
`/publicMsg/` review queue. The existing Express service handles both the
page and `/api/admin/`; Caddy proxies these paths to it. Dashboard assets
live outside the publicly served `argument/site/` directory so an alternate
static URL cannot bypass access checks.

Use the existing account session with an explicit administrator role.
Existing and newly registered accounts remain ordinary users. Grant the
first administrator through an SSH-only command, never by assuming that
a particular username is an administrator. Disabled accounts cannot log
in or use existing sessions. Every dashboard and API request checks access.

The initial dashboard provides:

- Overview counts and recent operator activity.
- Searchable, paginated user lists; account creation; display-name changes;
  enable/disable; password reset; session revocation; and role management.
- A private message queue with status, search, date order, pagination, and
  full-message inspection. Operators can mark reviewed, reject, or return
  a message to pending. Reviewed messages remain private; no public feed
  is introduced. Message editing and redaction are deferred.

All writes require the existing JSON request guard and a recorded reason.
Manual dialogs start with editable default reasons. The persistent admin
setting `auto_approve_all` defaults to off. Enabling it immediately reviews
existing pending messages and arguments, and new submissions are reviewed
inside their creation transaction. Automatic reviews show **approved by
auto** and record `approval: auto_approve` in the audit log.

Automatic mode skips admin action confirmations; a requested role change
still requires an authorized admin request, and passwords still need to be
entered when setting them. Registration continues to create ordinary
users. The username `auto` may be reserved by a real account; automatic
reviews use the distinct system ID `system:auto-approval`. Disabling the
setting affects future reviews without undoing previous decisions.
Explicit rejections remain rejected. Return-to-pending requires turning
automatic mode off first.
Record actions atomically in an audit log, omitting passwords, session
secrets, network identifiers, and message bodies. Keep audit events for
90 days. Preserve existing message retention periods. Version message
reviews to reject stale decisions from another tab or reviewer.

Prevent self-disable, self-demotion, and removal of the last active admin.
Revoke sessions when disabling an account or resetting its password.
Use no-store responses and a restrictive content security policy for the
dashboard. Show admin navigation only to authorized accounts, while
enforcing authorization independently on the server.

Implementation and bootstrap instructions: [argument/admin.md](argument/admin.md).

Local dashboard demo: username `Operator`, password
`dashboard-preview-password` (`Operator/dashboard-preview-password`).
These are synthetic preview credentials, not a production account or a
default password. The demo runs with a separate temporary database;
production admin access is granted explicitly to an existing account.

## Site-wide arguments attached to passages — 2026-10-26

Extend `/argument/` so a reader can select a passage anywhere on the
public site and start a discussion connected to its source. Caddy keeps
serving static pages; shared browser JavaScript captures the selection,
and the existing Express service authenticates users and creates threads.
The detailed argument subsystem design is in
[argument/design.md](argument/design.md).

### Reader flow

1. Select text in a supported page's reading area. Show a dismissible
   **Discuss this passage** action near the selection, with keyboard and
   touch support. Ignore navigation, form fields, and editable content.
2. Open `/argument/new/` with a draft containing the quotation, source
   title, and source link. Ask what the reader wants to question or
   discuss. Keep their contribution separate from the quoted passage.
3. Preserve the draft in the current browser tab through login and
   recoverable submission errors. Selecting text does not publish it.
   If browser storage is unavailable, explain the problem before leaving
   the source page. Do not place the quotation in URL query parameters.
4. Require the existing account session to publish. Let the reader review
   and edit their title and contribution, or remove the attached passage.
   Clear the saved draft after successful publication or explicit discard.
5. Display the source quotation and attribution on the thread, with a
   link back to the passage. The quoting user is not the quoted author.

### Source attachment and return link

Store source metadata separately from the root claim in SQLite: source
URL, page title, exact selected text, short text before and after it,
nearest section anchor when available, language, and capture time.
Existing threads without attachments continue working.

Validate attachments on the server, accepting bounded plain text and
public `sosweb.org` URLs. Render text with HTML escaping. A submitted
quotation is a reader-supplied snapshot; it is not proof of authorship or
that the source page was verified by the server.

On return, use the quotation and surrounding text to locate and highlight
the passage. Keep the original section anchor as a fallback. If the source
changed or the match is ambiguous, explain that the exact passage cannot
be located rather than highlighting unrelated text. Retain the original
quotation in the thread even when its source changes.

### Coverage and delivery

Start with MkDocs reading pages, including History Notes, using shared
JavaScript and CSS through the existing site configuration. Standalone
HTML pages and the Markdown viewer can load the same assets. Door pages
are published separately from `/my/md/` and need their own integration
and upload step. Avoid changing or duplicating their translations.

The first implementation includes selection, draft review, login
continuation, attachment storage, thread attribution, and passage return
highlighting. Verify desktop and mobile selection, keyboard access,
Chinese and right-to-left text, migration of an existing database, and
existing thread creation without a source attachment.

Later additions can provide a page-level discussion count, existing
threads for the selected passage, and an option to join one before
starting another. Keep publisher freedom assessments separate from
discussion activity; thread counts are not evidence or danger scores.

## Explicitly deferred to a later phase

- **Dynamic backend** (translation editor UI, signal-relay API): separate
  Node.js systemd service on `127.0.0.1:8000`, added to the Caddyfile as a
  path-scoped `handle` block once it exists. Not needed for the static
  site. (Chosen 2026-09-23: zero sunk cost in any particular backend
  stack pre-launch, and Node/npm gives agents more off-the-shelf options
  — see `py/map/README.md` for the map API's specifics.)
- **Translation pipeline** (2026-10-15 update; Edited by za and Codex):
  za has already translated documents and needs time to locate the files.
  Wait for that review before choosing a pipeline or generating duplicate
  translations. The following paths are historical leads to inspect,
  not a confirmed current workflow: `~/dev/localllm/py/translate.py`'s piece
  splitting / interleave format / atomic-write logic rather than
  reinventing it; `:Zatranslate` output for `notebook.history.md` now
  targets `~/my/history/2021/notebook.history.en` inside the
  `historyStudy/2021` GitLab repo, so it travels with the source.
- **GitHub Actions / automated tests**: add once there's an actual test
  suite worth gating a deploy on.

## Bigger picture — after the static site (ss)

Two directions once phase 1/1.1 are solid, not yet decided between:

1. **Dynamic web** — the deferred Node.js backend above (signal relay
   API, translation editor), reverse-proxied by Caddy alongside the
   static site.
2. **Android app with the static site as a remote source** — a thin
   native shell (in the spirit of the existing `basicsMar23` project) that
   points at `sosweb.org` rather than duplicating content, so the
   knowledge base/guide pages stay maintained in one place.
