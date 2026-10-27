# Administration dashboard

Implementation, 2026-10-27. No VPS roles are granted automatically.

`/admin/` provides an overview, user management, and the private message
review queue through the existing Express service and SQLite database.

## Access

Every page, script, stylesheet, and API request checks the current
account's administrator role. Ordinary registration creates a normal
user. Existing accounts remain normal users until an explicit grant.
Disabled accounts cannot log in or use existing sessions.

Dashboard assets live in `argument/admin/`, outside the public
`argument/site/` root. `/argument/admin/` must not expose them. Responses
use no-store and a CSP restricting scripts and styles to same-origin
files. JSON writes require the existing custom request header.

## User management

Search and paginate users; inspect display names, roles, enabled status,
registration dates, and active-session counts. Actions include account
creation, display-name changes, enable/disable, session revocation,
password reset, and role changes. Login usernames are stable in this
version. Deletion and self-service password recovery are deferred.

Changes have a recorded reason and are audited. Manual dialogs provide an
editable default reason. Passwords are hashed
with the same scrypt settings as registration. Password values and hashes
never appear in API responses or the audit log. Disabling accounts and
resetting passwords revoke their sessions. Re-enabling requires a fresh
login. Self-disable and self-demotion are blocked. At least one enabled
administrator must remain. Operators can sign out their own sessions or
reset their own password, but must then log in again.

## Message review

The queue supports status, text search, oldest/newest ordering, and bounded
pagination. List entries contain previews; opening an entry loads its full
text. Operators can mark reviewed (private), reject, or return to pending.
No action publishes messages to a public feed. Editing and redaction are
not implemented in this edition.

A separate `public_msg_review` record stores the decision, operator,
review time, and revision. The sender's private history and read-only CLI
show the effective review status. Updates require the last-seen revision;
a stale review returns HTTP 409 and must be reloaded.

Rejection also sets the existing message status to rejected, preserving
its seven-day-from-submission cleanup. Other messages retain the 30-day
limit. Review metadata cascades away with the message. The audit log
retains action metadata and operator notes for 90 days, without storing
message bodies, network identifiers, passwords, or session secrets.
Operators should keep their notes free of unnecessary personal details.

## Deployment and first administrator

Deploy the reviewed repository changes using the normal Git workflow.
Back up the SQLite database with SQLite's online backup API before its
additive migrations; do not copy a live database without its WAL state.

Add the block in `deploy/admin.caddy` inside the existing `sosweb.org`
Caddy site block, preserving all other routes. Validate the configuration
and reload Caddy. Both `/admin/*` and `/api/admin/*` must reach Express.

Then explicitly grant an existing account administrator access:

```bash
ssh lightsail.a 'cd /opt/sos-relay/argument && node src/admin-access.js grant zaa'
```

`zaa` is an example using the owner's existing account. Confirm the desired
username before executing a grant. Sign in through `/user/` and open
`https://sosweb.org/admin/`. The account page shows an administration link
only for administrators.

Additional SSH commands:

```bash
node src/admin-access.js list
node src/admin-access.js grant USERNAME
node src/admin-access.js revoke USERNAME
node src/admin-access.js enable USERNAME
```

Run these on the VPS from `/opt/sos-relay/argument`. Role changes and
explicit recovery are audited as SSH-operator actions. Revoking the last
active administrator is blocked; grant another account first.

## Verification

Run `npm test` inside `argument/`. Test with an isolated database:
unauthenticated requests, ordinary users, role escalation attempts,
disabled sessions, account changes, last-admin protection, stale message
reviews, retention, and audit privacy. Check desktop and mobile layouts
and the login return path. No live credentials or real messages belong
in test fixtures or screenshots.

## Default notes and automatic mode

`auto_approve_all` is a site-wide, persistent SQLite setting. It starts
off and can be changed only by an enabled administrator. Setting changes
are versioned and audited. Enabling it immediately reviews pending
messages and public arguments, with one audit event per item, and new
submissions are automatically reviewed inside their creation transaction.
Rejected and already reviewed items are left unchanged.

Automatic reviews record `approval: auto_approve` and display **approved
by auto**. They use the system ID `system:auto-approval`, independent of
any real account named `auto`. No system account or password is created.

The dashboard also skips confirmation dialogs for authorized actions in
this mode. Role changes require an explicit admin request; registration
still creates an ordinary user. Password reset still requires the new
password input. The server supplies the automatic reason independently
of the browser, and keeps CSRF checks, stale-review protection, and
last-admin safeguards in force.

Explicit rejection remains available. Returning content to pending
requires switching automatic mode off first. Switching off does not undo
previous automatic approvals. Message privacy, thread visibility, quotas,
and retention remain unchanged. Argument review covers the root thread
contribution; replies have their existing posting behavior.

Local preview credentials are `Operator/dashboard-preview-password`,
as recorded in the root `design.md` and `logs.md`. They belong only to
the separate demo database.

The Node-only preview serves the dashboard, accounts, inbox, and arguments.
Its `/` route redirects to `https://sosweb.org/`, where the main static
homepage is served by Caddy. Home links therefore open the public site.
