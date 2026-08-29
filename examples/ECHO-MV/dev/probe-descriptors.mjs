// Dev-only: determine exact property descriptors so we know how (or whether)
// window.echo / window.echo.mv can be replaced from the main world.
const CDP_PORT = 9229;
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''));
if (!target) { console.error('no ECHO page target'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
const state = { id: 0, pending: new Map() };
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && state.pending.has(m.id)) { const p = state.pending.get(m.id); state.pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
const call = (method, params = {}) => new Promise((res, rej) => { const id = ++state.id; state.pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (state.pending.has(id)) { state.pending.delete(id); rej(new Error('timeout')); } }, 20000); });
await call('Runtime.enable');
const r = await call('Runtime.evaluate', { expression: `(() => {
  const desc = (obj, key) => {
    let d; try { d = Object.getOwnPropertyDescriptor(obj, key); } catch (e) { return 'err:' + e.message; }
    if (!d) return 'none';
    return { hasValue: 'value' in d, valueType: d.value === null ? 'null' : typeof d.value, writable: d.writable, configurable: d.configurable, enumerable: d.enumerable, hasGet: !!d.get, hasSet: !!d.set };
  };
  const out = {};
  out.window_echo = desc(window, 'echo');
  out.echo_isExtensible = (() => { try { return Object.isExtensible(window.echo); } catch (e) { return 'err'; } })();
  out.echo_isFrozen = (() => { try { return Object.isFrozen(window.echo); } catch (e) { return 'err'; } })();
  out.echo_streaming = desc(window.echo, 'streaming');
  out.echo_mv = desc(window.echo, 'mv');
  out.echo_playback = desc(window.echo, 'playback');
  out.echo_proto_ctor = (() => { try { return Object.getPrototypeOf(window.echo)?.constructor?.name; } catch { return 'err'; } })();
  // Try defineProperty on window.echo directly (mv) — report outcome, then revert.
  out.tryDefineMvOnEcho = (() => {
    try { Object.defineProperty(window.echo, 'mv', { value: { __t: 1 }, configurable: true }); return window.echo.mv && window.echo.mv.__t === 1 ? 'ok' : 'noeffect'; }
    catch (e) { return 'throw:' + e.message; }
  })();
  // Try defineProperty on window itself (echo) to a fresh object — report, then revert.
  out.tryDefineEchoOnWindow = (() => {
    const original = window.echo;
    try {
      Object.defineProperty(window, 'echo', { value: { __probe: true, mv: { __t: 2 }, streaming: original && original.streaming }, configurable: true, writable: true });
      const ok = window.echo && window.echo.__probe === true && window.echo.mv && window.echo.mv.__t === 2;
      try { Object.defineProperty(window, 'echo', { value: original, configurable: true, writable: true }); } catch {}
      return ok ? 'ok' : 'noeffect';
    } catch (e) { return 'throw:' + e.message; }
  })();
  out.afterRevert_streaming = typeof window.echo?.streaming;
  return out;
})()`, awaitPromise: true, returnByValue: true, includeCommandLineAPI: true });
console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails, null, 1));
try { ws.close(); } catch {}
process.exit(0);
