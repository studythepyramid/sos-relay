## Account registration (implemented October 2026)

This section supersedes the anonymous-only identity notes below. `/user/`
provides username/password registration, login, display-name editing, and logout.
Reading remains public; creating arguments and replies requires a session.

- `argument_user`: account ID, unique case-insensitive username, scrypt password
  hash, random salt, and creation time. Usernames use 3–32 ASCII letters,
  numbers, or underscores; passwords use 8–128 characters.
- `argument_session`: SHA-256 hash of a random session secret, account ID,
  and expiry (30 days). Login rotates the session; logout revokes it.
- `argument_identity` remains the display-name store. New account IDs are used
  as the author/owner identity in existing argument tables. Legacy anonymous
  identities and posts remain unchanged and are not automatically claimed.
- Cookies are HttpOnly, SameSite=Lax, and Secure over HTTPS. Production must
  use HTTPS through the existing trusted loopback proxy. HTTP is supported for
  local development only.
- Writes require JSON and `X-Argument-Request: 1` as a CSRF guard. Do not add
  permissive credentialed CORS. Existing per-IP rate limits also cover auth.
- No email verification or password recovery is included yet.

Start/restart the service with `cd argument && npm start` to create the tables
in the configured database and regenerate thread pages with the new client code.
The existing `/api/user` proxy route must forward its subpaths as well.
Run `cd argument && npm test` for database and HTTP authentication tests.

# Argument — design anchor

A sub-project of `sos-relay`: online argumentation formed from facts and
theories drawn from human history, sciences, and theologies, held to a
philosophical standard of discourse — regular argumentation theory, not
quarrels among bad men.

A quarrel has no structure. 
An argument does — and that structure is what makes it public 
(i.e., something anyone can follow and evaluate). 

## Seed content

- `docs/history-religion-science.md` — links the source notebook
  (`notebook.history.md`, GitLab) and its in-progress English translation
  (`notebook.history.en`). This is the first document arguments will root
  into.

## Two argumentation theories to start with

1. **Toulmin's model of argument** (Stephen Toulmin, *The Uses of
   Argument*, 1958) — claim, data/grounds, warrant, backing, qualifier,
   rebuttal. Richer than raw syllogism; matches "start with premises and
   build an argument" without forcing every argument into strict
   deduction. Good fit for historical/empirical claims where certainty is
   rarely absolute.

```
        Backing (support for the warrant)
            ↓
        Warrant (the bridge: "why does this evidence
         support that claim?")
            ↓
   Grounds →→→→ Claim
   (evidence)    (conclusion)
            ↓
        Qualifier ("probably", "in most cases")
            ↓
        Rebuttal ("unless...")   
```

2. **Dung's abstract argumentation frameworks** (Phan Minh Dung, 1995) —
   arguments as nodes, attack relations as edges, with formally defined
   semantics (grounded, preferred, stable extensions) for which arguments
   are collectively "acceptable" given what attacks what. This is the
   part that makes "regular theory, not quarrels" computable rather than
   aspirational: a rebuttal doesn't win by being posted last, it wins (or
   doesn't) by the framework's own defined rules.



Both are established, decades-old formalisms — the goal is reusing
existing theory, not inventing new rules of debate from scratch.

Other frameworks for arguments

| Framework | Structure | Used in |
|---|---|---|
| **Aristotelian Rhetoric** | Ethos (credibility) + Pathos (emotion) + Logos (logic) | Speeches, editorials |
| **Classical (Cicero)** | Introduction → Narration → Confirmation → Refutation → Conclusion | Courtrooms, debates |
| **Deductive** | Premise 1 + Premise 2 → Conclusion (valid or invalid) | Math, formal logic |
| **Inductive** | Specific observations → General conclusion | Science, surveys |
| **Dialectic (Hegel)** | Thesis → Antithesis → Synthesis | Philosophy, policy synthesis |
| **Socratic** | Question → Answer → Question → … (dialogue, not monologue) | Teaching, journalism |

Dialectic should be paid more attention, 
it's negative, it's abusive to good human reasonings, it's running outside of the logics,
brainless confucians and communists twist it to do propoganda.

## Data model (draft)

A DAG, not a tree — deductive inference commonly combines multiple
premises into one conclusion, which a strict tree can't represent.

```
node: {
  id,
  type,        # fact | premise | inference | claim | rebuttal
  parents,     # [node_id, ...] — zero or more
  anchor,      # piece_id (see below) if this is a root node, else null
  content,
  owner,       # attribution — see "Ownership" below
  reasoning,   # inductive | deductive | abductive
  created_at,
}
```

### Anchoring to source paragraphs

`notebook.history.en` already carries stable
`<!-- translate:piece id=N lines=START-END -->` markers from the
translation pipeline (`~/dev/localllm/py/translate.py`). Reuse `piece_id`
directly as the anchor — no new parsing needed, arguments root into the
same paragraph-level units the translation already addresses.

### Ownership

Attribution lives at the **node** level, not the thread level — an
argument is a mosaic of individually-owned facts/premises/inferences, not
one blob credited to whoever posted last. This is also the moderation
mechanism: a bad-faith contributor's specific nodes can be traced and
pruned without touching anyone else's work in the same argument.

## Infrastructure implications

- Needs a real backend the moment more than one person can write to it —
  static-site territory ends here (see `../design.md`'s "Bigger picture"
  section on dynamic web vs. static).
- Storage: SQLite is enough at any scale this is likely to hit early on —
  no separate DB server needed, fits the VPS's resource constraints.
- Needs lightweight user identity — even pseudonymous — since "ownership"
  is meaningless without someone to own it. First feature in this project
  that actually requires accounts of any kind.

## Edge types (relationship, not votes)

A reply is always a **node** (owned text, per "Ownership" above). What the
reply *means to its parent* is carried by the **edge**, not a second node
type and not a vote count:

```
edge: {
  from,        # node_id (the reply)
  to,          # node_id (what it replies to)
  relation,    # attack | support | unrelated | noise
  set_by,      # "owner" | "ai:<classifier-name>" — who classified it
  created_at,
}
```

- **No thumbs up/down, no vote counts.** The whole reason Dung's framework
  was chosen over a StackOverflow-style vote system is that acceptability
  should come from attack/defense structure, not popularity — a raw vote
  count reopens the "manipulated crowds win by numbers" problem this
  subsystem exists to defend the owner against. Adding votes on top of
  typed edges would just give brigading two levers instead of one.
- `noise` is not a trash bin off to the side — it's an edge classification
  like any other ("You're trash!", "You're dumb!", drive-by insults with
  no fact/premise/logic attached, land here). It's not deleted or hidden
  by default; it's demoted, and its presence is itself a small signal
  ("someone came and left noise") worth keeping visible in aggregate, not
  necessarily per-message.
- `set_by` distinguishes an AI-suggested classification from the owner's
  own — the AI proposes, the owner has final authority to reclassify any
  edge attached to their argument. This follows the same node-level
  ownership/moderation principle above; the classifier must not be able
  to silently overrule the owner.

## AI copilot — three separate jobs, ordered by risk

1. **Classifier** (build first). Suggests `relation` for each new incoming
   edge. Architecturally the same shape as `py/map/agent.py`'s existing
   pattern: poll unprocessed rows, call a model, write the result, leave
   it unprocessed on failure so the next poll retries — no silent drops.
   New table (`argument_edge_classifications` or similar), not a rewrite
   of that module.
2. **Graph renderer.** Draws the DAG (nodes = facts/premises/claims, edges
   = attack/support/unrelated). Since the framework is already Dung's, this
   can go beyond a generic force-directed graph and actually compute/
   highlight the grounded or preferred **extension** — which nodes are
   collectively acceptable given the current attack structure — which is
   the actual payoff of having picked a formal framework over inventing
   one.
3. **"AI quarreller" (draft-only at first).** An AI that writes a
   suggested rebuttal to noise/bad-faith attacks so the owner doesn't have
   to keep repeating themselves. Keep this **assistive, not autonomous**
   initially — an AI auto-posting *as if defending* a specific person
   edges toward impersonation/astroturfing even when well-intentioned,
   which sits in tension with this project's own Ethical License stance on
   manipulation. Owner reviews and posts the draft themselves; autonomous
   auto-reply can be a later, explicit opt-in, not a default.

## Identity, quota, and what's explicitly deferred past the MVP

- **Identity**: a random token generated client-side (localStorage) on
  first post, sent along with writes (as a request header, e.g.
  `X-Argument-Token`) — no signup, no login screen, the server never
  checks or verifies it, it only stores it. This is what "ownership"
  (node/edge attribution, edge reclassification rights) binds to. Display
  name is derived deterministically from the token — `wordlist[hash(token)
  % wordlist.length]` against a short hand-picked word list (`Sky`,
  `Kane`, `Jane`, `Tree`, `cat`, …) — deterministic so the same
  anonymous poster is recognizable across a thread, not re-randomized per
  post. Collisions between different posters sharing a name are expected
  and accepted at this list size; not worth solving yet. Accepted MVP
  limitation: clearing localStorage or switching devices loses "ownership"
  of past posts permanently, with no recovery path.
- **Registering a display name and avatar** (built 2026-09-26): the
  `argument_identity` table (`token`, `display_name`) lets a token attach
  a real name via `/user/` — not a login (no password, no session; the
  server still never verifies the token, it only stores what's attached
  to it), just metadata on the same silent token every visitor already
  holds. `resolveLabel(token)` returns the registered name if one exists,
  else `anonymous-<word-list-label>` — the `anonymous-` prefix makes
  registered vs. unregistered posters visually distinguishable at a
  glance. **Not retroactive**: the label is baked into `author_label` at
  post time, so registering a name only changes future posts; making it
  retroactive would mean regenerating every thread a token has ever
  touched on every name change, real complexity for cosmetic benefit.
  Avatar is a deterministic identicon (`src/identicon.js`, sha256(token)
  → a 5×5 mirrored colored grid) — no upload, no storage, same
  zero-friction shape as the word-list label, generated server-side and
  reused identically by both the rendered pages and the `/api/user`
  profile preview (single source of truth, not duplicated in client JS).
  **A stronger identity is possible later**: the browser's Web Crypto API
  (`crypto.subtle`) can generate a real, non-extractable asymmetric
  keypair — the private key becomes physically unreadable by any page
  JS (stored as a live `CryptoKey` in IndexedDB, not a plain string in
  localStorage), writes get signed client-side and verified server-side
  with Node's matching `crypto.webcrypto`, and the public key *becomes*
  the identity, no separate token at all — genuinely closer to
  unphishable than a bearer token. It does **not** solve losing your
  identity on a cleared browser or a new device, though — that's
  identical under either scheme, since the secret lives in exactly one
  browser either way; solving that would need an exportable/backed-up
  key, which trades away the non-extractability that's the whole
  benefit. Treated as a separate future phase since it's an upgrade to
  *how* the token is established, not to what sits on top of it — the
  `argument_identity.token` column would just start holding a public key
  instead of a random string, with everything else unchanged.
- **Quota**: a fixed default (e.g. 10MB) per identity, enforced at write
  time against `argument_*` row sizes for that owner. Paid upsizing is a
  **separate sub-system** (billing, compliance) — do not let it block or
  complicate the MVP write path. Land quota *enforcement* first; land
  *payment* as its own later design pass, the same way `design.md`
  defers the dynamic backend as a whole.
- **Private arguments** ("public call to gather, then go private, pruning
  the trail as the owner progresses"): interesting, but be honest about
  what SQLite can actually guarantee — WAL checkpoints and backups can
  retain "erased" rows past the point the UI shows them gone. Promising
  erasure this storage layer can't structurally back is worse than not
  promising it, given the project's own "user data belongs to user"
  stance. Scope v1 as "pruned from the live view," not "erased," and
  treat true erasure as a separate hard problem for later.
- **Rich media** (voice/TTS-STT, camera video, links to external
  hypertext): text-only for the MVP; voice reuses the client-side
  sherpa-onnx-wasm work from `../design.md`'s Phase 1.1 once that's
  unblocked, rather than a separate implementation.
- **Android client**: reuse the "thin native shell pointing at the site"
  pattern already noted in `../design.md`'s "Bigger picture" section —
  content stays maintained in one place, not duplicated per-client.

## Phased roadmap

1. **MVP — live text board.** Node.js service (per `../design.md`'s
   already-chosen dynamic-backend decision) + SQLite `genone.db`,
   `argument_*` tables. Nodes = text; edges = typed relations
   (attack/support/unrelated/noise), owner-set only, no AI yet. Public
   arguments only. Pseudonymous identity, no quota enforcement yet.
2. **Quota enforcement.** Per-identity size cap on `argument_*` writes.
   No payment wiring yet — just the limit and a "you're at capacity"
   state.
3. **AI classifier copilot.** Auto-suggests edge relation on new replies;
   owner can override. `agent.py`-style poll loop.
4. **AI graph renderer.** DAG visualization + Dung extension computation
   (grounded/preferred) surfaced in the UI.
5. **Rich media.** Voice (STT/TTS via the static-site WASM work),
   camera video, external HTML links.
6. **Android client.** Thin shell over the same content.
7. **AI quarreller (draft-only).** Suggested-rebuttal drafts for the
   owner to review and post themselves.
8. **Payments.** Its own design pass — billing, compliance, upgrade flow
   for quota beyond the free default.
9. **Private arguments.** Public call → private transition, "pruned from
   view" semantics only, once the erasure-guarantee question above has a
   real answer.

## MVP schema (SQLite, shared `genone.db`)

Three tables, not more — `argument` (the thread itself, what the URL
resolves to), `argument_node` (every post: the claim + every reply),
`argument_edge` (the Dung relation; only replies get one, the root claim
has none). No `identity`/`user` table yet (the token is stored inline on
each row that needs attribution — a dedicated table only earns its keep
once it holds more than an opaque string, i.e. the payment/avatar phase)
and no `parents`/premises-join table yet (multi-premise derivation is
Phase 4+ structured-argument-building, not needed for a flat reply
thread).

```sql
CREATE TABLE argument (
  id           INTEGER PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,        -- YYMMDD-HH-title-XXXX
  title        TEXT NOT NULL,
  owner_token  TEXT NOT NULL,
  root_node_id INTEGER,                     -- filled in after the first node insert
  status       TEXT NOT NULL DEFAULT 'public',
  created_at   TEXT NOT NULL                -- UTC ISO-8601
);

CREATE TABLE argument_node (
  id            INTEGER PRIMARY KEY,
  argument_id   INTEGER NOT NULL REFERENCES argument(id),
  author_token  TEXT NOT NULL,
  author_label  TEXT NOT NULL,              -- word-list name derived from author_token
  body          TEXT NOT NULL,
  node_type     TEXT NOT NULL DEFAULT 'claim',  -- fact|premise|inference|claim|rebuttal
  created_at    TEXT NOT NULL
);

CREATE TABLE argument_edge (
  id             INTEGER PRIMARY KEY,
  argument_id    INTEGER NOT NULL REFERENCES argument(id),
  from_node_id   INTEGER NOT NULL REFERENCES argument_node(id),
  to_node_id     INTEGER NOT NULL REFERENCES argument_node(id),
  relation       TEXT NOT NULL,             -- attack|support|unrelated|noise
  set_by         TEXT NOT NULL DEFAULT 'poster',  -- poster|owner|ai:<classifier>
  reclassified_at TEXT,                     -- set on any later relation change
  created_at     TEXT NOT NULL
);

CREATE INDEX idx_node_argument ON argument_node(argument_id);
CREATE INDEX idx_edge_argument ON argument_edge(argument_id);
CREATE INDEX idx_edge_from     ON argument_edge(from_node_id);
```

Rendering a whole thread top-down is one query (also what a later AI
classifier reads to decide `relation` — no separate table needed for
that, it does the same `SELECT` and writes `relation`/`set_by='ai:...'`
back onto the edge row):

```sql
SELECT n.id, n.author_label, n.body, n.node_type, n.created_at,
       e.relation, e.to_node_id
FROM argument_node n
LEFT JOIN argument_edge e ON e.from_node_id = n.id
WHERE n.argument_id = ?
ORDER BY n.created_at;
```

**Who sets `relation` before the real AI classifier (phase 3) exists?**
The poster self-declares it when replying (`set_by='poster'`) — there's
no moderation UI yet for an owner to override. For pure prototyping before
even that exists, `relation` is decided by a placeholder heuristic with
zero semantic meaning, kept behind one small swappable function
(`classifyRelation(body)`, mirroring the swappable `process_fn` pattern
already used in `py/map/agent.py`): body over 100 bytes → `support`,
else → `noise`. Reclassifying (poster → owner → ai, or any relation
change) is a cheap single-row `UPDATE` by primary key — not a performance
concern at any scale this will hit — but since pages are static and
regenerated on write, a reclassification **is** a write and must trigger
the same page-regen path a new post does, or the displayed tag goes
stale against the DB.

## Repo layout & deployment

Node project root is the existing `argument/` folder (`npm init` run
there directly) — mirrors how `py/map/README.md` sits alongside
`py/map/db.py`, just without a language-prefixed parent directory since
this is the only Node subsystem so far.

```
argument/
├── design.md            # this file
├── settings.toml         # db_file = "var/genone.db"
├── package.json
├── src/
│   ├── server.js           # Express app entry
│   ├── db.js                 # schema + migrations, mirrors py/map/db.py's shape
│   ├── render.js               # DB rows → static HTML for a thread/list page
│   └── routes.js
├── site/                # generated static output — gitignored, Caddy serves this
└── test/
```

`settings.toml`:
```toml
db_file = "var/genone.db"
```
Path is relative to the **repo root**, not to `argument/` — resolved
against `process.cwd()` when the service is launched with
`WorkingDirectory=/opt/sos-relay` in its systemd unit, matching the same
"run from the repository root" convention `py/map/README.md` already
uses for `preview.py`. Needs one small TOML-parser dependency (Node has
none built in, unlike JSON).

URL path is singular, matching the folder name exactly:
`sosweb.org/argument/YYMMDD-HH-title-XXXX` — corrected from an earlier
plural (`/arguments/...`) that didn't match `argument/` on disk. Both the
public path and every on-disk folder are now `argument`, no plural
anywhere. Generated static output mirrors the existing `site/`
build-output pattern one level down, inside the subsystem's own folder
rather than inside MkDocs's — **must** stay out of `site/` itself, since
the existing deploy hook runs `mkdocs build` on every push and would
silently wipe any argument pages living inside it:

```
sosweb.org {
    redir /argument /argument/ 308

    @argument path /argument/*
    handle @argument {
        uri strip_prefix /argument
        root * /opt/sos-relay/argument/site
        file_server
    }

    @argument_api path /api/argument /api/argument/*
    handle @argument_api {
        reverse_proxy 127.0.0.1:8000
    }

    @user path /user /user/*
    handle @user {
        root * /opt/sos-relay/argument/site
        file_server
    }

    @user_api path /api/user /api/user/*
    handle @user_api {
        reverse_proxy 127.0.0.1:8000
    }

    handle {
        root * /opt/sos-relay/site
        file_server
    }

    encode gzip
}
```

**Deployed and corrected 2026-09-26**: `handle_path` only ever takes one
path pattern, not several — an earlier version of this block used
`handle_path /argument/* { ... }`, which is why a *bare* `/argument` or
`/api/argument` (no trailing slash — exactly what the "create a thread"
client request sends) silently 404'd in production, falling through to
the static-site catch-all. Fixed with a named matcher (`@argument`,
which *can* take multiple patterns) plus an explicit `uri strip_prefix`,
since plain `handle` (unlike `handle_path`) doesn't auto-strip the
matched prefix. The API block lists both `/api/argument` and
`/api/argument/*` directly rather than stripping, since Express expects
the full `/api/argument...` path as-is. Caught by testing the exact
"create a thread" request against the live site right after deploying,
not by local testing alone (`npm start`'s Express server has none of
this Caddy-prefix behavior, so this class of bug is invisible until
something Caddy-shaped is in the loop) — worth remembering for future
route changes.

Generated layout: `argument/site/<slug>/index.html` per thread,
`argument/site/index.html` for the list page. The "start an argument"
hints page has no DB-dependent content at all, so it doesn't need the
regen pipeline — `argument/site/new/index.html` can be written once by
hand and left alone (slugs always start `YYMMDD-`, so `new` can never
collide with a real thread).

## Pages (mockups)

Three pages, terminal/BBS visual direction chosen over two alternatives
(minimal-chat, forum-classic) that were mocked up alongside it:
https://claude.ai/artifact/NusPQTsQtEWc91ga9CXBHq

1. **Thread** — topic header, a dashed reserved block for the future
   topic-graph (Phase 4), then the reply column top-down, input pinned
   at the bottom.
2. **List** (`/argument`) — title + excerpt + `owner · participants ·
   opened · last reply` per thread, `[ + start new ]` link.
3. **New** (`/argument/new`) — hints page (no border box) explaining what
   a good claim looks like, then a title field and claim textarea; typing
   the claim before the title auto-fills the title from the claim's
   first three words, until the title is edited directly.

## Status

Design-only. Not started. Revisit once the static site (docs/, MkDocs)
and the base KB content are in a stable place.

### Create an account from the command line

From the repository root:

```sh
cd argument
npm run create-user -- alice
```

Enter and confirm the password at the hidden prompts. The command writes to
`db_file` in `argument/settings.toml` (currently `var/genone.db` relative to the
repository root), and works without the web server running. It uses the same
validation, salted password hashing, and account/profile transaction as web
registration. Passwords may be simple: 8–128 characters, with no character-type
requirements. Existing usernames are rejected, not overwritten.

For automation, the command also accepts the password on standard input (one
optional trailing newline is removed). Avoid putting passwords in command-line
arguments or shell history. Direct SQL inserts must supply the correctly
computed scrypt hash and salt plus a matching `argument_identity` row; use this
command instead of inserting a plaintext password.
