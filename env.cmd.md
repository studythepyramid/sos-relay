
# Environment commands

Last updated: **2026-10-15**  
Editor: **Codex, OpenAI**

## VPS access

Use the SSH alias for VPS tasks:

```bash
ssh lightsail.a
```

Run a command remotely:

```bash
ssh lightsail.a 'hostname'
```

`lightsail.a` is the SSH host alias for this VPS. SSH resolves the alias
using the local SSH configuration (typically a `Host lightsail.a` entry
in `~/.ssh/config`, or an included configuration file). That entry supplies
the server address (`HostName`), login account (`User`), and any configured
identity file or connection options. The alias need not be a public DNS name
or match the server's own hostname.

Inspect the effective SSH settings without connecting:

```bash
ssh -G lightsail.a
```

In an rsync destination such as `lightsail.a:/my/md/`, the colon separates
the SSH host from the absolute directory path on that host. Rsync uses SSH
and the same alias configuration as `ssh lightsail.a`, so there is no need
to repeat the IP address or username.

## Sync local technical notes to the VPS

Run these commands **locally**, not inside an SSH session on the VPS.
Rsync must be installed on both computers. This is a one-way upload from
local `/my/md/` to VPS `/my/md/`; it does not merge simultaneous edits.
Transferred files become public immediately at `https://sosweb.org/tecNotes/`.
No Caddy reload or MkDocs build is needed.

Preview the changes first (no files are changed):

```bash
rsync -avzn --itemize-changes --safe-links \
  --exclude='.*' \
  --exclude='*.swp' \
  --exclude='*.swo' \
  --exclude='*~' \
  /my/md/ lightsail.a:/my/md/
```

After reviewing the preview, remove `n` to upload:

```bash
rsync -avz --itemize-changes --safe-links \
  --exclude='.*' \
  --exclude='*.swp' \
  --exclude='*.swo' \
  --exclude='*~' \
  /my/md/ lightsail.a:/my/md/
```

Flags and arguments:

- `-a` (archive): recurse into directories and preserve timestamps,
  permissions, symlinks, and ownership/group information where permitted.
- `-v` (verbose): show transfer details.
- `-z` (compress): compress data during transfer, useful for text files.
- `-n` (dry run): report proposed changes without making them.
- `--itemize-changes`: show a change summary for each affected entry.
- `--safe-links`: skip source symlinks pointing outside the transferred
  tree. This does not remove unsafe symlinks already on the destination.
- `--exclude='.*'`: skip hidden files and directories at every level.
- The other `--exclude` patterns skip Vim swap files and editor backups.
- `/my/md/`: the local source. Its trailing slash means copy the contents
  into the destination, rather than nesting another `md` directory there.
- `lightsail.a:/my/md/`: the destination directory on the VPS reached by SSH.

**Keep the source exactly `/my/md/`, never `/my/`.** These commands do not
select personal files in `/my/*.md`. Do not add `-L` (`--copy-links`): it
copies symlink targets and could bring files outside the notes tree into
the public directory.

By default, rsync updates changed files and leaves destination-only files
in place. If you deliberately want local deletions reflected on the VPS,
add `--delete` to the dry-run command, review the proposed deletions, then
add it to the real command. It deletes destination-only entries within
`/my/md/`; excluded files remain protected by default. Avoid
`--delete-excluded`, which removes that protection.

## Build the static site

The VPS deployment hook is versioned as `deploy/post-receive` and installed at
`/opt/sos-relay.git/hooks/post-receive`. Keep deploying with `git push production
main`; the hook updates the checkout and only runs the affected steps:

- Python crawler/source changes: checkout only, without a site build or restart.
- `pyproject.toml`, `uv.lock`, `.python-version`: synchronize Python dependencies.
- MkDocs inputs (`docs/`, theme overrides, configuration, homepage source/hooks):
  rebuild the static site.
- Node dependency files: install production dependencies and restart the API.
- Node source/settings: restart the API without reinstalling dependencies.
- Directly served `argument/site/` files: checkout makes them available immediately.
- Crawl data, new URLs and keywords stored on the VPS: no Git deployment at all.

Python dependency updates alone do not regenerate existing static output; rebuild
manually if a MkDocs dependency upgrade should also regenerate the pages. TTS
assets are checked when their fetching script changes or a site build needs
missing assets. Missing environments/site output trigger the necessary recovery
steps. Deployment runs are serialized, and the last successful commit is recorded
in `/opt/sos-relay.git/sos-deployed-revision`; a failed step is retried on the next
push, even if that push changes unrelated files.

The static-site build step runs in `/opt/sos-relay`. To rebuild it manually:

```bash
ssh lightsail.a 'cd /opt/sos-relay && bash scripts/build-site.sh'
```

This rebuilds `/opt/sos-relay/site/`, which Caddy serves immediately.
Use it after changing MkDocs pages, assets, or `mkdocs.yml`. Directly served
notes under `/my/md/` do not require this build.

To deliberately rerun all deployment steps for the current main revision:

```bash
ssh lightsail.a 'cd /opt/sos-relay.git && bash hooks/post-receive --full'
```

The hook updates its installed copy from the versioned source after a successful
deployment. Runtime SQLite, artifacts and source lists are never copied by it.

The deployment hook calls `scripts/build-site.sh`, which runs
`uv run mkdocs build`. The configured `scripts/homepage.py` hook supplies
the root-level `za-index.md` as the homepage content at build time without
overwriting `docs/index.md`. Edit `za-index.md` to change the homepage;
its unfinished content is intentionally published as written. Direct
MkDocs builds also use this hook. Run `bash scripts/build-site.sh` locally
to build from the same source.

The dark green theme matches `/argument/`; its colors are in
`docs/assets/site-theme.css` and its palette is selected in `mkdocs.yml`.

The same Python hook adds reciprocal links between `docs/history_notes/`
files named `NAME.md` (Chinese original) and `NAME-en.md` (existing
interleaved Chinese/English translation). The history index also gains
translation links at build time. Only existing pairs receive links;
authored document text is not rewritten.

The full Git hook also forces a checkout of `main`, fetches speech assets,
syncs dependencies, installs argument-app packages, and restarts that app.
Do not invoke the full hook merely to rebuild documentation.

The site favicon and header logo are configured in `mkdocs.yml` through
`theme.favicon` and `theme.logo`, both pointing to `assets/site-icon.png`.
The source asset is `docs/assets/site-icon.png`, copied from
`tmp/codex-sep7c.png`.

## Caddy

Inspect the active configuration and service:

```bash
ssh lightsail.a 'sudo cat /etc/caddy/Caddyfile'
ssh lightsail.a 'sudo systemctl status caddy --no-pager'
ssh lightsail.a 'sudo journalctl -u caddy -n 50 --no-pager'
```

After editing the configuration, validate before reloading:

```bash
ssh lightsail.a 'sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile && sudo systemctl reload caddy'
```

## Public message service

`/publicMsg/` and `/api/publicMsg` run inside the existing Node service.
Caddy proxies both to `127.0.0.1:8000`. They are independent of MkDocs:
changing the homepage link requires a static build; changing Node code
requires a service restart.

```bash
ssh lightsail.a 'sudo systemctl status sos-relay-argument --no-pager'
ssh lightsail.a 'sudo journalctl -u sos-relay-argument -n 50 --no-pager'
ssh lightsail.a 'cd /opt/sos-relay/argument && npm test'
ssh lightsail.a 'sudo systemctl restart sos-relay-argument'
```

See `argument/publicMsg.md` for limits, privacy/retention, and review status.
All submitted messages are private and pending; no Agent reviewer or SOS
dispatch is active. Do not print session cookies or private messages into
public logs. Commit the intended source changes before a future Git
push-to-deploy so its forced checkout preserves the new implementation.

## Published paths

- Main site: `https://sosweb.org/`, served from `/opt/sos-relay/site/`.
- Technical notes: `https://sosweb.org/tecNotes/`, served directly from `/my/md/` on the VPS, with directory browsing. Markdown is not rendered by MkDocs. A browser opening a `.md` note gets `/md-view.html`, which renders it with a link back home; add `?raw=1` for the plain file. Scripts and agents that do not ask for HTML still get the plain file. The public URL does not expose the filesystem prefix.
- Door narration: `https://sosweb.org/share/door-tts/`, from `/var/sos-share/door-tts/`. Render locally with `.venv/bin/python py/door/speak.py`, then `scp -r tmp/door-tts/* lightsail.a:/var/sos-share/door-tts/`. Re-render after editing the opening of `/my/md/door/readme.md`; the page reports stale audio instead of highlighting the wrong text.
- Shared files: `https://sosweb.org/share/`, served by Caddy from `/var/sos-share/` with directory browsing. Read-only for visitors. Copy files in over SSH or rsync; no Node service and no MkDocs rebuild. The directory is outside `/opt/sos-relay/site/`, so `mkdocs build` does not delete it.
- Old `/mymd/` and `/my/md/` links redirect to `/tecNotes/`, preserving the remaining path. Filesystem paths and rsync destinations remain `/my/md/`.
- `/my` is a symlink to `/home/admin/my` on the VPS.
- **Never publish `/my/` or `/my/*.md`.** Only `/my/md/` is authorized for public access. Caddy explicitly returns 404 for other `/my/` paths.
- Do not add symlinks inside `/my/md/` that lead outside it: Caddy follows filesystem symlinks. No nested symlinks were present when this route was enabled.
- Hidden files and editor swap/backup files are excluded from the notes file server.
- The route serves existing VPS files; it does not synchronize local notes automatically.

Check the public notes and the blocked parent directory:

```bash
ssh lightsail.a 'curl -I --max-time 15 https://sosweb.org/tecNotes/'
ssh lightsail.a 'curl -I --max-time 15 https://sosweb.org/my/'
```

Expected status: 200 for the notes directory, 404 for its parent.

Before enabling the notes route, the Caddyfile was backed up on the VPS to:
`/etc/caddy/Caddyfile.before-notes-20261015T142701Z`.

The earlier statement in `design.md` that `/my/md/` must remain unpublished
is superseded by the explicit October 15, 2026 decision to publish only
that technical-notes directory. The parent `/my/` remains private.
