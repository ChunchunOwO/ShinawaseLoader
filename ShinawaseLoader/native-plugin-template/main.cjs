module.exports = async function activate(host) {
  host.log('info', 'main-process extension loaded');
  host.handle('ping', async () => ({
    ok: true,
    message: host.config.message || 'pong',
    echoRoot: host.echoRoot,
    pid: process.pid,
  }));
  host.ipc.handle('shinawase:example-native', async () => ({ ok: true, id: host.id }));
  return () => {
    try { host.ipc.removeHandler('shinawase:example-native'); } catch {}
  };
};
