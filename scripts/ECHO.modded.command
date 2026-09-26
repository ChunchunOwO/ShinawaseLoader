#!/bin/bash
# macOS stand-in for ECHO.modded.exe. Steam's copy of ECHO.app is not modified.
# Steam launches this with a minimal PATH, so Node must be found by absolute path.
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
LOADER="$ROOT/ShinawaseLoader"
LOG="$LOADER/Logs"
mkdir -p "$LOG"

find_node() {
  if [[ -n "${ECHO_NODE_PATH:-}" && -x "${ECHO_NODE_PATH}" ]]; then
    printf '%s\n' "$ECHO_NODE_PATH"
    return
  fi
  if [[ -f "$LOADER/loader.config.json" ]]; then
    local configured
    configured="$(/usr/bin/python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("runtimePath") or "")' "$LOADER/loader.config.json" 2>/dev/null || true)"
    if [[ -n "$configured" && -x "$configured" ]]; then
      printf '%s\n' "$configured"
      return
    fi
  fi
  local candidate
  local candidates=("$LOADER/node" "$HOME/.local/bin/node" "/opt/homebrew/bin/node" "/usr/local/bin/node")
  local bundled
  for bundled in "$HOME/.local/opt"/node-v22.23.2*/bin/node; do
    candidates+=("$bundled")
  done
  if command -v node >/dev/null 2>&1; then
    candidates+=("$(command -v node)")
  fi
  for candidate in "${candidates[@]}"; do
    if [[ -n "$candidate" && -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return
    fi
  done
  return 1
}

NODE="$(find_node || true)"
if [[ -z "$NODE" ]]; then
  printf '%s\n' "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Steam launch could not find Node. Set ECHO_NODE_PATH." >> "$LOG/modded-command.log"
  exit 127
fi
export ECHO_GAME_ROOT="$ROOT"
export ECHO_MOD_HOME="$LOADER"
export ECHO_NODE_PATH="$NODE"
exec "$NODE" "$LOADER/echo-modded-host.mjs" "$@"
