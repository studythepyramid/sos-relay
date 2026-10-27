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

Submissions start pending when automatic approval is off. The admin setting
`auto_approve_all` can review pending and incoming messages automatically
with the label **approved by auto**. There is no Agent, public feed, or
emergency dispatch. History returns only the
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

The administrator dashboard records manual review decisions with an
operator note and preserves message text. Editing, redaction, and Agent
moderation still require separate design before implementation. Later SOS
support needs location privacy, priority/capacity policy, expiry, and resolution handling.

Deployment: Caddy proxies `/publicMsg`, `/publicMsg/*`, `/api/publicMsg`,
and `/api/publicMsg/*` to the existing loopback service on port 8000.
No extra paid service, AI API, or Node dependency is introduced.

Run `npm test` inside `argument/` before deploying. Integration tests
cover guest privacy, retry safety, multilingual counts, persistent quotas,
registered limits, network throttling, and cleanup.

## Operator review over SSH

The `/admin/` dashboard provides private message review to explicitly
authorized administrators; see [admin.md](admin.md). Ordinary website
accounts cannot read other senders' messages. Operators with VPS access can
inspect the inbox using this read-only command after deploying `src/review-messages.js`:

```bash
ssh lightsail.a 'cd /opt/sos-relay/argument && node src/review-messages.js'
```

By default it returns up to 20 pending messages, oldest first. To see the
latest 50 messages across statuses:

```bash
ssh lightsail.a 'cd /opt/sos-relay/argument && node src/review-messages.js --status all --order newest --limit 50'
```

Output includes message reference, status, kind, word count, UTC date,
sender type, account username when available, and message text. It omits
owner/session tokens, request keys, password data, and network counters.
Treat the output as private; do not copy it into the public website or
Git. The command opens SQLite read-only and does not run cleanup or change
review status. The dashboard can mark reviewed, reject, or return to
pending with an audit record. Redaction is deferred.

To inspect pending submissions before the command has been deployed:

```bash
ssh lightsail.a
cd /opt/sos-relay/argument
node --input-type=module <<'JS'
import {DatabaseSync} from 'node:sqlite';
import {dbPath} from './src/settings.js';
const db = new DatabaseSync(dbPath, {readOnly: true});
const messages = db.prepare(`
  SELECT id, status, created_at, body FROM public_msg
  WHERE status = ? ORDER BY created_at ASC LIMIT 20
`).all('pending');
console.log(JSON.stringify(messages, null, 2));
db.close();
JS
```

The visitor's history still loads only their own latest 50 submissions.
Its display-order selector offers oldest-first (the default) and
newest-first without changing which records are returned. The privacy
notice uses a separate blue panel to distinguish it from the message form
and history.
