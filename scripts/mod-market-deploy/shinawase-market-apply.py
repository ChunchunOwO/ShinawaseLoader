#!/usr/bin/env python3
"""Forced-command entry point for the Shinawase Mod Market deploy key.

Installed as /usr/local/bin/shinawase-market-apply and bound to one SSH key with
`restrict,command="/usr/local/bin/shinawase-market-apply"`, so that key can do
exactly two things:

  status  print the official (seed) and served (index) versions, read-only
  apply   read a tar archive from stdin and publish official mods from it

The archive holds `entries.json` (a list of seed entries), the packages they
name (`packages/<id>-<version>.echomod`) and optional icons
(`icons/<id>.<ext>`). Every package must match the sha256 and size in its entry.
Only those seed entries are replaced; community uploads, stats and pages are not
touched. seed.json is backed up before each change. The key cannot run a shell,
change the server code, or write outside packages/, icons/ and seed.json.

Configuration: /etc/shinawase-market-deploy.json
  {"root": "<market dir with seed.json>", "restart": ["systemctl", "restart", "<unit>"]}
"""
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import tarfile
import time
from pathlib import Path

CONFIG = Path(os.environ.get("SHINAWASE_MARKET_DEPLOY_CONFIG", "/etc/shinawase-market-deploy.json"))
SAFE_ID = re.compile(r"^[a-z0-9][a-z0-9._-]{1,63}$", re.I)
SAFE_VERSION = re.compile(r"^[0-9A-Za-z][0-9A-Za-z.+-]{0,31}$")
ICON_EXT = {".svg", ".png", ".webp", ".jpg", ".jpeg", ".gif"}
MAX_ARCHIVE = 64 * 1024 * 1024
MAX_PACKAGE = 32 * 1024 * 1024


def fail(message: str, code: int = 1) -> None:
    print(json.dumps({"ok": False, "error": message}, ensure_ascii=False))
    sys.exit(code)


def load_config() -> tuple[Path, list[str]]:
    try:
        config = json.loads(CONFIG.read_text(encoding="utf-8"))
    except Exception as error:
        fail(f"config unreadable: {CONFIG}: {error}")
    root = Path(str(config.get("root") or ""))
    restart = config.get("restart")
    if not (root / "seed.json").is_file():
        fail(f"seed.json not found under {root}")
    if not (isinstance(restart, list) and restart and all(isinstance(part, str) for part in restart)):
        fail("config.restart must be a command list")
    return root, restart


def read_json(path: Path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def write_json_atomic(path: Path, value) -> None:
    tmp = path.with_name(path.name + f".tmp-{os.getpid()}")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def write_bytes_atomic(path: Path, data: bytes) -> None:
    tmp = path.with_name(path.name + f".tmp-{os.getpid()}")
    tmp.write_bytes(data)
    os.chmod(tmp, 0o644)
    os.replace(tmp, path)


def versions(root: Path) -> dict:
    seed = read_json(root / "seed.json", {"mods": []})
    index = read_json(root / "index.json", {"mods": []})
    return {
        "official": {m.get("id"): m.get("version") for m in seed.get("mods") or [] if isinstance(m, dict)},
        "served": {m.get("id"): m.get("version") for m in index.get("mods") or [] if isinstance(m, dict)},
        "count": len(index.get("mods") or []),
    }


def read_archive() -> dict[str, bytes]:
    data = sys.stdin.buffer.read(MAX_ARCHIVE + 1)
    if not data:
        fail("empty archive on stdin")
    if len(data) > MAX_ARCHIVE:
        fail("archive too large")
    files: dict[str, bytes] = {}
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:") as archive:
        for member in archive.getmembers():
            name = member.name.removeprefix("./")
            if member.isdir() and name in ("", ".", "packages", "icons"):
                continue
            if not member.isfile():
                fail(f"unexpected archive member: {member.name}")
            ok = name == "entries.json" or re.fullmatch(r"packages/[A-Za-z0-9._-]+\.echomod", name) or re.fullmatch(r"icons/[A-Za-z0-9._-]+", name)
            if not ok or ".." in name:
                fail(f"path not allowed: {member.name}")
            if member.size > MAX_PACKAGE:
                fail(f"file too large: {name}")
            files[name] = archive.extractfile(member).read()
    if "entries.json" not in files:
        fail("entries.json missing")
    return files


def validate(files: dict[str, bytes]) -> list[dict]:
    try:
        entries = json.loads(files["entries.json"].decode("utf-8"))
    except Exception as error:
        fail(f"entries.json invalid: {error}")
    if not isinstance(entries, list) or not entries or len(entries) > 16:
        fail("entries.json must be a non-empty list (max 16)")
    for entry in entries:
        if not isinstance(entry, dict):
            fail("entry is not an object")
        ident, version = str(entry.get("id") or ""), str(entry.get("version") or "")
        if not SAFE_ID.match(ident) or not SAFE_VERSION.match(version):
            fail(f"bad id/version: {ident} {version}")
        expected = f"packages/{ident}-{version}.echomod"
        if entry.get("file") != expected or expected not in files:
            fail(f"{ident}: package {expected} missing or file field mismatch")
        blob = files[expected]
        if hashlib.sha256(blob).hexdigest() != entry.get("sha256") or len(blob) != entry.get("size"):
            fail(f"{ident}: sha256/size mismatch")
        icon = entry.get("icon")
        if icon is not None:
            suffix = Path(str(icon)).suffix.lower()
            if icon != f"icons/{ident}{suffix}" or suffix not in ICON_EXT:
                fail(f"{ident}: bad icon path {icon}")
        entry["channel"] = "official"
        for key in [k for k in entry if str(k).startswith("_") or k in {"downloads", "views", "installs", "iconDataUrl", "editKey", "editKeyHash"}]:
            entry.pop(key, None)
    return entries


def apply(root: Path, restart: list[str]) -> None:
    files = read_archive()
    entries = validate(files)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    seed_path = root / "seed.json"
    seed = read_json(seed_path, None)
    if not isinstance(seed, dict) or not isinstance(seed.get("mods"), list):
        fail("seed.json unreadable")
    backup = seed_path.with_name(f"seed.json.bak-{stamp}")
    backup.write_bytes(seed_path.read_bytes())
    (root / "packages").mkdir(exist_ok=True)
    (root / "icons").mkdir(exist_ok=True)
    for name, blob in files.items():
        if name.startswith(("packages/", "icons/")):
            write_bytes_atomic(root / name, blob)
    mods = list(seed["mods"])
    for entry in entries:
        index = next((i for i, m in enumerate(mods) if isinstance(m, dict) and m.get("id") == entry["id"]), None)
        if index is None:
            mods.append(entry)
        else:
            mods[index] = entry
    seed["mods"] = mods
    write_json_atomic(seed_path, seed)
    result = subprocess.run(restart, capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        fail(f"restart failed ({result.returncode}): {result.stderr.strip()[:300]}; seed backup {backup.name}")
    served = {}
    for _ in range(20):
        time.sleep(0.5)
        served = versions(root)["served"]
        if all(served.get(e["id"]) == e["version"] for e in entries):
            break
    ok = all(served.get(e["id"]) == e["version"] for e in entries)
    print(json.dumps({"ok": ok, "published": {e["id"]: e["version"] for e in entries}, "backup": backup.name, **versions(root)}, ensure_ascii=False))
    sys.exit(0 if ok else 1)


def main() -> None:
    root, restart = load_config()
    command = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get("SSH_ORIGINAL_COMMAND", "")).strip() or "status"
    if command == "status":
        print(json.dumps({"ok": True, **versions(root)}, ensure_ascii=False))
    elif command == "apply":
        apply(root, restart)
    else:
        fail("only 'status' and 'apply' are allowed", 2)


if __name__ == "__main__":
    main()
