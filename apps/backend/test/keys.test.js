// The API keys kept outside the window: against a stand-in for /usr/bin/security that answers as it does (never this
// Mac's own keychain). Run: npm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-keys-')));
const dataDir = path.join(tmp, 'data');
const keychain = path.join(tmp, 'keychain.json');
const fake = path.join(tmp, 'security.mjs');
// add-generic-password -U -s -a -X (hex), read from standard input after -i; find-generic-password -s -a -w; every
// command line kept in keychain.json.argv; keychain.json.locked answers as a keychain that won't open
await fs.writeFile(fake, `#!/usr/bin/env node
import fs from 'node:fs';
const file = ${JSON.stringify(keychain)};
const args = process.argv.slice(2);
fs.appendFileSync(file + '.argv', JSON.stringify(args) + '\\n');
if (fs.existsSync(file + '.locked')) { console.error('security: SecKeychainItemCopyContent: User interaction is not allowed.'); process.exit(36); }
const items = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
const opt = (a, flag) => a[a.indexOf(flag) + 1];
if (args[0] === '-i') {
  for (const line of fs.readFileSync(0, 'utf8').split('\\n').filter(Boolean)) {
    const a = line.trim().split(/\\s+/);
    if (a[0] !== 'add-generic-password' || !a.includes('-U')) process.exit(1);
    items[opt(a, '-s') + '/' + opt(a, '-a')] = Buffer.from(opt(a, '-X'), 'hex').toString('utf8');
  }
  fs.writeFileSync(file, JSON.stringify(items));
} else if (args[0] === 'find-generic-password' && args.includes('-w')) {
  const value = items[opt(args, '-s') + '/' + opt(args, '-a')];
  if (value === undefined) { console.error('security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.'); process.exit(44); }
  process.stdout.write(value + '\\n');
} else process.exit(2);
`, { mode: 0o755 });
Object.assign(process.env, { SPECTRUM_DATA_DIR: dataDir, SPECTRUM_SECURITY: fake });
const { KEY_REF, forgetCache, registerKeyRoutes, storeKeys, withKeys } = await import('../src/services/keyStore.js');
const { default: Fastify } = await import('fastify');

after(() => rmSync(tmp, { recursive: true, force: true }));

const mac = process.platform === 'darwin' ? false : 'the keychain stand-in is for a Mac';
const KEY_A = 'sk-test-CANARY-aaaaaaaaaaaa';
const KEY_B = 'tvly-CANARY-bbbbbbbbbbbb';

test('keys go into the keychain and come back by reference, after a restart too', { skip: mac }, async () => {
  const [a, b, again] = await storeKeys([KEY_A, KEY_B, KEY_A]);
  assert.match(a, KEY_REF);
  assert.match(b, KEY_REF);
  assert.equal(again, a, 'the same key is one entry');
  assert.notEqual(a, b);
  forgetCache();
  const body = { llmConfig: { endpoint: 'https://api.example.com', apiKey: a }, searchConfig: { connections: [{ provider: 'tavily', apiKey: b }] }, text: 'spectrum-key: not one', n: 3 };
  assert.deepEqual(await withKeys(body), { ...body, llmConfig: { ...body.llmConfig, apiKey: KEY_A }, searchConfig: { connections: [{ provider: 'tavily', apiKey: KEY_B }] } });
  assert.deepEqual(await withKeys({ apiKey: 'sk-typed-as-before' }), { apiKey: 'sk-typed-as-before' }, 'a key not moved yet works as before');
});

test('a key is never on a command line, nor in a file of the data folder', { skip: mac }, async () => {
  const lines = await fs.readFile(`${keychain}.argv`, 'utf8');
  for (const key of [KEY_A, KEY_B]) {
    assert.ok(!lines.includes(key), 'on a command line');
    assert.ok(!lines.includes(Buffer.from(key).toString('hex')), 'on a command line in hex');
  }
  for (const name of await fs.readdir(dataDir).catch(() => [])) {
    const text = await fs.readFile(path.join(dataDir, name), 'utf8').catch(() => '');
    assert.ok(!text.includes(KEY_A) && !text.includes(KEY_B), `in ${name}`);
  }
});

test('a key no field refers to goes after an hour; one still referred to stays', { skip: mac }, async () => {
  const [a, b] = await storeKeys([KEY_A, KEY_B]);
  const hour = 60 * 60 * 1000;
  // within the hour, unreferred keys stay (another window may be about to refer to them)
  await storeKeys(['key-C-cccccccc'], [], Date.now() + 1000);
  assert.equal((await withKeys({ k: b })).k, KEY_B);
  await storeKeys(['key-C-cccccccc'], [a], Date.now() + 2 * hour);
  forgetCache();
  assert.equal((await withKeys({ k: a })).k, KEY_A);
  await assert.rejects(withKeys({ k: b }), (err) => err.statusCode === 503 && /missing/.test(err.message));
});

test('a keychain that can’t be opened is an error the window shows, and keeps nothing back', { skip: mac }, async () => {
  await fs.writeFile(`${keychain}.locked`, '');
  forgetCache();
  try {
    await assert.rejects(storeKeys(['key-D-dddddddd']), (err) => err.code === 'keychain' && err.statusCode === 503 && /User interaction is not allowed/.test(err.message) && !err.message.includes('key-D'));
  } finally {
    await fs.rm(`${keychain}.locked`);
    forgetCache();
  }
});

test('every route is handed its keys; the keys’ own route takes references as they are', { skip: mac }, async () => {
  const app = Fastify();
  registerKeyRoutes(app);
  app.post('/api/echo', async (req) => req.body);
  const put = await app.inject({ method: 'PUT', url: '/api/keys', payload: { values: [KEY_A], keep: ['spectrum-key:' + '0'.repeat(32)] } });
  assert.equal(put.statusCode, 200, put.body);
  const [ref] = put.json().refs;
  const echo = await app.inject({ method: 'POST', url: '/api/echo', payload: { llmConfig: { apiKey: ref } } });
  assert.equal(echo.json().llmConfig.apiKey, KEY_A);
  const missing = await app.inject({ method: 'POST', url: '/api/echo', payload: { apiKey: 'spectrum-key:' + 'f'.repeat(32) } });
  assert.equal(missing.statusCode, 503);
  const bad = await app.inject({ method: 'PUT', url: '/api/keys', payload: { values: ['two\nlines'] } });
  assert.equal(bad.statusCode, 400);
  await app.close();
});
