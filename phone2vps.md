# Phone to VPS: old phones as small servers

**Date: 2026-11-28 (UTC).**
**Author: Claude (Anthropic CLI), from za's request.**
**Status: proposal for za's review; nothing here is built or
authorized yet.**

za's idea: turn an old smart phone into a small VPS, so the SOS and
survivor projects can have many servers when they need them, at the
price of a phone nobody uses.

za's clarification (2026-11-28): the job is a **message-sharing
server** for sos-relay and survivor scenarios. A phone's CPU and
memory are enough for that. What limits it is reachability, power,
safety of the people involved and syncing between nodes, so those
drive the plan (section 3 and section 10).

This page is the plan: why, what a phone can and cannot do, the
design, the steps, and what to decide first. It does not change the
existing `sosweb.org` setup in `deploy.md`.


## 1. Why many small servers

- One VPS is one place to block, one bill, one failure. SOS and
  survivor work needs more than one door (see `design.md`, Doors).
- A phone has a battery (a built-in UPS for short power cuts), a radio
  (Wi-Fi, mobile data), a screen for local control and a camera. A
  desk of old phones is a cheap fleet.
- Many nodes can be put in different homes, countries and networks.
  That is the point for a project that must survive a blocked site.

What it is not: a replacement for the main VPS. The main VPS keeps a
fixed public address, TLS, the domain and the data that must not be
lost. Phones are extra nodes behind it or beside it.


## 2. What a phone can do, and what it cannot

Can do (light work, low traffic):
- serve static pages and small files (Caddy, nginx, or Python);
- run a small API (Python or Node), a message relay, a mirror of the
  public notes, a tusd upload endpoint for small clips;
- run scheduled jobs (sync, checks, backups, scoring a few clips);
- be a private worker that the main VPS or za's PC calls.

Cannot, or only badly:
- a public address on its own: mobile carriers use carrier-grade NAT
  and many home routers give no inbound port (section 4 solves this);
- steady heavy CPU: no cooling, so it throttles and heats the battery;
- much writing: flash storage wears out, so logs must be small and
  databases kept light;
- high uptime without help: Android kills background apps (section 5);
- anything that must not be lost: keep the master copy elsewhere.


## 3. Three roles for a node

| Role | What it does | Public? |
|---|---|---|
| Worker | pulls jobs from the main VPS, sends results back | no |
| Mirror | serves a copy of public files and the site | yes, through a tunnel |
| Relay | store-and-forward for SOS messages and files | yes, through a tunnel |

The target is the Relay (za, 2026-11-28). A Relay holds other
people's messages, so the security work in section 7 and the message
design in section 10 come before it takes any real message. Worker
and Mirror are only stepping stones: a Worker is the safest way to
prove the phone stays up, a Mirror proves the tunnel and Caddy.


## 4. Design

    visitor ---> sosweb.org (main VPS, Caddy, fixed IP)
                      |  reverse tunnel (the phone dials OUT)
                      +--> phone A  (home Wi-Fi)
                      +--> phone B  (mobile data)
                      +--> phone C  (other country)

The phone always dials out to the main VPS. Outbound connections work
behind NAT, so no port is opened at home. Caddy on the main VPS sends
a path (for example `/n/a/`) or a hostname to the right tunnel.

Options for the tunnel, in the order to try:
1. **SSH reverse tunnel** (`ssh -R`), kept alive with `autossh`. Needs
   only sshd on the main VPS, which already exists. Simple and easy to
   inspect.
2. **WireGuard** to the main VPS: one small private network, every
   phone gets a private address, Caddy proxies to it. Better when
   there are many phones.
3. **frp or rathole**: a purpose-built reverse proxy; useful if many
   services per phone are needed.
4. Tailscale and Cloudflare Tunnel work, but they depend on a third
   party and are unreliable from behind the Great Firewall. Do not
   build the plan on them.

Each phone has a name (`ph-01`, `ph-02`), one key pair and one entry
in a small inventory file in this repo (model, owner, place, role,
tunnel port, battery state, date set up). No secrets in the repo.


## 5. Setting up one phone

Software (no root needed):
1. Factory reset an old phone, update it, remove the Google account
   if possible; install **Termux** and **Termux:Boot** from F-Droid
   (the Play Store build is old).
2. In Termux: `pkg install openssh python caddy autossh git`.
3. Key-only SSH from za's PC to the phone (`sshd` on port 8022). No
   password login.
4. Keep it alive: Settings > Apps > Termux > Battery > Unrestricted;
   `termux-wake-lock` in the boot script; Termux:Boot starts sshd,
   autossh and the services after a reboot.
5. Put the services under a small supervisor script
   (`~/.termux/boot/start.sh`) that restarts them if they die.
6. A heartbeat: the phone calls `https://sosweb.org/n/ping?id=ph-01`
   every minute; the main VPS notes when a phone stops calling.

Other ways, if Termux is too limited:
- `proot-distro` Debian inside Termux, for normal Debian packages;
- the Linux terminal on newer Android, if the phone has it;
- postmarketOS on a supported model: a real systemd server, but it
  erases Android and few phones are supported.

Power and heat (do this first, it is the real danger):
- No phone runs hot all day with a full battery. Use a charge limit
  if the phone has one, or a smart plug on a timer, or remove the
  battery on models that boot without it.
- Never leave a swollen battery in service. Keep phones on a hard,
  open surface, not on a bed or in a closed box.


## 6. Steps and what each proves

| Step | Work | Done when |
|---|---|---|
| 0 | pick one old phone; choose a role (Worker first) | model and role in the inventory |
| 1 | Termux, sshd, key-only login | za logs in from the PC over Wi-Fi |
| 2 | wake lock, battery settings, Termux:Boot | survives a reboot and a night with the screen off |
| 3 | reverse tunnel to the main VPS | `curl` from the VPS reaches the phone |
| 4 | the message service (section 10, build order 1) on `/n/ph-01/` through Caddy | a test message can be stored and fetched from the outside |
| 5 | heartbeat and a status page | the VPS shows ph-01 up or down |
| 6 | a real job: for example score the FDT clips pulled from the VPS | result matches the PC's result |
| 7 | second phone on a different network | both appear on the status page |
| 8 | Mirror role for the public notes; later Relay with the security work | an outage test: main VPS down, a mirror still answers |

Do steps 0 to 3 on one phone before buying or collecting more. If the
night-long survival in step 2 fails, the whole idea needs another
platform (a cheap Linux board) and we learn that cheaply.


## 7. Security

- Key-only SSH, one key per phone, no shared keys, no password login.
- The phone dials out; no inbound port at the phone.
- A phone can be lost or taken. It holds only what its role needs:
  a Worker holds no user data at rest, a Mirror holds public files.
  A Relay's stored messages are encrypted to a key that is not on
  the phone.
- The main VPS treats a phone as untrusted: it limits what a tunnel
  can reach, rate-limits it, and checks any result it returns.
- Full-disk encryption on the phone (the Android default) and a lock
  screen, so a stolen phone is not an open door.
- Updates: a small script updates Termux packages weekly and logs it.
- Who owns the phone, and where it sits, is part of the inventory:
  for survivor work, a node in someone's home is a real person's
  risk. Ask the person; do not assume.


## 8. Cost and capacity (rough)

- Hardware: a used phone, a charger and cable, a short list of
  spares; no monthly fee except the phone's Wi-Fi or data plan.
- Capacity: a few requests per second of small files, tens of GB
  storage; fine for notes, forms and small clips; not for video
  streaming or a busy database.
- Compare: the main VPS is one small cloud machine with a fixed IP.
  The phones add places, not power.


## 9. Questions for za

1. (Answered: the target is the Relay.) Which stepping stone first,
   Worker or Mirror, to prove the phone stays up and the tunnel works?
2. Which old phone, and where does it live (home Wi-Fi, or mobile
   data)? Mobile data gives a different network but is harder to keep
   up and may cost money.
3. Is the SSH reverse tunnel to the existing VPS acceptable as the
   first design, or should it be WireGuard from the start?
4. Who may host a phone for the survivor side, and what do we tell
   them about the risk?
5. For FDT: do we want the phone as a clip-scoring worker (step 6),
   or leave FDT on the PC and VPS?

Nothing is built until za answers 2 and 3.


## 10. Message server design for SOS and survivor use

Sizes: a text message is about 1 KB, a photo 200 KB to 2 MB, a short
voice note 50 KB. A phone with 64 GB holds tens of millions of
messages, so storage is not the limit; the files are.

**Message model (store and forward):**
- A message is an immutable record: id = hash of the content,
  created time, expiry, an encrypted body, and a routing tag. It is
  never edited; a correction is a new message.
- The body is encrypted to the recipient (or a group key) before it
  reaches the node. The node stores bytes it cannot read. It knows
  only the routing tag, the size and the times.
- Every message has a time to live (for example 7 days; the sender
  may set shorter). The node deletes expired messages, so a seized
  phone holds little.
- Delivery is "pick up with your key": the recipient asks for its tag,
  fetches, then acknowledges; the node may delete after the ack.

**Sync between nodes (many phones, a main VPS):**
- Nodes exchange lists of message ids and fetch what they lack
  (gossip). Because ids are hashes, duplicates are harmless and the
  merge order does not matter.
- A node that comes back after being offline simply catches up.
- Bandwidth is small: ids first, bodies only when missing.
- The main VPS is one more node with a fixed address, not a master.

**Local access when the internet is down (survivor case):**
- The phone can act as a Wi-Fi hotspot with a local page; people
  connect, write or read a message, and nothing leaves the room. A QR
  code on the screen gives the address.
- When any phone or node gets internet, sync carries the messages
  onward through the tunnel. This is the "nearby handoff during a
  partition" of `sos-delivery-plan.md`.
- Related, not repeated here: the Android app's nearby sharing and
  BitChat research (`android/app-roadmap.md`). The phone node and the
  app share the same message format, so a message can travel by
  hotspot, Bluetooth, tunnel or a person walking with a phone.

**Safety of the people (the hardest part):**
- A node holds no names, phone numbers or locations in the clear.
- A seized or checked phone must not show what it is: a decoy home
  page, a quick wipe (a long press that deletes the store and the
  keys), and no log of who connected.
- Rate limits and size limits stop a node from being flooded with
  junk or used as a file dump.
- Abuse: the node cannot read messages, so moderation works on tags,
  sizes and rates, not on content. This is a trade-off to decide with
  za, not to ignore.
- The risk to a host (the person who keeps the phone) is part of the
  plan: see section 7.

**Build order for the message server (after steps 0 to 3):**
1. a small Python or Go service: `POST /m` (store), `GET /m?tag=`
   (list), `GET /m/<id>`, `DELETE` after ack, expiry job;
2. encrypt in the Android app and a command-line tool; the node never
   sees plain text;
3. two nodes (phone and main VPS) syncing by id lists;
4. hotspot mode with the local page and a QR;
5. an outage test: cut the VPS, send through the hotspot, restore,
   check that the message arrives.


## 11. Storage choice: SQLite, with an HTML export (za's question, 2026-11-28)

Question: files seem to limit an Android server; could one HTML file
with a JavaScript filter be the database for about 100K messages, or
should the phone run SQLite?

**Decision: SQLite is the store. HTML is only a small, read-only
export.**

Why not many files: the phone's storage can hold hundreds of
thousands of files, but listing and opening them is slow, wears the
flash, and gets much worse under Android's shared-storage layers. One
file per message is a poor design.

Why not one HTML file as the database:

| Question | One HTML file | SQLite |
|---|---|---|
| 100K messages of 1 KB | about 100 MB to load, parse and keep in browser memory | one file, queried a page at a time |
| find one tag | scan everything | index lookup |
| add a message | rewrite or append to a big file; two writers corrupt it; a crash can leave it broken | one transaction; write-ahead log survives a crash |
| expire old messages | rewrite the file | one `DELETE`, then `VACUUM` |
| quick wipe | find every copy | shred one file |
| available on the phone | any browser | built into Python (Termux) and Android |

The node also cannot search message text: bodies are encrypted
(section 10). So the server filters only by tag, time and size;
searching content happens in the client after it decrypts.

**Schema sketch**

    messages(
      id        TEXT PRIMARY KEY,   -- hash of the encrypted body
      tag       TEXT NOT NULL,      -- routing tag (no names, no places)
      created   INTEGER NOT NULL,   -- unix seconds
      expires   INTEGER NOT NULL,   -- unix seconds; swept on a timer
      size      INTEGER NOT NULL,
      body      BLOB,               -- encrypted; NULL when it lives in a file
      file      TEXT                -- hash name of a blob file, for big bodies
    )
    CREATE INDEX messages_tag     ON messages(tag, created);
    CREATE INDEX messages_expires ON messages(expires);

    peers(node TEXT PRIMARY KEY, last_sync INTEGER, last_seen INTEGER)
    acks(id TEXT, tag TEXT, at INTEGER)       -- delivered, can be removed

Settings: `PRAGMA journal_mode=WAL`, `synchronous=NORMAL`,
`foreign_keys=ON`; one writer process, short transactions.

**Bodies and files**
- Body up to about 100 KB: inside SQLite (a BLOB is faster than a
  separate file at that size).
- Larger bodies (photos, voice, video): a file named by its hash in
  `blobs/ab/cd/<hash>`, two levels of folders so no folder grows
  large; the row keeps the name.
- Cap the size per message and per tag, so one sender cannot fill the
  phone.

**What the numbers say**
- 100K messages of 1 KB is about 100 MB; 1M is about 1 GB. A phone
  with 64 GB is far from full; photos and voice are what fill it.
- Reads: "newest 100 for this tag" is one indexed query, a few
  milliseconds.
- Sync: the id lists of two nodes are compared by id and time range;
  only missing bodies cross the network.

**The HTML export (where HTML earns its place)**
- For the no-internet survivor case the node writes one
  self-contained `.html`: a small JSON array of encrypted messages
  for one tag or time range, plus the JavaScript that decrypts and
  filters them in the browser.
- Keep it to a few MB (a few thousand messages). It can be served
  from the hotspot page, copied to another phone, or sent by
  Bluetooth, and it needs no server to read.
- It is derived from SQLite and can be thrown away and rebuilt. It
  never receives new writes; new messages go to a node.
- The key to decrypt lives in the reader's own device, not in the
  file.

**Open points**
- SQLite's file is one thing to seize. Mitigations are in section 10:
  encrypted bodies, expiry, a quick wipe. Whole-database encryption
  (SQLCipher) is possible but needs a build for Termux; decide when
  the threat model is written.
- Full-text search over plaintext is deliberately not offered by the
  node. If a user wants search, the client keeps its own decrypted
  index.


## 12. Syncing the databases among many phones (za, 2026-11-28)

Goal: many phone nodes, each with its own SQLite store (section 11),
converge to the same set of messages, with no master, over networks
that come and go (tunnel, home Wi-Fi, a hotspot with nobody online).

### 12.1 Why sync is simple here

> **Superseded in part by section 13 (za, 2026-11-28):** deletes are
> local marks and never synced; the tombstone rule below is dropped.

A message is immutable and its id is the hash of its content
(section 10). So the store is a **grow-only set**: two nodes merge by
taking the union. There is no edit, so no conflict, and the order of
merging does not matter. Duplicates are the same id and are ignored.

Three things are not plain set growth and need rules:
- **Expiry.** Every node deletes a message when its `expires` time
  has passed. Because `expires` is inside the message, all nodes
  agree without talking.
- **Delivery ack / early delete.** A deleted message must not come
  back from a peer that still has it. Keep a **tombstone**
  (`id`, `expires`) until the original expiry; sync tombstones like
  messages. After that time both can be dropped.
- **Mutable bits** (peer list, settings). Avoid them; where needed,
  one record per key with a version number, higher version wins.

Clocks on phones drift. Nothing depends on a global clock: ordering
comes from the hash id and a **local sequence number** (`seq`, section
12.2); expiry uses the message's own `expires`, with a tolerance of
a few minutes.

### 12.2 The protocol (pull, two steps)

A node `A` syncs with a peer `B` over HTTPS (through the tunnel, the
LAN or the hotspot). Syncing is **pull-based and idempotent**: any
step can fail, be repeated or arrive twice.

1. **Fast path: since-sequence.**
   Every node numbers its inserts with a local, increasing `seq`
   (a column on `messages`). `A` keeps `seen[B]`, the last `seq` of
   B it has fetched, and asks: "ids and tags with `seq` > N". B
   answers with a page (for example 500 ids). `A` fetches the bodies
   it does not have. This is cheap for the usual case: B just
   received a few new messages.
   Because B stores messages it got from others under its own `seq`,
   the messages travel further (gossip) without extra work.
2. **Repair path: set reconciliation.**
   `seen[B]` is lost when a node is wiped, restored from a backup, or
   a peer was reset. Then `A` and `B` run a **range-based set
   reconciliation**: they exchange short fingerprints of ranges of
   ids (ordered by time, then id), split only the ranges whose
   fingerprints differ, and in the end list just the ids one side
   lacks. The cost grows with the **difference**, not with the size of
   the store. This is the algorithm named below.
   Run it rarely (once an hour, after a restart, and when two nodes
   meet for the first time).
3. **Bodies.** Lists carry ids, tags, sizes and times only. `A`
   fetches a body when it is missing, small ones first, newest
   first, urgent tags first. Large blobs are fetched last and can be
   resumed (same idea as the tus uploads already running on the VPS).
4. **Validate before storing.** Hash of the body equals the id; size
   within limits; `expires` in the future and not absurdly far; tag
   format ok. A failure is dropped and counted against that peer.

### 12.3 Who talks to whom (topology)

- Not a full mesh. Each node keeps a short list of peers (3 to 5):
  the main VPS if reachable, plus a few others, chosen by region and
  network so one failure does not cut the graph.
- Every sync round (for example every 1 to 5 minutes on Wi-Fi, every
  30 minutes on mobile data) picks one or two peers at random.
  Messages then reach every node in a few rounds (epidemic spread).
- The main VPS is just a node with a fixed address. If it goes down,
  phones keep syncing among themselves through the other tunnels. It
  is not a master and holds no special data.
- **Nearby sync with no internet.** Two phones in the same hotspot or
  LAN find each other (the QR code or a local name) and run the same
  protocol over HTTP on the LAN. A person walking from one place to
  another becomes a carrier: sync on arrival and the messages move.

### 12.4 Trust and safety between nodes

- Each node has an Ed25519 key pair. Its public key is in the
  inventory. A sync request is signed; unknown keys are refused.
  This is the allowlist of who may sync, separate from end users.
- All node-to-node traffic is over TLS (the tunnel or HTTPS); on a
  LAN use a pinned key, not the open Wi-Fi alone.
- A bad node can only add messages that pass validation (12.2 step 4)
  and fit the rate limits. It cannot change or delete another node's
  messages. Per-peer rate limits and a quota stop a flood. A node that
  floods or sends invalid data is put on hold and logged.
- The sync metadata shows tags, sizes and times to peers. That is
  enough to see traffic patterns, so peers are **chosen and trusted
  by za**, not open to anyone. A private tag scheme (tags that change
  every day, derived from a shared secret) can hide who talks to whom;
  decide with the threat model.

### 12.5 Bandwidth and battery

- Wi-Fi: sync freely. Mobile data: ids and small bodies only, a daily
  byte limit, and big files wait for Wi-Fi (settings per node).
- Sync wakes the radio, which costs battery: the interval grows when
  nothing changed (back off from 1 to 30 minutes) and shrinks when
  a new message arrives.
- A phone that is far behind (wiped, or off for days) reconciles
  first (12.2 step 2), then takes bodies in priority order, so the
  newest and most urgent come first.

### 12.6 Existing tools: what to reuse

Reuse an idea before writing code. For each, what it solves and why
it may or may not fit:

| Tool | What it does | Fit |
|---|---|---|
| Negentropy (range-based set reconciliation; NIP-77 in Nostr) | finds the missing ids between two sets at a cost proportional to the difference; open implementations in several languages, used by relay software to sync relays | **best match for step 2**; the algorithm is small and the format is stable enough to copy |
| Nostr relays and events | events are immutable, id is the hash of the content, relays store and forward them | very close to our message model; consider the event format and relay behaviour, and decide whether to be Nostr-compatible or only inspired by it |
| cr-sqlite | SQLite extension for multi-writer replication with CRDTs, merging per column | more than needed (our rows never conflict); the extension must be loaded into every connection; check its maintenance status before using it |
| Litestream | streams SQLite changes to a store as a backup, one writer | a backup tool, not a sync among writers; useful for the main VPS backup |
| Syncthing, rsync | file sync | wrong level: the database file is one writer's; would corrupt a live SQLite |
| Matrix | federated chat with its own rooms and history sync | too big for a phone relay; keep as a reference for federation |

Plan: write a small own protocol using the set-growth rules above,
and borrow range-based reconciliation from Negentropy for the repair
path. Consider Nostr compatibility as a separate decision (it gives
existing clients and relays, but fixes the event format and signing
rules).

### 12.7 Build and test steps

1. Add `seq` and tombstones to the SQLite schema; a script that makes
   N test messages with known ids.
2. Fast path between two nodes on one PC (two processes, two files).
3. Two phones plus the VPS; add, expire and delete messages on
   different nodes; check that all three end the same.
4. Fault tests: kill a node mid-sync, wipe a node, run it offline
   for a day, flip the network every 10 seconds. The final sets must
   match; compare by the hash of the sorted id list.
5. Repair path: remove `seen[B]` on a node, run reconciliation, count
   bytes against the size of the difference.
6. The hotspot case: three phones, no internet, a walker with one
   phone between two groups.
7. A flood test: one bad peer sends garbage; check the quota and hold.

### 12.8 Open points for za

1. **Nostr or own format?** Compatibility brings existing tools but
   fixes the event shape. Own format keeps full control. (My lean: own
   format, borrowing the idea and Negentropy; revisit when the format
   is written.)
2. Who is allowed to be a peer, and who signs a new node into the
   inventory.
3. How many nodes at first (3 is enough to test: VPS plus two
   phones).
4. Tag privacy: fixed tags (simple) or tags that rotate daily
   (harder to trace). This needs the threat model page first.

Sources: Aljoscha Meyer, "Range-Based Set Reconciliation"
(arXiv:2212.13567); the Negentropy repository
(https://github.com/hoytech/negentropy) and Nostr NIP-77
(https://nips.4rs.nl/nips/77), draft text; the cr-sqlite repository
(https://github.com/vlcn-io/cr-sqlite). I read search summaries, not
the sources in full; check the current NIP-77 and the cr-sqlite
maintenance status before relying on them.


## 13. Simpler rules (za, 2026-11-28)

za's decisions, which replace the tombstone and trust parts of
section 12:

1. **Delete is a mark, not a synced deletion.**
2. **A user chooses which databases to trust.**
3. **A node's database stays near 100K rows**, so it is easy to
   control.

### 13.1 Marks are local; sync carries only messages

- Each node has a local column `mark` on `messages`: 0 = normal,
  1 = hidden (the user "deleted" it), maybe 2 = starred. **Marks are
  never sent to a peer and never read from a peer.** A peer's marks
  mean nothing to me.
- Sync therefore does one thing only: add messages that are missing.
  No deletion messages, no tombstones, no "undelete" races, no rule
  about which delete wins. The set only grows (until expiry).
- A hidden message stays in the database, so it is not fetched again
  and does not come back from a peer. The reader hides it in its own
  view (`WHERE mark = 0`).
- The same mark idea covers "acknowledged", "read" and "spam". Each is
  a local column; the user's phone and the user's trusted node may
  copy their own marks between themselves (13.3), nobody else.

What a mark does not do: a mark does not remove the data. For a seized
phone that matters, so keep two separate actions:
- **Hide** (mark): reversible, local, just a flag.
- **Purge** (local only): physically deletes the body and any blob
  file of marked rows, and keeps only a short record `seen(id,
  expires)` so the same message is not fetched again. Purge is never
  synced and is run by the node's owner, on a timer or by hand. A
  quick wipe (section 10) is the extreme case: purge everything and
  the keys.

Expiry stays as it is: when `expires` passes, the node purges the
body and keeps `seen(id, expires)` until the same time plus the
tolerance, then drops that too. Every node reaches this without
talking.

### 13.2 A size cap keeps the database small

Aim: about 100K rows of message data per node.
- 100K messages of 1 KB is about 100 MB; with photos and voice, the
  blob files are capped separately (for example 4 GB), oldest and
  already-hidden first.
- The cap is a number in a setting. When a node is over it, it purges
  in this order: expired, hidden, then oldest of the low-priority tags.
  It never purges unread urgent tags to make room; it refuses new
  low-priority messages first.
- Because the set is small, the sync repair path can be simpler than
  full range reconciliation: group ids by day, compare a count and a
  fingerprint (the XOR of the ids of that day) per group, and for any
  day that differs, exchange the id list of that day only. That is
  about fifty lines and one table, and it costs at most a few KB per
  differing day. Keep Negentropy as an upgrade if the sets ever grow,
  not as a first dependency.
- A purged message that a peer still holds: the `seen` record stops it
  from coming back. If `seen` is lost (a wiped node), the node takes
  the peer's messages again, which is the correct outcome for a
  restored node.

### 13.3 The user chooses which databases to trust

Two different lists, kept apart:

- **Node peers (machine to machine):** which nodes my node syncs with.
  Set by whoever runs the node, in the inventory, as a list of public
  keys (section 12.4). Only these peers may add messages to my store.
- **A user's trusted nodes (person to node):** which nodes a person's
  app reads from and writes to. The user picks them in the app: scan a
  QR code of the node (its address and public key), name it, and keep
  it in a list. The app can use several nodes at once, and the user
  can remove one at any time.

What "trust" means in each case:
- A trusted node is trusted to **carry** and not to **read**:
  messages are encrypted to the recipient, so a node never sees plain
  text (section 10). Trust is about availability, honesty about what
  it holds, and not leaking tags or sizes.
- The app writes a message to every trusted node it can reach and
  reads from any of them. The reader merges by id, so one node being
  down or lying by omission is covered by the others.
- A node that the user does not trust is simply not in the list. No
  vote, no web of trust, no global directory.

The first release uses only a short list of nodes that za sets up and
hands out by QR code. Open registration of nodes comes later, if ever.

### 13.4 What section 12 still stands

- Immutable messages with hash ids; union is the merge.
- The fast path (since-sequence) and the nearby sync in a hotspot.
- Node keys and signed requests; validation before storing.
- Bandwidth, battery and the test steps (12.5, 12.7), with the delete
  and tombstone tests replaced by: hide on one node, check that the
  other nodes still hold the message and that the first node does not
  fetch it back.

### 13.5 What this costs, honestly

- Hidden messages remain on every node until expiry or purge. A
  person who wants a message gone from everywhere cannot do it with one
  tap; the nodes hold it until its time to live runs out. For
  survivor use, keep the time to live short (for example 24 hours to
  7 days) and say so in the app.
- A malicious or careless node holds a message past its expiry. That is
  not preventable (it could copy the file); expiry only protects the
  honest nodes.
- Marks are not shared, so two devices of one person need an explicit
  way to copy their own marks (an encrypted note to themselves is an
  ordinary message, so it can ride on the same sync).

### 13.6 Open points for za

1. Time to live: a default of 7 days, and a maximum (for example 30)?
2. The cap: 100K rows and 4 GB of blobs per node; are these right for
   the phones you have?
3. Purge: automatic on the cap and expiry only, or also a button in
   the app for the user's own node?
4. The first list of trusted nodes: the VPS plus two phones, handed out
   by QR code?


## 14. Deferred: the complexities for later (za, 2026-11-28)

Version 1 is the simple design of section 13: immutable messages,
local marks, a trusted-node list by QR code, about 100K rows per
node, a day-bucket repair. Everything below is real, but is not
built until it is needed. Each item has a sign that tells us it is
time.

| Deferred | Why it can wait | Sign that it is time |
|---|---|---|
| Synced deletion (tombstones across nodes) | marks and a short time to live are enough | users ask to remove a message everywhere, or abuse cannot be cleared by expiry |
| Full range-based reconciliation (Negentropy) | day-bucket repair is enough at 100K rows | a node store grows far beyond the cap, or repair costs real bandwidth |
| Nostr compatibility or another public format | an own format keeps control | we want existing clients and relays |
| Rotating daily tags | needs the threat model first | a real risk to who-talks-to-whom is shown |
| Open registration of nodes, a web of trust | za hands out nodes by QR code | strangers want to run nodes |
| Whole-database encryption (SQLCipher) | bodies are already encrypted; a quick wipe exists | a threat model says metadata in the file is too exposed |
| Marks shared across one person's devices | a note to oneself rides on the ordinary sync | people use more than one device |
| Abuse handling and moderation by content | impossible while bodies are encrypted; use tags, sizes, rates | spam or abuse shows up in a real pilot |
| Multi-writer database tools (cr-sqlite and similar) | our rows never conflict | we add data that is edited, not only added |
| Large files and video | text first; blobs capped | a pilot needs photos or voice notes at scale |
| Radio, Bluetooth or mesh transports | tunnel, LAN and hotspot cover the first tests | a pilot needs links with no phone network at all |

Rule for the plan: when a new complication comes up, write it in this
table with its sign, instead of putting it in version 1. A version 1
that two phones and a VPS can run, break and repair is worth more
than a complete design that nobody has tried.
