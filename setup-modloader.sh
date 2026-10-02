#!/bin/bash
# macOS and Linux installer. Windows setup remains setup-modloader.bat.
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"

# Linux only: when no Node 22+ is found, fetch the official tarball into
# ~/.local/opt (ECHO.modded.sh looks there too). Keep NODE_VERSION equal to
# nodeVersion in ShinawaseLoader/loader-version.json (tests/ checks this) and
# refresh the hashes from https://nodejs.org/dist/v<version>/SHASUMS256.txt.
NODE_VERSION="22.23.2"
NODE_SHA256_X64="b294a556e639d64338823920e5866c21c02741742d2e1529ee1a225c1ec9252a"
NODE_SHA256_ARM64="013b59cfd2819703a6f4a14ab891fc46fc2a4e3f5bcd92de3fb4929b43e35b30"

node_ok() {
  [[ -n "$1" && -x "$1" ]] && "$1" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' >/dev/null 2>&1
}

fetch() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --connect-timeout 10 --max-time 600 -o "$2" "$1"
  elif command -v wget >/dev/null 2>&1; then
    wget -q --timeout=30 -O "$2" "$1"
  else
    return 1
  fi
}

install_node_linux() {
  local arch sha file tmp base
  case "$(uname -m)" in
    x86_64) arch="x64"; sha="$NODE_SHA256_X64" ;;
    aarch64|arm64) arch="arm64"; sha="$NODE_SHA256_ARM64" ;;
    *) echo "没有适用于 $(uname -m) 的官方 Node 包，请手动安装 Node 22，或设置 ECHO_NODE_PATH。" >&2; return 1 ;;
  esac
  file="node-v$NODE_VERSION-linux-$arch.tar.gz"
  tmp="$(mktemp -d)"
  echo "没有找到 Node 22+，正在下载 Node $NODE_VERSION ……" >&2
  for base in \
    "https://nodejs.org/dist/v$NODE_VERSION" \
    "https://registry.npmmirror.com/-/binary/node/v$NODE_VERSION" \
    "https://mirrors.huaweicloud.com/repository/toolkit/nodejs/v$NODE_VERSION"; do
    if fetch "$base/$file" "$tmp/$file" && [[ "$(sha256sum "$tmp/$file" | cut -d' ' -f1)" == "$sha" ]]; then
      mkdir -p "$HOME/.local/opt" && tar -xzf "$tmp/$file" -C "$HOME/.local/opt" && rm -rf "$tmp" \
        && printf '%s\n' "$HOME/.local/opt/node-v$NODE_VERSION-linux-$arch/bin/node" && return 0
    fi
  done
  rm -rf "$tmp"
  echo "Node 下载失败或校验不通过。请手动安装 Node 22，或设置 ECHO_NODE_PATH。" >&2
  return 1
}

find_node() {
  local candidate
  for candidate in "${ECHO_NODE_PATH:-}" "$(command -v node 2>/dev/null || true)" "$HOME"/.local/opt/node-v22.*/bin/node; do
    if node_ok "$candidate"; then printf '%s\n' "$candidate"; return 0; fi
  done
  [[ "$(uname -s)" == "Linux" ]] && install_node_linux
}

NODE="$(find_node || true)"
if [[ -z "$NODE" ]]; then
  echo "没有找到可用的 Node 22+。请安装 Node 22，或设置 ECHO_NODE_PATH。" >&2
  exit 1
fi
case "$(uname -s)" in
  Linux) SCRIPT="setup-modloader-linux.mjs" ;;
  *) SCRIPT="setup-modloader-macos.mjs" ;;
esac
exec "$NODE" "$ROOT/scripts/$SCRIPT" "$@"
