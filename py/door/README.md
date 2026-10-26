# Door translation and static publishing

This tool publishes `/my/md/door/readme.md` in English, Russian,
Persian, and Simplified Chinese. It runs entirely locally and does not
change the VPS. Qwen 7B is required; no model is downloaded.

The adapter imports `translate_blocks` and `translate_text` directly
from `~/dev/localllm/py/translate.py`. It supplies a language map in
memory; the localllm project and its configuration remain unchanged.
The adapter supplies a small Ollama HTTP wrapper with low temperature,
a bounded context/output budget, and detection of truncated responses.
Persian requests use one paragraph at a time. Other languages reuse the
existing translator's batching and per-paragraph fallback. Invalid
protected tokens and foreign-script contamination trigger retries.
The Python environment needs Markdown (already installed with MkDocs).

## Translate and build

From the sos-relay repository:

```bash
.venv/bin/python py/door/publish.py
```

Defaults:

- Source: `/my/md/door/readme.md`
- Model: `qwen2.5:latest` (verified as the installed 7.6B model)
- Ollama: `http://127.0.0.1:11434`
- Private progress/cache: `tmp/door-state.json`
- Bilingual review drafts: `tmp/door/review/`
- Public output: `tmp/door/public/`

Each completed batch is cached. Re-run after an interruption to resume.
The key includes source text, target language, prompt version, and model
digest. Source edits invalidate the affected blocks, not the whole book.
Code fences and reference definitions are copied without model calls;
inline code, URLs, and reference identifiers are protected and checked.
Translations with missing tokens or structural markers are rejected.
These checks do not establish linguistic accuracy.

To rebuild HTML from complete cached translations without Ollama:

```bash
.venv/bin/python py/door/publish.py --offline
```

Incomplete caches fail instead of silently publishing mixed languages.
The public output is assembled only after all translations complete.

## Review and corrections

The Chinese edition is intentionally bilingual: each English block is
followed by Chinese, with code shown only once. The Persian edition
uses RTL layout and includes the user-authorized Codex revision; it is
still labeled as not human-reviewed.

Review `tmp/door/review/{ru,fa,zh}.md` alongside the source. These are
regenerated review views, not authoritative translation storage.
For a lasting correction, edit the corresponding `translation` field
in `tmp/door-state.json` and set `reviewed` to true. Preserve all
`ZXKEEP<number>XZ` tokens exactly. Rebuild with `--offline` afterward.
Cache entries are reused, including human corrections. A changed source
gets a new entry; the previous correction remains available in the cache
for comparison but is not silently applied to different source text.

Keep the cache outside the published tree and back it up. Editing only
an exported translation is temporary: the next build regenerates it.
The public notice remains "not human-reviewed" until a separate full
editorial review establishes that the entire edition is reviewed.

## Files to publish

After reviewing the build, install only the public files:

```bash
.venv/bin/python py/door/install.py
```

This verifies the English source hash before writing, backs up replaced
files under `tmp/door-backups/`, and refuses to overwrite translated
files modified since the last installation. It does not contact the VPS.

The files installed into `/my/md/door/` are:

- `readme.md`: English, with language links at the top and bottom.
- `readme.ru.md`, `readme.fa.md`, `readme.zh.md`: translations.
- `index.html`: English HTML entry point.
- `ru/index.html`, `fa/index.html`, `zh/index.html`: localized HTML.
- `door.css`, `door.js`: shared, local assets with no CDN dependency.

Before replacing files, check that the source has not changed since
building: `tmp/door/source.sha256` records the source hash. Preserve
existing files/backups and inspect differences before overwriting
previously edited translations. Do not publish the cache or review tree.

The existing notes rsync workflow can publish these files later. With
normal static index handling, `/tecNotes/door/` opens the English page.
Explicit `index.html` links also work when directory indexes differ.
This tool neither runs rsync nor changes Caddy settings.

The floating language menu uses native details/summary. The close
button hides it for the browser tab's session, including language
changes. Top and bottom navigation remain available. With JavaScript
disabled, the menu still expands and all links remain usable; dismissal
requires JavaScript. Session storage failures do not prevent dismissal.
Persian uses RTL layout, with code blocks explicitly LTR.

## Checks

```bash
.venv/bin/python -m unittest discover -s py/door/tests -v
node --check py/door/templates/door.js
```

After generating output, check all four pages in a browser, including
mobile width, Persian direction, language switching, closing the
floating menu, and whether dismissal survives a same-tab page change.
