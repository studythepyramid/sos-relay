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
