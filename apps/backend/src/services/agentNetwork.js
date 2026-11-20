// Where an isolated process may connect. A macOS sandbox profile filters by address and port, never by host name
// ("host must be * or localhost"), and a provider's addresses change, so a list of hosts cannot be written into the
// profile. Instead the profile of a process with a list opens one way out, a port on this computer where Spectrum
// listens (the gate), and closes the rest: HTTPS to any address, DNS and the system resolver's socket. The gate is an
// HTTP proxy that takes CONNECT only: the host must be on the list and the port 443, the name is looked up here,
// outside isolation, an address of this computer is refused, and the first bytes through the tunnel must be a TLS
// hello that names the same host. The process is told of the gate through the proxy variables most programs honour;
// one that ignores them reaches nothing.
//
// What it does not stop is in docs/handbook (Agents, Network): above all, anything sent to a host on the list.
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import { lookup } from 'node:dns/promises';

/** The hosts Spectrum's own tools server reaches from inside an agent's isolation (literature_search, fetch_bibtex, check_references). */
export const SCHOLARLY_HOSTS = ['api.openalex.org', 'api.crossref.org', 'doi.org', 'data.crossref.org', 'api.datacite.org', 'data.crosscite.org', 'export.arxiv.org', 'arxiv.org', 'api.semanticscholar.org'];

// a name with a dot, or *.name for every host below one; never an address
const HOST = /^(\*\.)?(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/;
/** A host as the user typed it (a pasted link gives its host), or '' when it is not a host name. */
export function cleanHost(value) {
  const host = String(value ?? '').trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/[/:?#].*$/, '').replace(/\.$/, '');
  return HOST.test(host) ? host : '';
}
/** A saved list, as it is used: valid hosts only, each once, 100 at most. */
export const cleanHosts = (list) => [...new Set((Array.isArray(list) ? list : []).map(cleanHost).filter(Boolean))].slice(0, 100);
export const hostAllowed = (host, list) => list.some((entry) => entry === host || (entry.startsWith('*.') && host.endsWith(entry.slice(1))));

const loopback = new net.BlockList();
loopback.addSubnet('127.0.0.0', 8);
loopback.addSubnet('0.0.0.0', 8);
loopback.addAddress('::1', 'ipv6');
loopback.addAddress('::', 'ipv6');
// what isolation refuses without a list too (a service on this computer), by any of the computer's own addresses
export const thisComputer = ({ address, family }) => loopback.check(address, family === 6 ? 'ipv6' : 'ipv4') || Object.values(os.networkInterfaces()).flat().some((i) => i?.address === address);

// A test names a stand-in server on this computer for a host (host → port on 127.0.0.1); never in a release
const standIns = new Map();
export function nameStandIn(host, port) {
  if (process.env.NODE_ENV === 'production') throw new Error('Stand-in hosts are for tests.');
  if (port) standIns.set(host, port); else standIns.delete(host);
}

/**
 * The server name a TLS ClientHello asks for: '' when it names none, null when the bytes are not one, undefined
 * while more are needed.
 */
export function helloName(b) {
  if (b.length < 5) return undefined;
  if (b[0] !== 0x16 || b[1] !== 3) return null;
  const end = 5 + b.readUInt16BE(3);
  if (b.length < end) return undefined;
  try {
    // a hello in one record: type 1, its length, version, random, then session id, cipher suites, compression
    if (b[5] !== 1 || b.readUIntBE(6, 3) > end - 9) return null;
    let at = 5 + 4 + 2 + 32;
    at += 1 + b[at];
    at += 2 + b.readUInt16BE(at);
    at += 1 + b[at];
    const stop = Math.min(end, at + 2 + b.readUInt16BE(at));
    for (at += 2; at + 4 <= stop; at += 4 + b.readUInt16BE(at + 2)) {
      // server_name: a list whose first entry is a host name
      if (b.readUInt16BE(at) === 0) return b[at + 6] === 0 ? b.toString('latin1', at + 9, at + 9 + b.readUInt16BE(at + 7)).toLowerCase() : '';
    }
    return '';
  } catch { return null; }
}

const REFUSED = 'Spectrum’s isolation does not let this program reach that host. The user can allow it in Spectrum.';

/**
 * Opens a gate: { port, close }. hosts(): the list now, read at each connection so a host the user allows works at
 * once; onRefused(host): a host off the list was asked for.
 */
export async function openGate({ hosts, onRefused }) {
  const tunnels = new Set();
  const server = http.createServer((req, res) => { res.writeHead(403, { Connection: 'close' }).end('Spectrum’s isolation allows HTTPS only.\n'); });
  server.on('connect', async (req, client, head) => {
    client.on('error', () => {});
    const refuse = (status, why) => client.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${why}\n`);
    const [, name = '', port] = /^([^:]*):(\d+)$/.exec(req.url || '') || [];
    const host = name.toLowerCase();
    if (port !== '443' || !HOST.test(host) || host.startsWith('*')) return refuse('403 Forbidden', 'Spectrum’s isolation allows HTTPS to a named host on port 443 only.');
    // the list first: a host off it is never looked up
    if (!hostAllowed(host, cleanHosts(await Promise.resolve().then(hosts).catch(() => [])))) {
      onRefused?.(host);
      return refuse('403 Forbidden', REFUSED);
    }
    let target;
    if (standIns.has(host)) target = { address: '127.0.0.1', port: standIns.get(host) };
    else {
      const found = (await lookup(host, { all: true }).catch(() => [])).find((a) => !thisComputer(a));
      if (!found) return refuse('502 Bad Gateway', 'That host was not found, or is this computer.');
      target = { address: found.address, port: 443 };
    }
    if (client.destroyed) return;
    const upstream = net.connect(target.port, target.address);
    const end = () => { client.destroy(); upstream.destroy(); tunnels.delete(end); };
    tunnels.add(end);
    client.on('close', end);
    upstream.on('close', end);
    let open = false;
    upstream.on('error', () => { if (!open) refuse('502 Bad Gateway', 'That host could not be reached.'); });
    upstream.once('connect', () => {
      open = true;
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      // nothing passes until the hello has named the host the list allowed, so the tunnel carries TLS to that host and
      // not, through an address two sites share, to another
      let first = head;
      const wait = setTimeout(end, 30000);
      wait.unref();
      const check = (chunk) => {
        first = first.length ? Buffer.concat([first, chunk]) : chunk;
        const named = first.length > 32768 ? null : helloName(first);
        if (named === undefined) return;
        clearTimeout(wait);
        client.off('data', check);
        if (named !== host) return end();
        upstream.write(first);
        client.pipe(upstream);
        upstream.pipe(client);
      };
      client.on('data', check);
      if (head.length) check(Buffer.alloc(0));
    });
  });
  server.on('clientError', (err, socket) => socket.destroy());
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  server.unref();
  return {
    port: server.address().port,
    close() { server.close(); server.closeAllConnections(); for (const end of [...tunnels]) end(); }
  };
}

/** What tells a program of the gate: the proxy variables, and Node's own switch to honour them. */
export function proxyEnv(port) {
  const url = `http://127.0.0.1:${port}`;
  const direct = 'localhost,127.0.0.1,::1';
  return { HTTPS_PROXY: url, https_proxy: url, HTTP_PROXY: url, http_proxy: url, NO_PROXY: direct, no_proxy: direct, NODE_USE_ENV_PROXY: '1' };
}
