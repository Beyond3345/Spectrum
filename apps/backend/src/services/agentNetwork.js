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
import { bypasses } from './networkProxy.js';

/** The hosts Spectrum's own tools server reaches from inside an agent's isolation (literature_search, fetch_bibtex, check_references). */
export const SCHOLARLY_HOSTS = ['api.openalex.org', 'api.crossref.org', 'doi.org', 'data.crossref.org', 'api.datacite.org', 'data.crosscite.org', 'export.arxiv.org', 'arxiv.org', 'api.semanticscholar.org'];
/**
 * With those, what its compile downloads on first use, as an agent's private home starts with neither: a Typst
 * package, and Tectonic's TeX files (the relay hands on to the data host). Both programs honour the proxy variables.
 */
export const TOOL_HOSTS = [...SCHOLARLY_HOSTS, 'packages.typst.org', 'relay.fullyjustified.net', 'data1.fullyjustified.net'];

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
export function thisComputer({ address, family }) {
  // an IPv4 address written as an IPv6 one is that IPv4 address
  const plain = family === 6 && /^::ffff:\d+\.\d+\.\d+\.\d+$/i.test(address) ? address.slice(7) : address;
  return loopback.check(plain, net.isIPv6(plain) ? 'ipv6' : 'ipv4') || Object.values(os.networkInterfaces()).flat().some((i) => i?.address === plain);
}

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
 * A tunnel to host:port through the user's proxy (networkProxy.js): HTTP CONNECT for an http:// proxy, SOCKS5 CONNECT for
 * a socks5:// one, the name given to the proxy to look up. Resolves to the socket once the proxy says it is open.
 */
export function throughProxy(proxy, host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(proxy.port, proxy.host);
    let got = Buffer.alloc(0), step = 0;
    const fail = (why) => { socket.destroy(); reject(new Error(why)); };
    socket.setTimeout(15000, () => fail('The proxy did not answer.'));
    socket.on('error', (err) => fail(`The proxy could not be reached (${err.code || err.message}).`));
    const done = (rest) => { socket.setTimeout(0); socket.removeAllListeners('data'); socket.removeAllListeners('error'); if (rest.length) socket.unshift(rest); resolve(socket); };
    const name = Buffer.from(host);
    const connectRequest = () => Buffer.concat([Buffer.from([5, 1, 0, 3, name.length]), name, Buffer.from([port >> 8, port & 255])]);
    socket.once('connect', () => {
      if (proxy.scheme === 'http') {
        const auth = proxy.user ? `Proxy-Authorization: Basic ${Buffer.from(`${proxy.user}:${proxy.pass || ''}`).toString('base64')}\r\n` : '';
        socket.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n${auth}\r\n`);
      } else socket.write(Buffer.from(proxy.user ? [5, 2, 0, 2] : [5, 1, 0]));
    });
    socket.on('data', (chunk) => {
      got = Buffer.concat([got, chunk]);
      if (got.length > 16384) return fail('The proxy’s answer was too long.');
      if (proxy.scheme === 'http') {
        const end = got.indexOf('\r\n\r\n');
        if (end < 0) return;
        const status = Number(/^HTTP\/1\.[01] (\d{3})/.exec(got.toString('latin1', 0, end))?.[1]);
        return status === 200 ? done(got.subarray(end + 4)) : fail(`The proxy refused the connection${status ? ` (${status})` : ''}.`);
      }
      // SOCKS5: the method it chose, its answer to the name and password, then to the connection
      if (step === 0) {
        if (got.length < 2) return;
        const method = got[1];
        got = got.subarray(2);
        if (got[0] === undefined && method === 0) { step = 2; return socket.write(connectRequest()); }
        if (method === 0) { step = 2; socket.write(connectRequest()); }
        else if (method === 2 && proxy.user) { step = 1; const u = Buffer.from(proxy.user), w = Buffer.from(proxy.pass || ''); socket.write(Buffer.concat([Buffer.from([1, u.length]), u, Buffer.from([w.length]), w])); }
        else return fail('The proxy wants a sign-in Spectrum does not have.');
        if (!got.length) return;
      }
      if (step === 1) {
        if (got.length < 2) return;
        if (got[1] !== 0) return fail('The proxy refused the name and password.');
        got = got.subarray(2);
        step = 2;
        socket.write(connectRequest());
        if (!got.length) return;
      }
      if (got.length < 5) return;
      if (got[1] !== 0) return fail(`The proxy refused the connection (SOCKS ${got[1]}).`);
      const length = 6 + (got[3] === 1 ? 4 : got[3] === 4 ? 16 : 1 + got[4]);
      if (got.length >= length) done(got.subarray(length));
    });
  });
}

// whether a name is this computer by the lookup here, given a moment, which a network that answers names only
// through its proxy may not: then the proxy looks it up
const resolvesHere = (host) => Promise.race([
  lookup(host, { all: true }).then((all) => all.some(thisComputer), () => false),
  new Promise((resolve) => setTimeout(resolve, 1500, false).unref())
]);

/**
 * Opens a gate: { port, close, asked }. hosts(): the list now, read at each connection so a host the user allows works
 * at once, or null for any host (an agent on Any host that goes through a proxy); onRefused(host): a host off the list
 * was asked for; asked(): how many times the gate was asked for anything. proxy: the user's proxy (networkProxy.js), or
 * a function giving it at each connection, which a host goes on through unless its NO_PROXY names it; without one the
 * gate connects itself.
 */
export async function openGate({ hosts, onRefused, proxy }) {
  const tunnels = new Set();
  let asked = 0;
  const server = http.createServer((req, res) => { asked++; res.writeHead(403, { Connection: 'close' }).end('Spectrum’s isolation allows HTTPS only.\n'); });
  server.on('connect', async (req, client, head) => {
    asked++;
    client.on('error', () => {});
    const refuse = (status, why) => client.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${why}\n`);
    const [, name = '', port] = /^([^:]*):(\d+)$/.exec(req.url || '') || [];
    const host = name.toLowerCase();
    if (port !== '443' || !HOST.test(host) || host.startsWith('*')) return refuse('403 Forbidden', 'Spectrum’s isolation allows HTTPS to a named host on port 443 only.');
    // the list first: a host off it is never looked up, nor asked of the proxy
    if (hosts && !hostAllowed(host, cleanHosts(await Promise.resolve().then(hosts).catch(() => [])))) {
      onRefused?.(host);
      return refuse('403 Forbidden', REFUSED);
    }
    let upstream;
    const via = typeof proxy === 'function' ? proxy() : proxy;
    if (via && !bypasses(host, via.noProxy)) {
      // a name this computer answers to is refused as below; one the lookup here can't answer is the proxy's to look up
      if (await resolvesHere(host)) return refuse('502 Bad Gateway', 'That host was not found, or is this computer.');
      try { upstream = await throughProxy(via, host, 443); } catch (err) { return refuse('502 Bad Gateway', err.message); }
    } else {
      let target;
      if (standIns.has(host)) target = { address: '127.0.0.1', port: standIns.get(host) };
      else {
        const found = (await lookup(host, { all: true }).catch(() => [])).find((a) => !thisComputer(a));
        if (!found) return refuse('502 Bad Gateway', 'That host was not found, or is this computer.');
        target = { address: found.address, port: 443 };
      }
      if (client.destroyed) return;
      upstream = net.connect(target.port, target.address);
      try { await new Promise((resolve, reject) => { upstream.once('connect', resolve); upstream.once('error', reject); }); }
      catch { return refuse('502 Bad Gateway', 'That host could not be reached.'); }
    }
    if (client.destroyed) return upstream.destroy();
    upstream.on('error', () => {});
    const end = () => { client.destroy(); upstream.destroy(); tunnels.delete(end); };
    tunnels.add(end);
    client.on('close', end);
    upstream.on('close', end);
    {
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
    }
  });
  server.on('clientError', (err, socket) => socket.destroy());
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  server.unref();
  return {
    port: server.address().port,
    asked: () => asked,
    close() { server.close(); server.closeAllConnections(); for (const end of [...tunnels]) end(); }
  };
}

/** What tells a program of the gate: the proxy variables, and Node's own switch to honour them. */
export function proxyEnv(port) {
  const url = `http://127.0.0.1:${port}`;
  const direct = 'localhost,127.0.0.1,::1';
  return { HTTPS_PROXY: url, https_proxy: url, HTTP_PROXY: url, http_proxy: url, NO_PROXY: direct, no_proxy: direct, NODE_USE_ENV_PROXY: '1' };
}

const PROXY_VARS = ['HTTPS_PROXY', 'https_proxy', 'ALL_PROXY', 'all_proxy', 'HTTP_PROXY', 'http_proxy'];
const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?)$/i;
/** A proxy as the line shows it: host and port only, never a name, password or path. */
function proxyAt(value) {
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `http://${value}`);
    return `${url.host}${LOOPBACK.test(url.hostname) ? ' (this computer)' : ''}`;
  } catch { return 'an address Spectrum could not read'; }
}
/** The proxies `scutil --proxy` says this Mac's network settings name: [kind, where]. */
export function systemProxies(text = '') {
  const top = Object.fromEntries([...String(text).matchAll(/^ {2}(\w+) : (.*)$/gm)].map(([, k, v]) => [k, v.trim()]));
  const on = (k) => top[`${k}Enable`] === '1';
  return [
    ...[['HTTPS', 'HTTPS'], ['HTTP', 'HTTP'], ['SOCKS', 'SOCKS']].filter(([k]) => on(k) && top[`${k}Proxy`]).map(([k, name]) => [`${name} proxy`, proxyAt(`${top[`${k}Proxy`]}:${top[`${k}Port`] || ''}`.replace(/:$/, ''))]),
    ...(on('ProxyAutoConfig') && top.ProxyAutoConfigURLString ? [['automatic proxy configuration', proxyAt(top.ProxyAutoConfigURLString)]] : []),
    ...(on('ProxyAutoDiscovery') ? [['automatic proxy discovery', '']] : [])
  ];
}
/**
 * One line on how an agent may find a proxy: the proxy variables Spectrum gave it (passed), the proxies this Mac's
 * network settings name (scutil: `scutil --proxy`'s output, read outside isolation; undefined: not read), and the proxy
 * variables Spectrum's own environment has, which it does not pass on. Hosts and ports only.
 */
export function proxyNote(name, passed = {}, scutil, own = process.env, proxy) {
  const given = PROXY_VARS.filter((k) => passed[k]);
  const gate = given.length && given.every((k) => /^http:\/\/127\.0\.0\.1:\d+$/.test(passed[k]));
  const parts = [given.length ? `Spectrum passed ${given.join(', ')} (${gate ? `its own gate${proxy ? `, which goes on through the proxy ${proxy.text} (${proxy.from.toLowerCase()})` : ' for the list of hosts'}` : proxyAt(passed[given[0]])})` : 'Spectrum passed no proxy variables'];
  const found = scutil === undefined ? null : systemProxies(scutil);
  parts.push(found === null ? 'this computer’s proxy settings were not read' : found.length ? `this Mac’s network settings name ${found.map(([kind, at]) => at ? `${kind} ${at}` : kind).join(', ')}` : 'this Mac’s network settings name no proxy');
  const kept = PROXY_VARS.filter((k) => own[k] && !passed[k]);
  if (kept.length) parts.push(`Spectrum’s own environment has ${kept.join(', ')} (${proxyAt(own[kept[0]])}), not passed on`);
  const local = !proxy && found?.some(([, at]) => at.endsWith('(this computer)'));
  return `Network check for ${name}: ${parts.join('; ')}.${local ? ` Isolation does not let ${name} reach a proxy on this computer.` : ''}`;
}
