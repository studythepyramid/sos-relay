# TTS/STT Guide (step by step)

This page tests the offline, client-side voice engine — nothing here talks
to a cloud API or this site's server once the model is loaded. Everything
below runs in your browser.

## Step 0 — What your browser supports

<div class="capability-probe"></div>

This checks WebAssembly/SIMD, storage, and file/microphone APIs before
asking you to download anything. If a row above shows &#10060;, the step
that depends on it will say so.

## Step 1 — Get the voice model

<a href="../assets/tts/vits-piper-en_US-amy-low-int8/en_US-amy-low.onnx" download>
Download English voice — en_US-amy-low (~18MB)</a>

This is a real piper voice (bundled via sherpa-onnx's model zoo), fetched
by `scripts/fetch-tts-assets.sh`. Save it somewhere you'll find again —
Step 2 loads it back from disk, not from this site.

<!-- TODO(phase 1.1): the WASM *engine* itself (JS glue + .wasm + .data)
     still needs to be built from source via Emscripten
     (build-wasm-simd-tts.sh in k2-fsa/sherpa-onnx) — there is no prebuilt
     download for it; the official HF Space demo blocks anonymous script
     downloads (HF's Xet storage backend), so it can't just be mirrored.
     Steps 2-4 below are blocked on that build existing. -->

*(The inference engine itself isn't wired up yet — see the note in the
page source. Steps 2-4 below are placeholders until that's built.)*

## Step 2 — Load the model

Two ways, depending on Step 0's results:

- **If your browser supports the File System Access API**: click "Load
  model," pick the file once, and it can be reloaded automatically on
  later visits.
- **Otherwise**: click "Load model," pick the file each time you visit —
  still fully offline, just one extra click.

*(Loader control placeholder — added alongside Step 1.)*

## Step 3 — Try it: Listen (TTS)

*(Same "Listen" control as the earlier Web Speech demo, once wired to the
loaded model instead of the browser's built-in — see
[the English sample](../samples/tts-stt-en.md) for the older browser-native
version for comparison.)*

## Step 4 — Try it: Speak (STT)

*(Requires microphone access — Step 0 will show whether your browser
supports this at all before you try.)*

---

See [design notes](../notes/web-ttsstt.md) for how this approach was
chosen over the browser-native Web Speech API.
