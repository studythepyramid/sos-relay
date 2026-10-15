#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
test -f za-index.md || { echo 'Missing homepage source: za-index.md' >&2; exit 1; }
if command -v uv >/dev/null 2>&1; then
    uv run mkdocs build "$@"
else
    "$HOME/.local/bin/uv" run mkdocs build "$@"
fi
