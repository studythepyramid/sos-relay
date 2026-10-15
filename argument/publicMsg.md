# Public text inbox — 2026-10-15

Edited by za and Codex.

`/publicMsg/` uses the existing Node service and SQLite connection, with
separate `public_msg*` tables. The form appears before the abuse/privacy
notice. Visitors see their server-observed IP and a non-secret session
reference. Location is explicitly unavailable: no external IP lookup or
browser location permission is requested.

Guest allowance: 10 messages / 3,000 segmented words per UTC day.
Registered allowance: 20 messages / 6,000 words per UTC day, using the
existing account session. Both have a 60-second cooldown, 12,000-character
cap, 64 KiB request-body cap, duplicate checks, and retry keys. Counting
uses `Intl.Segmenter` for multilingual text; server counts are authoritative.
Counters persist in SQLite. Network guard: 120 API requests per minute,
1,000 per UTC day (including reads); shared networks share this allowance.
Inbox guard: 1,000 messages per UTC day and 5,000 retained messages total.
These are initial tunable values, not assertions that one cookie or IP
identifies one person.

All submissions start pending. This version has no Agent, public feed,
automated moderation, or emergency dispatch. History returns only the
current guest's or account's latest 50 messages. Signing in does not claim
guest history or migrate a guest's submissions. Registration does not
bypass review or network/global limits. `kind` reserves remark/SOS storage
types; the endpoint currently accepts remarks only.

The plaintext IP is displayed for the current request and is not stored
by this inbox. SQLite stores a per-day keyed fingerprint for abuse
counters. Daily keys and counters expire within 48 hours. Guest sessions
expire after seven days, message content after 30 days, and rejected
content after seven days from submission. Daily quotas expire within
48 hours. Cleanup runs on API requests, startup, and hourly. Deletion
here means removing records from the active database; SQLite WAL, storage,
and backups are not a guaranteed immediate secure-erasure mechanism.
Network/session identifiers must never be copied into public output.

Future moderation must record its actions and mark redactions without
silently changing meaning. It needs explicit authorization boundaries
before an Agent can modify or publish messages. Later SOS support needs
location privacy, priority/capacity policy, expiry, and resolution handling.

Deployment: Caddy proxies `/publicMsg`, `/publicMsg/*`, `/api/publicMsg`,
and `/api/publicMsg/*` to the existing loopback service on port 8000.
No extra paid service, AI API, or Node dependency is introduced.

Run `npm test` inside `argument/` before deploying. Integration tests
cover guest privacy, retry safety, multilingual counts, persistent quotas,
registered limits, network throttling, and cleanup.
