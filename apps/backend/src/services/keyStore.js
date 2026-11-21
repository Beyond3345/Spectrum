// The API keys typed in Settings (the models', each saved provider's, the search connections', the PDF parsers' and
// NCBI's), kept by the system rather than in the window's storage, where any script that ran in the window could
// read them all at once: on a Mac in the login keychain, on Windows encrypted for the user's Windows account
// (DPAPI) in the data folder. The window keeps only a reference for each, spectrum-key:<32 hex>, which the request
// hook below swaps for the key on its way into any route, so every caller that took a key in its request body still
// does. A reference is named after its key (keyed with a salt kept beside the keys), so the same key typed into two
// fields, or moved from two windows at once, is one entry.
// ponytail: like the GitHub token, a script in the window can't read a key but can still have Spectrum use one;
// tying each key to its provider's address would need the address changed only from outside the window
import crypto from 'crypto';
import path from 'path';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { DATA_DIR } from '../config/constants.js';
import { renameOver } from '../utils/fsUtils.js';

export const KEY_REF = /^spectrum-key:([0-9a-f]{32})$/;
const SERVICE = 'com.beyond3345.spectrum.api-keys';
const ACCOUNT = 'api-keys';
// the tests' stand-in for /usr/bin/security, which answers as it does
const SECURITY = process.env.SPECTRUM_SECURITY || '/usr/bin/security';
const DPAPI_FILE = path.join(DATA_DIR, 'keys.dpapi');
// an entry no field refers to any more goes after this long (another window may be about to refer to it)
const UNUSED_FOR = 60 * 60 * 1000;

/** A store error the window shows as is: 503 with code 'keychain'. */
const storeError = (message) => Object.assign(new Error(message), { statusCode: 503, code: 'keychain' });

/** Runs a program with input on its standard input (never on its command line, which other programs can see). */
function run(file, args, input = '') {
  return new Promise((resolve) => {
    const child = spawn(file, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), 60_000);
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: err.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
const firstLine = (text) => String(text).trim().split(/\r?\n/)[0].replace(/^security: /, '').replace(/\.$/, '');

// Each store holds one text (the keys as JSON, in base64 so the keychain prints it back as it is): read() is that text
// or null when nothing is stored yet; write(text) stores it
const stores = {
  darwin: {
    async read() {
      const { code, stdout, stderr } = await run(SECURITY, ['find-generic-password', '-s', SERVICE, '-a', ACCOUNT, '-w']);
      // errSecItemNotFound
      if (code === 44) return null;
      if (code !== 0) throw storeError(`Spectrum couldn’t read its keys from the keychain: ${firstLine(stderr) || `security ended with ${code}`}.`);
      return stdout.trim();
    },
    async write(text) {
      // -i reads the command from standard input, and -X takes the data as hex, so the keys go on no command line
      const command = `add-generic-password -U -s ${SERVICE} -a ${ACCOUNT} -X ${Buffer.from(text).toString('hex')}\n`;
      const { code, stderr } = await run(SECURITY, ['-i'], command);
      if (code !== 0) throw storeError(`Spectrum couldn’t save keys in the keychain: ${firstLine(stderr) || `security ended with ${code}`}.`);
    }
  },
  // Windows PowerShell 5.1 (always there) with .NET's ProtectedData: only this Windows account can decrypt the file
  win32: {
    async read() {
      const sealed = await fs.readFile(DPAPI_FILE, 'utf8').catch((err) => (err.code === 'ENOENT' ? null : Promise.reject(err)));
      if (sealed === null) return null;
      const { code, stdout, stderr } = await powershell('[Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($in), $null, "CurrentUser"))', sealed);
      if (code !== 0) throw storeError(`Spectrum couldn’t read its keys: ${firstLine(stderr) || `PowerShell ended with ${code}`}.`);
      return stdout.trim();
    },
    async write(text) {
      const { code, stdout, stderr } = await powershell('[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($in), $null, "CurrentUser"))', text);
      if (code !== 0 || !stdout.trim()) throw storeError(`Spectrum couldn’t save its keys: ${firstLine(stderr) || `PowerShell ended with ${code}`}.`);
      await fs.mkdir(DATA_DIR, { recursive: true });
      const tmp = `${DPAPI_FILE}.${crypto.randomUUID()}.tmp`;
      try {
        await fs.writeFile(tmp, stdout.trim(), { mode: 0o600 });
        await renameOver(tmp, DPAPI_FILE);
      } finally {
        await fs.rm(tmp, { force: true });
      }
    }
  }
};
const powershell = (expression, input) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
  `$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.Security; $in = [Console]::In.ReadToEnd().Trim(); [Console]::Out.Write(${expression})`], input);

const store = () => stores[process.platform] ?? null;

/** Whether keys can be kept outside the window here (a Mac or Windows). */
export const keyStoreAvailable = () => !!store();

// { salt, keys: { id: { value, at } }, held?: { name: { variable: value } } }, read once and kept; writes one at a time
let cache = null;
let queue = Promise.resolve();
const serial = (fn) => {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next;
};

async function load() {
  if (cache) return cache;
  const backend = store();
  if (!backend) throw storeError('This system has no keychain Spectrum can use, so keys stay in the window’s storage.');
  const text = await backend.read();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(Buffer.from(text, 'base64').toString('utf8'));
    } catch {
      throw storeError('Spectrum’s keys in the keychain can’t be read.');
    }
  }
  cache = data && typeof data.salt === 'string' && data.keys && typeof data.keys === 'object' ? data : { salt: crypto.randomBytes(16).toString('hex'), keys: {} };
  return cache;
}

async function save(next) {
  const text = Buffer.from(JSON.stringify(next)).toString('base64');
  await store().write(text);
  // read back: the keychain has been seen to report success without storing
  if ((await store().read()) !== text) throw storeError('Spectrum couldn’t save keys in the keychain: what it saved didn’t read back.');
  cache = next;
}

const idOf = (salt, value) => crypto.createHmac('sha256', salt).update(value).digest('hex').slice(0, 32);
const validKey = (value) => typeof value === 'string' && value.length > 0 && value.length <= 8192 && !/[\r\n\0]/.test(value);

/**
 * Keeps keys (values) and answers their references, in the same order. keep: the references the window still holds;
 * entries no reference names and older than an hour are dropped, so a key replaced or cleared in Settings goes.
 */
export function storeKeys(values, keep = [], now = Date.now()) {
  if (!Array.isArray(values) || values.length > 200 || !values.every(validKey)) throw Object.assign(new Error('Invalid API key.'), { statusCode: 400 });
  const kept = new Set((Array.isArray(keep) ? keep : []).map((ref) => KEY_REF.exec(String(ref))?.[1]).filter(Boolean));
  return serial(async () => {
    const current = await load();
    const keys = {};
    const ids = values.map((value) => idOf(current.salt, value));
    values.forEach((value, i) => (keys[ids[i]] = current.keys[ids[i]] ?? { value, at: now }));
    for (const [id, entry] of Object.entries(current.keys)) {
      if (!keys[id] && (kept.has(id) || now - entry.at < UNUSED_FOR)) keys[id] = entry;
    }
    const next = { ...current, keys };
    if (JSON.stringify(next) !== JSON.stringify(current)) await save(next);
    return ids.map((id) => `spectrum-key:${id}`);
  });
}

/** The value with every reference in it (at any depth) swapped for its key. A reference to no key is an error. */
export async function withKeys(value) {
  const found = [];
  const walk = (v) => {
    if (typeof v === 'string') {
      if (v.length === 45 && KEY_REF.test(v)) found.push(v);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(value);
  if (!found.length) return value;
  const { keys } = await load();
  const swap = (v) => {
    if (typeof v === 'string') {
      const id = v.length === 45 ? KEY_REF.exec(v)?.[1] : null;
      if (!id) return v;
      if (!keys[id]) throw storeError('A key saved in the keychain is missing. Type it again in Settings.');
      return keys[id].value;
    }
    if (Array.isArray(v)) return v.map(swap);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x)]));
    return v;
  };
  return swap(value);
}

/**
 * Values Spectrum holds under a name of its own (an MCP server's environment variables): never given a reference, so
 * no window can have them sent anywhere, and never dropped as unused. holdValues(name, null) forgets them.
 */
export async function heldValues(name) {
  const values = (await load()).held?.[name];
  return values && typeof values === 'object' ? values : {};
}
export const holdValues = (name, values) => serial(async () => {
  const current = await load();
  const held = { ...current.held };
  if (values && Object.keys(values).length) held[name] = values;
  else delete held[name];
  if (JSON.stringify(held) !== JSON.stringify(current.held || {})) await save({ ...current, held });
});

/** The keys' route, and the hook that hands every route its keys. Registered before the other routes. */
export function registerKeyRoutes(fastify) {
  fastify.addHook('preValidation', async (req) => {
    // the keys' own route takes references as they are
    if (req.routeOptions?.url === '/api/keys') return;
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) req.body = await withKeys(req.body);
  });
  // { values: [key…], keep: [reference…] } → { refs: [reference…] }; the body is never logged
  fastify.put('/api/keys', async (req) => ({ ok: true, refs: await storeKeys(req.body?.values, req.body?.keep) }));
}

/** For the tests: forget what was read, as a restart would. */
export const forgetCache = () => {
  cache = null;
};
