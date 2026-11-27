// The proxy Spectrum reaches the internet through, for a network that reaches it only through one (a company proxy, or
// a proxy app such as Clash). Spectrum learns it in this order: the one the user typed in Settings › System & Network (Proxy),
// the Mac's network settings, the proxy variables of the user's login shell, which an app started from the Finder does
// not have. The backend's own requests go through it from one place (applyProxy: Node's global proxy, pointed at a
// relay in this process that goes on through the proxy); an isolated agent, MCP server or compile, which isolation
// never lets reach this computer, goes through Spectrum's gate (agentNetwork.js), which goes on through it. With no
// proxy, everything connects as before. macOS only: on Windows Spectrum connects as before.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import http from 'node:http';
import crypto from 'node:crypto';
import { DATA_DIR } from '../config/constants.js';
import { writeJsonAtomic } from '../utils/fsUtils.js';

const execFileAsync = promisify(execFile);
const file = () => path.join(DATA_DIR, 'network.json');
const testOnly = (name) => process.env.NODE_ENV !== 'production' ? process.env[name] : undefined;

/**
 * A proxy as written: http://host:port or socks5://host:port, with a name and password if it needs them; a variable's
 * value may leave out http://. { scheme, host, port, user?, pass? }, or null when it is none of these.
 */
export function parseProxy(value, { bare = false } = {}) {
  const text = String(value ?? '').trim();
  if (!text || text.length > 2048 || /\s/.test(text)) return null;
  let url;
  try { url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : bare ? `http://${text}` : text); } catch { return null; }
  const scheme = url.protocol === 'http:' ? 'http' : ['socks5:', 'socks5h:'].includes(url.protocol) ? 'socks5' : null;
  const port = Number(url.port);
  if (!scheme || !url.hostname || !Number.isInteger(port) || port < 1 || port > 65535 || (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) return null;
  return { scheme, host: url.hostname.replace(/^\[|\]$/g, ''), port, ...(url.username && { user: decodeURIComponent(url.username), pass: decodeURIComponent(url.password) }) };
}
/** A proxy as Spectrum shows it, its name and password masked. */
export const proxyText = (p) => `${p.scheme}://${p.user ? '•••@' : ''}${p.host.includes(':') ? `[${p.host}]` : p.host}:${p.port}`;

/** The hosts a proxy is not used for, from NO_PROXY or the Mac's exceptions: names, .names and *.names. */
export const noProxyList = (value) => String(value || '').split(/[\s,]+/).map((h) => h.trim().toLowerCase().replace(/:\d+$/, '')).filter(Boolean).slice(0, 200);
export const bypasses = (host, list = []) => list.some((entry) => entry === '*' || host === entry.replace(/^\*?\./, '') || host.endsWith(`.${entry.replace(/^\*?\./, '')}`));

/** The proxy the user typed, as saved: '' for none. */
export async function typedProxy() {
  try { return String(JSON.parse(await fs.readFile(file(), 'utf8')).proxy || ''); }
  catch (err) { if (err.code === 'ENOENT' || err instanceof SyntaxError) return ''; throw err; }
}
/** Saves the proxy the user typed ('' for none), checked. */
export async function saveTypedProxy(value) {
  const text = String(value ?? '').trim();
  if (text && !parseProxy(text)) throw Object.assign(new Error('Give a proxy as http://host:port or socks5://host:port, with a name and password before the host if it needs them.'), { statusCode: 400 });
  await fs.mkdir(path.dirname(file()), { recursive: true, mode: 0o700 });
  await writeJsonAtomic(file(), { proxy: text });
  await fs.chmod(file(), 0o600);
}

/** The proxy the Mac's network settings name for HTTPS, else for SOCKS, from `scutil --proxy`; an automatic configuration (PAC) is not read. */
export function systemProxy(text = '') {
  const top = Object.fromEntries([...String(text).matchAll(/^ {2}(\w+) : (.*)$/gm)].map(([, k, v]) => [k, v.trim()]));
  const exceptions = [...(String(text).match(/^ {2}ExceptionsList : <array> \{\n([\s\S]*?)\n {2}\}/m)?.[1] || '').matchAll(/^ {4}\d+ : (.+)$/gm)].map(([, h]) => h.trim());
  // ponytail: a PAC file names a proxy per address; reading it needs a JavaScript engine for its rules, so it is left to the typed proxy
  for (const [kind, scheme] of [['HTTPS', 'http'], ['SOCKS', 'socks5']]) {
    if (top[`${kind}Enable`] === '1' && top[`${kind}Proxy`] && top[`${kind}Port`]) {
      const p = parseProxy(`${scheme}://${top[`${kind}Proxy`]}:${top[`${kind}Port`]}`);
      if (p) return { ...p, noProxy: noProxyList(exceptions.join(',')) };
    }
  }
  return null;
}
// in development only a stand-in (SPECTRUM_SCUTIL), so no test goes through a proxy app this Mac happens to run
const scutil = () => process.env.NODE_ENV === 'production' ? '/usr/sbin/scutil' : testOnly('SPECTRUM_SCUTIL');
/** `scutil --proxy` as it answers now, or '' when it does not. */
export const readSystemProxies = () => scutil() ? execFileAsync(scutil(), ['--proxy'], { timeout: 3000 }).then(({ stdout }) => stdout, () => '') : Promise.resolve('');

const SHELL_VARS = ['HTTPS_PROXY', 'https_proxy', 'ALL_PROXY', 'all_proxy', 'HTTP_PROXY', 'http_proxy', 'NO_PROXY', 'no_proxy'];
const MARK = '__SPECTRUM_PROXY__';
/**
 * The proxy variables of the user's login shell, which an app started from the Finder does not have: { NAME: value }
 * for the eight proxy names only. Read once, as the shell's PATH is when Spectrum starts, given four seconds, and its
 * process group stopped after. In development only a stand-in shell (SPECTRUM_LOGIN_SHELL) is read.
 */
export function loginShellVariables() {
  return shellRead ??= new Promise((resolve) => {
    const shell = process.env.NODE_ENV === 'production' ? process.env.SHELL || '/bin/zsh' : testOnly('SPECTRUM_LOGIN_SHELL');
    if (!shell || process.platform === 'win32') return resolve({});
    let out = '', done = false;
    // works in sh, bash, zsh and fish; env prints every variable, of which only the proxy ones are kept
    const child = spawn(shell, ['-ilc', `printf '%s' ${MARK}; /usr/bin/env; printf '%s' ${MARK}`], { stdio: ['ignore', 'pipe', 'ignore'], detached: true });
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ }
      const body = out.split(MARK)[1] || '';
      out = '';
      resolve(Object.fromEntries(body.split('\n').map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]).filter(([k, v]) => SHELL_VARS.includes(k) && v)));
    };
    const timer = setTimeout(finish, 4000);
    child.stdout.on('data', (chunk) => { out += chunk; if (out.split(MARK).length > 2) finish(); });
    child.on('error', finish);
    child.on('exit', () => setTimeout(finish, 50));
  });
}
let shellRead;
/** Forgets the shell's variables, for a test. */
export const forgetShell = () => { shellRead = undefined; };

/** The proxy the shell's variables name for HTTPS: HTTPS_PROXY, else ALL_PROXY, else HTTP_PROXY. */
export function shellProxy(vars = {}) {
  for (const name of ['HTTPS_PROXY', 'ALL_PROXY', 'HTTP_PROXY']) {
    const p = parseProxy(vars[name] || vars[name.toLowerCase()], { bare: true });
    if (p) return { ...p, noProxy: noProxyList(vars.NO_PROXY || vars.no_proxy) };
  }
  return null;
}

const SOURCES = { typed: 'Set by you', system: 'From this Mac’s network settings', shell: 'From your shell' };
/**
 * The proxy Spectrum goes through now: { scheme, host, port, user?, pass?, noProxy, source, from, text }, source being
 * typed, system or shell; null for none, or on another platform than macOS.
 */
export async function currentProxy() {
  if (process.platform !== 'darwin') return null;
  const typed = parseProxy(await typedProxy().catch(() => ''));
  const system = !typed && systemProxy(await readSystemProxies());
  const shell = !typed && !system && shellProxy(await loginShellVariables());
  const found = typed ? { ...typed, noProxy: [], source: 'typed' } : system ? { ...system, source: 'system' } : shell ? { ...shell, source: 'shell' } : null;
  return found && { ...found, from: SOURCES[found.source], text: proxyText(found) };
}

/**
 * A relay on this computer for the backend's own requests, which Node's global proxy points at: it takes CONNECT to any
 * host and port and plain requests, only with its own password, and goes on through the user's proxy (HTTP or SOCKS5),
 * whose name and password stay here. { url, port, close }; relay.proxy is the proxy it goes through now.
 */
async function openRelay() {
  const { throughProxy } = await import('./agentNetwork.js');
  const secret = crypto.randomBytes(18).toString('base64url');
  const relay = { proxy: null };
  // as each client writes it: the scheme in any case
  const allowed = (req) => Buffer.from(/^basic\s+(\S+)$/i.exec(req.headers['proxy-authorization'] || '')?.[1] || '', 'base64').toString() === `spectrum:${secret}`;
  const server = http.createServer(async (req, res) => {
    let target;
    try { target = new URL(req.url); } catch { return res.writeHead(400).end(); }
    if (!allowed(req)) return res.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="Spectrum"' }).end();
    if (target.protocol !== 'http:') return res.writeHead(400).end();
    let socket;
    try { socket = await throughProxy(relay.proxy, target.hostname, Number(target.port) || 80); } catch (err) { return res.writeHead(502).end(err.message); }
    const { 'proxy-authorization': _a, 'proxy-connection': _c, ...headers } = req.headers;
    const onward = http.request({ method: req.method, path: target.pathname + target.search, headers, createConnection: () => socket }, (answer) => { res.writeHead(answer.statusCode, answer.headers); answer.pipe(res); });
    onward.on('error', () => res.destroy());
    req.pipe(onward);
  });
  server.on('connect', async (req, client, head) => {
    client.on('error', () => {});
    if (!allowed(req)) return client.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="Spectrum"\r\n\r\n');
    const [, host = '', port] = /^\[?([^\]]*?)\]?:(\d+)$/.exec(req.url || '') || [];
    let upstream;
    try { upstream = await throughProxy(relay.proxy, host, Number(port)); } catch (err) { return client.end(`HTTP/1.1 502 Bad Gateway\r\n\r\n${err.message}\n`); }
    upstream.on('error', () => client.destroy());
    client.on('close', () => upstream.destroy());
    upstream.on('close', () => client.destroy());
    client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head.length) upstream.write(head);
    client.pipe(upstream);
    upstream.pipe(client);
  });
  server.on('clientError', (err, socket) => socket.destroy());
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  server.unref();
  return Object.assign(relay, { url: `http://spectrum:${secret}@127.0.0.1:${server.address().port}`, close: () => { server.close(); server.closeAllConnections(); } });
}

const LOCAL = ['localhost', '127.0.0.1', '::1'];
let relay = null, restore = null, applied = null;
/**
 * Points the backend's own requests (fetch, http and https) at the proxy found now, through the relay, or back to
 * connecting directly when there is none. Requests to this computer and to the proxy's NO_PROXY hosts never go through
 * it. Returns the proxy, or null.
 */
export async function applyProxy(found) {
  found = found === undefined ? await currentProxy() : found;
  restore?.();
  restore = null;
  applied = found;
  // the variables Spectrum was started with come back without a proxy
  for (const [name, value] of Object.entries(started ??= Object.fromEntries(VARIABLES.map((k) => [k, process.env[k]])))) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
  if (!found) { relay?.close(); relay = null; return null; }
  relay ??= await openRelay();
  relay.proxy = found;
  restore = http.setGlobalProxyFromEnv({ HTTP_PROXY: relay.url, HTTPS_PROXY: relay.url, NO_PROXY: [...LOCAL, ...found.noProxy].join(',') });
  // and every program Spectrum starts outside isolation (Typst and Tinymist, a trusted compile, npm) inherits them;
  // an isolated one is given its own environment
  Object.assign(process.env, proxyVariables());
  return found;
}
const VARIABLES = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'NO_PROXY', 'no_proxy'];
let started;
/** The proxy the backend goes through now, as applyProxy last found it. */
export const appliedProxy = () => applied;
/**
 * The proxy variables for a program Spectrum starts outside isolation (npm installing an adapter, a trusted compile),
 * pointed at the relay; none without a proxy.
 */
export function proxyVariables() {
  if (!relay || !applied) return {};
  const direct = [...LOCAL, ...applied.noProxy].join(',');
  return { HTTPS_PROXY: relay.url, https_proxy: relay.url, HTTP_PROXY: relay.url, http_proxy: relay.url, NO_PROXY: direct, no_proxy: direct };
}
