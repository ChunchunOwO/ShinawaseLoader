from __future__ import annotations

import argparse
import hashlib
import json
import os
import secrets
import shutil
import subprocess
import struct
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path
from tkinter import Button, Label, StringVar, Tk, filedialog, messagebox


PLUGIN_ID = "echo.listen-together"
_BUNDLE_ROOT = getattr(sys, "_MEIPASS", None)
ROOT = Path(_BUNDLE_ROOT) if _BUNDLE_ROOT else Path(__file__).resolve().parent
PLUGIN_SOURCE = ROOT / PLUGIN_ID
APP_DATA = Path(os.environ.get("APPDATA", str(Path.home() / "AppData/Roaming")))
CONFIG_FILE = APP_DATA / "ECHO Together" / "launcher.json"
ECHO_EXE: Path | None = None
DEFAULT_ECHO_ROOT = Path(os.environ.get("ECHO_ROOT", r"D:\SteamLibrary\steamapps\common\ECHO"))
ECHO_EXE_NAMES = ("ECHO.exe", "ECHO Steam.exe", "ECHO.modded.exe", "ECHO NEXT.exe")
USER_DATA = APP_DATA / "ECHO Steam"
MOD_CONFIG_FILE = USER_DATA / "echo-together.json"
PLUGIN_DIR = USER_DATA / "plugins"
INSTALLED_PLUGIN = PLUGIN_DIR / PLUGIN_ID
STATE_FILE = PLUGIN_DIR / "plugin-state.json"
BACKUP_DIR = USER_DATA / "echo-together-backups"
RELAY_URL = "http://127.0.0.1:47891"
CLIENT_LOADER_MARKER = "echo-together-loader.json"
CLIENT_MOD_MARKER = "ECHO_TOGETHER_RELAY_V3"
CLIENT_RENDERER_MARKER = "ECHO_TOGETHER_RENDERER_V6"
MAIN_ENTRY = "out/main/index.js"
SOURCE_COMPAT_MARKER = "ECHO_TOGETHER_ECHOSTEAM_SOURCE_V1"
SOURCE_CONFIG_FILE = ROOT / "build" / "source-mod.json"
SOURCE_BACKUP_DIR = ROOT / "build" / "source-mod-backup"


def read_json(path: Path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, OSError, json.JSONDecodeError):
        return fallback


def write_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temp, path)


def _exe_from_dir(directory: Path) -> Path | None:
    for name in ECHO_EXE_NAMES:
        candidate = directory / name
        if candidate.is_file():
            return candidate
    return None


def _is_echo_exe(path: Path) -> bool:
    return path.is_file() and path.name.lower() in {name.lower() for name in ECHO_EXE_NAMES}


def discover_echo_exe() -> Path | None:
    env_exe = os.environ.get("ECHO_EXE")
    if env_exe:
        path = Path(env_exe).expanduser()
        if path.is_file():
            return path.resolve()
        if path.is_dir():
            found = _exe_from_dir(path)
            if found:
                return found.resolve()
    configured = read_json(CONFIG_FILE, {})
    configured_path = configured.get("echoExe") if isinstance(configured, dict) else None
    candidates = [Path(configured_path)] if configured_path else []
    candidates.append(DEFAULT_ECHO_ROOT / "ECHO.exe")
    candidates.append(DEFAULT_ECHO_ROOT)
    candidates.extend(
        Path(root) / "ECHO" / "ECHO.exe"
        for root in (
            os.environ.get("PROGRAMFILES", r"C:\Program Files"),
            Path(os.environ.get("LOCALAPPDATA", str(APP_DATA.parent))) / "Programs",
            os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)"),
        )
    )
    seen = set()
    for candidate in candidates:
        candidate = Path(candidate).expanduser()
        key = str(candidate).lower()
        if key in seen:
            continue
        seen.add(key)
        if candidate.is_dir():
            found = _exe_from_dir(candidate)
            if found:
                return found.resolve()
            continue
        if _is_echo_exe(candidate):
            return candidate.resolve()
    return None


def selected_echo_exe() -> Path | None:
    global ECHO_EXE
    if ECHO_EXE and ECHO_EXE.is_file():
        return ECHO_EXE
    ECHO_EXE = discover_echo_exe()
    return ECHO_EXE


def set_echo_directory(directory: Path):
    directory = Path(directory).expanduser()
    if directory.is_dir():
        candidate = _exe_from_dir(directory)
        if not candidate:
            candidate = directory / "ECHO.exe"
    else:
        candidate = directory
    if not _is_echo_exe(candidate):
        raise FileNotFoundError(f"ECHO.exe not found in: {directory}")
    candidate = candidate.resolve()
    write_json(CONFIG_FILE, {"echoExe": str(candidate)})
    global ECHO_EXE
    ECHO_EXE = candidate
    return candidate


def require_echo_exe() -> Path:
    path = selected_echo_exe()
    if not path:
        raise FileNotFoundError("ECHO was not found. Select its install folder first, or set ECHO_ROOT / ECHO_EXE.")
    return path


def client_paths(echo_exe: Path):
    resources = echo_exe.parent / "resources"
    return resources, resources / "app.asar", resources / "app.echo-together-original.asar"


def discover_source_root(configured: str | None = None) -> Path | None:
    candidates = []
    if configured:
        candidates.append(Path(configured).expanduser())
    saved = read_json(CONFIG_FILE, {})
    if isinstance(saved, dict) and saved.get("sourceRoot"):
        candidates.append(Path(str(saved["sourceRoot"])).expanduser())
    candidates.extend([ROOT.parent, Path.cwd()])
    seen = set()
    for candidate in candidates:
        try:
            candidate = candidate.resolve()
        except OSError:
            continue
        key = str(candidate).lower()
        if key in seen:
            continue
        seen.add(key)
        if (candidate / "package.json").is_file() and (candidate / "src").is_dir():
            return candidate
    return None


def source_paths(source_root: Path):
    output = source_root / "out"
    main = output / "main" / "index.js"
    renderers = sorted((output / "renderer" / "assets").glob("App-*.js"), key=lambda path: path.stat().st_mtime, reverse=True)
    if not main.is_file():
        raise FileNotFoundError(f"ECHO source build not found: {main}. Run npm run build first.")
    if not renderers:
        raise FileNotFoundError(f"ECHO renderer App bundle not found under: {output / 'renderer' / 'assets'}")
    return main, renderers[0]


def source_mod_status(source_root: Path | None):
    if not source_root:
        return "ECHO source not found"
    try:
        main, renderer = source_paths(source_root)
    except FileNotFoundError:
        return "ECHO source build inactive"
    if SOURCE_COMPAT_MARKER.encode("ascii") in main.read_bytes() and SOURCE_COMPAT_MARKER.encode("ascii") in renderer.read_bytes():
        return "source client mod active"
    return "source client mod inactive"


def atomic_write_bytes(path: Path, data: bytes):
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temporary.write_bytes(data)
    os.replace(temporary, path)


def install_source_mod(source_root: Path):
    main_path, renderer_path = source_paths(source_root)
    marker = SOURCE_COMPAT_MARKER.encode("ascii")
    current_main, current_renderer = main_path.read_bytes(), renderer_path.read_bytes()
    if marker in current_main and marker in current_renderer:
        return
    SOURCE_BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    backup_main = SOURCE_BACKUP_DIR / "main-index.js"
    backup_renderer = SOURCE_BACKUP_DIR / renderer_path.name
    backup_main.write_bytes(current_main)
    backup_renderer.write_bytes(current_renderer)
    atomic_write_bytes(main_path, patched_main_source(current_main))
    atomic_write_bytes(renderer_path, patched_renderer_source(current_renderer))
    write_json(SOURCE_CONFIG_FILE, {"sourceRoot": str(source_root), "main": str(main_path), "renderer": str(renderer_path)})


def uninstall_source_mod(source_root: Path):
    main_path, renderer_path = source_paths(source_root)
    backup_main = SOURCE_BACKUP_DIR / "main-index.js"
    backup_renderer = SOURCE_BACKUP_DIR / renderer_path.name
    if not backup_main.is_file() or not backup_renderer.is_file():
        raise FileNotFoundError(f"ECHO Together source backup not found: {SOURCE_BACKUP_DIR}")
    atomic_write_bytes(main_path, backup_main.read_bytes())
    atomic_write_bytes(renderer_path, backup_renderer.read_bytes())
    SOURCE_CONFIG_FILE.unlink(missing_ok=True)


def source_electron_exe(source_root: Path) -> Path:
    configured = os.environ.get("ECHO_ELECTRON_EXE")
    candidates = [Path(configured)] if configured else []
    candidates.append(source_root / "node_modules" / "electron" / "dist" / "electron.exe")
    for candidate in candidates:
        if candidate and candidate.is_file():
            return candidate.resolve()
    raise FileNotFoundError("Electron executable not found. Set ECHO_ELECTRON_EXE or install Electron dependencies.")


def start_source(source_root: Path):
    main_path, _renderer_path = source_paths(source_root)
    electron = source_electron_exe(source_root)
    subprocess.Popen([str(electron), str(main_path)], cwd=source_root)


def read_asar_header(path: Path):
    with path.open("rb") as source:
        size_data = source.read(8)
        if len(size_data) != 8:
            raise ValueError("asar header is truncated")
        header_size = struct.unpack("<I", size_data[4:])[0]
        header_data = source.read(header_size)
    if len(header_data) != header_size:
        raise ValueError("asar header is truncated")
    payload_size = struct.unpack("<I", header_data[:4])[0]
    json_length = struct.unpack("<I", header_data[4:8])[0]
    header = json.loads(header_data[8:8 + json_length].decode("utf-8"))
    return header, 8 + header_size


def iter_asar_files(node, prefix=""):
    for name, child in (node.get("files") or {}).items():
        path = f"{prefix}/{name}" if prefix else name
        if child.get("files") is not None:
            yield from iter_asar_files(child, path)
        elif not child.get("unpacked") and "offset" in child:
            yield path, child


def read_asar_file(path: Path, filename: str) -> bytes:
    header, data_start = read_asar_header(path)
    node = next((item for item_path, item in iter_asar_files(header) if item_path == filename), None)
    if not node:
        raise FileNotFoundError(f"asar file not found: {filename}")
    with path.open("rb") as source:
        source.seek(data_start + int(node["offset"]))
        return source.read(int(node["size"]))


def integrity_for(data: bytes, block_size=4 * 1024 * 1024):
    blocks = [hashlib.sha256(data[index:index + block_size]).hexdigest() for index in range(0, len(data), block_size)]
    return {"algorithm": "SHA256", "hash": hashlib.sha256(data).hexdigest(), "blockSize": block_size, "blocks": blocks}


def relay_injection():
    return r'''const echoTogetherRelayPort = 47891;
const echoTogetherRelayBodyLimit = 64 * 1024;
const echoTogetherRelayMediaLimit = 2 * 1024 * 1024 * 1024;
const echoTogetherRelayTypes = new Map([['.aac', 'audio/aac'], ['.flac', 'audio/flac'], ['.m4a', 'audio/mp4'], ['.mp3', 'audio/mpeg'], ['.ogg', 'audio/ogg'], ['.opus', 'audio/ogg'], ['.wav', 'audio/wav'], ['.wma', 'audio/x-ms-wma']]);
let echoTogetherRelayUploadProgress = { active: false, loaded: 0, total: 0, stage: 'idle', quality: 'opus' };
const echoTogetherRelaySettingsPath = () => join(app.getPath('userData'), 'echo-together.json');
const echoTogetherRelaySettings = () => { try { return JSON.parse(readFileSync(echoTogetherRelaySettingsPath(), 'utf8')); } catch { return {}; } };
const echoTogetherRelayJson = (response2, status2, value2) => { const body2 = Buffer.from(JSON.stringify(value2)); response2.writeHead(status2, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Content-Type': 'application/json', 'Content-Length': body2.length, 'Cache-Control': 'no-store' }); response2.end(body2); };
const echoTogetherRelayBody = (request2) => new Promise((resolve2, reject2) => { const chunks2 = []; let size2 = 0; request2.on('data', (chunk2) => { size2 += chunk2.length; if (size2 > echoTogetherRelayBodyLimit) { reject2(new Error('request_too_large')); request2.destroy(); return; } chunks2.push(chunk2); }); request2.on('end', () => { try { resolve2(JSON.parse(Buffer.concat(chunks2).toString('utf8') || '{}')); } catch { reject2(new Error('json_invalid')); } }); request2.on('error', reject2); });
const echoTogetherRelayFinite = (value2) => Number.isFinite(Number(value2)) ? Math.max(0, Number(value2)) : 0;
const echoTogetherRelayRequest = async (url2, options2) => { const response2 = await fetch(url2, options2); const body2 = await response2.text(); if (!response2.ok) throw new Error(`remote_http_${response2.status}:${body2.slice(0, 180)}`); try { return JSON.parse(body2); } catch { throw new Error('remote_json_invalid'); } };
const echoTogetherRelayStatus = () => { const status2 = getAudioSession().getStatus(); return { state: status2.state, currentTrackId: status2.currentTrackId, currentFilePath: status2.currentFilePath, positionSeconds: status2.positionSeconds, durationSeconds: status2.durationSeconds, currentTrackTitle: status2.currentTrackTitle, currentTrackArtist: status2.currentTrackArtist, currentTrackAlbum: status2.currentTrackAlbum, currentTrackAlbumArtist: status2.currentTrackAlbumArtist, currentTrackCoverUrl: status2.currentTrackCoverUrl }; };
const echoTogetherRelayControl = async (payload2) => { const action2 = String(payload2.action || ''); if (action2 === 'play') await getAudioSession().play(); else if (action2 === 'pause') await getAudioSession().pause(); else if (action2 === 'stop') getAudioSession().stop(); else if (action2 === 'seek') await getAudioSession().seek(echoTogetherRelayFinite(payload2.positionSeconds)); else if (action2 === 'load') { const filePath2 = String(payload2.filePath || ''); if (!/^https?:\/\//iu.test(filePath2) && !existsSync(filePath2)) throw new Error('audio_source_invalid'); await getAudioSession().playLocalFile({ filePath: filePath2, trackId: String(payload2.trackId || filePath2).slice(0, 240), mimeType: String(payload2.mimeType || ''), metadata: { sourceId: String(payload2.sourceId || '').slice(0, 180), title: String(payload2.title || '').slice(0, 180), artist: String(payload2.artist || '').slice(0, 180), album: String(payload2.album || '').slice(0, 180), albumArtist: String(payload2.albumArtist || '').slice(0, 180), coverUrl: String(payload2.coverUrl || '').slice(0, 4000), fileName: String(payload2.fileName || '').slice(0, 180), durationSeconds: echoTogetherRelayFinite(payload2.durationSeconds) }, startSeconds: echoTogetherRelayFinite(payload2.positionSeconds) }); if (payload2.state !== 'playing') await getAudioSession().pause(); } else throw new Error('control_action_invalid'); return echoTogetherRelayStatus(); };
const echoTogetherRelayPublish = async (payload2) => { const source2 = resolve(String(payload2.filePath || '')); const extension2 = extname(source2).toLowerCase(); const info2 = statSync(source2); if (!echoTogetherRelayTypes.has(extension2) || !info2.isFile() || info2.size <= 0 || info2.size > echoTogetherRelayMediaLimit) throw new Error('audio_file_invalid'); const server2 = String(payload2.serverUrl || '').replace(/\/+$/u, ''); if (!server2.startsWith('https://')) throw new Error('https_server_required'); const code2 = String(payload2.roomCode || '').toUpperCase().replace(/[^A-Z0-9]/gu, '').slice(0, 6); const roomToken2 = String(payload2.roomToken || ''); if (code2.length !== 6 || !roomToken2) throw new Error('room_session_invalid'); const quality2 = payload2.quality === 'direct' ? 'direct' : 'opus'; const metadata2 = { sourceId: String(payload2.sourceId || '').slice(0, 180), title: String(payload2.title || basename(source2, extension2)).slice(0, 180), artist: String(payload2.artist || '').slice(0, 180), album: String(payload2.album || '').slice(0, 180), albumArtist: String(payload2.albumArtist || '').slice(0, 180), coverUrl: String(payload2.coverUrl || '').slice(0, 4000), durationSeconds: echoTogetherRelayFinite(payload2.durationSeconds), sizeBytes: info2.size, mimeType: echoTogetherRelayTypes.get(extension2) || 'application/octet-stream', fileName: basename(source2).slice(0, 180), quality: quality2, state: payload2.state === 'playing' ? 'playing' : 'paused', positionSeconds: echoTogetherRelayFinite(payload2.positionSeconds) }; echoTogetherRelayUploadProgress = { active: true, loaded: 0, total: info2.size, stage: 'preparing', quality: quality2 }; try { const prepared2 = await echoTogetherRelayRequest(`${server2}/v1/rooms/${encodeURIComponent(code2)}/track?token=${encodeURIComponent(roomToken2)}`, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(metadata2) }); const stream2 = createReadStream(source2); let loaded2 = 0; stream2.on('data', (chunk2) => { loaded2 += chunk2.length; echoTogetherRelayUploadProgress = { active: true, loaded: loaded2, total: info2.size, stage: 'uploading', quality: quality2 }; }); const upload2 = await fetch(prepared2.uploadUrl, { method: 'PUT', headers: { 'Content-Length': String(info2.size), 'Content-Type': 'application/octet-stream' }, body: stream2, duplex: 'half' }); if (!upload2.ok) throw new Error(`media_upload_http_${upload2.status}`); echoTogetherRelayUploadProgress = { active: false, loaded: info2.size, total: info2.size, stage: 'complete', quality: quality2 }; return { ok: true, mediaId: prepared2.mediaId, title: metadata2.title, quality: quality2 }; } catch (error2) { echoTogetherRelayUploadProgress = { active: false, loaded: 0, total: info2.size, stage: 'error', quality: quality2 }; throw error2; } };
const echoTogetherRelayServer = createServer(async (request2, response2) => { if (request2.method === 'OPTIONS') { response2.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' }); response2.end(); return; } const path2 = new URL(request2.url || '/', `http://127.0.0.1:${echoTogetherRelayPort}`).pathname; try { if (request2.method === 'GET' && path2 === '/v1/together/status') return echoTogetherRelayJson(response2, 200, { ok: true, ...echoTogetherRelayStatus() }); if (request2.method === 'GET' && path2 === '/v1/together/config') return echoTogetherRelayJson(response2, 200, { ok: true, ...echoTogetherRelaySettings(), relayPort: echoTogetherRelayPort }); if (request2.method === 'GET' && path2 === '/v1/together/upload-progress') return echoTogetherRelayJson(response2, 200, { ok: true, ...echoTogetherRelayUploadProgress }); if (request2.method === 'POST' && path2 === '/v1/together/control') return echoTogetherRelayJson(response2, 200, { ok: true, ...(await echoTogetherRelayControl(await echoTogetherRelayBody(request2))) }); if (request2.method === 'POST' && path2 === '/v1/together/publish') return echoTogetherRelayJson(response2, 200, await echoTogetherRelayPublish(await echoTogetherRelayBody(request2))); return echoTogetherRelayJson(response2, 404, { error: 'not_found' }); } catch (error2) { echoTogetherRelayJson(response2, 400, { error: String(error2?.message || error2) }); } });
echoTogetherRelayServer.on('error', (error2) => console.warn('[ECHO Together] relay failed', error2));
echoTogetherRelayServer.listen(echoTogetherRelayPort, '127.0.0.1');
app.once('will-quit', () => echoTogetherRelayServer.close());
// ECHO_TOGETHER_RELAY_V3 ECHO_TOGETHER_ECHOSTEAM_SOURCE_V1
'''


def renderer_injection():
    return r''';(()=>{if(window.__echoTogetherInjected)return;window.__echoTogetherInjected=true;
const echoTogetherLocal='http://127.0.0.1:47891';
const echoTogetherServers=['https://echo.shiinasuki.com/echo-together','https://47-243-198-176.sslip.io'];
const echoTogetherStorage='echo-together-session-v1';
const echoTogetherLoad=()=>{try{return JSON.parse(localStorage.getItem(echoTogetherStorage)||'{}')}catch{return{}}};
const echoTogetherServerHost=value=>String(value||'').trim().replace(/\/+$/u,'').replace(/\/v1$/u,'');
const echoTogetherSyncInterval=value=>Math.max(100,Math.min(5000,Math.round(Number(value)||250)));
const echoTogetherRoomSize=value=>Math.max(2,Math.min(8,Math.round(Number(value)||2)));
const echoTogetherDriftThreshold=()=>Math.max(.45,echoTogetherSyncInterval(echoTogetherState.syncIntervalMs)/1000*3);
let echoTogetherState=echoTogetherLoad(),echoTogetherSnapshot=null,echoTogetherBusy=false,echoTogetherSyncing=false,echoTogetherApplyingUntil=0,echoTogetherLastLocalSource='',echoTogetherLastLocalSample=null,echoTogetherLastPublish=0,echoTogetherPublishBusy=false,echoTogetherSyncTimer=null;
let echoTogetherLastLatency=null,echoTogetherMatching=false,echoTogetherMatchStart=0,echoTogetherMatchTimer=null,echoTogetherUploadTimer=null;
echoTogetherState.serverUrl=echoTogetherServerHost(echoTogetherState.serverUrl||echoTogetherServers[0]);
echoTogetherState.syncIntervalMs=echoTogetherSyncInterval(echoTogetherState.syncIntervalMs);
echoTogetherState.maxMembers=echoTogetherRoomSize(echoTogetherState.maxMembers);
echoTogetherState.opusEnabled=echoTogetherState.opusEnabled!==false;
echoTogetherState.publishedRoomCode=String(echoTogetherState.publishedRoomCode||'');
echoTogetherState.publishedMediaId=String(echoTogetherState.publishedMediaId||'');
echoTogetherState.publishedLocalPath=String(echoTogetherState.publishedLocalPath||'');
echoTogetherState.publishedSourceId=String(echoTogetherState.publishedSourceId||'');
let echoTogetherPublishedRoomCode=echoTogetherState.publishedRoomCode,echoTogetherPublishedMediaId=echoTogetherState.publishedMediaId,echoTogetherPublishedLocalPath=echoTogetherState.publishedLocalPath,echoTogetherPublishedSourceId=echoTogetherState.publishedSourceId;
let echoTogetherCurrentTab='room';
const echoTogetherSave=()=>localStorage.setItem(echoTogetherStorage,JSON.stringify(echoTogetherState));
const echoTogetherRememberPublished=(path,sourceId,id)=>{echoTogetherPublishedRoomCode=echoTogetherState.roomCode||'';echoTogetherPublishedMediaId=String(id||'');echoTogetherPublishedLocalPath=String(path||'');echoTogetherPublishedSourceId=String(sourceId||'');echoTogetherState.publishedRoomCode=echoTogetherPublishedRoomCode;echoTogetherState.publishedMediaId=echoTogetherPublishedMediaId;echoTogetherState.publishedLocalPath=echoTogetherPublishedLocalPath;echoTogetherState.publishedSourceId=echoTogetherPublishedSourceId;echoTogetherSave();};
const echoTogetherClearPublished=()=>{echoTogetherPublishedRoomCode='';echoTogetherPublishedMediaId='';echoTogetherPublishedLocalPath='';echoTogetherPublishedSourceId='';echoTogetherState.publishedRoomCode='';echoTogetherState.publishedMediaId='';echoTogetherState.publishedLocalPath='';echoTogetherState.publishedSourceId='';};
const echoTogetherSource=local=>JSON.stringify([String(local?.currentFilePath||''),String(local?.currentTrackId||'')]);
const echoTogetherIsPublishedLocal=(value,path,sourceId)=>Boolean(value?.track&&!/^https?:\/\//iu.test(String(path||''))&&((echoTogetherPublishedRoomCode===echoTogetherState.roomCode&&echoTogetherPublishedMediaId===String(value.track.id)&&String(path||'')===echoTogetherPublishedLocalPath&&(!echoTogetherPublishedSourceId||String(sourceId||'')===echoTogetherPublishedSourceId))||(sourceId&&String(sourceId)===String(value.track.sourceId||value.track.metadata?.sourceId||''))));
const echoTogetherResetSync=()=>{echoTogetherLastLocalSource='';echoTogetherLastLocalSample=null;echoTogetherLastPublish=0;echoTogetherApplyingUntil=0;};
const echoTogetherName=value=>String(value||'').replace(/\s+/gu,' ').trim().slice(0,32);
const echoTogetherId=id=>`echo-together:${id}`;
const echoTogetherEl=id=>document.getElementById(id);
const echoTogetherJson=async(response)=>{const value=await response.json();if(!response.ok||value.error)throw new Error(value.error||`http_${response.status}`);return value};
const echoTogetherLocalApi=(path,options={})=>fetch(echoTogetherLocal+path,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})},body:options.body===undefined?undefined:JSON.stringify(options.body)}).then(echoTogetherJson);
const echoTogetherRenderUploadProgress=value=>{const box=echoTogetherEl('echo-together-upload-progress'),fill=echoTogetherEl('echo-together-upload-fill'),text=echoTogetherEl('echo-together-upload-text');if(!box||!fill||!text)return;const active=Boolean(value?.active)||echoTogetherPublishBusy;if(!active&&value?.stage!=='complete'){box.style.display='none';return}box.style.display='block';const total=Number(value?.total)||0,loaded=Math.max(0,Number(value?.loaded)||0),percent=total>0?Math.min(100,loaded/total*100):0;fill.style.width=(value?.stage==='preparing'?'12':percent)+'%';text.textContent=value?.stage==='preparing'?'正在准备上传…':value?.stage==='complete'?'上传完成':`${Math.round(percent)}% · ${value?.quality==='opus'?'Opus':'原始格式'}`;};
const echoTogetherStartUploadProgress=()=>{if(echoTogetherUploadTimer)clearInterval(echoTogetherUploadTimer);echoTogetherRenderUploadProgress({active:true,stage:'preparing'});echoTogetherUploadTimer=setInterval(async()=>{try{const value=await echoTogetherLocalApi('/v1/together/upload-progress');echoTogetherRenderUploadProgress(value);if(!value.active&&value.stage!=='complete'){clearInterval(echoTogetherUploadTimer);echoTogetherUploadTimer=null;}}catch{}},150);};
const echoTogetherStopUploadProgress=()=>{if(echoTogetherUploadTimer){clearInterval(echoTogetherUploadTimer);echoTogetherUploadTimer=null;}setTimeout(()=>{if(!echoTogetherPublishBusy)echoTogetherRenderUploadProgress({active:false,stage:'idle'});},900);};
const echoTogetherRemote=async(path,options={})=>{
  const base=echoTogetherState.serverUrl||echoTogetherServers[0],t0=Date.now();
  const value=await fetch(base+path,{...options,headers:{Accept:'application/json','Content-Type':'application/json',...(options.headers||{})},body:options.body===undefined?undefined:JSON.stringify(options.body)}).then(echoTogetherJson);
  echoTogetherLastLatency=Date.now()-t0;
  return value;
};
const echoTogetherRoomPath=suffix=>`/v1/rooms/${encodeURIComponent(echoTogetherState.roomCode)}${suffix||''}?token=${encodeURIComponent(echoTogetherState.roomToken)}`;
const echoTogetherTime=seconds=>{const value=Math.max(0,Math.floor(Number(seconds)||0));return String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0')};
const echoTogetherRemotePosition=value=>{const playback=value?.playback||{},clock=Number(value?.serverTimeMs)||Date.now(),updated=Number(playback.updatedAtMs)||clock;return Math.max(0,(Number(playback.positionSeconds)||0)+(playback.state==='playing'?Math.max(0,clock-updated)/1000:0))};
let echoTogetherStatusTimer=null;

const echoTogetherFormatError=err=>{
  const str=String(err?.message||err||'').trim();
  if(!str)return '⚠️ 操作失败';
  if(str==='name_required'||str.includes('name_required'))return '⚠️ 请先在设置中填写用户昵称';
  if(str==='name_and_code_required'||str.includes('name_and_code_required'))return '⚠️ 请输入昵称与正确的6位房间码';
  if(str==='room_not_found'||str.includes('room_not_found'))return '🔍 未找到该房间，请检查房间码是否正确';
  if(str==='room_full'||str.includes('room_full'))return '👥 房间人数已满，无法加入';
  if(str==='room_session_invalid'||str.includes('room_session_invalid'))return '⌛ 房间会话已失效，请重新加入';
  if(str==='no_local_audio'||str.includes('no_local_audio')||str==='当前 ECHO 未在播放本地音频文件')return '🎵 当前 ECHO 未在播放本地歌曲';
  if(str==='no_syncable_playback'||str.includes('no_syncable_playback'))return '🎵 没有可同步的播放内容，请先在 ECHO 中播放音乐';
  if(str==='no_shared_track'||str.includes('no_shared_track')||str==='当前房间暂无播放中的曲目')return '📻 当前房间暂无可播放的曲目';
  if(str.includes('together_server_unavailable')||str.includes('Failed to fetch')||str.includes('NetworkError'))return '🌐 无法连接到同步服务器，请检查网络或切换服务器';
  if(str.includes('request_too_large'))return '⚠️ 上传的音频文件过大';
  if(str.includes('audio_file_invalid'))return '⚠️ 不支持该格式的音频文件';
  if(str.includes('audio_source_invalid'))return '⚠️ 音频文件路径无效或不存在';
  if(str.includes('opus_encoder_unavailable'))return '⚠️ 服务器暂不支持 Opus 压缩，请关闭该选项或更换服务器';
  if(str.includes('opus_encode_failed'))return '⚠️ Opus 压缩失败，请重试或关闭该选项';
  if(str.includes('http_404')||str.includes('remote_http_404'))return '🔍 目标房间或资源不存在 (404)';
  if(str.includes('http_500')||str.includes('remote_http_500'))return '💥 同步服务器内部错误 (500)';
  if(str.startsWith('⚠️')||str.startsWith('❌')||str.startsWith('✅')||str.startsWith('🚀')||str.startsWith('⌛')||str.startsWith('ℹ️')||str.startsWith('👑')||str.startsWith('🔄'))return str;
  return '⚠️ '+str.replace(/^Error:\s*/iu,'');
};

const echoTogetherStatus=(message,error=false)=>{
  const node=echoTogetherEl('echo-together-status');
  if(!node)return;
  const text=error?echoTogetherFormatError(message):String(message||'');
  node.textContent=text;
  node.className='et-status-toast '+(error?'error':'active');
  if(echoTogetherStatusTimer)clearTimeout(echoTogetherStatusTimer);
  if(text){echoTogetherStatusTimer=setTimeout(()=>{node.className='et-status-toast';node.textContent='';},3800);}
};

const echoTogetherSwitchTab=(tabName)=>{
  echoTogetherCurrentTab=tabName;
  const tabs=['room','lobby','settings','match'];
  tabs.forEach(t=>{
    const btn=echoTogetherEl(`echo-together-tab-btn-${t}`);
    const view=echoTogetherEl(`echo-together-view-${t}`);
    if(btn)btn.classList.toggle('active',t===tabName);
    if(view)view.classList.toggle('active',t===tabName);
  });
};

const echoTogetherStartMatchTimer=()=>{
  echoTogetherMatchStart=Date.now();
  if(echoTogetherMatchTimer)clearInterval(echoTogetherMatchTimer);
  const tEl=echoTogetherEl('echo-together-match-elapsed');
  if(tEl)tEl.textContent='00:00';
  echoTogetherMatchTimer=setInterval(()=>{
    const elapsed=Math.floor((Date.now()-echoTogetherMatchStart)/1000);
    const m=String(Math.floor(elapsed/60)).padStart(2,'0');
    const s=String(elapsed%60).padStart(2,'0');
    const el=echoTogetherEl('echo-together-match-elapsed');
    if(el)el.textContent=`${m}:${s}`;
  },1000);
};

const echoTogetherStopMatchTimer=()=>{
  if(echoTogetherMatchTimer){clearInterval(echoTogetherMatchTimer);echoTogetherMatchTimer=null;}
};

const echoTogetherMount=()=>{
  if(document.getElementById('echo-together-tab'))return true;
  const style=document.createElement('style');
  style.id='echo-together-style';
  style.textContent=`
@keyframes et-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes et-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.45;transform:scale(.85)}}
@keyframes et-wave{0%,100%{height:20%}50%{height:100%}}
@keyframes et-radar-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes et-fade-up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}

#echo-together-tab{
  position:fixed;right:0;left:auto;top:50%;z-index:2147483000;transform:translateY(-50%);
  display:flex;flex-direction:column;align-items:center;gap:6px;
  padding:12px 6px 12px 7px;
  background:rgba(18,24,35,.88);backdrop-filter:blur(18px) saturate(180%);
  border:1px solid rgba(255,255,255,.14);border-right:none;
  border-radius:10px 0 0 10px;
  color:#eaf0f7;cursor:pointer;
  box-shadow:-4px 0 24px rgba(0,0,0,.38);
  transition:all .22s cubic-bezier(.16,1,.3,1);
  user-select:none;outline:none;
}
#echo-together-tab:hover{
  padding-right:10px;background:rgba(28,36,52,.95);
  border-color:rgba(100,160,255,.35);
  box-shadow:-6px 0 28px rgba(79,109,245,.3);
}
#echo-together-tab .et-tab-wave{display:flex;align-items:flex-end;gap:2px;height:14px}
#echo-together-tab .et-tab-wave i{width:2.5px;background:#60a5fa;border-radius:2px;height:100%;transform-origin:bottom;animation:et-wave .8s ease-in-out infinite alternate}
#echo-together-tab .et-tab-wave i:nth-child(1){animation-duration:.6s}
#echo-together-tab .et-tab-wave i:nth-child(2){animation-duration:.9s;animation-delay:.15s}
#echo-together-tab .et-tab-wave i:nth-child(3){animation-duration:.5s;animation-delay:.3s}
#echo-together-tab .et-tab-text{writing-mode:vertical-rl;font:600 11px -apple-system,system-ui,sans-serif;letter-spacing:1.5px}
#echo-together-tab .et-tab-dot{width:6px;height:6px;border-radius:50%;background:#34d399;box-shadow:0 0 8px #34d399;animation:et-pulse 1.8s infinite ease-in-out}
#echo-together-tab .et-tab-dot.idle{background:#94a3b8;box-shadow:none;animation:none}

#echo-together-panel{
  position:fixed;right:48px;left:auto;top:50%;z-index:2147482999;
  transform:translateY(-50%) translateX(12px) scale(.96);
  opacity:0;pointer-events:none;
  width:min(390px,calc(100vw - 64px));max-height:calc(100vh - 40px);
  overflow-y:auto;overflow-x:hidden;
  background:rgba(14,18,26,.92);backdrop-filter:blur(28px) saturate(190%);
  border:1px solid rgba(255,255,255,.12);border-radius:18px;
  box-shadow:0 24px 64px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.04);
  color:#f1f5f9;font:13px -apple-system,system-ui,"Segoe UI",Roboto,sans-serif;
  padding:16px;box-sizing:border-box;
  transition:transform .28s cubic-bezier(.16,1,.3,1),opacity .24s ease;
  user-select:none;
}
#echo-together-panel.open{transform:translateY(-50%) translateX(0) scale(1);opacity:1;pointer-events:auto}
#echo-together-panel *{box-sizing:border-box}
#echo-together-panel::-webkit-scrollbar{width:4px}
#echo-together-panel::-webkit-scrollbar-track{background:transparent}
#echo-together-panel::-webkit-scrollbar-thumb{background:rgba(255,255,255,.18);border-radius:4px}

.et-header{display:flex;align-items:center;justify-content:space-between;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,.08)}
.et-title-pill{display:flex;align-items:center;gap:7px}
.et-brand-title{font-size:15px;font-weight:700;letter-spacing:.3px;background:linear-gradient(135deg,#fff,#93c5fd);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.et-badge{padding:2px 7px;border-radius:12px;font-size:10px;font-weight:600;display:inline-flex;align-items:center;gap:4px}
.et-badge.online{background:rgba(52,211,153,.15);color:#34d399;border:1px solid rgba(52,211,153,.3)}
.et-badge.idle{background:rgba(148,163,184,.14);color:#94a3b8;border:1px solid rgba(148,163,184,.25)}
.et-badge.playing{background:rgba(96,165,250,.18);color:#60a5fa;border:1px solid rgba(96,165,250,.35)}
.et-close-btn{width:26px;height:26px;border-radius:50%;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.06);color:#94a3b8;display:grid;place-items:center;cursor:pointer;font-size:12px;transition:all .18s ease}
.et-close-btn:hover{background:rgba(255,255,255,.15);color:#fff;transform:rotate(90deg)}

.et-nav{display:flex;gap:5px;background:rgba(0,0,0,.25);padding:4px;border-radius:10px;margin:12px 0 14px;border:1px solid rgba(255,255,255,.06)}
.et-nav-item{flex:1;padding:7px 0;background:transparent;border:none;border-radius:7px;color:#94a3b8;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;transition:all .18s ease;position:relative}
.et-nav-item:hover{color:#e2e8f0;background:rgba(255,255,255,.05)}
.et-nav-item.active{color:#fff;background:rgba(79,109,245,.25);border:1px solid rgba(129,140,248,.35);box-shadow:0 2px 8px rgba(79,109,245,.2)}
.et-nav-dot{width:5px;height:5px;border-radius:50%;background:#34d399;box-shadow:0 0 5px #34d399}

.et-view{display:none;animation:et-fade-up .2s cubic-bezier(.16,1,.3,1)}
.et-view.active{display:block}

.et-card{background:rgba(23,30,42,.65);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:12px;margin-bottom:10px}
.et-empty-card{text-align:center;padding:28px 16px;background:rgba(23,30,42,.45);border:1px dashed rgba(255,255,255,.12);border-radius:14px;margin:8px 0}
.et-empty-icon{font-size:32px;margin-bottom:8px;opacity:.8}
.et-empty-title{font-size:14px;font-weight:600;color:#e2e8f0;margin-bottom:4px}
.et-empty-desc{font-size:11px;color:#8899ac;margin-bottom:14px;line-height:1.4}

.et-room-banner{display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,rgba(30,41,59,.75),rgba(15,23,42,.85))}
.et-caption{font-size:10px;font-weight:600;text-transform:uppercase;color:#8899ac;letter-spacing:.8px;margin-bottom:2px}
.et-code-row{display:flex;align-items:center;gap:8px}
.et-code-text{font-size:20px;font-weight:800;letter-spacing:2px;color:#38bdf8;font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
.et-copy-btn{padding:2px 8px;font-size:10px;border-radius:6px;border:1px solid rgba(56,189,248,.3);background:rgba(56,189,248,.12);color:#38bdf8;cursor:pointer;transition:all .15s}
.et-copy-btn:hover{background:rgba(56,189,248,.25)}
.et-member-badge{font-size:13px;font-weight:700;color:#94a3b8}

.et-track-card{position:relative;overflow:hidden;background:linear-gradient(180deg,rgba(30,41,59,.5),rgba(15,23,42,.75))}
.et-track-top{display:flex;align-items:center;gap:12px}
.et-vinyl{width:46px;height:46px;border-radius:50%;background:radial-gradient(circle at center,#1e293b 25%,#0f172a 26%,#334155 45%,#0f172a 46%,#1e293b 70%,#020617 100%);box-shadow:0 4px 12px rgba(0,0,0,.5);display:grid;place-items:center;flex-shrink:0;animation:et-spin 10s linear infinite;animation-play-state:paused}
.et-vinyl.spinning{animation-play-state:running}
.et-vinyl-core{width:14px;height:14px;border-radius:50%;background:#38bdf8;border:2px solid #0f172a}
.et-track-info{flex:1;min-width:0}
.et-track-title{font-size:14px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.et-track-artist{font-size:11px;color:#94a3b8;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.et-visualizer{display:flex;align-items:flex-end;gap:3px;height:14px;margin-top:4px}
.et-visualizer i{width:3px;background:linear-gradient(180deg,#60a5fa,#4f6df5);border-radius:3px;height:100%;transform-origin:bottom;animation:et-wave .7s ease-in-out infinite alternate}
.et-visualizer i:nth-child(1){animation-duration:.5s}
.et-visualizer i:nth-child(2){animation-duration:.8s;animation-delay:.1s}
.et-visualizer i:nth-child(3){animation-duration:.6s;animation-delay:.2s}
.et-visualizer i:nth-child(4){animation-duration:.9s;animation-delay:.15s}
.et-visualizer i:nth-child(5){animation-duration:.65s;animation-delay:.3s}
.et-visualizer.paused i{animation-play-state:paused;transform:scaleY(.25)}

.et-progress-shell{margin:10px 0 6px}
.et-progress-bar{height:4px;border-radius:4px;background:rgba(255,255,255,.1);overflow:hidden;position:relative}
.et-progress-fill{height:100%;background:linear-gradient(90deg,#38bdf8,#6366f1);width:0%;transition:width .3s linear}
.et-progress-labels{display:flex;justify-content:space-between;align-items:center;margin-top:4px;font-size:10px;color:#8899ac}

.et-upload-progress{display:none;margin:6px 0 8px;padding:7px 9px;border-radius:7px;background:rgba(15,23,42,.72);border:1px solid rgba(96,165,250,.22)}
.et-upload-track{height:5px;border-radius:5px;background:rgba(255,255,255,.1);overflow:hidden}
.et-upload-fill{height:100%;width:0;background:linear-gradient(90deg,#34d399,#38bdf8);transition:width .15s linear}
.et-upload-text{display:block;margin-top:4px;font-size:10px;color:#9cc8ff;text-align:right}

.et-controller-banner{display:flex;align-items:center;gap:5px;font-size:11px;color:#fbbf24;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.06)}

.et-btn{
  padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.12);
  background:rgba(30,41,59,.7);color:#f1f5f9;font:600 12px inherit;
  cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;
  transition:all .18s cubic-bezier(.16,1,.3,1);outline:none;
}
.et-btn:hover{background:rgba(51,65,85,.85);border-color:rgba(255,255,255,.25);transform:translateY(-1px)}
.et-btn:active{transform:scale(.97)}
.et-btn.primary{
  background:linear-gradient(135deg,#4f46e5,#3b82f6);border-color:rgba(129,140,248,.4);
  color:#fff;box-shadow:0 4px 14px rgba(79,70,229,.35);
}
.et-btn.primary:hover{box-shadow:0 6px 20px rgba(79,70,229,.55)}
.et-btn.secondary{background:rgba(30,41,59,.8);border-color:rgba(255,255,255,.14)}
.et-btn.danger{background:rgba(225,29,72,.15);border-color:rgba(244,63,94,.3);color:#fb7185;width:100%}
.et-btn.danger:hover{background:rgba(225,29,72,.28);border-color:rgba(244,63,94,.5)}
.et-btn.match-btn{width:100%;padding:10px;font-size:13px}

.et-latency-badge{
  display:inline-flex;align-items:center;gap:5px;padding:7px 10px;border-radius:8px;
  background:rgba(15,23,42,.85);border:1px solid rgba(255,255,255,.12);
  font:700 11px ui-monospace,SFMono-Regular,Consolas,monospace;color:#34d399;flex-shrink:0;
}
.et-latency-dot{width:6px;height:6px;border-radius:50%;background:#34d399;box-shadow:0 0 6px #34d399}
.et-latency-badge.warning{color:#fbbf24;border-color:rgba(251,191,36,.3)}
.et-latency-badge.warning .et-latency-dot{background:#fbbf24;box-shadow:0 0 6px #fbbf24}
.et-latency-badge.danger{color:#f87171;border-color:rgba(248,113,113,.3)}
.et-latency-badge.danger .et-latency-dot{background:#f87171;box-shadow:0 0 6px #f87171}

.et-members-flow{display:flex;flex-direction:column;gap:5px;margin-top:6px}
.et-member-row{display:flex;align-items:center;justify-content:space-between;padding:5px 8px;border-radius:6px;background:rgba(0,0,0,.2)}
.et-member-name{font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px}
.et-host-pill{font-size:9px;padding:1px 5px;border-radius:8px;background:rgba(251,191,36,.2);color:#fbbf24;border:1px solid rgba(251,191,36,.35)}

.et-input-group{display:flex;gap:6px;margin-top:6px}
.et-input{
  width:100%;padding:8px 10px;border-radius:7px;border:1px solid rgba(255,255,255,.12);
  background:rgba(15,23,42,.85);color:#f1f5f9;font:12px inherit;outline:none;
  transition:all .18s ease;
}
.et-input:focus{border-color:#60a5fa;box-shadow:0 0 0 2px rgba(96,165,250,.2)}
.et-input.code-input{text-transform:uppercase;font-weight:700;letter-spacing:1.5px;text-align:center;font-size:13px}

.et-field{margin-bottom:10px}
.et-field-title{font-size:11px;font-weight:600;color:#cbd5e1;display:block;margin-bottom:3px}
.et-field-desc{font-size:10px;color:#64748b;display:block;margin-bottom:5px}

.et-status-toast{
  margin-top:10px;padding:7px 10px;border-radius:8px;font-size:11px;
  display:none;background:rgba(30,41,59,.9);color:#cbd5e1;border:1px solid rgba(255,255,255,.1);
  animation:et-fade-up .2s ease;
}
.et-status-toast.active{display:block}
.et-status-toast.error{display:block;background:rgba(159,18,57,.88);color:#fecdd3;border-color:rgba(244,63,94,.4)}

/* Radar Match Screen */
.et-radar-card{
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:24px 16px;background:rgba(15,23,42,.75);border:1px solid rgba(56,189,248,.2);
  border-radius:14px;text-align:center;
}
.et-radar-box{
  position:relative;width:140px;height:140px;border-radius:50%;
  background:radial-gradient(circle,rgba(14,165,233,.18) 0%,rgba(15,23,42,.85) 70%);
  border:2px solid rgba(56,189,248,.4);
  box-shadow:0 0 24px rgba(14,165,233,.25),inset 0 0 20px rgba(14,165,233,.15);
  overflow:hidden;margin-bottom:16px;
}
.et-radar-circle{
  position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
  border-radius:50%;border:1px dashed rgba(56,189,248,.35);
}
.et-radar-circle.circle-1{width:45px;height:45px}
.et-radar-circle.circle-2{width:90px;height:90px}
.et-radar-circle.circle-3{width:130px;height:130px;border-style:solid;border-color:rgba(56,189,248,.2)}
.et-radar-cross-h{position:absolute;top:50%;left:0;right:0;height:1px;background:rgba(56,189,248,.25)}
.et-radar-cross-v{position:absolute;left:50%;top:0;bottom:0;width:1px;background:rgba(56,189,248,.25)}
.et-radar-sweep{
  position:absolute;top:0;left:0;width:100%;height:100%;border-radius:50%;
  background:conic-gradient(from 0deg,rgba(56,189,248,.45) 0deg,rgba(56,189,248,0) 65deg,transparent 65deg);
  animation:et-radar-spin 2s linear infinite;
}
.et-radar-center-dot{
  position:absolute;top:50%;left:50%;width:8px;height:8px;
  transform:translate(-50%,-50%);background:#38bdf8;border-radius:50%;box-shadow:0 0 10px #38bdf8;
}
.et-match-title{font-size:13px;font-weight:700;color:#f1f5f9;margin-bottom:6px}
.et-match-timer{font-size:16px;font-weight:800;color:#38bdf8;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;margin-bottom:4px}
.et-match-tip{font-size:11px;color:#94a3b8}
`;
  document.head.append(style);

  const tab=document.createElement('button');
  tab.id='echo-together-tab';
  tab.type='button';
  tab.title='ECHO Together 一起听';
  tab.innerHTML='<div class="et-tab-wave"><i></i><i></i><i></i></div><span class="et-tab-text">一起听</span><span id="echo-together-tab-dot" class="et-tab-dot idle"></span>';

  const panel=document.createElement('aside');
  panel.id='echo-together-panel';
  panel.innerHTML=`
<header class="et-header">
  <div class="et-title-pill">
    <span class="et-brand-title">ECHO Together</span>
    <span id="echo-together-header-badge" class="et-badge idle">● 离线</span>
  </div>
  <button id="echo-together-close" class="et-close-btn" title="收起面板">✕</button>
</header>

<nav class="et-nav">
  <button id="echo-together-tab-btn-room" class="et-nav-item active">
    <span>🎧 房间</span>
    <span id="echo-together-room-dot" class="et-nav-dot" style="display:none"></span>
  </button>
  <button id="echo-together-tab-btn-lobby" class="et-nav-item"><span>🔍 大厅</span></button>
  <button id="echo-together-tab-btn-settings" class="et-nav-item"><span>⚙️ 设置</span></button>
</nav>

<div class="et-views">
  <!-- View: Room -->
  <div id="echo-together-view-room" class="et-view active">
    <div id="echo-together-room-empty" class="et-empty-card">
      <div class="et-empty-icon">📻</div>
      <div class="et-empty-title">当前未在房间中</div>
      <div class="et-empty-desc">前往“大厅”快速匹配、创建房间或输入代码加入</div>
      <button id="echo-together-goto-lobby" class="et-btn primary">前往大厅</button>
    </div>

    <div id="echo-together-room-content" style="display:none">
      <div class="et-card et-room-banner">
        <div>
          <div class="et-caption">房间代码</div>
          <div class="et-code-row">
            <span id="echo-together-room-code" class="et-code-text">------</span>
            <button id="echo-together-copy" class="et-copy-btn">复制</button>
          </div>
        </div>
        <div style="text-align:right">
          <div class="et-caption">当前成员</div>
          <span id="echo-together-members-count" class="et-member-badge">1/2</span>
        </div>
      </div>

      <div class="et-card et-track-card">
        <div class="et-track-top">
          <div id="echo-together-vinyl" class="et-vinyl">
            <div class="et-vinyl-core"></div>
          </div>
          <div class="et-track-info">
            <div id="echo-together-track-title" class="et-track-title">暂无正在同步的歌曲</div>
            <div id="echo-together-track-artist" class="et-track-artist">等待房主分享曲目...</div>
            <div id="echo-together-visualizer" class="et-visualizer paused">
              <i></i><i></i><i></i><i></i><i></i>
            </div>
          </div>
        </div>
        <div class="et-progress-shell">
          <div class="et-progress-bar">
            <div id="echo-together-progress-fill" class="et-progress-fill"></div>
          </div>
          <div class="et-progress-labels">
            <span id="echo-together-pos-text">00:00</span>
            <span id="echo-together-state-text">⏸️ 已暂停</span>
          </div>
        </div>
      </div>

      <div style="display:flex;gap:7px;align-items:stretch;margin:8px 0">
        <button id="echo-together-share" class="et-btn primary" style="flex:1" title="强制与房间同步播放状态与歌曲">🔄 强制同步</button>
        <button id="echo-together-retry" class="et-btn secondary" title="重新加载当前房间歌曲并恢复同步">↻ 重试</button>
        <div id="echo-together-latency-badge" class="et-latency-badge" title="当前同步服务器延迟">
          <span class="et-latency-dot"></span>
          <span id="echo-together-latency-text">-- ms</span>
        </div>
      </div>
      <div id="echo-together-upload-progress" class="et-upload-progress">
        <div class="et-upload-track"><div id="echo-together-upload-fill" class="et-upload-fill"></div></div>
        <span id="echo-together-upload-text">正在准备上传…</span>
      </div>

      <div class="et-card" style="margin-top:8px">
        <div class="et-caption">成员列表</div>
        <div id="echo-together-members-list" class="et-members-flow"></div>
      </div>

      <button id="echo-together-leave" class="et-btn danger">🚪 退出当前房间</button>
    </div>
  </div>

  <!-- View: Lobby -->
  <div id="echo-together-view-lobby" class="et-view">
    <div class="et-card">
      <div class="et-caption">✨ 全网快速匹配</div>
      <div class="et-field-desc">自动随机匹配当前在线的听歌伙伴</div>
      <button id="echo-together-match" class="et-btn primary match-btn">
        <span>⚡ 开始随机匹配</span>
      </button>
    </div>

    <div class="et-card">
      <div class="et-caption">🔑 加入指定房间</div>
      <div class="et-field-desc">输入 6 位房间代码加入</div>
      <div class="et-input-group">
        <input id="echo-together-code" class="et-input code-input" maxlength="6" placeholder="ABC123" autocomplete="off">
        <button id="echo-together-join" class="et-btn primary" style="padding:0 16px">加入</button>
      </div>
    </div>

    <div class="et-card">
      <div class="et-caption">🏠 创建专属房间</div>
      <div class="et-field-desc">新建私有房间并邀请好友加入</div>
      <button id="echo-together-create" class="et-btn secondary" style="width:100%">+ 创建房间</button>
    </div>
  </div>

  <!-- View: Match (Radar) -->
  <div id="echo-together-view-match" class="et-view">
    <div class="et-radar-card">
      <div class="et-radar-box">
        <div class="et-radar-circle circle-1"></div>
        <div class="et-radar-circle circle-2"></div>
        <div class="et-radar-circle circle-3"></div>
        <div class="et-radar-cross-h"></div>
        <div class="et-radar-cross-v"></div>
        <div class="et-radar-sweep"></div>
        <div class="et-radar-center-dot"></div>
      </div>
      <div class="et-match-title">正在全球寻找听歌伙伴...</div>
      <div class="et-match-timer">已等待 <span id="echo-together-match-elapsed">00:00</span></div>
      <div class="et-match-tip">匹配成功后将自动进入并同步房间</div>
      <button id="echo-together-cancel-match" class="et-btn danger" style="margin-top:14px;width:100%">✕ 退出匹配</button>
    </div>
  </div>

  <!-- View: Settings -->
  <div id="echo-together-view-settings" class="et-view">
    <div class="et-card">
      <div class="et-field">
        <label class="et-field-title">👤 用户昵称</label>
        <span class="et-field-desc">在房间内展示的名字</span>
        <input id="echo-together-name" class="et-input" maxlength="32" placeholder="输入你的昵称">
      </div>

      <div class="et-field">
        <label class="et-field-title">🌐 同步服务器</label>
        <span class="et-field-desc">选择或输入 Together 服务器</span>
        <select id="echo-together-server-select" class="et-input">
          <option value="https://echo.shiinasuki.com/echo-together">HK1 主服务器</option>
          <option value="https://47-243-198-176.sslip.io">HK2 附属服务器</option>
          <option value="custom">自定义服务器 (Custom)</option>
        </select>
        <input id="echo-together-server" class="et-input" style="margin-top:6px" placeholder="https://your-server.example">
      </div>

      <div class="et-field">
        <label class="et-field-title">⚡ 自动同步间隔</label>
        <span class="et-field-desc">越小越及时；建议 100 到 500 毫秒</span>
        <div class="et-input-group">
          <input id="echo-together-sync-interval" class="et-input" type="number" min="100" max="5000" step="50">
          <span style="display:flex;align-items:center;color:#94a3b8;font-size:11px">ms</span>
        </div>
      </div>

      <div class="et-field">
        <label class="et-field-title">👥 创建房间人数</label>
        <span class="et-field-desc">新建或随机匹配房间的最大成员数</span>
        <select id="echo-together-max-members" class="et-input">
          <option value="2">2 人</option>
          <option value="3">3 人</option>
          <option value="4">4 人</option>
          <option value="5">5 人</option>
          <option value="6">6 人</option>
          <option value="7">7 人</option>
          <option value="8">8 人</option>
        </select>
      </div>

      <div class="et-field">
        <label class="et-field-title">🎧 Opus 音频压缩</label>
        <span class="et-field-desc">分享歌曲上传前压缩为 Opus，默认开启以减少流量</span>
        <label style="display:flex;align-items:center;gap:8px;color:#cbd5e1;font-size:12px">
          <input id="echo-together-opus" type="checkbox">
          上传到服务器时使用 Opus
        </label>
      </div>

      <div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.08);font-size:11px;color:#94a3b8;display:flex;justify-content:space-between;align-items:center">
        <span>⚡ 本地中继核心 (127.0.0.1:47891)</span>
        <span style="color:#34d399">● 就绪</span>
      </div>
    </div>
  </div>
</div>

<div id="echo-together-status" class="et-status-toast"></div>
`;

  document.body.append(tab,panel);
  tab.onclick=()=>panel.classList.toggle('open');
  echoTogetherEl('echo-together-close').onclick=()=>panel.classList.remove('open');
  echoTogetherEl('echo-together-tab-btn-room').onclick=()=>echoTogetherSwitchTab('room');
  echoTogetherEl('echo-together-tab-btn-lobby').onclick=()=>echoTogetherSwitchTab('lobby');
  echoTogetherEl('echo-together-tab-btn-settings').onclick=()=>echoTogetherSwitchTab('settings');
  echoTogetherEl('echo-together-goto-lobby').onclick=()=>echoTogetherSwitchTab('lobby');
  echoTogetherEl('echo-together-copy').onclick=()=>{
    const code=echoTogetherEl('echo-together-room-code').textContent;
    if(code&&code!=='------'){
      navigator.clipboard?.writeText(code);
      echoTogetherStatus('✅ 已复制房间代码: '+code);
    }
  };
  return true;
};

const echoTogetherRender=()=>{
  if(!echoTogetherEl('echo-together-panel'))return;
  const server=echoTogetherServerHost(echoTogetherState.serverUrl||echoTogetherServers[0]);
  echoTogetherEl('echo-together-name').value=echoTogetherState.name||'';
  echoTogetherEl('echo-together-server').value=server;
  echoTogetherEl('echo-together-sync-interval').value=String(echoTogetherSyncInterval(echoTogetherState.syncIntervalMs));
  echoTogetherEl('echo-together-max-members').value=String(echoTogetherRoomSize(echoTogetherState.maxMembers));
  echoTogetherEl('echo-together-opus').checked=echoTogetherState.opusEnabled!==false;
  const serverSelect=echoTogetherEl('echo-together-server-select');
  if(serverSelect){
    serverSelect.value=echoTogetherServers.includes(server)?server:'custom';
    echoTogetherEl('echo-together-server').style.display=serverSelect.value==='custom'?'block':'none';
  }

  const latencyBadge=echoTogetherEl('echo-together-latency-badge');
  const latencyText=echoTogetherEl('echo-together-latency-text');
  if(latencyText){
    if(echoTogetherLastLatency!==null){
      latencyText.textContent=echoTogetherLastLatency+' ms';
      if(latencyBadge){
        latencyBadge.className='et-latency-badge '+(echoTogetherLastLatency<100?'':'warning'===(echoTogetherLastLatency<250?'warning':'danger')?echoTogetherLastLatency<250?'warning':'danger':'');
      }
    }else{
      latencyText.textContent='-- ms';
    }
  }

  const connected=Boolean(echoTogetherState.roomCode&&echoTogetherState.roomToken);
  const emptyView=echoTogetherEl('echo-together-room-empty');
  const contentView=echoTogetherEl('echo-together-room-content');
  const tabDot=echoTogetherEl('echo-together-tab-dot');
  const roomDot=echoTogetherEl('echo-together-room-dot');
  const headerBadge=echoTogetherEl('echo-together-header-badge');

  if(emptyView)emptyView.style.display=connected?'none':'block';
  if(contentView)contentView.style.display=connected?'block':'none';
  if(roomDot)roomDot.style.display=connected?'inline-block':'none';

  if(!connected){
    if(tabDot)tabDot.className='et-tab-dot idle';
    if(headerBadge){headerBadge.className='et-badge idle';headerBadge.textContent='● 离线';}
    return;
  }

  if(tabDot)tabDot.className='et-tab-dot';
  if(!echoTogetherSnapshot){
    echoTogetherEl('echo-together-room-code').textContent=echoTogetherState.roomCode;
    if(headerBadge){headerBadge.className='et-badge online';headerBadge.textContent='● 在线';}
    return;
  }

  const track=echoTogetherSnapshot.track,playback=echoTogetherSnapshot.playback||{};
  const isPlaying=playback.state==='playing';

  if(headerBadge){
    headerBadge.className='et-badge '+(isPlaying?'playing':'online');
    headerBadge.textContent=isPlaying?'● 同步中':'● 在线';
  }

  echoTogetherEl('echo-together-room-code').textContent=echoTogetherSnapshot.roomCode||echoTogetherState.roomCode;
  echoTogetherEl('echo-together-members-count').textContent=((echoTogetherSnapshot.members||[]).length+'/'+(echoTogetherSnapshot.maxMembers||2));

  echoTogetherEl('echo-together-track-title').textContent=track?(track.title||'未知曲目'):'暂无播放曲目';
  echoTogetherEl('echo-together-track-artist').textContent=track?[track.artist,track.album].filter(Boolean).join(' · ')||'未知艺术家':'等待房主推流...';

  const vinyl=echoTogetherEl('echo-together-vinyl');
  const visualizer=echoTogetherEl('echo-together-visualizer');
  if(vinyl)vinyl.classList.toggle('spinning',isPlaying);
  if(visualizer)visualizer.classList.toggle('paused',!isPlaying);

  const pos=Number(playback.positionSeconds)||0;
  const dur=Number(track&&track.durationSeconds)||0;
  const pct=dur>0?Math.min(100,(pos/dur)*100):0;
  const fill=echoTogetherEl('echo-together-progress-fill');
  if(fill)fill.style.width=pct+'%';

  echoTogetherEl('echo-together-pos-text').textContent=echoTogetherTime(pos)+(dur>0?' / '+echoTogetherTime(dur):'');
  echoTogetherEl('echo-together-state-text').textContent=isPlaying?'🎵 同步播放中':'⏸️ 已暂停';

  const listEl=echoTogetherEl('echo-together-members-list');
  if(listEl){
    listEl.innerHTML=(echoTogetherSnapshot.members||[]).map(m=>{
      const isCtrl=m.id===echoTogetherSnapshot.controllerId;
      return `<div class="et-member-row"><span class="et-member-name">${m.name||'听众'}${isCtrl?'<span class="et-host-pill">👑 控制者</span>':''}</span><span style="font-size:10px;color:#8899ac">${m.ipLocation||'在线'}</span></div>`;
    }).join('');
  }
};

const echoTogetherRefresh=async()=>{if(!echoTogetherState.roomCode||!echoTogetherState.roomToken)return null;echoTogetherSnapshot=await echoTogetherRemote(echoTogetherRoomPath());echoTogetherRender();return echoTogetherSnapshot};
const echoTogetherControl=(action,payload={})=>echoTogetherLocalApi('/v1/together/control',{method:'POST',body:{action,...payload}});
const echoTogetherShare=async(local=null)=>{
  if(echoTogetherPublishBusy)return;
  echoTogetherPublishBusy=true;
  try{
    local=local||await echoTogetherLocalApi('/v1/together/status');
    if(!local.currentFilePath)throw new Error('no_local_audio');
    echoTogetherLastPublish=Date.now();
    echoTogetherStartUploadProgress();
    const value=await echoTogetherLocalApi('/v1/together/publish',{method:'POST',body:{serverUrl:echoTogetherState.serverUrl,roomCode:echoTogetherState.roomCode,roomToken:echoTogetherState.roomToken,filePath:local.currentFilePath,sourceId:local.currentTrackId,title:local.currentTrackTitle,artist:local.currentTrackArtist,album:local.currentTrackAlbum,albumArtist:local.currentTrackAlbumArtist,coverUrl:local.currentTrackCoverUrl,durationSeconds:local.durationSeconds,state:local.state,positionSeconds:local.positionSeconds,quality:echoTogetherState.opusEnabled===false?'direct':'opus'}});
    echoTogetherRememberPublished(local.currentFilePath,local.currentTrackId,value.mediaId);
    echoTogetherLastLocalSource=echoTogetherSource(local);echoTogetherApplyingUntil=Date.now()+500;
    await echoTogetherRefresh();
    echoTogetherStatus('🚀 已自动分享: '+(value.title||'曲目'));
  }finally{echoTogetherPublishBusy=false;echoTogetherStopUploadProgress();}
};
const echoTogetherForceSync=async()=>{
  const local=await echoTogetherLocalApi('/v1/together/status');
  if(echoTogetherSnapshot?.track&&(local.currentTrackId===echoTogetherId(echoTogetherSnapshot.track.id)||echoTogetherIsPublishedLocal(echoTogetherSnapshot,local.currentFilePath,local.currentTrackId))){
    echoTogetherSnapshot=await echoTogetherRemote(echoTogetherRoomPath('/state'),{method:'POST',body:{mediaId:echoTogetherSnapshot.track.id,state:local.state==='playing'?'playing':'paused',positionSeconds:Number(local.positionSeconds)||0}});
    echoTogetherRender();
  }else if(local.currentFilePath&&!/^https?:\/\//iu.test(String(local.currentFilePath))){
    await echoTogetherShare(local);
  }else{
    throw new Error('no_syncable_playback');
  }
  echoTogetherStatus('🔄 强制同步指令已发送');
};
const echoTogetherRetry=async()=>{
  echoTogetherStatus('正在重新加载房间播放…');
  let value=await echoTogetherRefresh();
  const local=await echoTogetherLocalApi('/v1/together/status');
  if(!value?.track){
    if(local.currentFilePath&&!/^https?:\/\//iu.test(String(local.currentFilePath)))return echoTogetherShare(local);
    throw new Error('no_shared_track');
  }
  const position=Number(value.playback?.positionSeconds)||0;
  value=await echoTogetherRemote(echoTogetherRoomPath('/state'),{method:'POST',body:{mediaId:value.track.id,state:'playing',positionSeconds:position}});
  echoTogetherSnapshot=value;
  echoTogetherApplyingUntil=0;
  await echoTogetherApplyRemote(value,local,echoTogetherIsPublishedLocal(value,local.currentFilePath,local.currentTrackId),true);
  echoTogetherRender();
  echoTogetherStatus('✅ 已重新加载并恢复播放');
};
const echoTogetherApplyRemote=async(value,local,keepLocalSource=false,forceReload=false)=>{
  const track=value.track;if(!track)return;
  const expected=echoTogetherId(track.id),playback=value.playback||{},position=echoTogetherRemotePosition(value);
  echoTogetherApplyingUntil=Date.now()+3000;
  if((local.currentTrackId!==expected||forceReload)&&!keepLocalSource){
    echoTogetherClearPublished();
    echoTogetherSyncing=true;
    try{await echoTogetherControl('load',{filePath:track.streamUrl,trackId:expected,mimeType:track.mimeType,sourceId:track.sourceId||track.metadata?.sourceId,title:track.title||track.metadata?.title,artist:track.artist||track.metadata?.artist,album:track.album||track.metadata?.album,albumArtist:track.albumArtist||track.metadata?.albumArtist,coverUrl:track.coverUrl||track.metadata?.coverUrl,fileName:track.fileName||track.metadata?.fileName,durationSeconds:track.durationSeconds||track.metadata?.durationSeconds,positionSeconds:position,state:playback.state})}finally{echoTogetherSyncing=false;echoTogetherApplyingUntil=Date.now()+1600}
    return;
  }
  if(Math.abs((Number(local.positionSeconds)||0)-position)>echoTogetherDriftThreshold()){
    echoTogetherSyncing=true;
    try{await echoTogetherControl('seek',{positionSeconds:position})}finally{echoTogetherSyncing=false;echoTogetherApplyingUntil=Date.now()+1600}
  }
  if(playback.state==='playing'&&local.state!=='playing'){
    echoTogetherSyncing=true;try{await echoTogetherControl('play')}finally{echoTogetherSyncing=false;echoTogetherApplyingUntil=Date.now()+1600}
  }else if(playback.state!=='playing'&&local.state==='playing'){
    echoTogetherSyncing=true;try{await echoTogetherControl('pause')}finally{echoTogetherSyncing=false;echoTogetherApplyingUntil=Date.now()+1600}
  }
};

const echoTogetherTick=async()=>{
  if(echoTogetherBusy||echoTogetherPublishBusy||!echoTogetherState.roomCode||!echoTogetherState.roomToken)return;
  echoTogetherBusy=true;
  try{
    const value=await echoTogetherRefresh(),local=await echoTogetherLocalApi('/v1/together/status'),now=Date.now();
    const localPath=String(local.currentFilePath||''),localTrack=String(local.currentTrackId||''),localPosition=Number(local.positionSeconds)||0;
    const localSource=echoTogetherSource(local),localSourceChanged=Boolean(echoTogetherLastLocalSource&&localSource!==echoTogetherLastLocalSource);
    const previousLocal=echoTogetherLastLocalSample,expectedLocalPosition=previousLocal?(Number(previousLocal.position)||0)+(previousLocal.state==='playing'?Math.max(0,now-previousLocal.at)/1000:0):localPosition;
    const localChanged=Boolean(previousLocal&&previousLocal.track===localTrack&&(previousLocal.state!==local.state||Math.abs(localPosition-expectedLocalPosition)>echoTogetherDriftThreshold()));
    const expected=value?.track?echoTogetherId(value.track.id):'';
    const publishedLocal=echoTogetherIsPublishedLocal(value,localPath,localTrack);
    const uploadAvailable=!value?.upload||value.upload.publisherId===value.clientId;
    const canPublish=now-echoTogetherLastPublish>=Math.max(1200,echoTogetherSyncInterval(echoTogetherState.syncIntervalMs)*4);
    if(localSourceChanged&&!/^https?:\/\//iu.test(localPath)&&!publishedLocal&&!echoTogetherSyncing&&now>=echoTogetherApplyingUntil&&uploadAvailable&&canPublish){
      await echoTogetherShare(local);
    }else if(value?.track&&localTrack!==expected&&!publishedLocal){
      if(!echoTogetherSyncing&&now>=echoTogetherApplyingUntil){
        await echoTogetherApplyRemote(value,local);
      }
    }else if(value?.track&&(localTrack===expected||publishedLocal)&&!echoTogetherSyncing&&now>=echoTogetherApplyingUntil){
      const remoteState=value.playback?.state==='playing'?'playing':value.playback?.state==='ended'?'ended':'paused';
      const remotePosition=echoTogetherRemotePosition(value);
      const localDiffersRemote=local.state!==remoteState||Math.abs(localPosition-remotePosition)>echoTogetherDriftThreshold();
      if(localChanged&&localDiffersRemote){
        await echoTogetherRemote(echoTogetherRoomPath('/state'),{method:'POST',body:{mediaId:value.track.id,state:local.state==='playing'?'playing':local.state==='ended'?'ended':'paused',positionSeconds:Number(local.positionSeconds)||0}});
      }else if(localDiffersRemote){
        await echoTogetherApplyRemote(value,local,publishedLocal);
      }
    }else if(!value?.track&&uploadAvailable&&value?.members?.[0]?.id===value?.clientId&&!/^https?:\/\//iu.test(localPath)&&localPath&&canPublish){
      await echoTogetherShare(local);
    }
    if(now>=echoTogetherApplyingUntil||!localChanged)echoTogetherLastLocalSample={track:localTrack,state:local.state,position:localPosition,at:now};
    if(now>=echoTogetherApplyingUntil||!localSourceChanged)echoTogetherLastLocalSource=localSource;
  }catch(error){
    echoTogetherStatus(error.message||error,true);
  }finally{
    echoTogetherBusy=false;
  }
};

const echoTogetherRestartTimer=()=>{
  if(echoTogetherSyncTimer)clearInterval(echoTogetherSyncTimer);
  echoTogetherSyncTimer=setInterval(echoTogetherTick,echoTogetherSyncInterval(echoTogetherState.syncIntervalMs));
};

const echoTogetherBind=()=>{
  if(!echoTogetherMount())return false;
  const forceSyncButton=echoTogetherEl('echo-together-share');
  if(forceSyncButton){forceSyncButton.onclick=async()=>{try{await echoTogetherForceSync()}catch(error){echoTogetherStatus(error.message,true)}};}
  echoTogetherEl('echo-together-retry').onclick=async()=>{try{await echoTogetherRetry()}catch(error){echoTogetherStatus(error.message,true)}};
  echoTogetherEl('echo-together-create').onclick=async()=>{
    try{
      echoTogetherState.name=echoTogetherName(echoTogetherEl('echo-together-name').value);
      echoTogetherState.serverUrl=echoTogetherServerHost(echoTogetherEl('echo-together-server').value);
      if(!echoTogetherState.name)throw new Error('name_required');
      echoTogetherState.maxMembers=echoTogetherRoomSize(echoTogetherState.maxMembers);
      const value=await echoTogetherRemote('/v1/rooms',{method:'POST',body:{name:echoTogetherState.name,maxMembers:echoTogetherState.maxMembers}});
      echoTogetherState={...echoTogetherState,roomCode:value.roomCode,roomToken:value.token,clientId:value.clientId};
      echoTogetherClearPublished();
      echoTogetherResetSync();
      echoTogetherSave();
      echoTogetherSnapshot=value;
      echoTogetherSwitchTab('room');
      echoTogetherRender();
      echoTogetherStatus('✅ 房间已创建: '+value.roomCode);
    }catch(error){echoTogetherStatus(error,true)}
  };
  echoTogetherEl('echo-together-join').onclick=async()=>{
    try{
      echoTogetherState.name=echoTogetherName(echoTogetherEl('echo-together-name').value);
      echoTogetherState.serverUrl=echoTogetherServerHost(echoTogetherEl('echo-together-server').value);
      const code=echoTogetherEl('echo-together-code').value.trim().toUpperCase();
      if(!echoTogetherState.name||code.length!==6)throw new Error('name_and_code_required');
      const value=await echoTogetherRemote('/v1/rooms/join',{method:'POST',body:{name:echoTogetherState.name,code}});
      echoTogetherState={...echoTogetherState,roomCode:value.roomCode,roomToken:value.token,clientId:value.clientId};
      echoTogetherClearPublished();
      echoTogetherResetSync();
      echoTogetherSave();
      echoTogetherSnapshot=value;
      echoTogetherSwitchTab('room');
      echoTogetherRender();
      echoTogetherStatus('✅ 已加入房间: '+value.roomCode);
    }catch(error){echoTogetherStatus(error,true)}
  };
  echoTogetherEl('echo-together-match').onclick=async()=>{
    try{
      echoTogetherState.name=echoTogetherName(echoTogetherEl('echo-together-name').value);
      echoTogetherState.serverUrl=echoTogetherServerHost(echoTogetherEl('echo-together-server').value);
      if(!echoTogetherState.name)throw new Error('name_required');
      echoTogetherMatching=true;
      echoTogetherSwitchTab('match');
      echoTogetherStartMatchTimer();
      let token='';
      while(echoTogetherMatching){
        echoTogetherState.maxMembers=echoTogetherRoomSize(echoTogetherState.maxMembers);
        const value=await echoTogetherRemote('/v1/match',{method:'POST',body:{name:echoTogetherState.name,maxMembers:echoTogetherState.maxMembers,...(token?{matchToken:token}:{})}});
        if(!echoTogetherMatching)break;
        if(!value.matchWaiting){
          echoTogetherMatching=false;
          echoTogetherStopMatchTimer();
          echoTogetherState={...echoTogetherState,roomCode:value.roomCode,roomToken:value.token,clientId:value.clientId};
          echoTogetherClearPublished();
          echoTogetherResetSync();
          echoTogetherSave();
          echoTogetherSnapshot=value;
          echoTogetherSwitchTab('room');
          echoTogetherRender();
          echoTogetherStatus('✅ 匹配成功，已进入房间: '+value.roomCode);
          break;
        }
        token=value.matchToken;
        await new Promise(resolve=>setTimeout(resolve,1200));
      }
    }catch(error){
      echoTogetherMatching=false;
      echoTogetherStopMatchTimer();
      echoTogetherSwitchTab('lobby');
      echoTogetherStatus(error,true);
    }
  };
  echoTogetherEl('echo-together-cancel-match').onclick=()=>{
    echoTogetherMatching=false;
    echoTogetherStopMatchTimer();
    echoTogetherSwitchTab('lobby');
    echoTogetherStatus('ℹ️ 已退出匹配');
  };
  echoTogetherEl('echo-together-leave').onclick=async()=>{
    try{
      if(echoTogetherState.roomCode&&echoTogetherState.roomToken)await echoTogetherRemote(echoTogetherRoomPath('/leave'),{method:'POST',body:{}});
    }catch{}
    echoTogetherState={serverUrl:echoTogetherState.serverUrl,name:echoTogetherState.name};
    echoTogetherClearPublished();
    echoTogetherResetSync();
    echoTogetherSnapshot=null;
    echoTogetherSave();
    echoTogetherSwitchTab('lobby');
    echoTogetherRender();
    echoTogetherStatus('✅ 已退出房间');
  };
  echoTogetherEl('echo-together-name').onchange=()=>{echoTogetherState.name=echoTogetherName(echoTogetherEl('echo-together-name').value);echoTogetherSave();};
  echoTogetherEl('echo-together-server-select').onchange=()=>{
    const select=echoTogetherEl('echo-together-server-select'),input=echoTogetherEl('echo-together-server');
    echoTogetherState.serverUrl=echoTogetherServerHost(select.value==='custom'?input.value:select.value);
    input.value=echoTogetherState.serverUrl;input.style.display=select.value==='custom'?'block':'none';echoTogetherSave();
  };
  echoTogetherEl('echo-together-server').onchange=()=>{echoTogetherState.serverUrl=echoTogetherServerHost(echoTogetherEl('echo-together-server').value);echoTogetherSave();};
  echoTogetherEl('echo-together-sync-interval').onchange=()=>{
    echoTogetherState.syncIntervalMs=echoTogetherSyncInterval(echoTogetherEl('echo-together-sync-interval').value);
    echoTogetherSave();
    echoTogetherRestartTimer();
    echoTogetherStatus('✅ 自动同步间隔已更新为 '+echoTogetherState.syncIntervalMs+' ms');
  };
  echoTogetherEl('echo-together-max-members').onchange=()=>{
    echoTogetherState.maxMembers=echoTogetherRoomSize(echoTogetherEl('echo-together-max-members').value);
    echoTogetherSave();
  };
  echoTogetherEl('echo-together-opus').onchange=()=>{
    echoTogetherState.opusEnabled=echoTogetherEl('echo-together-opus').checked;
    echoTogetherSave();
    echoTogetherStatus(echoTogetherState.opusEnabled?'✅ Opus 压缩已开启':'ℹ️ Opus 压缩已关闭');
  };

  echoTogetherRender();
  return true;
};
const echoTogetherStart=()=>{if(echoTogetherBind())echoTogetherRestartTimer()};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',echoTogetherStart,{once:true});else echoTogetherStart();
})();
// ECHO_TOGETHER_RENDERER_V6 ECHO_TOGETHER_ECHOSTEAM_SOURCE_V1
'''


def external_renderer_source():
    source = renderer_injection()
    source = source.replace(
        "const echoTogetherLoad=()=>{try{return JSON.parse(localStorage.getItem(echoTogetherStorage)||'{}')}catch{return{}}};",
        "const echoTogetherLoad=()=>{try{return {...(echoExternalMod?.config||{}),...JSON.parse(localStorage.getItem(echoTogetherStorage)||'{}')}}catch{return{...(echoExternalMod?.config||{})}}};",
        1,
    )
    teardown = r'''
window.__echoTogetherExternalDispose=()=>{
  try{echoTogetherStopMatchTimer();echoTogetherStopUploadProgress();}catch{}
  if(echoTogetherSyncTimer)clearTimeout(echoTogetherSyncTimer);
  if(echoTogetherStatusTimer)clearTimeout(echoTogetherStatusTimer);
  document.getElementById('echo-together-tab')?.remove();
  document.getElementById('echo-together-panel')?.remove();
  document.getElementById('echo-together-style')?.remove();
  window.__echoTogetherInjected=false;
  delete window.__echoTogetherExternalDispose;
};
'''
    marker = "\n})();"
    index = source.rfind(marker)
    if index < 0:
        raise ValueError("Together renderer close marker not found")
    return source[:index] + teardown + source[index:]


def patched_main_source(source: bytes) -> bytes:
    text = source.decode("utf-8")
    if CLIENT_MOD_MARKER in text:
        return source
    needle = "  app.whenReady().then(async () => {"
    if needle not in text:
        raise ValueError(f"ECHO main entry marker not found: {needle}")
    return text.replace(needle, relay_injection() + "\n" + needle, 1).encode("utf-8")


def patched_renderer_source(source: bytes) -> bytes:
    if CLIENT_RENDERER_MARKER.encode("ascii") in source:
        return source
    return source + renderer_injection().encode("utf-8")


def rebuild_asar(source_path: Path, target_path: Path):
    header, data_start = read_asar_header(source_path)
    target_data = tempfile.NamedTemporaryFile(prefix="echo-together-data-", suffix=".bin", delete=False, dir=target_path.parent)
    target_data_path = Path(target_data.name)
    target_offset = 0
    target_found = False
    renderer_found = False
    try:
        with source_path.open("rb") as source:
            for filename, node in iter_asar_files(header):
                source.seek(data_start + int(node["offset"]))
                original = source.read(int(node["size"]))
                if filename == MAIN_ENTRY:
                    content = patched_main_source(original)
                elif filename.startswith("out/renderer/assets/App-") and filename.endswith(".js"):
                    content = patched_renderer_source(original)
                    renderer_found = True
                else:
                    content = original
                target_found |= filename == MAIN_ENTRY
                node["offset"] = str(target_offset)
                node["size"] = len(content)
                if filename == MAIN_ENTRY or filename.startswith("out/renderer/assets/App-") and filename.endswith(".js"):
                    node["integrity"] = integrity_for(content)
                target_data.write(content)
                target_offset += len(content)
        target_data.close()
        if not target_found:
            raise FileNotFoundError(f"ECHO main entry not found: {MAIN_ENTRY}")
        if not renderer_found:
            raise FileNotFoundError("ECHO renderer App bundle not found")
        header_json = json.dumps(header, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        payload = struct.pack("<I", len(header_json)) + header_json
        payload += b"\0" * ((4 - len(payload) % 4) % 4)
        header_buf = struct.pack("<I", len(payload)) + payload
        size_buf = struct.pack("<II", 4, len(header_buf))
        with target_path.open("wb") as target:
            target.write(size_buf)
            target.write(header_buf)
            with target_data_path.open("rb") as data:
                shutil.copyfileobj(data, target, length=4 * 1024 * 1024)
    finally:
        target_data.close()
        target_data_path.unlink(missing_ok=True)


def install_client_mod(echo_exe: Path):
    resources, app_asar, original_asar = client_paths(echo_exe)
    if not resources.is_dir():
        raise FileNotFoundError(f"ECHO resources directory not found: {resources}")
    legacy_loader = resources / "app"
    legacy_marker = legacy_loader / CLIENT_LOADER_MARKER
    if legacy_marker.is_file() and read_json(legacy_marker, {}).get("id") == PLUGIN_ID:
        shutil.rmtree(legacy_loader)
    if original_asar.exists() and app_asar.exists():
        renderer_entry = next((item_path for item_path, _item in iter_asar_files(read_asar_header(app_asar)[0]) if item_path.startswith("out/renderer/assets/App-") and item_path.endswith(".js")), None)
        main_source = read_asar_file(app_asar, MAIN_ENTRY)
        renderer_source = read_asar_file(app_asar, renderer_entry) if renderer_entry else b""
        if renderer_entry and CLIENT_MOD_MARKER.encode("ascii") in main_source and CLIENT_RENDERER_MARKER.encode("ascii") in renderer_source:
            return
        if not (b"ECHO_TOGETHER_RELAY_V" in main_source and b"ECHO_TOGETHER_RENDERER_V" in renderer_source):
            raise FileExistsError("ECHO app.asar changed while the client mod was installed; restore it before reinstalling")
    moved = False
    if not original_asar.exists():
        if not app_asar.is_file():
            raise FileNotFoundError(f"ECHO app.asar not found: {app_asar}")
        os.replace(app_asar, original_asar)
        moved = True
    temporary = resources / f".app.asar.echo-together-{os.getpid()}.tmp"
    try:
        rebuild_asar(original_asar, temporary)
        os.replace(temporary, app_asar)
    except Exception:
        temporary.unlink(missing_ok=True)
        if moved and original_asar.exists() and not app_asar.exists():
            os.replace(original_asar, app_asar)
        raise


def uninstall_client_mod(echo_exe: Path):
    _resources, app_asar, original_asar = client_paths(echo_exe)
    legacy_loader = echo_exe.parent / "resources" / "app"
    legacy_marker = legacy_loader / CLIENT_LOADER_MARKER
    if legacy_marker.is_file() and read_json(legacy_marker, {}).get("id") == PLUGIN_ID:
        shutil.rmtree(legacy_loader)
    if original_asar.exists():
        if app_asar.exists():
            if CLIENT_MOD_MARKER.encode() not in read_asar_file(app_asar, MAIN_ENTRY):
                raise FileExistsError(f"Refusing to remove an unknown ECHO app.asar: {app_asar}")
            app_asar.unlink()
        os.replace(original_asar, app_asar)


def client_mod_status(echo_exe: Path | None = None):
    if not echo_exe:
        return "ECHO not found"
    _resources, app_asar, original_asar = client_paths(echo_exe)
    if app_asar.is_file() and CLIENT_MOD_MARKER.encode() in read_asar_file(app_asar, MAIN_ENTRY):
        return "client mod active"
    legacy_loader = echo_exe.parent / "resources" / "app" / CLIENT_LOADER_MARKER
    if legacy_loader.is_file() and original_asar.is_file() and not app_asar.exists():
        return "legacy client loader active"
    return "client mod inactive"


def backup_path(label: str) -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    candidate = BACKUP_DIR / f"{label}-{stamp}"
    while candidate.exists():
        candidate = BACKUP_DIR / f"{label}-{stamp}-{secrets.token_hex(2)}"
    return candidate


def stop_echo():
    for name in ["ECHO.exe", "ECHO Steam.exe", "ECHO.modded.exe", "ECHO NEXT.exe", "echo-audio-host.exe", "echo-smtc-host.exe"]:
        subprocess.run(
            ["taskkill", "/IM", name, "/T", "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    time.sleep(1.0)


def start_echo():
    echo_exe = require_echo_exe()
    subprocess.Popen([str(echo_exe)], cwd=echo_exe.parent)


def install_mod():
    echo_exe = require_echo_exe()
    stop_echo()
    install_client_mod(echo_exe)
    legacy_backup = None
    if INSTALLED_PLUGIN.exists():
        target = backup_path(f"{PLUGIN_ID}-previous")
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(INSTALLED_PLUGIN), str(target))
        legacy_backup = str(target)
    state = read_json(STATE_FILE, {})
    previous_record = state.get("plugins", {}).get(PLUGIN_ID) if isinstance(state, dict) and isinstance(state.get("plugins"), dict) else None
    if isinstance(state, dict) and isinstance(state.get("plugins"), dict) and PLUGIN_ID in state["plugins"]:
        state["plugins"].pop(PLUGIN_ID, None)
        write_json(STATE_FILE, state)
    write_json(MOD_CONFIG_FILE, {
        "version": 1,
        "serverUrls": ["https://echo.shiinasuki.com/echo-together/v1", "https://47-243-198-176.sslip.io"],
        "relayPort": 47891,
        "legacyPluginBackup": legacy_backup,
        "legacyPluginState": previous_record,
    })
    start_echo()


def uninstall_mod():
    echo_exe = require_echo_exe()
    stop_echo()
    uninstall_client_mod(echo_exe)
    mod_config = read_json(MOD_CONFIG_FILE, {})
    legacy_backup = Path(mod_config.get("legacyPluginBackup", "")) if isinstance(mod_config, dict) and mod_config.get("legacyPluginBackup") else None
    if legacy_backup and legacy_backup.is_dir() and not INSTALLED_PLUGIN.exists():
        INSTALLED_PLUGIN.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(legacy_backup), str(INSTALLED_PLUGIN))
    state = read_json(STATE_FILE, {})
    previous_record = mod_config.get("legacyPluginState") if isinstance(mod_config, dict) else None
    if isinstance(previous_record, dict) and isinstance(state, dict):
        plugins = state.setdefault("plugins", {})
        if isinstance(plugins, dict):
            plugins[PLUGIN_ID] = previous_record
            write_json(STATE_FILE, state)
    MOD_CONFIG_FILE.unlink(missing_ok=True)
    if isinstance(state, dict) and isinstance(state.get("plugins"), dict) and PLUGIN_ID not in state["plugins"]:
        write_json(STATE_FILE, state)
    start_echo()


def status_text():
    return client_mod_status(selected_echo_exe())


def run_gui():
    try:
        import ctypes
        ctypes.windll.shcore.SetProcessDpiAwareness(1)
    except Exception:
        pass

    import tkinter as tk
    from tkinter import filedialog, messagebox

    root = tk.Tk()
    root.title("ECHO Mod Loader - 模组管理与加载器")
    root.geometry("600x595")
    root.resizable(False, False)
    root.configure(bg="#0d1117")

    # Center window
    root.update_idletasks()
    w, h = 600, 595
    sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
    root.geometry(f"{w}x{h}+{(sw-w)//2}+{(sh-h)//2}")

    # Color palette
    BG = "#0d1117"
    CARD_BG = "#161b22"
    BORDER_COLOR = "#30363d"
    TEXT_MAIN = "#f0f6fc"
    TEXT_MUTED = "#8b949e"
    ACCENT = "#5865f2"
    ACCENT_HOVER = "#4752c4"
    DANGER = "#f85149"
    SUCCESS = "#3fb950"
    WARNING = "#d29922"

    # Header
    header = tk.Frame(root, bg=BG)
    header.pack(fill="x", padx=24, pady=(18, 10))

    title_row = tk.Frame(header, bg=BG)
    title_row.pack(fill="x")

    title_label = tk.Label(
        title_row,
        text="ECHO MOD LOADER",
        font=("Segoe UI", 16, "bold"),
        fg="#58a6ff",
        bg=BG,
    )
    title_label.pack(side="left")

    ver_badge = tk.Label(
        title_row,
        text="v0.4.0 LOADER",
        font=("Segoe UI", 9, "bold"),
        fg=ACCENT,
        bg="#1f2438",
        padx=8,
        pady=2,
    )
    ver_badge.pack(side="left", padx=(10, 0))

    subtitle = tk.Label(
        header,
        text="ECHO Steam 客户端模组注入与扩展管理平台",
        font=("Segoe UI", 9),
        fg=TEXT_MUTED,
        bg=BG,
    )
    subtitle.pack(anchor="w", pady=(3, 0))

    # Marquee Announcement Banner
    marquee_frame = tk.Frame(root, bg="#151f30", highlightbackground="#2d3a54", highlightthickness=1)
    marquee_frame.pack(fill="x", padx=24, pady=(0, 10))

    marquee_tag = tk.Label(
        marquee_frame,
        text="📢 公告",
        font=("Segoe UI", 9, "bold"),
        fg="#60a5fa",
        bg="#1e2c44",
        padx=8,
        pady=4,
    )
    marquee_tag.pack(side="left")

    marquee_canvas = tk.Canvas(marquee_frame, bg="#151f30", height=24, highlightthickness=0)
    marquee_canvas.pack(side="left", fill="both", expand=True)

    notice_msg = "★ 会同时同步更新Steam版本！Steam版本正在紧张开发中！ ★ 欢迎体验 ECHO 模组生态与拓展！"
    text_id = marquee_canvas.create_text(
        420, 12, text=notice_msg, fill="#93c5fd", font=("Segoe UI", 9, "bold"), anchor="w"
    )

    def scroll_notice():
        try:
            if not root.winfo_exists():
                return
            marquee_canvas.move(text_id, -1, 0)
            bbox = marquee_canvas.bbox(text_id)
            if bbox and bbox[2] < 0:
                c_width = marquee_canvas.winfo_width() or 420
                marquee_canvas.coords(text_id, c_width + 10, 12)
            root.after(30, scroll_notice)
        except Exception:
            pass

    root.after(150, scroll_notice)

    # Status Card
    card = tk.Frame(root, bg=CARD_BG, highlightbackground=BORDER_COLOR, highlightthickness=1)
    card.pack(fill="x", padx=24, pady=(0, 10))

    card_header = tk.Frame(card, bg=CARD_BG)
    card_header.pack(fill="x", padx=14, pady=(10, 6))

    card_title = tk.Label(
        card_header,
        text="ECHO 客户端状态",
        font=("Segoe UI", 9, "bold"),
        fg=TEXT_MAIN,
        bg=CARD_BG,
    )
    card_title.pack(side="left")

    status_pill = tk.Label(
        card_header,
        text="● 检测中...",
        font=("Segoe UI", 8, "bold"),
        fg=TEXT_MUTED,
        bg="#21262d",
        padx=8,
        pady=2,
    )
    status_pill.pack(side="right")

    path_var = tk.StringVar(value=str(selected_echo_exe() or "未检测到 ECHO 安装路径"))

    path_box = tk.Frame(card, bg="#0d1117", highlightbackground="#21262d", highlightthickness=1)
    path_box.pack(fill="x", padx=14, pady=(0, 8))

    path_label = tk.Label(
        path_box,
        textvariable=path_var,
        font=("Consolas", 8),
        fg="#7ee787" if selected_echo_exe() else "#ffa657",
        bg="#0d1117",
        wraplength=520,
        justify="left",
        anchor="w",
    )
    path_label.pack(fill="x", padx=8, pady=5)

    card_footer = tk.Frame(card, bg=CARD_BG)
    card_footer.pack(fill="x", padx=14, pady=(0, 10))

    relay_label = tk.Label(
        card_footer,
        text="本地中继核心: 127.0.0.1:47891",
        font=("Segoe UI", 8),
        fg=TEXT_MUTED,
        bg=CARD_BG,
    )
    relay_label.pack(side="left")

    def update_ui_state():
        exe = selected_echo_exe()
        st = client_mod_status(exe)
        if exe:
            path_var.set(str(exe))
            path_label.config(fg="#7ee787")
        else:
            path_var.set("未找到 ECHO 安装路径，请点击右侧手动选择")
            path_label.config(fg="#ffa657")

        if st == "client mod active":
            status_pill.config(text="● 模组注入已激活", fg=SUCCESS, bg="#122619")
            mod_together_status.config(text="● 运行就绪", fg=SUCCESS, bg="#122619")
        elif st == "client mod inactive":
            status_pill.config(text="● 尚未注入", fg=WARNING, bg="#2d2212")
            mod_together_status.config(text="○ 可安装", fg="#60a5fa", bg="#152438")
        else:
            status_pill.config(text="● 未检测到客户端", fg=DANGER, bg="#2f1519")
            mod_together_status.config(text="× 客户端未就绪", fg=DANGER, bg="#2f1519")

    def choose_echo():
        initial = selected_echo_exe()
        selected = filedialog.askdirectory(
            title="选择 ECHO 安装目录",
            initialdir=str(initial.parent if initial else Path(os.environ.get("PROGRAMFILES", r"C:\Program Files"))),
        )
        if not selected:
            return
        try:
            set_echo_directory(Path(selected))
            update_ui_state()
        except Exception as error:
            messagebox.showerror("无效的 ECHO 目录", str(error))

    browse_btn = tk.Button(
        card_footer,
        text="更改路径...",
        font=("Segoe UI", 8),
        fg=TEXT_MAIN,
        bg="#21262d",
        activebackground="#30363d",
        activeforeground=TEXT_MAIN,
        relief="flat",
        cursor="hand2",
        padx=6,
        pady=1,
        command=choose_echo,
    )
    browse_btn.pack(side="right")

    # Mod List Hub
    mods_frame = tk.Frame(root, bg=BG)
    mods_frame.pack(fill="x", padx=24, pady=(0, 10))

    mods_title_row = tk.Frame(mods_frame, bg=BG)
    mods_title_row.pack(fill="x", pady=(0, 6))

    tk.Label(
        mods_title_row,
        text="模组列表与扩展管理 (MOD HUB)",
        font=("Segoe UI", 9, "bold"),
        fg="#94a3b8",
        bg=BG,
    ).pack(side="left")

    # Mod Item 1: ECHO Together (Active)
    mod1 = tk.Frame(mods_frame, bg="#172234", highlightbackground="#3b82f6", highlightthickness=1)
    mod1.pack(fill="x", pady=(0, 6))

    mod1_top = tk.Frame(mod1, bg="#172234")
    mod1_top.pack(fill="x", padx=10, pady=(8, 2))

    tk.Label(
        mod1_top,
        text="🎧 ECHO Together (一起听)",
        font=("Segoe UI", 10, "bold"),
        fg="#ffffff",
        bg="#172234",
    ).pack(side="left")

    mod_together_status = tk.Label(
        mod1_top,
        text="● 就绪",
        font=("Segoe UI", 8, "bold"),
        fg=SUCCESS,
        bg="#122619",
        padx=6,
        pady=1,
    )
    mod_together_status.pack(side="right")

    tk.Label(
        mod1,
        text="跨网络多设备同步播放、房间推流与播放控制（右侧悬浮挂件）",
        font=("Segoe UI", 8),
        fg="#93c5fd",
        bg="#172234",
    ).pack(anchor="w", padx=10, pady=(0, 8))

    # Mod Item 2: Streaming Media (In Dev)
    mod2 = tk.Frame(mods_frame, bg=CARD_BG, highlightbackground="#242c38", highlightthickness=1)
    mod2.pack(fill="x", pady=(0, 6))

    mod2_top = tk.Frame(mod2, bg=CARD_BG)
    mod2_top.pack(fill="x", padx=10, pady=(6, 2))

    tk.Label(
        mod2_top,
        text="🌐 流媒体服务拓展",
        font=("Segoe UI", 9, "bold"),
        fg="#94a3b8",
        bg=CARD_BG,
    ).pack(side="left")

    tk.Label(
        mod2_top,
        text="⏳ 正在开发中",
        font=("Segoe UI", 8),
        fg=WARNING,
        bg="#2d2212",
        padx=6,
        pady=1,
    ).pack(side="right")

    tk.Label(
        mod2,
        text="支持网易云音乐、QQ音乐、Spotify等在线流媒体音频服务接入与解析",
        font=("Segoe UI", 8),
        fg="#64748b",
        bg=CARD_BG,
    ).pack(anchor="w", padx=10, pady=(0, 6))

    # Mod Item 3: Pending Expansion (Waiting Dev)
    mod3 = tk.Frame(mods_frame, bg=CARD_BG, highlightbackground="#242c38", highlightthickness=1)
    mod3.pack(fill="x")

    mod3_top = tk.Frame(mod3, bg=CARD_BG)
    mod3_top.pack(fill="x", padx=10, pady=(6, 2))

    tk.Label(
        mod3_top,
        text="📦 更多模组扩展",
        font=("Segoe UI", 9, "bold"),
        fg="#94a3b8",
        bg=CARD_BG,
    ).pack(side="left")

    tk.Label(
        mod3_top,
        text="⏳ 正在等待开发中",
        font=("Segoe UI", 8),
        fg="#818cf8",
        bg="#1e1b4b",
        padx=6,
        pady=1,
    ).pack(side="right")

    tk.Label(
        mod3,
        text="更多拓展模组正在开发中，敬请期待后续版本更新...",
        font=("Segoe UI", 8),
        fg="#64748b",
        bg=CARD_BG,
    ).pack(anchor="w", padx=10, pady=(0, 6))

    # Action Hub
    actions_frame = tk.Frame(root, bg=BG)
    actions_frame.pack(fill="x", padx=24, pady=(10, 0))

    def do_install():
        try:
            install_mod()
            update_ui_state()
            messagebox.showinfo("ECHO Mod Loader", "Together 模组安装成功！ECHO 已自动启动，请在右侧查看『Together』浮动标签。")
        except Exception as error:
            messagebox.showerror("安装失败", str(error))

    def do_uninstall():
        try:
            uninstall_mod()
            update_ui_state()
            messagebox.showinfo("ECHO Mod Loader", "已成功卸载模组注入，并还原原始 ECHO 客户端。")
        except Exception as error:
            messagebox.showerror("卸载失败", str(error))

    def do_launch():
        try:
            start_echo()
        except Exception as error:
            messagebox.showerror("启动失败", str(error))

    btn_install = tk.Button(
        actions_frame,
        text="✨ 一键安装 / 更新 Together 模组",
        font=("Segoe UI", 10, "bold"),
        fg="#ffffff",
        bg=ACCENT,
        activebackground=ACCENT_HOVER,
        activeforeground="#ffffff",
        relief="flat",
        cursor="hand2",
        pady=8,
        command=do_install,
    )
    btn_install.pack(fill="x", pady=(0, 6))

    row_sub_actions = tk.Frame(actions_frame, bg=BG)
    row_sub_actions.pack(fill="x")

    btn_launch = tk.Button(
        row_sub_actions,
        text="🚀 启动 ECHO",
        font=("Segoe UI", 9, "bold"),
        fg=TEXT_MAIN,
        bg="#21262d",
        activebackground="#30363d",
        activeforeground=TEXT_MAIN,
        relief="flat",
        cursor="hand2",
        pady=6,
        command=do_launch,
    )
    btn_launch.pack(side="left", fill="x", expand=True, padx=(0, 5))

    btn_uninstall = tk.Button(
        row_sub_actions,
        text="🗑️ 卸载并恢复原版",
        font=("Segoe UI", 9),
        fg="#f85149",
        bg="#21262d",
        activebackground="#3f1518",
        activeforeground="#ff7b72",
        relief="flat",
        cursor="hand2",
        pady=6,
        command=do_uninstall,
    )
    btn_uninstall.pack(side="right", fill="x", expand=True, padx=(5, 0))

    # Bottom Tips
    tip_label = tk.Label(
        root,
        text="提示：ECHO Together 注入后将在 ECHO 客户端右侧边缘生成毛玻璃悬浮挂件。",
        font=("Segoe UI", 8),
        fg=TEXT_MUTED,
        bg=BG,
        wraplength=520,
        justify="center",
    )
    tip_label.pack(side="bottom", pady=(0, 10))

    update_ui_state()
    root.protocol("WM_DELETE_WINDOW", root.destroy)
    root.mainloop()


def self_test():
    injection = relay_injection()
    renderer = renderer_injection()
    required_renderer = (
        CLIENT_RENDERER_MARKER,
        "quality:echoTogetherState.opusEnabled===false?'direct':'opus'",
        "setInterval(echoTogetherTick,echoTogetherSyncInterval",
        "maxMembers:echoTogetherState.maxMembers",
        "echoTogetherRememberPublished",
        "localSourceChanged",
        "uploadAvailable",
        "echoTogetherRetry",
        "echo-together-upload-progress",
    )
    if CLIENT_MOD_MARKER not in injection or "/v1/together/upload-progress" not in injection or "echoTogetherRelayServer.listen" not in injection or renderer.count("echoTogetherLocalApi('/v1/together/publish'") != 1 or any(item not in renderer for item in required_renderer):
        raise AssertionError("ECHO relay injection is missing")


def main():
    parser = argparse.ArgumentParser(description="Install or remove ECHO Together with a reversible ECHO client mod.")
    parser.add_argument("--check", action="store_true", help="print detected paths and exit")
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--install", action="store_true")
    parser.add_argument("--uninstall", action="store_true")
    parser.add_argument("--source-root", help="use an ECHOSteam source checkout instead of an installed ECHO client")
    parser.add_argument("--source-install", action="store_true", help="patch the built ECHOSteam out/ bundle")
    parser.add_argument("--source-uninstall", action="store_true", help="restore the ECHOSteam out/ bundle")
    parser.add_argument("--source-start", action="store_true", help="launch the built ECHOSteam out/ bundle")
    parser.add_argument("--package-root", help="select a built Windows directory package containing ECHO.exe")
    parser.add_argument("--package-start", action="store_true", help="launch the selected Windows directory package")
    parser.add_argument("--external-renderer-output", help="write the Python Together floating renderer to a loader mod entry file")
    args = parser.parse_args()
    if args.package_root:
        set_echo_directory(Path(args.package_root))
    if args.check:
        echo_exe = selected_echo_exe()
        source_root = discover_source_root(args.source_root)
        print(json.dumps({"echo": str(echo_exe) if echo_exe else None, "sourceRoot": str(source_root) if source_root else None, "config": str(CONFIG_FILE), "modConfig": str(MOD_CONFIG_FILE), "userData": str(USER_DATA), "relay": RELAY_URL, "status": status_text(), "sourceStatus": source_mod_status(source_root)}, ensure_ascii=False, indent=2))
        return
    if args.external_renderer_output:
        output = Path(args.external_renderer_output).expanduser()
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(external_renderer_source(), encoding="utf-8")
        print(f"external renderer written: {output}")
        return
    if args.self_test:
        self_test()
        print("launcher self-test: ok")
        return
    if args.source_install or args.source_uninstall or args.source_start:
        source_root = discover_source_root(args.source_root)
        if not source_root:
            raise FileNotFoundError("ECHOSteam source root was not found. Pass --source-root <checkout>.")
        write_json(CONFIG_FILE, {**read_json(CONFIG_FILE, {}), "sourceRoot": str(source_root)})
        if args.source_install:
            install_source_mod(source_root)
            print(source_mod_status(source_root))
        elif args.source_uninstall:
            uninstall_source_mod(source_root)
            print(source_mod_status(source_root))
        else:
            start_source(source_root)
            print(f"source started: {source_root}")
        return
    if args.package_start:
        start_echo()
        print(f"package started: {selected_echo_exe()}")
        return
    if args.install:
        install_mod()
        print(status_text())
        return
    if args.uninstall:
        uninstall_mod()
        print(status_text())
        return
    run_gui()


if __name__ == "__main__":
    main()
