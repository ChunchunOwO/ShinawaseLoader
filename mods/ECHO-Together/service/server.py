#!/usr/bin/env python3
import json
import ipaddress
import mimetypes
import os
import re
import secrets
import shutil
import subprocess
import threading
import time
from urllib.parse import parse_qs, quote, urlparse
from urllib.request import Request as UrlRequest, urlopen
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


MEMBER_TTL_SECONDS = 60
ROOM_JOIN_TIMEOUT_SECONDS = 120
MEDIA_IDLE_CLEANUP_SECONDS = 60
PENDING_UPLOAD_TTL_SECONDS = 15 * 60
MAX_JSON_BYTES = 64 * 1024
MAX_MEDIA_BYTES = int(os.environ.get("ECHO_TOGETHER_MAX_MEDIA_BYTES", 2 * 1024 * 1024 * 1024))
MAX_STORAGE_BYTES = int(os.environ.get("ECHO_TOGETHER_MAX_STORAGE_BYTES", 12 * 1024 * 1024 * 1024))
ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
FFMPEG_BINARY = os.environ.get("ECHO_TOGETHER_FFMPEG") or shutil.which("ffmpeg") or "/usr/bin/ffmpeg"
OPUS_BITRATE = os.environ.get("ECHO_TOGETHER_OPUS_BITRATE", "128k")
PUBLIC_BASE_URL = os.environ.get("ECHO_TOGETHER_PUBLIC_BASE_URL", "").rstrip("/")
PLUGIN_PACKAGE_PATH = Path(os.environ.get("ECHO_TOGETHER_PLUGIN_PACKAGE", Path(__file__).with_name("echo.listen-together.echo")))


class TogetherState:
    def __init__(self, media_dir):
        self.media_dir = Path(media_dir)
        self.media_dir.mkdir(parents=True, exist_ok=True)
        self.rooms = {}
        self.match_waiters = {}
        self.lock = threading.RLock()
        self.ip_locations = {}

    def _member(self, name, client_ip=None, avatar=None):
        now = time.time()
        return {
            "id": secrets.token_urlsafe(9),
            "token": secrets.token_urlsafe(32),
            "name": clean_name(name),
            "avatar": clean_avatar(avatar),
            "ip": client_ip or "",
            "ipLocation": self.ip_locations.get(client_ip or "", "定位中"),
            "joinedAt": now,
            "lastSeen": now,
            "listeningStartedAt": None,
        }

    def _code(self):
        while True:
            code = "".join(secrets.choice(ROOM_CODE_CHARS) for _ in range(6))
            if code not in self.rooms:
                return code

    def create(self, name, public=False, max_members=2, client_ip=None, avatar=None):
        with self.lock:
            self.cleanup()
            if len(self.rooms) >= 500:
                raise ApiError(503, "room_capacity_reached")
            member = self._member(name, client_ip, avatar)
            room = {
                "code": self._code(),
                "public": bool(public),
                "maxMembers": max(2, min(int(safe_number(max_members, 2, 8)), 8)),
                "createdAt": time.time(),
                "updatedAt": time.time(),
                "revision": 0,
                "syncQuality": "opus",
                "members": {member["id"]: member},
                "controllerId": None,
                "track": None,
                "pending": None,
                "playback": {"state": "paused", "positionSeconds": 0.0, "updatedAtMs": now_ms()},
            }
            self.rooms[room["code"]] = room
            self._schedule_location(room["code"], member)
            return room, member

    def join(self, code, name, client_ip=None, avatar=None):
        with self.lock:
            self.cleanup()
            room = self.rooms.get(normalize_code(code))
            if not room:
                raise ApiError(404, "room_not_found")
            if len(room["members"]) >= room["maxMembers"]:
                raise ApiError(409, "room_full")
            member = self._member(name, client_ip, avatar)
            room["members"][member["id"]] = member
            self.touch(room)
            self._schedule_location(room["code"], member)
            return room, member

    def match(self, name, client_ip=None, avatar=None, match_token=None, max_members=2):
        with self.lock:
            self.cleanup()
            available = [
                room for room in self.rooms.values()
                if room["public"] and len(room["members"]) < room["maxMembers"]
            ]
            if available:
                room = min(available, key=lambda item: item["createdAt"])
                if match_token:
                    self.match_waiters.pop(str(match_token), None)
                return {"status": "matched", "room": room, "member": self.join(room["code"], name, client_ip, avatar)[1]}

            if match_token:
                waiter_token = str(match_token)
                waiter = self.match_waiters.get(str(waiter_token))
                if waiter and waiter.get("roomCode"):
                    room = self.rooms.get(waiter["roomCode"])
                    member = waiter.get("member")
                    self.match_waiters.pop(str(waiter_token), None)
                    if room and member:
                        return {"status": "matched", "room": room, "member": member}
                if waiter:
                    waiter["lastSeen"] = time.time()
                    return {"status": "waiting", "matchToken": str(waiter_token)}

            waiter_items = [
                (token, item) for token, item in self.match_waiters.items()
                if not item.get("roomCode")
            ]
            if waiter_items:
                token, waiter = min(waiter_items, key=lambda pair: pair[1]["createdAt"])
                room, first_member = self.create(
                    waiter["name"],
                    public=True,
                    max_members=waiter.get("maxMembers", max_members),
                    client_ip=waiter["clientIp"],
                    avatar=waiter["avatar"],
                )
                _, member = self.join(room["code"], name, client_ip, avatar)
                waiter["roomCode"] = room["code"]
                waiter["member"] = first_member
                waiter["lastSeen"] = time.time()
                return {"status": "matched", "room": room, "member": member}

            token = secrets.token_urlsafe(18)
            self.match_waiters[token] = {
                "name": clean_name(name),
                "clientIp": client_ip,
                "avatar": clean_avatar(avatar),
                "maxMembers": max(2, min(int(safe_number(max_members, 2, 8)), 8)),
                "createdAt": time.time(),
                "lastSeen": time.time(),
                "roomCode": None,
                "member": None,
            }
            return {"status": "waiting", "matchToken": token}

    def _schedule_location(self, code, member):
        ip = member.get("ip")
        local = local_ip_location(ip or "")
        if local != "未知地区":
            self.ip_locations[ip] = local
            member["ipLocation"] = local
            return
        if not ip or ip in self.ip_locations:
            if ip and ip not in self.ip_locations:
                self.ip_locations[ip] = local_ip_location(ip)
                member["ipLocation"] = self.ip_locations[ip]
            return
        threading.Thread(
            target=self._resolve_location,
            args=(code, member["id"], ip),
            name="echo-together-ip-location",
            daemon=True,
        ).start()

    def _resolve_location(self, code, member_id, ip):
        location = lookup_ip_location(ip)
        with self.lock:
            self.ip_locations[ip] = location
            room = self.rooms.get(code)
            member = room and room["members"].get(member_id)
            if member:
                member["ipLocation"] = location

    def authenticate(self, code, token):
        room = self.rooms.get(normalize_code(code))
        if not room:
            raise ApiError(404, "room_not_found")
        member = next((item for item in room["members"].values() if secrets.compare_digest(item["token"], token or "")), None)
        if not member:
            raise ApiError(401, "room_token_invalid")
        member["lastSeen"] = time.time()
        self.touch(room)
        return room, member

    def touch(self, room):
        room["updatedAt"] = time.time()

    def cleanup(self):
        now = time.time()
        for token, waiter in list(self.match_waiters.items()):
            if now - waiter.get("lastSeen", waiter.get("createdAt", now)) >= ROOM_JOIN_TIMEOUT_SECONDS:
                self.match_waiters.pop(token, None)
        for code, room in list(self.rooms.items()):
            pending = room.get("pending")
            if pending and now - pending.get("createdAt", now) > PENDING_UPLOAD_TTL_SECONDS:
                Path(str(pending["path"]) + ".part").unlink(missing_ok=True)
                room["pending"] = None
            track = room.get("track")
            if track and track.get("endedAtMs") and now_ms() - track["endedAtMs"] >= MEDIA_IDLE_CLEANUP_SECONDS * 1000:
                self.delete_track(room)
            for member_id, member in list(room["members"].items()):
                if now - member["lastSeen"] > MEMBER_TTL_SECONDS:
                    del room["members"][member_id]
            if not room["members"]:
                self.delete_room(code)

    def delete_track(self, room):
        track = room.get("track")
        if track and track.get("path"):
            Path(track["path"]).unlink(missing_ok=True)
            Path(str(track["path"]) + ".part").unlink(missing_ok=True)
        room["track"] = None
        room["controllerId"] = None
        room["playback"] = {"state": "paused", "positionSeconds": 0.0, "updatedAtMs": now_ms()}
        room["revision"] += 1

    def delete_room(self, code):
        room = self.rooms.pop(code, None)
        if not room:
            return
        for item in (room.get("track"), room.get("pending")):
            if item and item.get("path"):
                Path(item["path"]).unlink(missing_ok=True)
                Path(str(item["path"]) + ".part").unlink(missing_ok=True)

    def storage_bytes(self):
        return sum(path.stat().st_size for path in self.media_dir.glob("*") if path.is_file())

    def snapshot(self, room, member, base_url):
        now = time.time()
        playback = dict(room["playback"])
        controller = room["members"].get(room["controllerId"])
        track = public_track(room["track"], base_url, room["code"])
        pending = room.get("pending")
        return {
            "roomCode": room["code"],
            "public": room["public"],
            "maxMembers": room["maxMembers"],
            "syncQuality": room.get("syncQuality", "opus"),
            "clientId": member["id"],
            "controllerId": room["controllerId"],
            "controllerName": controller["name"] if controller else None,
            "revision": room["revision"],
            "serverTimeMs": now_ms(),
            "members": [
                {
                    "id": item["id"],
                    "name": item["name"],
                    "avatar": item.get("avatar", ""),
                    "ipLocation": item.get("ipLocation", "未知地区"),
                    "listeningSeconds": max(0, int(now - item["listeningStartedAt"])) if item.get("listeningStartedAt") else 0,
                    "joinedAt": int(item["joinedAt"] * 1000),
                }
                for item in sorted(room["members"].values(), key=lambda item: item["joinedAt"])
            ],
            "track": track,
            "upload": {
                "mediaId": pending["id"],
                "publisherId": pending["publisherId"],
                "title": pending["title"],
                "sizeBytes": pending["sizeBytes"],
                "quality": pending.get("quality", "opus"),
            } if pending else None,
            "playback": playback,
        }


class ApiError(Exception):
    def __init__(self, status, code):
        super().__init__(code)
        self.status = status
        self.code = code


def now_ms():
    return int(time.time() * 1000)


def clean_name(value):
    name = re.sub(r"\s+", " ", str(value or "")).strip()[:32]
    if not name:
        raise ApiError(400, "username_required")
    return name


def clean_avatar(value):
    avatar = str(value or "").strip()
    if not avatar or len(avatar) > 180_000:
        return ""
    if not re.fullmatch(r"data:image/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+", avatar):
        return ""
    return avatar


def clean_quality(value):
    return "direct" if str(value or "").strip().lower() == "direct" else "opus"


def opus_available():
    return bool(shutil.which(FFMPEG_BINARY) or Path(FFMPEG_BINARY).is_file())


def encode_opus(source_path, output_path):
    if not opus_available():
        raise ApiError(503, "opus_encoder_unavailable")
    result = subprocess.run(
        [
            FFMPEG_BINARY,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(source_path),
            "-vn",
            "-c:a",
            "libopus",
            "-b:a",
            OPUS_BITRATE,
            "-vbr",
            "on",
            "-application",
            "audio",
            "-f",
            "ogg",
            str(output_path),
        ],
        capture_output=True,
        timeout=180,
        check=False,
    )
    if result.returncode != 0 or not output_path.is_file() or output_path.stat().st_size <= 0:
        output_path.unlink(missing_ok=True)
        raise ApiError(422, "opus_encode_failed")


def local_ip_location(ip):
    try:
        address = ipaddress.ip_address(ip)
        return "本地网络" if address.is_private or address.is_loopback else "未知地区"
    except ValueError:
        return "未知地区"


def lookup_ip_location(ip):
    fallback = local_ip_location(ip)
    if fallback != "未知地区":
        return fallback
    try:
        request = UrlRequest(
            f"http://ip-api.com/json/{quote(ip)}?fields=status,country,regionName,city",
            headers={"User-Agent": "ECHO-Together/1.0"},
        )
        with urlopen(request, timeout=1.5) as response:
            payload = json.loads(response.read(4096).decode("utf-8", "replace"))
        if payload.get("status") == "success":
            return " / ".join(part for part in (payload.get("country"), payload.get("regionName"), payload.get("city")) if part)[:80] or "未知地区"
    except Exception:
        pass
    return "未知地区"


def normalize_code(value):
    return re.sub(r"[^A-Z0-9]", "", str(value or "").upper())[:6]


def safe_number(value, default=0.0, maximum=24 * 60 * 60):
    try:
        return max(0.0, min(float(value), maximum))
    except (TypeError, ValueError):
        return default


def public_track(track, base_url, code):
    if not track:
        return None
    public = {
        key: value for key, value in track.items()
        if key not in {"path", "accessToken", "publisherToken"}
    }
    public["metadata"] = {
        key: public.get(key) for key in ("sourceId", "title", "artist", "album", "albumArtist", "coverUrl", "fileName", "durationSeconds")
        if public.get(key) not in (None, "")
    }
    public["streamUrl"] = f"{base_url}/v1/rooms/{code}/media/{track['id']}/{quote(track.get('fileName') or 'audio', safe='')}?access={quote(track['accessToken'])}"
    return public


class TogetherHandler(BaseHTTPRequestHandler):
    state = None
    server_version = "EchoTogether/1.0"

    def log_message(self, fmt, *args):
        status = args[1] if len(args) > 1 else "-"
        print(f"{self.log_date_time_string()} {self.client_address[0]} {self.command} {urlparse(self.path).path} {status}", flush=True)

    def do_OPTIONS(self):
        self.send_response(204)
        self._common_headers()
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "content-type")
        self.end_headers()

    def do_HEAD(self):
        self._dispatch(head_only=True)

    def do_GET(self):
        self._dispatch()

    def do_POST(self):
        self._dispatch()

    def do_PUT(self):
        self._dispatch()

    def _dispatch(self, head_only=False):
        try:
            parsed = urlparse(self.path)
            path = parsed.path.rstrip("/") or "/"
            query = parse_qs(parsed.query)
            base_url = self._base_url()

            if self.command in {"GET", "HEAD"} and path == "/v1/health":
                return self._json(200, {"ok": True, "rooms": len(self.state.rooms), "serverTimeMs": now_ms()}, head_only)

            if self.command in {"GET", "HEAD"} and path == "/v1/plugin":
                return self._plugin_package(head_only)

            if self.command == "POST" and path == "/v1/rooms":
                body = self._json_body()
                room, member = self.state.create(body.get("name"), body.get("public", False), body.get("maxMembers", 2), self._client_ip(), body.get("avatar"))
                return self._session(room, member, base_url)

            if self.command == "POST" and path == "/v1/match":
                body = self._json_body()
                result = self.state.match(body.get("name"), self._client_ip(), body.get("avatar"), body.get("matchToken"), body.get("maxMembers", 2))
                if result["status"] == "waiting":
                    return self._json(200, {"matchWaiting": True, "matchToken": result["matchToken"], "retryAfterMs": 1200})
                room, member = result["room"], result["member"]
                return self._session(room, member, base_url)

            if self.command == "POST" and path == "/v1/rooms/join":
                body = self._json_body()
                room, member = self.state.join(body.get("code"), body.get("name"), self._client_ip(), body.get("avatar"))
                return self._session(room, member, base_url)

            media_match = re.fullmatch(r"/v1/rooms/([A-Z0-9]{6})/media/([A-Za-z0-9_-]+)(?:/[^/]+)?", path)
            if media_match and self.command in {"GET", "HEAD"}:
                return self._media(media_match.group(1), media_match.group(2), query.get("access", [""])[0], head_only)
            if media_match and self.command == "PUT":
                return self._upload(media_match.group(1), media_match.group(2), query.get("token", [""])[0])

            room_match = re.fullmatch(r"/v1/rooms/([A-Z0-9]{6})(?:/(leave|track|state|profile|quality))?", path)
            if room_match:
                code, action = room_match.groups()
                token = query.get("token", [""])[0]
                with self.state.lock:
                    self.state.cleanup()
                    room, member = self.state.authenticate(code, token)
                    if self.command == "GET" and not action:
                        return self._json(200, self.state.snapshot(room, member, base_url), head_only)
                    if self.command != "POST":
                        raise ApiError(405, "method_not_allowed")
                    if action == "leave":
                        del room["members"][member["id"]]
                        if not room["members"]:
                            self.state.delete_room(code)
                        return self._json(200, {"ok": True})
                    if action == "track":
                        return self._prepare_track(room, member, self._json_body(), base_url)
                    if action == "state":
                        return self._update_state(room, member, self._json_body(), base_url)
                    if action == "profile":
                        return self._update_profile(room, member, self._json_body(), base_url)
                    if action == "quality":
                        return self._update_quality(room, self._json_body(), base_url, member)

            raise ApiError(404, "not_found")
        except ApiError as error:
            self._json(error.status, {"error": error.code})
        except (BrokenPipeError, ConnectionResetError):
            return
        except Exception as error:
            print(f"request_error:{type(error).__name__}:{error}", flush=True)
            self._json(500, {"error": "internal_error"})

    def _session(self, room, member, base_url):
        payload = self.state.snapshot(room, member, base_url)
        payload["token"] = member["token"]
        self._json(200, payload)

    def _plugin_package(self, head_only):
        if not PLUGIN_PACKAGE_PATH.is_file():
            raise ApiError(404, "plugin_package_not_found")
        size = PLUGIN_PACKAGE_PATH.stat().st_size
        self.send_response(200)
        self._common_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Disposition", 'attachment; filename="ECHO-Together.echo"')
        self.send_header("Content-Length", str(size))
        self.end_headers()
        if not head_only:
            with PLUGIN_PACKAGE_PATH.open("rb") as source:
                shutil.copyfileobj(source, self.wfile)

    def _prepare_track(self, room, member, body, base_url):
        size = int(safe_number(body.get("sizeBytes"), maximum=MAX_MEDIA_BYTES + 1))
        if size <= 0 or size > MAX_MEDIA_BYTES:
            raise ApiError(413, "media_size_invalid")
        if self.state.storage_bytes() + size > MAX_STORAGE_BYTES:
            raise ApiError(507, "media_storage_full")
        quality = clean_quality(body.get("quality") or room.get("syncQuality"))
        if quality == "opus" and not opus_available():
            raise ApiError(503, "opus_encoder_unavailable")
        media_id = secrets.token_urlsafe(12)
        path = self.state.media_dir / media_id
        previous_pending = room.get("pending")
        if previous_pending:
            if previous_pending["publisherId"] != member["id"]:
                raise ApiError(409, "upload_in_progress")
            Path(str(previous_pending["path"]) + ".part").unlink(missing_ok=True)
            Path(str(previous_pending["path"]) + ".opus.part").unlink(missing_ok=True)
        room["pending"] = {
            "id": media_id,
            "path": str(path),
            "publisherId": member["id"],
            "publisherToken": member["token"],
            "accessToken": secrets.token_urlsafe(24),
            "sourceId": str(body.get("sourceId") or "")[:180],
            "title": str(body.get("title") or "Unknown track")[:180],
            "artist": str(body.get("artist") or "")[:180],
            "album": str(body.get("album") or "")[:180],
            "albumArtist": str(body.get("albumArtist") or "")[:180],
            "coverUrl": str(body.get("coverUrl") or "")[:4000],
            "durationSeconds": safe_number(body.get("durationSeconds")),
            "sizeBytes": size,
            "mimeType": str(body.get("mimeType") or "application/octet-stream")[:120],
            "fileName": Path(str(body.get("fileName") or "audio")).name[:180],
            "quality": quality,
            "initialState": "playing" if body.get("state") == "playing" else "paused",
            "initialPositionSeconds": safe_number(body.get("positionSeconds")),
            "createdAt": time.time(),
        }
        room["controllerId"] = member["id"]
        self.state.touch(room)
        return self._json(200, {
            "mediaId": media_id,
            "uploadUrl": f"{base_url}/v1/rooms/{room['code']}/media/{media_id}?token={quote(member['token'])}",
        })

    def _upload(self, code, media_id, token):
        length = self.headers.get("Content-Length")
        if not length or not length.isdigit():
            raise ApiError(411, "content_length_required")
        length = int(length)
        with self.state.lock:
            room, member = self.state.authenticate(code, token)
            pending = room.get("pending")
            if not pending or pending["id"] != media_id or pending["publisherId"] != member["id"]:
                raise ApiError(409, "upload_not_current")
            if length != pending["sizeBytes"]:
                raise ApiError(400, "media_size_mismatch")
            part_path = Path(str(pending["path"]) + ".part")

        remaining = length
        with part_path.open("wb") as output:
            while remaining:
                chunk = self.rfile.read(min(1024 * 1024, remaining))
                if not chunk:
                    raise ApiError(400, "media_upload_incomplete")
                output.write(chunk)
                remaining -= len(chunk)

        with self.state.lock:
            room, member = self.state.authenticate(code, token)
            pending = room.get("pending")
            if not pending or pending["id"] != media_id:
                part_path.unlink(missing_ok=True)
                raise ApiError(409, "upload_superseded")
            final_path = Path(pending["path"])
            if pending.get("quality") == "opus":
                encoded_path = Path(f"{final_path}.opus.part")
                encode_opus(part_path, encoded_path)
                part_path.unlink(missing_ok=True)
                encoded_path.replace(final_path)
                pending = dict(pending)
                pending["sizeBytes"] = final_path.stat().st_size
                pending["mimeType"] = "audio/ogg; codecs=opus"
                pending["fileName"] = f"{Path(pending['fileName']).stem}.opus"
            else:
                part_path.replace(final_path)
            previous = room.get("track")
            track = {key: value for key, value in pending.items() if not key.startswith("initial") and key != "publisherToken"}
            track["readyAtMs"] = now_ms()
            track["lastActivityAtMs"] = now_ms()
            track["endedAtMs"] = None
            room["track"] = track
            room["pending"] = None
            room["controllerId"] = member["id"]
            room["playback"] = {
                "state": pending["initialState"],
                "positionSeconds": pending["initialPositionSeconds"],
                "updatedAtMs": now_ms(),
            }
            for room_member in room["members"].values():
                room_member["listeningStartedAt"] = room_member.get("listeningStartedAt") or time.time()
            room["revision"] += 1
            self.state.touch(room)
            if previous and previous.get("path") != str(final_path):
                Path(previous["path"]).unlink(missing_ok=True)
        return self._json(200, {"ok": True, "mediaId": media_id})

    def _update_state(self, room, member, body, base_url):
        track = room.get("track")
        if not track or body.get("mediaId") != track["id"]:
            raise ApiError(409, "playback_track_changed")
        position = safe_number(body.get("positionSeconds"))
        requested_state = body.get("state")
        duration = safe_number(track.get("durationSeconds"))
        ended = requested_state == "ended" or (requested_state == "playing" and duration > 0 and position >= max(0, duration - 0.5))
        state = "ended" if ended else ("playing" if requested_state == "playing" else "paused")
        room["controllerId"] = member["id"]
        room["playback"] = {
            "state": state,
            "positionSeconds": position,
            "updatedAtMs": now_ms(),
        }
        activity_ms = now_ms()
        track["lastActivityAtMs"] = activity_ms
        track["endedAtMs"] = (track.get("endedAtMs") or activity_ms) if ended else None
        room["revision"] += 1
        self.state.touch(room)
        return self._json(200, self.state.snapshot(room, member, base_url))

    def _update_profile(self, room, member, body, base_url):
        if "name" in body:
            member["name"] = clean_name(body.get("name"))
        if "avatar" in body:
            member["avatar"] = clean_avatar(body.get("avatar"))
        self.state.touch(room)
        return self._json(200, self.state.snapshot(room, member, base_url))

    def _update_quality(self, room, body, base_url, member):
        quality = clean_quality(body.get("quality"))
        if quality == "opus" and not opus_available():
            raise ApiError(503, "opus_encoder_unavailable")
        room["syncQuality"] = quality
        room["revision"] += 1
        self.state.touch(room)
        return self._json(200, self.state.snapshot(room, member, base_url))

    def _media(self, code, media_id, access, head_only):
        with self.state.lock:
            self.state.cleanup()
            room = self.state.rooms.get(code)
            track = room.get("track") if room else None
            if not track or track["id"] != media_id or not secrets.compare_digest(track["accessToken"], access or ""):
                raise ApiError(404, "media_not_found")
            path = Path(track["path"])
            if not path.is_file():
                raise ApiError(404, "media_not_found")
            size = path.stat().st_size
            mime = track.get("mimeType") or mimetypes.guess_type(track.get("fileName") or "")[0] or "application/octet-stream"
            file_name = track.get("fileName") or "audio"

        start, end, status = 0, size - 1, 200
        range_header = self.headers.get("Range")
        if range_header:
            match = re.fullmatch(r"bytes=(\d*)-(\d*)", range_header.strip())
            if not match:
                raise ApiError(416, "range_invalid")
            if match.group(1):
                start = int(match.group(1))
                end = int(match.group(2)) if match.group(2) else size - 1
            elif match.group(2):
                suffix = int(match.group(2))
                start = max(0, size - suffix)
            if start >= size or end < start:
                raise ApiError(416, "range_invalid")
            end = min(end, size - 1)
            status = 206

        length = end - start + 1
        self.send_response(status)
        self._common_headers()
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "private, no-store")
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(length))
        self.send_header("Content-Disposition", f"inline; filename*=UTF-8''{quote(file_name)}")
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        if head_only:
            return
        with path.open("rb") as source:
            source.seek(start)
            remaining = length
            while remaining:
                chunk = source.read(min(256 * 1024, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)

    def _json_body(self):
        length = self.headers.get("Content-Length", "0")
        if not length.isdigit() or int(length) > MAX_JSON_BYTES:
            raise ApiError(413, "json_body_too_large")
        try:
            value = json.loads(self.rfile.read(int(length)) or b"{}")
        except json.JSONDecodeError:
            raise ApiError(400, "json_invalid")
        if not isinstance(value, dict):
            raise ApiError(400, "json_object_required")
        return value

    def _json(self, status, payload, head_only=False):
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
        self.send_response(status)
        self._common_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if not head_only:
            self.wfile.write(body)

    def _common_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("X-Content-Type-Options", "nosniff")

    def _base_url(self):
        if PUBLIC_BASE_URL:
            return PUBLIC_BASE_URL
        proto = self.headers.get("X-Forwarded-Proto", "http").split(",", 1)[0].strip()
        host = self.headers.get("Host", f"127.0.0.1:{self.server.server_port}")
        return f"{proto}://{host}"

    def _client_ip(self):
        forwarded = self.headers.get("X-Forwarded-For", "").split(",", 1)[0].strip()
        return forwarded or self.headers.get("X-Real-IP", "").strip() or self.client_address[0]


def make_server(host="0.0.0.0", port=8791, media_dir=None):
    state = TogetherState(media_dir or os.environ.get("ECHO_TOGETHER_MEDIA_DIR", "./media"))
    handler = type("ConfiguredTogetherHandler", (TogetherHandler,), {"state": state})
    server = ThreadingHTTPServer((host, int(port)), handler)

    def cleanup_loop():
        while True:
            time.sleep(30)
            with state.lock:
                state.cleanup()

    threading.Thread(target=cleanup_loop, name="echo-together-cleanup", daemon=True).start()
    return server


if __name__ == "__main__":
    bind = os.environ.get("ECHO_TOGETHER_BIND", "0.0.0.0")
    port = int(os.environ.get("ECHO_TOGETHER_PORT", "8791"))
    server = make_server(bind, port)
    print(f"echo-together listening on {bind}:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
