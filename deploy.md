# Commit, sync, and deploy

Updated: 2026-10-26.
Run the local commands below from `~/dev/sos-relay`.

There are two publication paths:

- The church and main website use Git deployment. `docs/church/` and
  `za-index.md` go to the production Git remote; its hook builds MkDocs
  on the VPS and serves the result at `https://sosweb.org/`.
- Technical notes use rsync. Local `/my/md/` goes directly to VPS
  `/my/md/`, served at `https://sosweb.org/tecNotes/`. This includes
  the Door translations and their generated HTML pages.

A Git push does not upload `/my/md/`. An rsync of notes does not deploy
repository changes. Use both paths when a homepage update links to new
notes. Prepare and verify locally, commit, upload the notes, then push
production so the new homepage links already have their targets.

## Rules for every commit

1. Include every repository file whose basename matches `za*.md`, at
   any depth, in every commit. Stage new files, modifications, and
   deletions matching that pattern immediately before committing.
   Unchanged files already belong to the Git snapshot; do not modify
   them merely to make them appear in a diff.
2. This includes the user's current edits to `za-index.md` and
   `za-todo.md`, even when the main task concerns another component.
   Re-read their latest contents before staging. Preserve the user's
   words; do not replace them with an older copy or tidy them silently.
3. Stage other files explicitly for the intended task. Do not use a
   blanket `git add .` or `git add -A` in this shared, dirty workspace.
   Review any files that were already staged before adding your work.
4. Review the complete staged diff. Resolve unintended changes before
   committing; do not silently discard or reset another person's work.
5. Do not force-add ignored credentials, runtime data, local caches,
   generated `site/`, or editor swap/backup files. If a `za*.md` file
   contains material that should not enter Git, surface that conflict
   rather than silently publishing it or omitting the required file.
6. Commit and push only when the current task authorizes those actions.
   Writing this guide or editing code does not itself trigger a deploy.

Use Git's quoted recursive pathspec, not a shell-expanded `za*.md`:

```bash
git add -A -- ':(glob)**/za*.md'
git diff --cached --stat
git diff --cached
```

The quoted pattern includes matching files in the repository root and
subdirectories, including tracked deletions. If a matching file is
edited again before the commit, review and stage it again.

The persistent agent rule is in
[.cursor/rules/commit-deploy.mdc](.cursor/rules/commit-deploy.mdc).
This is a documented agent rule, not an installed Git hook. Other agents
should read this file before committing or deploying.

## 1. Inspect the current work and destinations

```bash
cd ~/dev/sos-relay
git status --short
git diff --stat
git diff --cached --stat
git branch --show-current
git remote -v
git ls-files --cached --others --exclude-standard \
  -- ':(glob)**/za*.md'
```

The configured destinations are:

- `origin`: `git@github-pyramid:studythepyramid/sos-relay.git`
- `production`: `admin@lightsail.a:/opt/sos-relay.git`
- VPS SSH alias: `lightsail.a`
- VPS checkout: `/opt/sos-relay`
- VPS generated site: `/opt/sos-relay/site`

Deployment watches the production `main` branch. If working on another
branch, integrate the reviewed changes into `main` before deploying.
Do not blindly switch branches or overwrite uncommitted work.

The root `za-index.md` supplies the homepage through
`scripts/homepage.py`; changing only `docs/index.md` does not replace
the homepage.

## 2. Prepare the Door notes, if they changed

Skip translation rebuilding if the installed notes are already current.
To rebuild from complete cached translations without calling Ollama:

```bash
.venv/bin/python py/door/publish.py --offline
```

If source changes require new translations, run the local Qwen 7B job:

```bash
.venv/bin/python py/door/publish.py
```

The default is `qwen2.5:latest`, checked as the installed 7.6B model.
The adapter reuses `~/dev/localllm/`; no LLM runs on the VPS.
Review new translations before installing, especially operational
warnings and negations. Persian required an AI revision in the initial
edition; a new model output should not be assumed equally reliable.
Chinese is intentionally English/Chinese, block by block. Persian HTML
uses right-to-left layout; code remains left-to-right.

```bash
.venv/bin/python -m unittest discover -s py/door/tests -v
.venv/bin/python py/door/verify.py
.venv/bin/python py/door/install.py
.venv/bin/python py/door/verify.py --public /my/md/door
```

The installer checks for source changes and edited outputs, then backs
up replaced files under `tmp/door-backups/`. If it refuses an overwrite,
inspect the changes and reconcile them; do not bypass the check.

Only the installed public files in `/my/md/door/` are uploaded.
Keep `tmp/door-state.json`, bilingual review drafts, and backups local.
Back up that cache privately: it preserves corrections and avoids
repeating model work. See [py/door/README.md](py/door/README.md).

## 3. Build and review the website locally

```bash
bash scripts/build-site.sh --site-dir /tmp/sos-relay-preview
```

Inspect the built church, language pages, and homepage links. The church
must support orbit, pan, zoom, camera presets, and roof/wall toggles.
Check mobile layout and confirm assets load without external CDNs.
Review build warnings: distinguish existing unrelated warnings from new
broken links or missing files introduced by the current change.

The production hook builds the committed checkout on the VPS. Do not
rsync the entire local `site/` or preview output: local builds may include
untracked or linked preview material that is not part of deployment.

## 4. Stage and commit the intended files

For the current church, translation-tool, and deployment-guide work:

```bash
git add -- docs/church/ py/door/ deploy.md \
  .cursor/rules/commit-deploy.mdc
git add -A -- ':(glob)**/za*.md'
git diff --cached --check
git diff --cached --stat
git diff --cached
git status --short
```

This is an example file list for this work, not a permanent list for
all future tasks. Add other intended files explicitly when needed.
Unrelated Android, map, theme, or other edits should not be swept in.
The `za*.md` rule still applies to every commit.

After reviewing the actual staged contents, use an accurate message:

```bash
git commit -m "Add church viewer and Door publishing workflow"
```

Inspect outgoing history before deployment; pushing `main` sends all
commits that the remote does not yet have, not just the latest one:

```bash
git fetch origin
git fetch production
git log --oneline origin/main..main
git log --oneline production/main..main
```

If either branch has diverged, reconcile deliberately before pushing.
Do not force-push to resolve an unexpected rejection.

## 5. Upload the technical notes

Run rsync locally. It uploads one way and does not merge simultaneous
edits on the VPS. Inspect differences if anyone edited the remote copy.
Only `/my/md/` is authorized for this publication path; never substitute
`/my/`, which includes private sibling content.

For a recoverable snapshot before an upload, save the existing notes
outside the VPS's public notes directory:

```bash
ssh lightsail.a 'mkdir -p ~/sos-relay-backups &&
  tar -czf ~/sos-relay-backups/notes-$(date -u +%Y%m%dT%H%M%SZ).tgz \
    -C /my md'
```

Preview the upload first:

```bash
rsync -avzn --itemize-changes --safe-links \
  --exclude='.*' \
  --exclude='*.swp' \
  --exclude='*.swo' \
  --exclude='*~' \
  /my/md/ lightsail.a:/my/md/
```

After reviewing that preview, upload with the same exclusions:

```bash
rsync -avz --itemize-changes --safe-links \
  --exclude='.*' \
  --exclude='*.swp' \
  --exclude='*.swo' \
  --exclude='*~' \
  /my/md/ lightsail.a:/my/md/
```

These commands preserve VPS-only files. Do not add `--delete` unless
remote deletion is specifically intended and its dry run was reviewed.
Do not use `--delete-excluded` or `-L`/`--copy-links`. `--safe-links`
skips outgoing symlinks but does not remove unsafe links already on the
VPS. Hidden files, editor swaps, and editor backups remain excluded.

The trailing slash uploads the contents of `md/`. New notes and HTML
become public immediately; no MkDocs build or Caddy reload is needed.

For a Door-only update, use `/my/md/door/` as the source and
`lightsail.a:/my/md/door/` as the destination in both rsync commands,
keeping all flags and exclusions. Check that referenced sibling notes,
such as `doors.md` and `bypass.gfw.md`, already exist on the VPS.

## 6. Push the committed website to the VPS

Once `main` contains the reviewed deployment and any required notes have
been uploaded:

```bash
git push origin main
git push production main
```

`origin` stores the repository on GitHub. `production` runs the VPS
post-receive hook, which updates `/opt/sos-relay` and performs affected
build steps. Changes to `docs/church/` or `za-index.md` rebuild MkDocs.
Node application changes can trigger dependency installation or restart;
plain notes or static-site edits normally do not restart the Node app.

Read the push output through `deploy: complete`. A successful transfer
of Git objects alone does not prove that the deployment hook succeeded.
The successful revision is recorded in
`/opt/sos-relay.git/sos-deployed-revision`.

## 7. Verify the published result

```bash
git rev-parse main
ssh lightsail.a 'cat /opt/sos-relay.git/sos-deployed-revision'
curl -fsSI --max-time 20 https://sosweb.org/
curl -fsSI --max-time 20 https://sosweb.org/church/
curl -fsSI --max-time 20 https://sosweb.org/church/church.js
curl -fsSI --max-time 20 https://sosweb.org/tecNotes/door/
curl -fsSI --max-time 20 https://sosweb.org/tecNotes/door/fa/
```

The two revisions should match. Public routes should return success.
Open the real pages in a browser as well: HTTP 200 does not prove that
JavaScript, 3D graphics, or language links work. Verify Russian,
Persian,
and Chinese links at the top and bottom, floating-menu dismissal, and
Persian text direction. Check church controls and the homepage link.

To confirm that a particular notes file arrived unchanged:

```bash
sha256sum /my/md/door/readme.fa.md
ssh lightsail.a 'sha256sum /my/md/door/readme.fa.md'
```

A repeated rsync dry run should show no further file transfers unless
local files changed after the upload.

## 8. Recover from a failed deployment

Do not reset or overwrite newer local edits. Inspect the failed step and
the recorded successful revision first. A repeated push of an unchanged
branch can report "up to date" without rerunning the hook.

For a static-site build retry only:

```bash
ssh lightsail.a \
  'cd /opt/sos-relay && bash scripts/build-site.sh'
```

This rebuilds the current checkout but does not update the hook's
successful-deployment marker. Verify the result and use the regular
hook for the next deployment.

If intentionally retrying every deployment step is appropriate:

```bash
ssh lightsail.a \
  'cd /opt/sos-relay.git && bash hooks/post-receive --full'
```

The full hook can install dependencies, fetch speech assets, and restart
the Node application. Do not run it merely to rebuild documentation.

For a code rollback, create a reviewed revert commit and deploy it;
include current `za*.md` changes under the same commit rule. For notes,
inspect the saved archive and restore the intended files, then verify
checksums and public pages. Note that rsync without `--delete` does not
remove newly added files as part of a rollback.

Routine content uploads do not need a Caddy restart. Only actual Caddy
configuration changes require validation and reload. See
[env.cmd.md](env.cmd.md) for service and server administration details.
