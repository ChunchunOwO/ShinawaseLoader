const expression = process.argv.slice(2).join(' ');
if (!expression) throw new Error('expression required');
const targets = await (await fetch('http://127.0.0.1:9229/json/list')).json();
const target = targets.find((item) => item.type === 'page' && item.webSocketDebuggerUrl && item.title === 'ECHO') || targets.find((item) => item.type === 'page' && item.webSocketDebuggerUrl);
if (!target) throw new Error('page target not found');
const socket = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 0;
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId;
  const onMessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== id) return;
    socket.removeEventListener('message', onMessage);
    message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
  };
  socket.addEventListener('message', onMessage);
  socket.send(JSON.stringify({ id, method, params }));
});
await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
try {
  await call('Runtime.enable');
  const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  console.log(JSON.stringify(result?.result?.value ?? result?.result ?? null, null, 2));
} finally { socket.close(); }
