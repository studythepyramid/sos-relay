# Test plan

Split into what's already been verified by tooling, and what genuinely
needs a human at a real browser/device/account — those are marked
**(dirty hands)** and can't be done from here.

## Already verified (no action needed)

- [x] `mkdocs build` succeeds clean
- [x] All pages return 200 from the dev server: home, about, both voice
      samples, the guide page, the design-notes page
- [x] `capability-probe.js` and `voice-widget.js` serve correctly
- [x] The piper voice `.onnx` file (18MB) downloads and serves correctly
- [x] `docs/assets/tts/` is confirmed git-ignored even under a broad
      `git add docs/` (checked via `git check-ignore -v`)
- [x] Web Speech API failure modes reproduced and understood (`network`
      for STT, `synthesis-failed` for TTS) — this is why we moved to WASM

## Phase 1 — static site (dirty hands)

- [ ] Open `http://127.0.0.1:8001/` and click through every nav item —
      does the structure make sense to someone who isn't you?
- [ ] Toggle light/dark mode — check both render correctly
- [ ] Try the search box (top right) — does it find content in the pages?
- [ ] Resize the browser to phone width — does the nav collapse sanely?

## Phase 1.1 — capability probe (dirty hands, needs multiple browsers)

The probe's *logic* is what I can verify; whether it reports **correctly**
on real browsers is something only real browsers can confirm:

- [ ] Chrome/Chromium — record what Step 0 reports
- [ ] Firefox — expect File System Access API: ❌, WASM/SIMD: probably ✅
- [ ] Safari (if you have access to a Mac/iPhone) — expect WebGPU and File
      System Access API: ❌
- [ ] A real Android phone browser — this is close to your actual target
      audience's device class; storage-estimate numbers here matter more
      than on a desktop
- [ ] **Private/incognito window**, each browser — does "Persistent
      storage" correctly report denied/unavailable? This is the specific
      case the whole manual-download-fallback design exists for.

## Blocked until the WASM engine exists (see design.md correction)

Not testable yet — the inference engine itself still needs to be built
from source via Emscripten (or an authenticated pull from HF). Once it
exists:

- [ ] **(dirty hands)** Click "Listen" — do you actually hear the voice,
      and does it sound acceptable?
- [ ] **(dirty hands)** Click "Try it," speak the sample sentence — is the
      transcription usable for a read-along check?
- [ ] **(dirty hands)** Download the model, close the tab, reopen — does
      the "load from file" path work without re-downloading?
- [ ] **(dirty hands)** Repeat the above in a private/incognito window —
      confirm the file survives even though the session doesn't
- [ ] **(dirty hands)** Copy the downloaded `.onnx` file to a second
      device via USB and load it there — confirms the peer-to-peer story
      actually works, not just in theory
- [ ] **(dirty hands)** Test on a device with little free storage — does
      the capability probe's warning actually show before the download
      fails partway through?

## Domain / VPS (dirty hands, needs your accounts/credentials)

- [ ] Run the actual `gcloud domains registrations register sosweb.org`
      command with your real contact info (I intentionally don't handle
      this — see `domain-register.md`)
- [ ] Confirm DNS resolves once registered
- [ ] One-time bare-repo setup on the VPS (`design.md` → CI/CD section)
- [ ] First `git push production main` — confirm Caddy serves it and
      issues a TLS cert once the domain resolves

## Passage discussions

Run `cd argument && npm test` for the source-attachment migration, URL
validation, escaped rendering, atomic writes, and authenticated API tests.
These tests use temporary databases and output directories.

For browser checks, use an isolated local preview and test account:

- Select a passage on a MkDocs reading page. Confirm the discussion action
  opens a draft and that the quotation is separate from the contribution.
- Follow login or registration and confirm the quotation survives. Write a
  contribution, reload, and confirm the title and body are restored.
- Simulate a failed submission; the draft must remain available. Publish
  successfully and confirm the draft is cleared and the source is shown.
- Follow the source link. Confirm a unique quotation is highlighted;
  repeated quotations require matching context. Missing or ambiguous
  quotations must show a message without highlighting unrelated text.
- Check Chinese, Persian, inline emphasis, and selections across paragraphs.
- Check a narrow touch viewport, Escape dismissal, and Alt+Shift+D keyboard
  access to the action. Verify form inputs do not offer quotations.
- Block session storage and confirm an explanation appears before leaving
  the source page. Remove a quotation or discard a draft and confirm those
  choices persist. Ordinary threads must still work without a quotation.

The initial integration covers MkDocs, selected standalone HTML pages,
and the Markdown viewer. Door HTML has a separate publication workflow;
its language pages do not yet load the shared discussion widget.

## Administration dashboard

The Node test suite covers role-gated pages and APIs, registration without
role escalation, disabled accounts, session revocation, account controls,
last-admin protection, additive migration without automatic grants,
versioned private message reviews, retention, and atomic rollback when
an audit write fails. Tests use temporary databases and synthetic users.

For a browser preview, use a separate database and explicitly grant a test
account admin access. Verify login returns to `/admin/`; the overview,
user search, account edit confirmation, message filters and review work;
ordinary users receive 403; message HTML is shown as text; and mobile
layouts have no horizontal overflow. Keep real messages and credentials
out of screenshots. See `argument/admin.md` for deployment and SSH setup.


Administration approval tests also cover default and edited notes,
versioned `auto_approve_all` settings, automatic review of pending and new
messages/arguments, no automatic role grant to registrations, the reserved
`auto` username, and rollback if automatic auditing fails. Browser checks
verify prefilled dialogs, confirmation-free authorized actions, persistent
mode, public argument labels, private sender history, and mobile layout.
