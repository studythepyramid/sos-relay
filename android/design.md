# Android — design anchor

Status: design-only, not started (2026-09-21)
Scope: an Android client for the SOS map (`map-tasks.md`) — the phone as an
**input device** (text, mic, camera, photo/video album) for submitting SOS
pins, plus a thin read view of nearby pins. Kept in sync with
`map-tasks.md`'s JSON/API contract; this doc doesn't redefine anything
already decided there.

## Why this is a smaller task than it looks

There's a half-finished, unrelated project at `~/dev/media-scripts/android`
(a Kotlin/Compose app) with three of the four input modalities already
built and working:

- `editor/EditorScreen.kt` + `NoteStore.kt` — text input
- `voice/VoiceScreen.kt` + `VoiceRecorder.kt` — mic
- `camera/CameraScreen.kt` — camera capture
- `llm/LlmManager.kt` — a **proven on-device LLM** (Gemma 3 1B int4 via
  Google's LiteRT-LM engine; its own comment says "proven working
  on-device")

So this task is mostly *reuse and rewire*, not *build four subsystems*:

1. Fork the reusable pieces above (not the whole app — `media-scripts`
   also has a dictionary screen and pronunciation-practice tooling that
   has nothing to do with `sos-relay` and shouldn't come along) into this
   repo's own `android/` folder, matching the isolation already used for
   `map/` and `argument/`. **This is a real filesystem decision — confirm
   before copying**, don't do it as a silent side effect of writing this
   doc.
2. Point each screen's submit action at the map API instead of whatever
   `media-scripts` originally used it for.
3. Add the one genuinely missing piece: a gallery/album picker.

## Net-new work

- **Gallery/album picker.** People's real photos land in the album from
  the phone's own camera app, not necessarily captured fresh inside this
  app — the picker needs to pull from there. Use Android's modern
  **Photo Picker** (`ActivityResultContracts.PickVisualMedia`), not the
  older broad-storage-permission APIs — it lets the user choose a single
  photo/video without granting the app blanket gallery access, which
  fits the project's privacy posture (identity minimization) better than
  the alternative.
- **Wiring** the three reused screens to the map API (below).
- **Read view**: a thin list/map of nearby pins via `GET /api/sos/pins`.

## Translation — simpler than it sounds

The desktop translator (`~/dev/localllm`) is complex because it translates
a 68k-line document — piece-splitting, resume, multi-hour batching. None
of that applies here: an SOS message is capped at 600 characters (`db.py`'s
`CHECK` constraint). Translating it is **one LLM call**, nothing more.
`LlmManager.kt`'s already-proven on-device engine can do this directly —
no new infrastructure, no network dependency (translation keeps working
with zero connectivity, which is exactly when it matters most for this
project). Quality will be modest (1B params vs. the desktop's qwen2.5),
which is an acceptable tradeoff for a short emergency message, not a
document.

## API contract (current, from `py/map/preview.py` + `py/map/db.py`)

```
POST /api/sos/pins
Content-Type: application/json, body ≤ 8192 bytes
{
  "latitude": <number>,
  "longitude": <number>,
  "message": "<1-600 chars>",
  "share_contact": <bool, default false>,
  "contact": "<string, ≤200 chars, only used if share_contact=true>",
  "id": "<uuid, optional — omit to let the server generate one>"
}
→ 201 {"pin": {...stored row...}}

GET /api/sos/pins?south=&west=&north=&east=&offset=
→ 200 {"pins": [...], "next_offset": <int|null>}
```

Submitting with a client-generated UUID `id` is safe to retry — the API
treats a resubmission of the same id+content as a no-op success (see
`create_pin` in `db.py`), which is exactly the property a mobile client on
an unreliable network needs. **Always generate and send `id`** so retries
after a dropped connection are idempotent rather than creating duplicates.

**Current constraint**: this endpoint only answers local/same-origin
requests (`Local same-origin access only`, 403 otherwise) — it's a preview
server, not a public deployment yet. A real device can't reach it over
the network as-is. For development now: `adb reverse tcp:18188 tcp:18188`
tunnels the phone's `localhost:18188` to the dev machine's preview server,
which satisfies the same-origin check. Public device use waits on the VPS
deployment already tracked as pending in `map-tasks.md`.

## Open item — no media field in the schema yet

`db.py`'s `sos_pins` table has no column for a photo/video/audio
attachment — today's schema is text message + optional contact only.
Camera/album capture producing something to *attach to a pin* needs a
schema extension (an `attachments` table or a `media_url`-style column)
that doesn't exist yet. **This needs to be coordinated with the map track
(Codex), not decided unilaterally here** — propose it as an additive
change there, since it touches the already-tested core schema. Until
that lands, camera/album capture can be built and reviewed on the Android
side against a stub, same pattern already used for the map frontend
before its backend existed.

## Review approach

Kotlin isn't a language the user can review by reading diffs the way
Python has been reviewed all session (testing real behavior — Ctrl-C,
resume, real files — not reading code). The design compensates
structurally rather than assuming closer code review:

- Keep changes small enough that **build passes + existing tests pass +
  it visibly does the right thing when tapped through** is a sufficient
  check on its own.
- `media-scripts/android` already has `androidTest`/`test` directories —
  lean on that harness as the real correctness gate, not manual read-through.
- Checkpoint = **running the app and using it**, not approving a diff.

## Suggested first slice

1. Fork the reusable screens + base project scaffolding into this repo's
   `android/` (after confirming that's wanted).
2. Wire text input (`editor/`) to `POST /api/sos/pins` first — smallest
   possible end-to-end slice, no media dependency, provable against the
   local preview via `adb reverse` today.
3. Wire mic + camera similarly.
4. Add the Photo Picker for album access.
5. Add the read view (`GET /api/sos/pins`).
6. Wire on-device translation for the read view (translate incoming pins'
   `message` for local display) once the above is stable.

Attachment upload (camera/album → actually stored on a pin) waits on the
schema coordination above — it's the one piece of this slice with an
external dependency, everything else can proceed independently.
