#!/bin/bash
# macOS installer. Windows setup remains setup-modloader.bat.
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
if [[ -n "${ECHO_NODE_PATH:-}" && -x "${ECHO_NODE_PATH}" ]]; then
  NODE="$ECHO_NODE_PATH"
elif command -v node >/dev/null 2>&1; then
  NODE="$(command -v node)"
else
  NODE="node"
fi
exec "$NODE" "$ROOT/scripts/setup-modloader-macos.mjs" "$@"
