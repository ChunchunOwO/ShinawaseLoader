// Protocol fixture only; this is not evidence of native GPUI behavior.
import { connect } from 'node:net';
import { encryptedChannel } from '../../ShinawaseLoader/zankyo-session.mjs';

const [host, port] = process.env.SHINAWASE_ENDPOINT.split(':');
const secret = Buffer.from(process.env.SHINAWASE_KEY, 'hex');
delete process.env.SHINAWASE_KEY;
delete process.env.SHINAWASE_ENDPOINT;
const socket = connect(Number(port), host);
const send = encryptedChannel(socket, secret, {
  host: true,
  onMessage(value) {
    if (value.accepted) return;
    send({ id: value.id, result: { method: value.method, params: value.params } });
  },
  onError() { process.exitCode = 1; },
});
socket.on('connect', () => send({ runtime: 'gpui', protocol: 1, pid: process.pid }));
socket.on('close', () => process.exit());
