#!/usr/bin/env python3
"""Shinawase Mod Market API — stdlib only. Search, recommend, upload, stats."""
from __future__ import annotations

import base64
import hashlib
import io
import json
import os
import re
import threading
import time
import urllib.error
import urllib.request
import zipfile
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(os.environ.get("MARKET_ROOT", ".")).resolve()
PORT = int(os.environ.get("MARKET_PORT", "17891"))
FLARUM_URL = os.environ.get("FLARUM_URL", "http://127.0.0.1:18880").rstrip("/")
MAX_UPLOAD = 32 * 1024 * 1024
MAX_UNCOMPRESSED = 128 * 1024 * 1024
MAX_FILES = 512
MAX_README = 80_000
MAX_INTRO = 2_000
SAFE_ID = re.compile(r"^[a-z0-9][a-z0-9._-]{1,63}$", re.I)
SAFE_TAG = re.compile(r"^[a-z0-9][a-z0-9._-]{0,31}$", re.I)
LOCK = threading.Lock()
UPLOAD_HITS: dict[str, list[float]] = {}
ME_CACHE: dict[str, tuple[float, dict | None]] = {}

SEED = ROOT / "seed.json"
COMMUNITY = ROOT / "community.json"
STATS = ROOT / "data" / "stats.json"
PAGES = ROOT / "data" / "pages.json"
CATALOG = ROOT / "index.json"
PACKAGES = ROOT / "packages"
ICONS = ROOT / "icons"
DOCS = ROOT / "docs"


def read_json(path: Path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return fallback


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def clamp_text(value, limit: int) -> str:
    text = str(value or "").replace("\x00", "").strip()
    return text[:limit]


def doc_path(ident: str) -> Path:
    return DOCS / f"{ident}.md"


def read_readme(ident: str) -> str:
    path = doc_path(ident)
    try:
        return path.read_text(encoding="utf-8")[:MAX_README]
    except OSError:
        return ""


def write_readme(ident: str, text: str) -> None:
    DOCS.mkdir(parents=True, exist_ok=True)
    body = clamp_text(text, MAX_README)
    if not body:
        doc_path(ident).unlink(missing_ok=True)
        return
    doc_path(ident).write_text(body + ("" if body.endswith("\n") else "\n"), encoding="utf-8")


def public_mod(item: dict) -> dict:
    out = {key: value for key, value in item.items() if not str(key).startswith("_") and key not in {"editKey", "editKeyHash", "iconDataUrl"}}
    ident = str(out.get("id") or "")
    out["hasReadme"] = bool(out.get("hasReadme")) or (bool(ident) and doc_path(ident).exists())
    return out


def empty_stats() -> dict:
    return {"downloads": 0, "installs": 0, "views": 0}


def overlay_stats(item: dict, stats: dict, pages: dict | None = None) -> dict:
    ident = str(item.get("id") or "")
    extra = stats.get(ident) or {}
    item["downloads"] = int(extra.get("downloads") or item.get("downloads") or 0)
    item["views"] = int(extra.get("views") or item.get("views") or 0)
    item["installs"] = int(extra.get("installs") or item.get("installs") or 0)
    if pages is None:
        pages = read_json(PAGES, {})
    page = pages.get(ident) or {}
    if page.get("intro"):
        item["intro"] = str(page.get("intro") or "")
    if page.get("introZh"):
        item["introZh"] = str(page.get("introZh") or "")
    item["hasReadme"] = doc_path(ident).exists()
    return item


def compare_versions(left: str, right: str) -> int:
    def parts(value: str):
        return [int(part) if part.isdigit() else 0 for part in re.split(r"[^\d]+", str(value or "0")) if part != ""] or [0]
    a, b = parts(left), parts(right)
    size = max(len(a), len(b))
    a += [0] * (size - len(a))
    b += [0] * (size - len(b))
    return (a > b) - (a < b)


def locale_text(item: dict, key: str, lang: str) -> str:
    zh = str(item.get(f"{key}Zh") or "")
    en = str(item.get(key) or item.get(f"{key}En") or "")
    if lang.startswith("zh"):
        return zh or en
    return en or zh


def search_score(item: dict, query: str, lang: str) -> int:
    q = query.strip().lower()
    if not q:
        return 1
    name = locale_text(item, "name", lang).lower()
    desc = locale_text(item, "description", lang).lower()
    ident = str(item.get("id") or "").lower()
    author = str(item.get("author") or "").lower()
    tags = [str(tag).lower() for tag in item.get("tags") or []]
    score = 0
    if name == q:
        score += 200
    elif name.startswith(q):
        score += 120
    elif q in name:
        score += 80
    if q in ident:
        score += 70
    if any(tag == q or q in tag for tag in tags):
        score += 60
    if q in desc:
        score += 24
    if q in author:
        score += 16
    return score


def recommend_score(item: dict, installed: set[str], tags: set[str]) -> float:
    ident = str(item.get("id") or "")
    if ident in installed:
        return 0
    score = 0.0
    if item.get("featured") is True:
        score += 48
    if item.get("channel") == "official":
        score += 18
    for tag in item.get("tags") or []:
        if str(tag) in tags:
            score += 14
    downloads = float(item.get("downloads") or 0)
    if downloads > 0:
        score += min(24.0, (downloads ** 0.5) * 2.2)
    uploaded = str(item.get("uploadedAt") or "")
    try:
        when = datetime.fromisoformat(uploaded.replace("Z", "+00:00"))
        age = (datetime.now(timezone.utc) - when).total_seconds()
        if age >= 0 and age < 14 * 86400:
            score += 8
    except Exception:
        pass
    return score


def inspect_zip(data: bytes) -> dict:
    if len(data) > MAX_UPLOAD:
        raise ValueError("echomod_too_large")
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as error:
        raise ValueError("echomod_zip_invalid") from error
    names = archive.namelist()
    if len(names) > MAX_FILES:
        raise ValueError("too_many_files")
    total = 0
    files: dict[str, bytes] = {}
    for info in archive.infolist():
        name = info.filename.replace("\\", "/")
        if name.endswith("/") or name.startswith("/") or ".." in name.split("/"):
            if name.endswith("/"):
                continue
            raise ValueError("invalid_mod_file")
        if info.file_size > MAX_UNCOMPRESSED:
            raise ValueError("mod_file_too_large")
        total += info.file_size
        if total > MAX_UNCOMPRESSED:
            raise ValueError("echomod_too_large")
        files[name] = archive.read(info)
    return files


def inspect_json_package(data: bytes) -> dict:
    payload = json.loads(data.decode("utf-8"))
    files: dict[str, bytes] = {}
    for file in payload.get("files") or []:
        path = str(file.get("path") or "").replace("\\", "/")
        if not path or path.startswith("/") or ".." in path.split("/"):
            raise ValueError("invalid_mod_file")
        if file.get("encoding") == "base64":
            files[path] = base64.b64decode(file.get("content") or "")
        else:
            files[path] = str(file.get("content") or "").encode("utf-8")
    manifest = payload.get("manifest")
    if isinstance(manifest, dict):
        files["echo.mod.json"] = json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8")
    return files


def inspect_package(data: bytes) -> tuple[dict, dict[str, bytes]]:
    files = inspect_zip(data) if data[:4] == b"PK\x03\x04" else inspect_json_package(data)
    lower = {key.lower(): key for key in files}
    manifest_key = lower.get("echo.mod.json") or lower.get("echo.plugin.json") or lower.get("manifest.json")
    if not manifest_key:
        raise ValueError("mod_manifest_missing")
    manifest = json.loads(files[manifest_key].decode("utf-8"))
    ident = str(manifest.get("id") or "")
    if not SAFE_ID.match(ident):
        raise ValueError("invalid_mod_id")
    entry = str(manifest.get("entry") or manifest.get("main") or ("plugin.js" if "plugin" in manifest_key else "mod.js")).replace("\\", "/")
    if entry.lower() not in lower:
        raise ValueError("mod_entry_missing")
    return manifest, files


def listing_from_manifest(manifest: dict, data: bytes, files: dict[str, bytes], extra: dict | None = None) -> dict:
    ident = str(manifest.get("id"))
    version = str(manifest.get("version") or "1.0.0")
    icon_name = str(manifest.get("icon") or "icon.svg").replace("\\", "/")
    lower = {key.lower(): key for key in files}
    icon_key = lower.get(icon_name.lower())
    icon_bytes = files.get(icon_key) if icon_key else None
    ext = Path(icon_name).suffix.lower() or ".svg"
    mime = {
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }.get(ext, "application/octet-stream")
    tags = [str(tag) for tag in (manifest.get("tags") or []) if SAFE_TAG.match(str(tag))][:8]
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    listing = {
        "id": ident,
        "name": str(manifest.get("name") or ident),
        "nameZh": str(manifest.get("nameZh") or manifest.get("name") or ident),
        "version": version,
        "description": str(manifest.get("description") or ""),
        "descriptionZh": str(manifest.get("descriptionZh") or manifest.get("description") or ""),
        "author": str((extra or {}).get("author") or manifest.get("author") or "Community"),
        "channel": "community",
        "featured": False,
        "tags": tags,
        "minEchoVersion": str(manifest.get("minEchoVersion") or "") or None,
        "homepage": str(manifest.get("homepage") or ""),
        "file": f"packages/{ident}-{version}.echomod",
        "icon": f"icons/{ident}{ext}" if icon_bytes else None,
        "iconDataUrl": f"data:{mime};base64,{base64.b64encode(icon_bytes).decode('ascii')}" if icon_bytes else None,
        "sha256": sha256(data),
        "size": len(data),
        "downloads": 0,
        "views": 0,
        "installs": 0,
        "intro": clamp_text(manifest.get("intro") or manifest.get("description") or "", MAX_INTRO),
        "introZh": clamp_text(manifest.get("introZh") or manifest.get("descriptionZh") or manifest.get("description") or "", MAX_INTRO),
        "hasReadme": False,
        "uploadedAt": now,
        "updatedAt": now,
    }
    readme_key = lower.get("readme.md") or lower.get("readme.txt")
    if readme_key:
        try:
            listing["_readme"] = files[readme_key].decode("utf-8")
            listing["hasReadme"] = True
        except Exception:
            pass
    return listing


OFFICIAL_PACKAGE_FIELDS = ("version", "file", "sha256", "size", "icon", "minEchoVersion", "hasReadme", "uploadedAt", "updatedAt")


def merge_catalog() -> dict:
    seed = read_json(SEED, {"mods": []})
    community = read_json(COMMUNITY, {"mods": []})
    stats = read_json(STATS, {})
    pages = read_json(PAGES, {})
    official = []
    official_ids = set()
    for raw in seed.get("mods") or []:
        if not isinstance(raw, dict) or not SAFE_ID.match(str(raw.get("id") or "")):
            continue
        item = dict(raw)
        item["channel"] = "official" if item.get("channel") == "official" else item.get("channel") or "official"
        ident = item["id"]
        official_ids.add(ident)
        over = next((row for row in community.get("mods") or [] if isinstance(row, dict) and str(row.get("id") or "") == ident), None)
        if over and (over.get("unlisted") or over.get("deleted")):
            continue
        # An admin re-upload of an official mod is stored in community.json. Serve
        # its package once it is newer than the seed, otherwise the catalog keeps
        # the seed version forever; names, descriptions, tags and featured stay
        # seed-managed.
        if over and compare_versions(str(over.get("version") or "0"), str(item.get("version") or "0")) > 0:
            for key in OFFICIAL_PACKAGE_FIELDS:
                if over.get(key) is not None:
                    item[key] = over[key]
        overlay_stats(item, stats, pages)
        official.append(public_mod(item))
    uploaded = []
    seen = set(official_ids)
    for raw in community.get("mods") or []:
        if not isinstance(raw, dict):
            continue
        ident = str(raw.get("id") or "")
        if ident in seen or not SAFE_ID.match(ident):
            continue
        item = dict(raw)
        item["channel"] = "community"
        if item.get("unlisted") or item.get("deleted"):
            continue
        seen.add(ident)
        overlay_stats(item, stats, pages)
        uploaded.append(public_mod(item))
    catalog = {
        "version": 1,
        "name": seed.get("name") or "Shinawase Mod Market",
        "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "mods": official + uploaded,
    }
    write_json(CATALOG, catalog)
    return catalog


def load_catalog() -> dict:
    catalog = read_json(CATALOG, None)
    if not catalog or not isinstance(catalog.get("mods"), list):
        return merge_catalog()
    stats = read_json(STATS, {})
    pages = read_json(PAGES, {})
    mods = []
    for raw in catalog.get("mods") or []:
        if isinstance(raw, dict):
            mods.append(public_mod(overlay_stats(dict(raw), stats, pages)))
    catalog = dict(catalog)
    catalog["mods"] = mods
    return catalog


def find_mod(ident: str) -> dict | None:
    if not SAFE_ID.match(ident):
        return None
    for item in load_catalog().get("mods") or []:
        if item.get("id") == ident:
            return item
    return None


def bump_stat(ident: str, field: str) -> dict:
    stats = read_json(STATS, {})
    entry = stats.get(ident) or empty_stats()
    for key in empty_stats():
        entry[key] = int(entry.get(key) or 0)
    if field == "install":
        entry["installs"] += 1
        entry["downloads"] += 1
    elif field == "download":
        entry["downloads"] += 1
    elif field == "view":
        entry["views"] += 1
    else:
        raise ValueError("invalid_event")
    stats[ident] = entry
    write_json(STATS, stats)
    catalog = read_json(CATALOG, {"mods": []})
    changed = False
    for item in catalog.get("mods") or []:
        if item.get("id") == ident:
            item["downloads"] = entry["downloads"]
            item["views"] = entry["views"]
            item["installs"] = entry["installs"]
            changed = True
            break
    if changed:
        write_json(CATALOG, catalog)
    return entry


def rate_limited(ip: str) -> bool:
    now = time.time()
    hits = [stamp for stamp in UPLOAD_HITS.get(ip, []) if now - stamp < 3600]
    if len(hits) >= 8:
        UPLOAD_HITS[ip] = hits
        return True
    hits.append(now)
    UPLOAD_HITS[ip] = hits
    return False


def package_files(ident: str):
    prefix = ident + "-"
    for path in PACKAGES.glob("*.echomod"):
        name = path.name
        if not name.startswith(prefix) or not name.endswith(".echomod"):
            continue
        rest = name[len(prefix):-8]
        if rest[:1].isdigit():
            yield path


def official_ids() -> set[str]:
    seed = read_json(SEED, {"mods": []})
    return {str(item.get("id")) for item in seed.get("mods") or [] if isinstance(item, dict) and item.get("id")}


def route_path(raw: str) -> str:
    path = (raw or "/").split("?", 1)[0]
    path = path.rstrip("/") or "/"
    for prefix in ("/mod-market/api", "/api"):
        if path == prefix:
            return "/"
        if path.startswith(prefix + "/"):
            return path[len(prefix):] or "/"
    return path


def find_raw_listing(ident: str):
    community = read_json(COMMUNITY, {"mods": []})
    for item in community.get("mods") or []:
        if isinstance(item, dict) and str(item.get("id") or "") == ident:
            return item, "community", community
    seed = read_json(SEED, {"mods": []})
    for item in seed.get("mods") or []:
        if isinstance(item, dict) and str(item.get("id") or "") == ident:
            return dict(item), "seed", community
    return None, None, community


def parse_flarum_actor(payload: dict) -> dict | None:
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, dict):
        return None
    rel = ((data.get("relationships") or {}).get("actor") or {}).get("data") or {}
    uid = str(rel.get("id") or "")
    if not uid:
        return None
    attrs = {}
    for row in payload.get("included") or []:
        if isinstance(row, dict) and row.get("type") == "users" and str(row.get("id")) == uid:
            attrs = row.get("attributes") or {}
            break
    groups = attrs.get("groups") if isinstance(attrs.get("groups"), list) else []
    is_admin = attrs.get("isAdmin") is True or any(str(group) in {"1", "admin", "Administrators"} for group in groups)
    return {
        "id": uid,
        "username": str(attrs.get("username") or ""),
        "displayName": str(attrs.get("displayName") or attrs.get("username") or ""),
        "isAdmin": is_admin,
    }


def flarum_me(cookie: str | None, authorization: str | None) -> dict | None:
    cookie = str(cookie or "").strip()
    authorization = str(authorization or "").strip()
    if not cookie and not authorization:
        return None
    cache_key = sha256(f"{cookie}|{authorization}".encode())
    hit = ME_CACHE.get(cache_key)
    now = time.time()
    if hit and now - hit[0] < 20:
        return hit[1]
    req = urllib.request.Request(
        FLARUM_URL + "/api/",
        headers={"Accept": "application/vnd.api+json", "User-Agent": "ShinawaseMarket/1"},
        method="GET",
    )
    if cookie:
        req.add_header("Cookie", cookie)
    if authorization:
        req.add_header("Authorization", authorization)
    try:
        with urllib.request.urlopen(req, timeout=8) as response:
            payload = json.loads(response.read().decode("utf-8"))
        user = parse_flarum_actor(payload)
    except Exception:
        user = None
    if len(ME_CACHE) >= 400:
        for key, _ in sorted(ME_CACHE.items(), key=lambda pair: pair[1][0])[:80]:
            ME_CACHE.pop(key, None)
    ME_CACHE[cache_key] = (now, user)
    return user


def flarum_login(identification: str, password: str) -> dict:
    body = json.dumps({"identification": identification, "password": password}).encode("utf-8")
    req = urllib.request.Request(
        FLARUM_URL + "/api/token",
        data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json", "User-Agent": "ShinawaseMarket/1"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:400]
        raise ValueError("login_failed") from error
    token = str(payload.get("token") or "")
    if not token:
        raise ValueError("login_failed")
    user = flarum_me(None, "Token " + token)
    if not user:
        raise ValueError("login_failed")
    return {"ok": True, "token": token, "user": user}


def can_manage(user: dict | None, item: dict | None) -> bool:
    if not user or not item:
        return False
    if user.get("isAdmin"):
        return True
    aid = str(item.get("authorId") or "")
    return bool(aid) and aid == str(user.get("id"))


def visible_mods(mods: list, user: dict | None) -> list:
    out = []
    for item in mods:
        if item.get("unlisted"):
            if can_manage(user, item):
                out.append(item)
            continue
        out.append(item)
    return out


def public_user(user: dict | None) -> dict | None:
    if not user:
        return None
    return {"id": user["id"], "username": user["username"], "displayName": user["displayName"], "isAdmin": bool(user.get("isAdmin"))}


class Handler(BaseHTTPRequestHandler):
    server_version = "ShinawaseMarket/1"

    def log_message(self, format, *args):
        print(f"{self.address_string()} {format % args}")

    def _cors(self, extra: dict | None = None) -> dict:
        headers = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "content-type, authorization",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-store",
        }
        if extra:
            headers.update(extra)
        return headers

    def _send(self, status: int, value, extra: dict | None = None) -> None:
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        for key, val in self._cors(extra).items():
            self.send_header(key, val)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read(self) -> bytes:
        length = int(self.headers.get("Content-Length") or "0")
        if length < 0 or length > MAX_UPLOAD + 1024 * 1024:
            raise ValueError("request_too_large")
        return self.rfile.read(length) if length else b""

    def _user(self) -> dict | None:
        return flarum_me(self.headers.get("Cookie"), self.headers.get("Authorization"))

    def _need_user(self) -> dict | None:
        user = self._user()
        if not user:
            self._send(401, {"ok": False, "error": "login_required"})
            return None
        return user

    def do_OPTIONS(self):
        self.send_response(204)
        for key, val in self._cors().items():
            self.send_header(key, val)
        self.end_headers()

    def do_HEAD(self):
        self.send_response(200)
        for key, val in self._cors().items():
            self.send_header(key, val)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()

    def do_GET(self):
        url = urlparse(self.path)
        path = route_path(url.path)
        query = parse_qs(url.query)
        lang = (query.get("lang") or ["zh"])[0]
        q = (query.get("q") or query.get("query") or [""])[0]
        tag = (query.get("tag") or [""])[0].strip().lower()
        channel = (query.get("channel") or [""])[0].strip().lower()
        installed = {part.strip() for part in (query.get("installed") or [""])[0].split(",") if part.strip()}
        try:
            if path in ("/", "/health"):
                return self._send(200, {"ok": True, "service": "Shinawase Mod Market"})
            if path == "/me":
                user = self._user()
                return self._send(200, {"ok": True, "user": public_user(user)})
            user = self._user()
            catalog = load_catalog()
            raw_mods = [item for item in catalog.get("mods") or [] if isinstance(item, dict)]
            community = read_json(COMMUNITY, {"mods": []})
            seed = read_json(SEED, {"mods": []})
            stats = read_json(STATS, {})
            pages = read_json(PAGES, {})
            seen = {str(item.get("id")) for item in raw_mods}
            for raw in community.get("mods") or []:
                if not isinstance(raw, dict):
                    continue
                ident = str(raw.get("id") or "")
                if not ident or ident in seen:
                    continue
                if raw.get("deleted"):
                    continue
                if raw.get("unlisted") and user and (user.get("isAdmin") or can_manage(user, raw)):
                    base = next((row for row in (seed.get("mods") or []) if isinstance(row, dict) and str(row.get("id") or "") == ident), raw)
                    item = public_mod(overlay_stats({**dict(base), **dict(raw)}, stats, pages))
                    item["unlisted"] = True
                    raw_mods.append(item)
                    seen.add(ident)
            mods = visible_mods(raw_mods, user)
            unique = []
            kept = set()
            for item in mods:
                ident = str(item.get("id") or "")
                if not ident or ident in kept:
                    continue
                kept.add(ident)
                item["canManage"] = can_manage(user, item)
                unique.append(item)
            mods = unique
            if path in ("/catalog", "/index.json"):
                out = dict(catalog)
                out["mods"] = mods
                return self._send(200, out)
            if path == "/search":
                scored = []
                for item in mods:
                    if channel and str(item.get("channel") or "") != channel:
                        continue
                    if tag and tag not in [str(value).lower() for value in item.get("tags") or []]:
                        continue
                    score = search_score(item, q, lang)
                    if score <= 0:
                        continue
                    scored.append((score, item))
                scored.sort(key=lambda pair: (-pair[0], str(pair[1].get("name") or "")))
                return self._send(200, {"ok": True, "query": q, "mods": [item for _, item in scored[:40]]})
            if path == "/recommend":
                installed_tags: set[str] = set()
                for item in mods:
                    if item.get("id") in installed:
                        installed_tags.update(str(tag) for tag in item.get("tags") or [])
                ranked = []
                for item in mods:
                    if item.get("unlisted"):
                        continue
                    score = recommend_score(item, installed, installed_tags)
                    if score > 0:
                        ranked.append((score, item))
                ranked.sort(key=lambda pair: -pair[0])
                return self._send(200, {"ok": True, "mods": [item for _, item in ranked[:8]]})
            if path == "/tags":
                counts: dict[str, int] = {}
                for item in mods:
                    for value in item.get("tags") or []:
                        key = str(value)
                        counts[key] = counts.get(key, 0) + 1
                tags = [{"id": key, "count": counts[key]} for key in sorted(counts, key=lambda name: (-counts[name], name))]
                return self._send(200, {"ok": True, "tags": tags})
            if path.startswith("/mod/"):
                ident = path.split("/")[-1]
                raw, _, _ = find_raw_listing(ident)
                if raw and raw.get("deleted"):
                    return self._send(404, {"ok": False, "error": "market_mod_not_found"})
                item = next((row for row in mods if row.get("id") == ident), find_mod(ident))
                if item and item.get("unlisted") and not can_manage(user, item):
                    item = None
                if not item:
                    return self._send(404, {"ok": False, "error": "market_mod_not_found"})
                return self._send(200, {
                    "ok": True,
                    "mod": item,
                    "readme": read_readme(ident),
                    "intro": str(item.get("intro") or ""),
                    "introZh": str(item.get("introZh") or ""),
                    "canManage": can_manage(user, item),
                })
            return self._send(404, {"ok": False, "error": "not_found"})
        except Exception as error:
            return self._send(400, {"ok": False, "error": str(error)})

    def do_POST(self):
        url = urlparse(self.path)
        path = route_path(url.path)
        ip = self.headers.get("X-Forwarded-For", self.client_address[0]).split(",")[0].strip()
        try:
            raw = self._read()
            body = json.loads(raw.decode("utf-8") or "{}") if raw else {}
            if not isinstance(body, dict):
                raise ValueError("invalid_json")
            if path == "/login":
                result = flarum_login(str(body.get("identification") or body.get("username") or ""), str(body.get("password") or ""))
                return self._send(200, result)
            if path == "/event":
                ident = str(body.get("id") or "")
                kind = str(body.get("type") or "download")
                if not SAFE_ID.match(ident) or kind not in {"download", "install", "view"}:
                    raise ValueError("invalid_event")
                raw_item, _, _ = find_raw_listing(ident)
                if (not raw_item or raw_item.get("deleted")) and not find_mod(ident):
                    raise ValueError("market_mod_not_found")
                with LOCK:
                    entry = bump_stat(ident, kind)
                return self._send(200, {"ok": True, "id": ident, "stats": entry})
            user = self._need_user()
            if not user:
                return
            if path == "/page":
                ident = str(body.get("id") or "")
                if not SAFE_ID.match(ident):
                    raise ValueError("invalid_mod_id")
                with LOCK:
                    community = read_json(COMMUNITY, {"mods": []})
                    existing = next((item for item in community.get("mods") or [] if item.get("id") == ident), None)
                    if not existing:
                        if ident in official_ids() and user.get("isAdmin"):
                            existing = {"id": ident, "channel": "official"}
                            community.setdefault("mods", []).append(existing)
                        else:
                            raise ValueError("market_mod_not_found")
                    if not can_manage(user, existing) and not (user.get("isAdmin") and ident in official_ids()):
                        self._send(403, {"ok": False, "error": "forbidden"})
                        return
                    pages = read_json(PAGES, {})
                    page = pages.get(ident) or {}
                    if "intro" in body:
                        page["intro"] = clamp_text(body.get("intro"), MAX_INTRO)
                    if "introZh" in body:
                        page["introZh"] = clamp_text(body.get("introZh"), MAX_INTRO)
                    if "description" in body:
                        existing["description"] = clamp_text(body.get("description"), MAX_INTRO)
                    if "descriptionZh" in body:
                        existing["descriptionZh"] = clamp_text(body.get("descriptionZh"), MAX_INTRO)
                    if "readme" in body:
                        write_readme(ident, body.get("readme"))
                    page["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                    pages[ident] = page
                    write_json(PAGES, pages)
                    if page.get("intro"):
                        existing["intro"] = page["intro"]
                    if page.get("introZh"):
                        existing["introZh"] = page["introZh"]
                    existing["hasReadme"] = doc_path(ident).exists()
                    existing["updatedAt"] = page["updatedAt"]
                    mods = [item for item in community.get("mods") or [] if item.get("id") != ident]
                    mods.append(existing)
                    write_json(COMMUNITY, {"mods": mods})
                    catalog = merge_catalog()
                item = next((row for row in catalog["mods"] if row.get("id") == ident), existing)
                return self._send(200, {"ok": True, "mod": public_mod(item), "readme": read_readme(ident)})
            if path in ("/unlist", "/relist"):
                ident = str(body.get("id") or "")
                if not SAFE_ID.match(ident):
                    raise ValueError("invalid_mod_id")
                hide = path == "/unlist"
                with LOCK:
                    existing, source, community = find_raw_listing(ident)
                    if not existing:
                        raise ValueError("market_mod_not_found")
                    if not (user.get("isAdmin") or can_manage(user, existing)):
                        self._send(403, {"ok": False, "error": "forbidden"})
                        return
                    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                    overlay = next((item for item in community.get("mods") or [] if isinstance(item, dict) and str(item.get("id") or "") == ident), None)
                    if overlay is None:
                        overlay = {
                            "id": ident,
                            "channel": existing.get("channel") or ("official" if source == "seed" else "community"),
                            "authorId": existing.get("authorId") or user.get("id"),
                            "author": existing.get("author") or user.get("displayName") or user.get("username"),
                        }
                        community.setdefault("mods", []).append(overlay)
                    overlay["unlisted"] = hide
                    if not hide:
                        overlay["deleted"] = False
                    overlay["updatedAt"] = now
                    write_json(COMMUNITY, community)
                    merge_catalog()
                return self._send(200, {"ok": True, "mod": public_mod(overlay), "unlisted": hide})
            if path == "/delete":
                ident = str(body.get("id") or "")
                if not SAFE_ID.match(ident):
                    raise ValueError("invalid_mod_id")
                with LOCK:
                    existing, source, community = find_raw_listing(ident)
                    if not existing:
                        raise ValueError("market_mod_not_found")
                    if not (user.get("isAdmin") or can_manage(user, existing)):
                        self._send(403, {"ok": False, "error": "forbidden"})
                        return
                    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                    locked = ident in official_ids() or source == "seed"
                    kept = [item for item in community.get("mods") or [] if not (isinstance(item, dict) and str(item.get("id") or "") == ident)]
                    if locked:
                        kept.append({
                            "id": ident,
                            "channel": "official",
                            "deleted": True,
                            "unlisted": True,
                            "updatedAt": now,
                            "authorId": existing.get("authorId") or user.get("id"),
                        })
                    else:
                        for file_path in package_files(ident):
                            file_path.unlink(missing_ok=True)
                        for file_path in ICONS.glob(f"{ident}.*"):
                            file_path.unlink(missing_ok=True)
                        write_readme(ident, "")
                        pages = read_json(PAGES, {})
                        pages.pop(ident, None)
                        write_json(PAGES, pages)
                        stats = read_json(STATS, {})
                        stats.pop(ident, None)
                        write_json(STATS, stats)
                    write_json(COMMUNITY, {"mods": kept})
                    merge_catalog()
                return self._send(200, {"ok": True, "deleted": ident})
            if path == "/upload":
                if rate_limited(ip):
                    return self._send(429, {"ok": False, "error": "upload_rate_limited"})
                blob = base64.b64decode(body.get("data") or "", validate=False)
                if not blob:
                    raise ValueError("empty_package")
                if len(blob) > MAX_UPLOAD:
                    raise ValueError("echomod_too_large")
                manifest, files = inspect_package(blob)
                listing = listing_from_manifest(manifest, blob, files, {"author": user.get("displayName") or user.get("username")})
                ident = listing["id"]
                listing["authorId"] = user["id"]
                listing["authorUsername"] = user.get("username") or ""
                listing["unlisted"] = False
                with LOCK:
                    locked = official_ids()
                    if ident in locked and not user.get("isAdmin"):
                        raise ValueError("official_mod_locked")
                    community = read_json(COMMUNITY, {"mods": []})
                    existing = next((item for item in community.get("mods") or [] if item.get("id") == ident), None)
                    if existing and not can_manage(user, existing):
                        self._send(403, {"ok": False, "error": "forbidden"})
                        return
                    if existing and not existing.get("deleted") and compare_versions(listing["version"], str(existing.get("version") or "0")) <= 0:
                        raise ValueError("version_not_newer")
                    listing["deleted"] = False
                    if existing and not existing.get("deleted"):
                        listing["uploadedAt"] = existing.get("uploadedAt") or listing["uploadedAt"]
                        listing["downloads"] = int(existing.get("downloads") or 0)
                        listing["views"] = int(existing.get("views") or 0)
                        listing["authorId"] = existing.get("authorId") or user["id"]
                        listing["authorUsername"] = existing.get("authorUsername") or user.get("username") or ""
                        listing["author"] = existing.get("author") or listing.get("author")
                        if existing.get("intro") and not listing.get("intro"):
                            listing["intro"] = existing.get("intro")
                        if existing.get("introZh") and not listing.get("introZh"):
                            listing["introZh"] = existing.get("introZh")
                    readme_text = listing.pop("_readme", None)
                    if readme_text:
                        write_readme(ident, readme_text)
                    listing["hasReadme"] = doc_path(ident).exists()
                    PACKAGES.mkdir(parents=True, exist_ok=True)
                    ICONS.mkdir(parents=True, exist_ok=True)
                    package_path = PACKAGES / f"{ident}-{listing['version']}.echomod"
                    package_path.write_bytes(blob)
                    if existing and existing.get("file"):
                        old = ROOT / str(existing["file"])
                        if old != package_path and old.exists() and str(old).startswith(str(PACKAGES)):
                            old.unlink(missing_ok=True)
                    icon_name = str(manifest.get("icon") or "icon.svg").replace("\\", "/")
                    lower = {key.lower(): key for key in files}
                    icon_key = lower.get(icon_name.lower())
                    if icon_key:
                        ext = Path(icon_name).suffix.lower() or ".svg"
                        (ICONS / f"{ident}{ext}").write_bytes(files[icon_key])
                    mods = [item for item in community.get("mods") or [] if item.get("id") != ident]
                    mods.append(listing)
                    write_json(COMMUNITY, {"mods": mods})
                    catalog = merge_catalog()
                published = next((item for item in catalog["mods"] if item.get("id") == ident), listing)
                return self._send(200, {"ok": True, "mod": public_mod(published)})
            if path == "/reload":
                if not user.get("isAdmin"):
                    self._send(403, {"ok": False, "error": "forbidden"})
                    return
                with LOCK:
                    catalog = merge_catalog()
                return self._send(200, {"ok": True, "mods": len(catalog.get("mods") or [])})
            return self._send(404, {"ok": False, "error": "not_found"})
        except Exception as error:
            return self._send(400, {"ok": False, "error": str(error)})


def main() -> None:
    PACKAGES.mkdir(parents=True, exist_ok=True)
    ICONS.mkdir(parents=True, exist_ok=True)
    DOCS.mkdir(parents=True, exist_ok=True)
    (ROOT / "data").mkdir(parents=True, exist_ok=True)
    if not SEED.exists() and CATALOG.exists():
        write_json(SEED, read_json(CATALOG, {"mods": []}))
    with LOCK:
        merge_catalog()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Shinawase Mod Market API http://127.0.0.1:{PORT} root={ROOT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
