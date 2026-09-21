"""Background worker: polls sos_pins for unprocessed rows and translates
each message to English, storing the result in sos_pin_agent_results.

Prototype. The real vendor/API choice for the VPS deployment is still open
(see android/design.md, map-tasks.md's "Backend hosting decision") — this
uses the local Ollama instance already running on this machine, since it's
proven working all session and needs no new setup. process_once() takes
process_fn as a parameter specifically so swapping to a real third-party
vendor later, or writing tests without a live model, are both small changes
rather than a rewrite.

A pin that fails processing (vendor error, empty response) is left
unprocessed (processed_at stays NULL) so the next poll retries it — no
work is silently dropped, matching the same retry-safety principle already
used for pin submission itself (idempotent create_pin).

Usage:
    uv run python py/map/agent.py --once   # one batch, for testing
    uv run python py/map/agent.py          # continuous, 5s poll
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.request

from db import DEFAULT_PATH, fetch_unprocessed_pins, save_agent_result

OLLAMA_URL = "http://127.0.0.1:11434/api/generate"
OLLAMA_MODEL = "qwen2.5:latest"
TRANSLATION_KIND = "translation_en"

TRANSLATE_PROMPT = """Translate the following short emergency message to English.
Output ONLY the translation, no commentary, no preamble, no labels.

--- MESSAGE ---
{text}
--- END ---
"""


def translate_via_ollama(text: str) -> str:
    body = json.dumps(
        {"model": OLLAMA_MODEL, "prompt": TRANSLATE_PROMPT.format(text=text), "stream": False}
    ).encode("utf-8")
    request = urllib.request.Request(
        OLLAMA_URL, data=body, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.loads(response.read())
    result = payload.get("response", "").strip()
    if not result:
        raise ValueError("Empty translation response")
    return result


def process_once(path=DEFAULT_PATH, *, process_fn=translate_via_ollama, limit=20):
    """Process up to `limit` unprocessed pins. Returns (done, failed) counts."""
    done, failed = 0, 0
    for pin in fetch_unprocessed_pins(path, limit=limit):
        try:
            result = process_fn(pin["message"])
            save_agent_result(path, pin_id=pin["id"], kind=TRANSLATION_KIND, result=result)
            done += 1
        except Exception as exc:  # noqa: BLE001 - isolate per-pin failures, never crash the loop
            print(f"  pin {pin['id']} FAILED: {exc}", file=sys.stderr, flush=True)
            failed += 1
    return done, failed


def run(path=DEFAULT_PATH, *, poll_seconds=5, once=False):
    while True:
        done, failed = process_once(path)
        if done or failed:
            print(f"agent: {done} processed, {failed} failed", file=sys.stderr, flush=True)
        if once:
            return
        time.sleep(poll_seconds)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--once", action="store_true", help="Process one batch and exit")
    parser.add_argument("--poll-seconds", type=int, default=5)
    args = parser.parse_args(argv)
    run(poll_seconds=args.poll_seconds, once=args.once)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
