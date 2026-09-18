# SOS Relay — Phase 1 Design

## Purpose

A public relay/knowledge-base site for the SOS project: signal relay for
emergencies under internet shutdown/censorship conditions, plus a
multi-language knowledge base (translated notebooks, GFW-bypass docs, etc).
See `~/dev/checklist.md` for the full project background.

## Domain

- Chosen: `sosweb.org` (not yet registered)
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
/my/  →  /home/admin/my/   # symlink; local test content synced from ~/my/md
```

`/my/md` on the VPS is local/dev test fixture data (chat logs, working
notes) used to test the MkDocs build/theme/nav — **not** meant to become
real published content or be referenced from the live site's `docs/` tree.
Some of it is sensitive (GFW-bypass notes, censorship notes); it stays off
the public repo and off anything Caddy serves.

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
config is short enough to keep here in full for phase 1:

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

## Explicitly deferred to a later phase

- **Dynamic backend** (translation editor UI, signal-relay API): separate
  Flask + gunicorn systemd service on `127.0.0.1:8000`, added to the
  Caddyfile as a path-scoped `handle` block once it exists. Not needed for
  the static site.
- **Translation pipeline**: reuse `~/dev/localllm/py/translate.py`'s piece
  splitting / interleave format / atomic-write logic rather than
  reinventing it; `:Zatranslate` output for `notebook.history.md` now
  targets `~/my/history/2021/notebook.history.en` inside the
  `historyStudy/2021` GitLab repo, so it travels with the source.
- **GitHub Actions / automated tests**: add once there's an actual test
  suite worth gating a deploy on.

## Bigger picture — after the static site (ss)

Two directions once phase 1/1.1 are solid, not yet decided between:

1. **Dynamic web** — the deferred Flask+gunicorn backend above (signal
   relay API, translation editor), reverse-proxied by Caddy alongside the
   static site.
2. **Android app with the static site as a remote source** — a thin
   native shell (in the spirit of the existing `basicsMar23` project) that
   points at `sosweb.org` rather than duplicating content, so the
   knowledge base/guide pages stay maintained in one place.
