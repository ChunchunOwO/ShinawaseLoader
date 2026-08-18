const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const targets = await (await fetch('http://127.0.0.1:9229/json/list')).json();
const target = targets.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl);
if (!target) throw new Error('echo_cdp_page_missing');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let sequence = 0;
const evaluate = (expression) => new Promise((resolve, reject) => {
  const id = ++sequence;
  const onMessage = (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id !== id) return;
    socket.removeEventListener('message', onMessage);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result?.result?.value);
  };
  socket.addEventListener('message', onMessage);
  socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
});

const before = await evaluate(`JSON.stringify({
  nav: Boolean(document.querySelector('[data-echo-external-mods]')),
  navText: document.querySelector('[data-echo-external-mods]')?.textContent?.trim() || null,
  panel: Boolean(document.querySelector('.echo-external-mod-panel')),
  hash: location.hash,
})`);
await evaluate("document.querySelector('[data-echo-external-mods]')?.click();");
await delay(500);
const after = await evaluate(`JSON.stringify({
  nav: Boolean(document.querySelector('[data-echo-external-mods]')),
  panel: Boolean(document.querySelector('.echo-external-mod-panel')),
  parent: document.querySelector('.echo-external-mod-panel')?.parentElement?.className || null,
  position: document.querySelector('.echo-external-mod-panel') ? getComputedStyle(document.querySelector('.echo-external-mod-panel')).position : null,
  gridColumn: document.querySelector('.echo-external-mod-panel') ? getComputedStyle(document.querySelector('.echo-external-mod-panel')).gridColumn : null,
})`);
console.log(JSON.stringify({ before: JSON.parse(before), after: JSON.parse(after) }, null, 2));
socket.close();
