// Loaded before every test file (see package.json's test script): a test that reaches for anything but this computer
// is refused its connection, and its file fails naming the host, even where the code under test swallows the refusal.
import net from 'node:net';

const LOCAL = ['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0'];
const reached = new Set();
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  // net.connect hands its arguments over as one normalised array
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  // a path is a Unix socket or a named pipe, which never leaves the computer
  const host = typeof first === 'object' && first !== null ? (first.path ? '' : first.host || 'localhost') : typeof first === 'number' ? (typeof args[1] === 'string' ? args[1] : 'localhost') : '';
  if (host && !LOCAL.includes(String(host).toLowerCase()) && !/^127\./.test(host)) {
    reached.add(host);
    process.exitCode = 1;
    queueMicrotask(() => this.destroy(new Error(`Tests may not reach the network: ${host}`)));
    return this;
  }
  return connect.apply(this, args);
};
process.on('exit', () => {
  if (!reached.size) return;
  process.exitCode = 1;
  console.error(`\nA test reached for the network (${[...reached].join(', ')}). Point it at a local stub: see test/no-network.mjs.`);
});
