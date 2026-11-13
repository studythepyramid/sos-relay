# Notes — 2026-11-13

Logged-in users write a note with a title, as Markdown or plain text, at
`/notes/edit/`. An administrator approves it in `/admin/#notes`; only then is it
written to `docs/notes/<yymmdd>-<title-slug>-<id>.md` and the site rebuilt, so it
appears at `/notes/<yymmdd>-<title-slug>-<id>/`.

## Who can do what

- Anyone can read published notes. Registration is open, so "logged in" means
  any account.
- The author and administrators can edit a note. Other accounts get 404.
- Every edit returns the note to review. The last approved version stays online
  until an administrator publishes the edit.
- Administrators can publish, reject, or remove. Rejecting an edit keeps the
  earlier approved version online; Remove deletes the page.
- `auto_approve_all` does not apply to notes.
- Limits: title 200 characters on one line, contents 100,000 characters,
  20 new notes per account per UTC day, and the shared 20 writes per minute per IP.

## Why approval rebuilds the site

Published notes are static MkDocs pages served by Caddy from `site/`. Node only
handles the editor and its API. Pending text lives only in SQLite (`note` table),
so an unrelated build never publishes it. Approval writes the Markdown source to
`docs/notes/` (not HTML into `site/`, which every build clears) and runs
`scripts/build-site.sh`, about 10 seconds. Builds triggered during a build share
one follow-up build, and `build-site.sh` holds `var/site-build.lock` so the
deploy hook and the service never build at the same time.

## Unsafe content

MkDocs passes raw HTML in Markdown through and renders theme templates without
escaping. Three walls:

1. Titles cannot contain `<`, `>`, `&`, or `"` (they reach `<title>` unescaped).
2. Markdown contents cannot contain raw HTML, character references, or
   `javascript:`/`vbscript:`/`data:` links outside code spans and fenced code.
   Plain-text notes are HTML-escaped into a `white-space: pre-wrap` block.
3. `scripts/user_notes.py` (a MkDocs hook) rebuilds the HTML of every page with
   `sos_user_note: true` front matter from an allow-list of tags, attributes,
   styles, and URL schemes.

The administrator also sees the raw text before publishing.

## Deploy

1. Add `deploy/notes.caddy` inside the sosweb.org site block, before the general
   static handle; validate and reload Caddy. `/notes/` itself stays static.
2. Push. Changes to `argument/src/` restart the service; `mkdocs.yml` and
   `za-index.md` rebuild the site.

Approved notes on the VPS are untracked files in `/opt/sos-relay/docs/notes/`.
Deploys keep them (`read-tree` only touches tracked files), but they are not in
Git: back them up with the database. File names carry a random id, so a pushed
note of yours cannot collide with one.

Run `npm test` inside `argument/` before deploying.
