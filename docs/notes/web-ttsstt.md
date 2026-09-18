# Design notes: client-side TTS/STT

Working notes from designing Phase 1.1 (browser-native speech vs. WASM).

## It's not reliable

both errors (`network` for STT, `synthesis-failed` for TTS) point at the same root cause: Chromium's Web Speech API on Linux leans on backends (Google's cloud for STT, a shaky OS-bridge for TTS) that just aren't reliable in this environment. 

That's genuinely useful signal, not a failure of the widget — it confirms the instinct from earlier that browser-native Web Speech isn't a solid foundation for this project, and the offline sherpa-onnx-WASM route is worth prioritizing when we pick this back up.

## WASM and client-side download 

Verified — good news, this is very doable, and there's a nice simplification: piper voices aren't a separate integration from sherpa-onnx, they're bundled into it. 129 piper voices are pre-converted and hosted directly for sherpa-onnx's TTS runtime — so "piper in the browser" and "sherpa-onnx in the browser" are the same thing, not two paths to choose between.

sherpa-onnx-wasm — official, prebuilt, no build step needed:
- Real HF Space demos exist for both directions: TTS (huggingface.co/spaces/k2-fsa/web-assembly-tts-sherpa-onnx-en) and ASR/STT (.../web-assembly-asr-sherpa-onnx-en), with the JS glue + .wasm + .data files visible directly in each Space's source — you can lift the bundle as static files, no Emscripten compilation required.
- Covers both TTS and STT from one consistent toolchain — matches the voice-tutor use case (needs both) and matches what you already trust/use locally.
- Serves as plain <script> + static asset files, same zero-build-step pattern as the current voice-widget.js — no npm/bundler needed, fits the site's existing design.
- Piper voices bundled this way are the lightest option: tens of MB per voice, much smaller than the alternatives below.
kokoro-js — real package- npm install kokoro-js ime-web — genuinely needs  a bundler (ESM importsper its own docs). That  reintroduces exactly tately avoided when  picking MkDocs's extra- Model weights: fp32 = –92MB — still a real  download even at the s- Voice quality is repor), but I'd treat it as a  later option if sherpasatisfying, not the  starting point.

One shared cost worth being upfront about: client-side solves the "no cloud dependency while in use"e hit with Chromium'sbuilt-in speech engine), but shifts the cost to a one-time model download — tens of MB (piper) up toThat download itselfneeds one decent connection. The natural mitigation is the PWA service worker from the earlier phase —irst load sorepeat/offline use never re-downloads.

## ONNX

**ONNX = Open Neural Network Exchange.**

It's an open file format for storing trained machine learning models, created so a model trained in one framework (PyTorch, TensorFlow, etc.) can be exported once and then run anywhere with a compatible runtime — rather than being locked to the framework it was trained in.

That's exactly why it shows up in this stack: a piper/sherpa-onnx TTS voice is trained using some ML framework, then exported to a `.onnx` file (the model weights). **ONNX Runtime** (Microsoft-led project) is the engine that actually loads that `.onnx` file and runs inference on it — and it has builds for regular desktops (what your local Python `sherpa-onnx` package uses), and a WASM build (`onnxruntime-web`), which is what lets that same `.onnx` file run inside the browser. So the chain is: `.onnx` file (the model) → ONNX Runtime (the engine that executes it) → compiled to WASM (so that engine can run in a browser tab).


## Question 1

❯ If we use the WASM packages, the cost is going to be download the 100M-300M weights and the .wasm file.  user's experiences is gonna to be depend on their internet speed, no 3td party provider as google api is needed and no more unknown api failures.   But we also lost control of the client side controls, we don't know if user can finish the download, how long the downloaded files could be cached.  right?

--- 

Yes, that's right, and there are a couple of sharper specifics worth knowing under each point:

**"We don't know if the user can finish the download"** — concretely true: a plain `fetch()` of a 100–300MB file has no built-in resume. If the connection drops or the tab closes mid-download, by default it restarts from zero next time — there's no automatic "continue where you left off." On a network flaky enough to matter (which, for this project, is the expected case, not the edge case), that's a real risk of the download never completing at all. It's fixable, but takes deliberate engineering: fetch the file in chunks via HTTP `Range` requests, track which chunks succeeded, retry only the missing ones, and reassemble — not something you get for free just by picking WASM.

**"How long could the files be cached"** — also true, and the honest answer is: **not guaranteed, at the browser's discretion.** A few layers, from weakest to strongest:
- Plain HTTP cache — subject to the browser's own storage-pressure eviction (LRU-style), cleared by "clear browsing data," no durability promise.
- Service Worker + Cache API (what you'd actually use for a PWA) — you control what's stored and for how long *in your own logic*, but it still lives in the same per-origin storage quota, which the browser can evict under pressure unless you call `navigator.storage.persist()` — and even that is the browser's call, not a guarantee (may prompt the user, may just say no on low-storage devices).
- **Private/incognito windows don't persist any of this across the session at all** — worth flagging specifically because your actual target users (people avoiding surveillance) are disproportionately likely to use private browsing. That means some real fraction of your audience could end up re-downloading the full 100–300MB **every single visit**, which is a serious cost given the threat model this project is built around.

So yes — going client-side trades "cloud API dependency and unknown failures" (last week's problem) for "download completion and cache durability are now entirely the browser's call, not yours" (this week's problem). Neither is free. The alternative worth keeping in mind is running the same sherpa-onnx models **server-side** on the VPS instead — no per-user download at all, but now you're paying server compute per request and it stops working the moment the user can't reach your server, which cuts against the "works offline once loaded" resilience that's the whole point of this project. Worth deciding consciously which failure mode you'd rather own, rather than defaulting into WASM just because it avoided last week's specific bug.

## Q #2

❯ Could we have user see something as "Save As" for those onnx files? and load it from user side after the big file get saved?

--- 

Yes — and this is a genuinely good fit for this project specifically, better than fighting the browser's cache eviction rules. Two ways to build it:

**1. Triggering the save** — a plain download link works:
```html
<a href="/models/piper-en.onnx" download="piper-en.onnx">Download voice model (43MB)</a>
```
This goes through the browser's normal download mechanism into the user's real Downloads folder — a genuine file on disk, not a cache entry. That distinction matters a lot given what we just discussed: **downloaded files survive private/incognito mode.** Incognito's "leave no trace" promise applies to history, cookies, and cache — not to files the user explicitly chose to save. So this actually solves the private-browsing gap from before, not just the general eviction problem.

**2. Loading it back in** — two options:
- **`<input type="file">`** (works everywhere): user clicks "Load model," picks the file they already downloaded from their disk, and your JS reads it with `file.arrayBuffer()` and hands that directly to `InferenceSession.create(arrayBuffer)` — ONNX Runtime Web accepts a raw buffer, not just a URL, so this fully skips the network. Small bit of friction (manual pick each time), universal support.
- **File System Access API** (`showOpenFilePicker()`, Chrome/Edge only): same idea, but after the first pick, you can store the file *handle* and re-request permission silently on later visits — closer to "just loads" without Firefox/Safari support. Worth having the plain `<input type="file">` as the fallback regardless.

**The bonus this unlocks**, which is worth calling out explicitly given what this project is for: since it's now a real file, it can move **peer-to-peer** — USB stick, local Wi-Fi transfer, Bluetooth, sneakernet — between users who never individually need to pull 300MB over a possibly-hostile network connection. One person downloads it once when they have good connectivity; everyone else gets it from them directly. That's a meaningfully different, better story for a shutdown/censorship scenario than "everyone independently fights their own network to download the same file."

One thing worth adding cheaply alongside this: a **checksum check** (SHA-256) before loading a user-supplied file into the inference engine — since the file could now arrive via untrusted hand-to-hand transfer, verifying it matches the known-good hash before use guards against a corrupted or swapped file silently being loaded.

This isn't mutually exclusive with the Cache API approach either — you can try the seamless cache path first and offer "load from a file you already have" as the fallback/portable option. Want me to sketch this into the sample page as the next test?


---

 yes, modify the design.md is ok.  And let's think how to have a ttsstt-guide page to let user test it step by step.   Do we need a js to grasp the capabilities of the user's browser?  so it's help the user go through those steps?


 ---


