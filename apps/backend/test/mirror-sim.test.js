// A seeded simulation of two computers mirroring one project, each into a cloud folder of its own, and a sync app
// like Dropbox's (a server that ignores letter case, a conflicted copy of a file changed on both, a folder renamed on
// one computer renamed on the other) copying between those folders a file at a time in an order the seed picks. Each
// computer runs the real mirror in a thread of its own, with a data folder and a clock of its own. The seed picks
// edits, sync app steps and passes; then the sync app and the passes go on until nothing changes, and nothing the
// user typed, no chat message, no change to project.json and no version is lost, all four copies hold the same files
// and no conflicted copy of the app's files is in a project folder. Fixed seeds, in a fake home folder and scratch
// folders. Run: npm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { Worker } from 'node:worker_threads';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (rel) => pathToFileURL(path.join(here, '..', 'src', rel)).href;
const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-mirror-sim-')));
const home = path.join(tmp, 'home');
mkdirSync(home);
// before the threads start, which take the environment from here
Object.assign(process.env, {
  HOME: home,
  USERPROFILE: home,
  OneDrive: path.join(home, 'OneDrive'),
  APPDATA: path.join(home, 'AppData', 'Roaming'),
  LOCALAPPDATA: path.join(home, 'AppData', 'Local')
});
delete process.env.OneDriveCommercial;
delete process.env.OneDriveConsumer;

const dirs = {};
for (const side of ['A', 'B']) {
  // a classic Synology Drive task, whose marker gives the location its name on every system
  const loc = path.join(tmp, `loc${side}`);
  mkdirSync(path.join(loc, '.SynologyWorkingDirectory'), { recursive: true });
  const data = path.join(tmp, `data-${side}`);
  mkdirSync(data);
  writeFileSync(path.join(data, 'sync.json'), JSON.stringify({ machineId: crypto.randomUUID(), machineName: `Comp${side}`, folders: [{ path: loc }], hidden: [] }));
  dirs[side] = { loc, data, local: path.join(tmp, side), bin: path.join(tmp, `bin${side}`) };
  mkdirSync(dirs[side].local);
}
const satmp = path.join(tmp, 'satmp');
mkdirSync(satmp);

// one computer: its clock moves on 1 ms each time it's read, and when the run says
const WORKER = `
const { parentPort, workerData } = require('node:worker_threads');
const { promises: fs } = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
let now = Date.UTC(2026, 9, 18, 9, 0, 0);
Date.now = () => (now += 1);
(async () => {
  const m = await import(workerData.mirror);
  const v = await import(workerData.versions);
  const { copyProject } = await import(workerData.copy);
  const roots = new Map();
  const hooks = (confirmMs) => m.mirrorHooks({
    confirmMs,
    rootOf: async (id) => {
      const root = roots.get(id);
      if (!root) throw Object.assign(new Error('Project not found.'), { code: 'PROJECT_NOT_FOUND' });
      await fs.access(path.join(root, '.spectrum', 'project.json')).catch(() => { throw Object.assign(new Error('Folder missing.'), { code: 'PROJECT_MISSING' }); });
      return root;
    },
    toBin: async (abs) => {
      await fs.mkdir(workerData.bin, { recursive: true });
      await fs.rename(abs, path.join(workerData.bin, crypto.randomUUID() + ' ' + path.basename(abs)));
    }
  });
  const cmds = {
    setup: ({ confirm }) => hooks(confirm),
    syncTo: async ({ id, root, location, rel }) => {
      roots.set(id, root);
      const { files } = await copyProject(root, path.join(location, rel));
      await m.linkMirror(id, { location, rel, files });
      return m.syncProject(id);
    },
    download: async ({ id, root, location, rel }) => {
      await copyProject(path.join(location, rel), root);
      roots.set(id, root);
      await m.linkMirror(id, { location, rel });
      return m.syncProject(id);
    },
    sync: ({ id }) => m.syncProject(id),
    record: ({ id }) => m.readMirror(id),
    version: ({ root, label }) => v.createVersion(root, { label }).then((r) => r.version.id),
    list: ({ root }) => v.listVersions(root).then((vs) => vs.map((x) => ({ id: x.id, label: x.label }))),
    advance: ({ ms }) => void (now += ms),
    unlink: ({ id }) => m.unlinkMirror(id)
  };
  parentPort.on('message', async ({ rid, cmd, args }) => {
    try {
      parentPort.postMessage({ rid, ok: true, value: await cmds[cmd](args) });
    } catch (err) {
      parentPort.postMessage({ rid, ok: false, error: (err.code || '') + ' ' + (err.stack || err.message) });
    }
  });
  process.on('unhandledRejection', (err) => parentPort.postMessage({ rid: -1, ok: false, error: 'unhandled ' + (err && err.stack) }));
  parentPort.postMessage({ rid: 0, ok: true });
})();
`;

class Comp {
  constructor(side) {
    this.rid = 1;
    this.pending = new Map();
    this.errors = [];
    this.worker = new Worker(WORKER, {
      eval: true,
      env: { ...process.env, SPECTRUM_DATA_DIR: dirs[side].data, SPECTRUM_PROJECTS_DIR: path.join(tmp, `projects${side}`), SPECTRUM_TEMPLATE_DIR: path.join(tmp, 'templates'), SPECTRUM_TEMPLATE_SEED_DIR: '', SPECTRUM_TEST_BIN_DIR: path.join(tmp, `testbin${side}`) },
      workerData: { mirror: src('services/mirrorService.js'), versions: src('services/versionService.js'), copy: src('utils/projectCopy.js'), bin: dirs[side].bin }
    });
    this.ready = new Promise((resolve) => this.pending.set(0, { resolve }));
    this.worker.on('message', ({ rid, ok, value, error }) => {
      if (rid === -1) return this.errors.push(error);
      const p = this.pending.get(rid);
      this.pending.delete(rid);
      if (ok) p.resolve(value);
      else p.reject(new Error(error));
    });
    this.worker.on('error', (err) => this.errors.push(`worker error ${err.stack}`));
  }
  call(cmd, args = {}) {
    const rid = this.rid++;
    return new Promise((resolve, reject) => {
      this.pending.set(rid, { resolve, reject });
      this.worker.postMessage({ rid, cmd, args });
    });
  }
}
const comps = { A: new Comp('A'), B: new Comp('B') };
after(async () => {
  await Promise.all(Object.values(comps).map((c) => c.worker.terminate()));
  rmSync(tmp, { recursive: true, force: true });
});

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const keyOf = (rel) => rel.normalize('NFC').toLowerCase();
const tokens = (text) => new Set(String(text).match(/T\d+_\d+/g) || []);
async function walk(root, skip = () => false, rel = '') {
  const entries = await fs.readdir(path.join(root, rel), { withFileTypes: true }).catch((err) => {
    if (['ENOENT', 'ENOTDIR'].includes(err.code)) return [];
    throw err;
  });
  const out = [];
  for (const e of entries) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (skip(r)) continue;
    if (e.isDirectory()) out.push(...(await walk(root, skip, r)));
    else if (e.isFile()) out.push(r);
  }
  return out;
}
const readOr = (abs, dflt = null) => fs.readFile(abs).catch(() => dflt);
async function writeAtomic(abs, data) {
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const t = `${abs}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  await fs.writeFile(t, data);
  await fs.rename(t, abs);
}
const userFile = (r) => !r.startsWith('.spectrum/') && !r.endsWith('.tmp');
const same = (a, b) => (!a && !b) || (!!a && !!b && a.rel === b.rel && a.hash === b.hash);
const conflicted = (r) => /conflicted copy/i.test(r);

/** The sync app: a server, what it knows each folder holds, and its queue of uploads, downloads and folder renames. */
class SyncApp {
  constructor(log) {
    this.server = new Map();
    this.known = { A: new Map(), B: new Map() };
    this.queue = [];
    this.log = log;
    this.moves = [];
  }
  blocked(side, key) {
    return this.moves.some((m) => m.side === side && [m.from, m.to].some((r) => key.startsWith(`${keyOf(r)}/`)));
  }
  remap(map, from, to) {
    for (const [key, v] of [...map]) {
      if (!key.startsWith(`${keyOf(from)}/`)) continue;
      map.delete(key);
      const rel = to + v.rel.slice(from.length);
      map.set(keyOf(rel), { ...v, rel });
    }
  }
  // a whole folder renamed on side: renamed on the other side too, after a while
  movedOn(side, from, to) {
    const other = side === 'A' ? 'B' : 'A';
    this.remap(this.known[side], from, to);
    this.remap(this.server, from, to);
    const m = { t: 'mv', side: other, from, to, key: `mv:${to}` };
    this.moves.push(m);
    this.queue.push(m);
  }
  async mv(m) {
    const { loc } = dirs[m.side];
    this.moves.splice(this.moves.indexOf(m), 1);
    if (await fs.rename(path.join(loc, m.from), path.join(loc, m.to)).then(() => true, () => false)) this.remap(this.known[m.side], m.from, m.to);
    this.log(`  mv ${m.side} ${m.from} -> ${m.to}`);
  }
  async scanSide(side) {
    const { loc } = dirs[side];
    const map = new Map();
    for (const rel of await walk(loc, (r) => r === '.SynologyWorkingDirectory' || r === '.spectrum-shared' || r === '.spectrum-bin' || r.endsWith('.tmp'))) {
      const buf = await readOr(path.join(loc, rel));
      if (buf) map.set(keyOf(rel), { rel, hash: sha(buf), buf });
    }
    return map;
  }
  enqueue(op) {
    if (!this.queue.some((o) => o.t === op.t && o.side === op.side && o.key === op.key)) this.queue.push(op);
  }
  async scan(side) {
    const cur = await this.scanSide(side);
    for (const key of new Set([...cur.keys(), ...this.known[side].keys()])) if (!same(cur.get(key), this.known[side].get(key))) this.enqueue({ t: 'up', side, key });
  }
  downsAll() {
    for (const side of ['A', 'B']) for (const key of new Set([...this.server.keys(), ...this.known[side].keys()])) if (!same(this.server.get(key), this.known[side].get(key))) this.enqueue({ t: 'down', side, key });
  }
  async run(op) {
    try {
      if (op.t === 'mv') return await this.mv(op);
      if (this.blocked(op.side, op.key)) return;
      await (op.t === 'up' ? this.up(op.side, op.key) : this.down(op.side, op.key));
    } catch (err) {
      this.log(`  syncapp ${op.t} ${op.side} ${op.key} failed ${err.code || err.message}`);
    }
  }
  async up(side, key) {
    const cur = (await this.scanSide(side)).get(key);
    const k = this.known[side].get(key);
    const s = this.server.get(key);
    const other = side === 'A' ? 'B' : 'A';
    const know = (sd, kk, v) => (v ? this.known[sd].set(kk, { rel: v.rel, hash: v.hash }) : this.known[sd].delete(kk));
    if (same(cur, k)) return;
    if (same(s, k) || (cur && s && cur.hash === s.hash) || (cur && !s)) {
      if (cur) this.server.set(key, cur);
      else this.server.delete(key);
      know(side, key, cur);
      this.enqueue({ t: 'down', side: other, key });
      this.log(`  up ${side} ${cur ? cur.rel : `-${k.rel}`}`);
      return;
    }
    if (!cur) {
      // deleted in this folder, changed on the server: the server's comes back
      know(side, key, null);
      this.enqueue({ t: 'down', side, key });
      return;
    }
    // changed on both: this folder's becomes a conflicted copy
    const dot = cur.rel.lastIndexOf('.');
    const slash = cur.rel.lastIndexOf('/');
    const [stem, ext] = dot > slash + 1 ? [cur.rel.slice(0, dot), cur.rel.slice(dot)] : [cur.rel, ''];
    let ccRel = `${stem} (Comp${side}'s conflicted copy 2026-10-18)${ext}`;
    for (let n = 2; this.server.has(keyOf(ccRel)) || this.known[side].has(keyOf(ccRel)); n++) ccRel = `${stem} (Comp${side}'s conflicted copy 2026-10-18) (${n})${ext}`;
    await fs.rename(path.join(dirs[side].loc, cur.rel), path.join(dirs[side].loc, ccRel));
    const v = { rel: ccRel, hash: cur.hash, buf: cur.buf };
    this.server.set(keyOf(ccRel), v);
    know(side, keyOf(ccRel), v);
    know(side, key, null);
    this.enqueue({ t: 'down', side: other, key: keyOf(ccRel) });
    this.enqueue({ t: 'down', side, key });
    this.log(`  up ${side} conflict ${cur.rel} -> ${ccRel}`);
  }
  async down(side, key) {
    const s = this.server.get(key);
    const k = this.known[side].get(key);
    if (same(s, k)) return;
    const cur = (await this.scanSide(side)).get(key);
    const know = (v) => (v ? this.known[side].set(key, { rel: v.rel, hash: v.hash }) : this.known[side].delete(key));
    if (!same(cur, k)) {
      if (same(cur, s)) know(s);
      else this.enqueue({ t: 'up', side, key });
      return;
    }
    const { loc } = dirs[side];
    if (!s) {
      await fs.rm(path.join(loc, cur.rel));
      for (let dir = path.dirname(path.join(loc, cur.rel)); dir !== loc && dir.startsWith(loc); dir = path.dirname(dir)) if (!(await fs.rmdir(dir).then(() => true, () => false))) break;
      know(null);
      this.log(`  down ${side} -${cur.rel}`);
      return;
    }
    if (cur && cur.rel !== s.rel) await fs.rename(path.join(loc, cur.rel), path.join(loc, s.rel));
    if (!cur || cur.hash !== s.hash) {
      const t = path.join(satmp, crypto.randomUUID());
      await fs.writeFile(t, s.buf);
      await fs.mkdir(path.dirname(path.join(loc, s.rel)), { recursive: true });
      await fs.rename(t, path.join(loc, s.rel));
    }
    know(s);
    this.log(`  down ${side} ${s.rel}`);
  }
  async drain(rng, max = 5000) {
    for (let i = 0; i < max; i++) {
      if (!this.queue.some((o) => o.t === 'mv' || !this.blocked(o.side, o.key))) {
        this.queue = this.queue.filter((o) => o.t === 'mv');
        await this.scan('A');
        await this.scan('B');
        this.downsAll();
        if (!this.queue.some((o) => o.t === 'mv' || !this.blocked(o.side, o.key))) return;
      }
      const [op] = this.queue.splice(Math.floor(rng() * this.queue.length), 1);
      await this.run(op);
    }
    throw new Error('The sync app never settled.');
  }
}

/** One seed: setup, the steps, quiescence, then what must hold. renames: 'none', or 'move' for a cloud copy renamed whole. */
async function runSeed(seed, steps, renames) {
  const rng = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const chance = (p) => rng() < p;
  const trace = [];
  const log = (s) => trace.push(s);
  const sa = new SyncApp(log);
  const violations = [];
  const violate = (type, detail) => violations.push(`${type}: ${detail}`);
  let n = 0;
  const tok = () => `T${seed}_${++n}`;
  const alive = new Map();
  const chatTokens = new Map();
  const id = crypto.randomUUID();
  const rel0 = `P${seed}`;
  const roots = { A: path.join(dirs.A.local, rel0), B: path.join(dirs.B.local, rel0) };
  const confirm = chance(0.5) ? 0 : 30_000;
  for (const c of Object.values(comps)) await c.call('setup', { confirm });

  // the project on A, synced to A's cloud folder, then downloaded on B
  const line = () => `L ${tok()}`;
  const text = (k) => `${Array.from({ length: k }, line).join('\n')}\n`;
  const initial = { 'main.tex': text(8), 'refs.bib': text(3), 'sub/intro.tex': text(4), 'fig.png': `PNG ${tok()}` };
  const now = '2026-10-18T09:00:00.000Z';
  await writeAtomic(path.join(roots.A, '.spectrum', 'project.json'), JSON.stringify({ id, name: rel0, createdAt: now, updatedAt: now, tags: [], archived: false, fileOrder: {} }, null, 2));
  for (const [rel, t] of Object.entries(initial)) {
    await writeAtomic(path.join(roots.A, rel), t);
    for (const x of tokens(t)) alive.set(x, `initial ${rel}`);
  }
  const chat0 = { id: 'c0', title: 'Chat', mode: 'assistant', updatedAt: now, messages: [{ role: 'user', createdAt: now, content: tok() }] };
  chatTokens.set(chat0.messages[0].content, 'initial chat');
  await writeAtomic(path.join(roots.A, '.spectrum', 'chats', 'c0.json'), JSON.stringify(chat0));
  if (chance(0.5)) await comps.A.call('version', { root: roots.A, label: 'Start' });
  const st0 = await comps.A.call('syncTo', { id, root: roots.A, location: dirs.A.loc, rel: rel0 });
  if (st0?.state !== 'synced') violate('setup', `A syncTo ${JSON.stringify(st0)}`);
  await sa.drain(rng);
  const st1 = await comps.B.call('download', { id, root: roots.B, location: dirs.B.loc, rel: rel0 });
  if (st1?.state !== 'synced') violate('setup', `B download ${JSON.stringify(st1)}`);
  await sa.drain(rng);

  const seenVersions = { A: new Map(), B: new Map() };
  const checkVersions = async (side, when) => {
    const list = await comps[side].call('list', { root: roots[side] }).catch(() => null);
    if (!list) return;
    const ids = new Set(list.map((v) => v.id));
    for (const [vid, label] of seenVersions[side]) if (!ids.has(vid)) violate('versions-shrank', `${side} lost version ${vid} (${label}) ${when}`);
    for (const v of list) seenVersions[side].set(v.id, v.label);
  };
  await checkVersions('A', 'setup');
  await checkVersions('B', 'setup');

  // each computer changes only its own field of project.json
  const metaOwner = chance(0.5) ? { A: 'tags', B: 'name' } : { A: 'name', B: 'tags' };
  const metaLast = {};
  const pass = async (side, label) => {
    const st = await comps[side].call('sync', { id }).catch((err) => violate('pass-error', `${side} ${err.message.slice(0, 400)}`));
    log(`  pass ${side} ${label} -> ${st?.state}${st?.message ? ` (${st.message})` : ''}`);
    await checkVersions(side, `after ${label}`);
  };
  const localFiles = async (side) => (await walk(roots[side])).filter(userFile);
  const textFiles = async (side) => (await localFiles(side)).filter((r) => /\.(tex|bib)$/.test(r));
  const userWrite = async (side, rel, data, why) => {
    const abs = path.join(roots[side], rel);
    const before = tokens((await readOr(abs, Buffer.alloc(0))).toString('latin1'));
    const after = tokens(data);
    for (const t of before) if (!after.has(t)) alive.delete(t);
    for (const t of after) if (!before.has(t)) alive.set(t, `${side} ${why} ${rel}`);
    await writeAtomic(abs, data);
  };
  const editLine = (old, k, mk) => {
    const lines = old.split('\n');
    if (lines.at(-1) === '') lines.pop();
    const i = Math.min(k, Math.max(0, lines.length - 1));
    const r = rng();
    if (r < 0.6 && lines.length) lines[i] = mk();
    else if (r < 0.9 || !lines.length) lines.splice(i + 1, 0, mk());
    else lines.splice(i, 1);
    return `${lines.join('\n')}\n`;
  };
  const ops = {
    async edit(side) {
      const files = await textFiles(side);
      if (!files.length) return;
      const rel = pick(files);
      const old = (await readOr(path.join(roots[side], rel), Buffer.alloc(0))).toString('latin1');
      const k = Math.floor(rng() * 10);
      log(`${side} edit ${rel} line ${k}`);
      await userWrite(side, rel, editLine(old, k, line), 'edit');
    },
    async editBinary(side) {
      const files = (await localFiles(side)).filter((r) => r.endsWith('.png'));
      if (!files.length) return;
      const rel = pick(files);
      log(`${side} edit binary ${rel}`);
      await userWrite(side, rel, `PNG ${tok()}`, 'binary');
    },
    async add(side) {
      const rel = pick(['', 'sub/']) + (chance(0.8) ? `n${seed}_${n + 1}.tex` : `img${n + 1}.png`);
      log(`${side} add ${rel}`);
      await userWrite(side, rel, rel.endsWith('.png') ? `PNG ${tok()}` : text(3), 'add');
    },
    async delete(side) {
      const files = await localFiles(side);
      if (files.length <= 1) return;
      const rel = pick(files);
      const old = await readOr(path.join(roots[side], rel));
      if (!old) return;
      for (const t of tokens(old.toString('latin1'))) alive.delete(t);
      log(`${side} delete ${rel}`);
      await fs.rm(path.join(roots[side], rel), { force: true });
    },
    async rename(side) {
      const files = await localFiles(side);
      if (!files.length) return;
      const rel = pick(files);
      const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/') + 1) : '';
      const name = rel.slice(dir.length);
      const caseOnly = chance(0.5);
      const to = caseOnly ? dir + (name[0] === name[0].toUpperCase() ? name[0].toLowerCase() : name[0].toUpperCase()) + name.slice(1) : `${dir}r${n++}${path.extname(name)}`;
      if (to === rel) return;
      if (!caseOnly && (await readOr(path.join(roots[side], to)))) return;
      log(`${side} rename ${rel} -> ${to}`);
      await fs.rename(path.join(roots[side], rel), path.join(roots[side], to)).catch(() => {});
    },
    async version(side) {
      log(`${side} save version`);
      await comps[side].call('version', { root: roots[side], label: `User ${n++}` }).catch((err) => violate('version-error', err.message.slice(0, 300)));
      await checkVersions(side, 'user version');
    },
    async chat(side) {
      const dir = path.join(roots[side], '.spectrum', 'chats');
      const names = (await fs.readdir(dir).catch(() => [])).filter((f) => /^c\d+\.json$/.test(f));
      const t = tok();
      chatTokens.set(t, `${side} chat`);
      if (names.length && chance(0.7)) {
        const file = path.join(dir, pick(names));
        const chat = JSON.parse(await fs.readFile(file, 'utf8'));
        chat.messages.push({ role: 'user', createdAt: `${n}`, content: t });
        chat.updatedAt = new Date(Date.parse('2026-10-18T10:00:00Z') + n * 1000).toISOString();
        log(`${side} continue chat ${path.basename(file)}`);
        await writeAtomic(file, JSON.stringify(chat));
      } else {
        const cid = `c${n}`;
        log(`${side} new chat ${cid}`);
        await writeAtomic(path.join(dir, `${cid}.json`), JSON.stringify({ id: cid, title: 'New', mode: 'assistant', updatedAt: now, messages: [{ role: 'user', createdAt: `${n}`, content: t }] }));
      }
    },
    async sameLine() {
      const [a, b] = [await textFiles('A'), await textFiles('B')];
      const both = a.filter((r) => b.includes(r));
      if (!both.length) return;
      const rel = pick(both);
      const k = Math.floor(rng() * 6);
      log(`A+B same line ${rel} line ${k}`);
      for (const side of ['A', 'B']) {
        const lines = (await readOr(path.join(roots[side], rel), Buffer.alloc(0))).toString('latin1').split('\n');
        if (lines.at(-1) === '') lines.pop();
        if (!lines.length) continue;
        lines[Math.min(k, lines.length - 1)] = line();
        await userWrite(side, rel, `${lines.join('\n')}\n`, 'same-line');
      }
    },
    async meta(side) {
      const field = metaOwner[side];
      const file = path.join(roots[side], '.spectrum', 'project.json');
      const m = JSON.parse(await fs.readFile(file, 'utf8'));
      const t = tok();
      m[field] = field === 'tags' ? [t] : `Name ${t}`;
      metaLast[field] = t;
      log(`${side} sets ${field} ${t}`);
      await writeAtomic(file, JSON.stringify(m, null, 2));
    },
    async renameCopy(side) {
      // the user renames the whole cloud copy in the location, and the sync app renames it on the other computer
      const rec = await comps[side].call('record', { id });
      if (!rec) return;
      const to = `${rel0}-r${n++}`;
      if (sa.moves.length || renames === 'none') return;
      log(`${side} renames the cloud copy ${rec.rel} -> ${to}`);
      if (await fs.rename(path.join(dirs[side].loc, rec.rel), path.join(dirs[side].loc, to)).then(() => true, () => false)) sa.movedOn(side, rec.rel, to);
    }
  };

  for (let step = 0; step < steps; step++) {
    const r = rng();
    const side = chance(0.5) ? 'A' : 'B';
    if (r < 0.36) {
      const u = rng();
      const op = u < 0.38 ? 'edit' : u < 0.48 ? 'add' : u < 0.57 ? 'delete' : u < 0.67 ? 'rename' : u < 0.75 ? 'version' : u < 0.82 ? 'chat' : u < 0.87 ? 'editBinary' : u < 0.93 ? 'sameLine' : u < 0.985 ? 'meta' : 'renameCopy';
      await ops[op](side);
    } else if (r < 0.66) {
      if (chance(0.3) || !sa.queue.length) {
        log(`syncapp scan ${side}`);
        await sa.scan(side);
        if (chance(0.5)) sa.downsAll();
      }
      for (let k = 1 + Math.floor(rng() * 4); k > 0 && sa.queue.length; k--) await sa.run(sa.queue.splice(Math.floor(rng() * sa.queue.length), 1)[0]);
    } else if (r < 0.93) {
      log(`${side} pass`);
      await pass(side, `step ${step}`);
      // Sync now on top of the save's pass
      if (chance(0.15)) await pass(side, `step ${step} again`);
    } else {
      const ms = Math.floor(rng() * 40_000);
      log(`time +${ms}`);
      await comps.A.call('advance', { ms });
      await comps.B.call('advance', { ms });
    }
  }
  for (const side of ['A', 'B']) await checkVersions(side, 'after the run');

  // the sync app delivers everything, and each computer passes, until nothing changes
  log('-- quiescence');
  const qrng = mulberry32(seed ^ 0x9e3779b9);
  let prev = '';
  let stable = 0;
  const statuses = {};
  for (let round = 0; round < 14 && stable < 2; round++) {
    await sa.drain(qrng);
    for (const s of ['A', 'B']) {
      await comps.A.call('advance', { ms: 31_000 });
      await comps.B.call('advance', { ms: 31_000 });
      statuses[s] = await comps[s].call('sync', { id }).catch((err) => ({ state: 'error', message: err.message.slice(0, 300) }));
      log(`  q pass ${s} -> ${statuses[s]?.state}${statuses[s]?.message ? ` (${statuses[s].message})` : ''}`);
      await checkVersions(s, `quiescence round ${round}`);
      await sa.drain(qrng);
    }
    const snap = sha(JSON.stringify(await Promise.all([roots.A, roots.B, dirs.A.loc, dirs.B.loc].map(async (r) => Promise.all((await walk(r, (x) => x.startsWith('.spectrum/open'))).sort().map(async (f) => [f, sha((await readOr(path.join(r, f))) || '')]))))));
    stable = snap === prev && statuses.A?.state === 'synced' && statuses.B?.state === 'synced' ? stable + 1 : 0;
    prev = snap;
  }
  for (const s of ['A', 'B']) if (statuses[s]?.state !== 'synced') violate('not-synced', `${s} ${JSON.stringify(statuses[s])}`);
  if (stable < 2) violate('no-quiescence', 'still changing after 14 rounds');

  const recs = { A: await comps.A.call('record', { id }), B: await comps.B.call('record', { id }) };
  const trees = { 'local A': roots.A, 'local B': roots.B, 'cloud A': recs.A && path.join(dirs.A.loc, recs.A.rel), 'cloud B': recs.B && path.join(dirs.B.loc, recs.B.rel) };
  const contents = async (root, filter) => {
    const out = new Map();
    if (!root) return out;
    for (const f of (await walk(root)).filter(filter)) out.set(f, (await readOr(path.join(root, f), Buffer.alloc(0))).toString('latin1'));
    return out;
  };
  // the user's text somewhere in the user's files (a folder left behind in a location included), else in a version or a Bin
  const live = [];
  for (const r of [roots.A, roots.B, dirs.A.loc, dirs.B.loc]) for (const [, t] of await contents(r, (x) => !x.includes('.spectrum') && !x.startsWith('.Synology'))) live.push(t);
  const liveText = live.join('\n');
  const kept = [];
  for (const r of [roots.A, roots.B, dirs.A.loc, dirs.B.loc]) {
    for (const f of await walk(r)) {
      const buf = await readOr(path.join(r, f));
      if (!buf) continue;
      if (f.includes('/history/objects/')) kept.push(zlib.gunzipSync(buf).toString('latin1'));
      else if (f.includes('.spectrum/deleted/') || f.includes('.spectrum-bin/')) kept.push(buf.toString('latin1'));
    }
  }
  for (const b of [dirs.A.bin, dirs.B.bin]) for (const f of await walk(b)) kept.push(((await readOr(path.join(b, f))) || '').toString('latin1'));
  const keptText = kept.join('\n');
  for (const [t, why] of alive) if (!liveText.includes(t)) violate(keptText.includes(t) ? 'text-only-in-version-or-bin' : 'text-lost', `${t} (${why})`);
  // each chat message in a chat the chat list shows
  const listed = [];
  const allChats = [];
  for (const r of Object.values(trees)) {
    for (const [f, t] of await contents(r, (x) => x.startsWith('.spectrum/chats/'))) {
      allChats.push(t);
      try {
        if (f === `.spectrum/chats/${JSON.parse(t).id}.json`) listed.push(t);
      } catch {}
    }
  }
  for (const [t, why] of chatTokens) if (!listed.join('\n').includes(t)) violate(allChats.join('\n').includes(t) ? 'chat-message-only-in-unlisted-copy' : 'chat-message-lost', `${t} (${why})`);
  // each computer's last change to its own field of project.json
  for (const [name, r] of Object.entries(trees)) {
    if (!r) continue;
    const m = JSON.parse((await readOr(path.join(r, '.spectrum', 'project.json'), Buffer.from('{}'))).toString());
    for (const [field, t] of Object.entries(metaLast)) if (!JSON.stringify(m[field] ?? null).includes(t)) violate('meta-change-lost', `${name}: ${field} should hold ${t}, has ${JSON.stringify(m[field])}`);
  }
  // the same files in all four, the app's chats and versions too (but a sync app's conflicted copies of those, which
  // stay in its folder)
  const view = async (r, filter) => (r ? [...(await contents(r, filter))].sort(([a], [b]) => (a < b ? -1 : 1)).map(([f, t]) => `${f}:${sha(t).slice(0, 8)}`).join(',') : null);
  const appFile = (f) => /^\.spectrum\/(chats|history\/manifests)\//.test(f) && !conflicted(f);
  for (const [filter, type] of [[userFile, 'diverged'], [appFile, 'app-files-diverged']]) {
    const ref = await view(roots.A, filter);
    for (const [name, r] of Object.entries(trees)) if ((await view(r, filter)) !== ref) violate(type, `${name} differs from local A`);
  }
  for (const side of ['A', 'B']) for (const f of await walk(roots[side])) if (f.startsWith('.spectrum/') && conflicted(f)) violate('conflict-copy-in-.spectrum', `local ${side}: ${f}`);
  for (const s of ['A', 'B']) {
    const extra = (await fs.readdir(dirs[s].loc)).filter((d) => !d.startsWith('.') && d !== recs[s]?.rel && d.startsWith(rel0));
    if (extra.length) violate('leftover-folder', `${s}: ${extra.join(', ')} (copy at ${recs[s]?.rel})`);
  }
  for (const c of Object.values(comps)) for (const e of c.errors.splice(0)) violate('worker-error', e.slice(0, 400));

  for (const c of Object.values(comps)) await c.call('unlink', { id }).catch(() => {});
  for (const p of [roots.A, roots.B]) await fs.rm(p, { recursive: true, force: true });
  for (const s of ['A', 'B']) {
    for (const d of await fs.readdir(dirs[s].loc)) if (d !== '.SynologyWorkingDirectory') await fs.rm(path.join(dirs[s].loc, d), { recursive: true, force: true });
    await fs.rm(dirs[s].bin, { recursive: true, force: true });
  }
  return { violations, trace };
}

await comps.A.ready;
await comps.B.ready;

// seeds that lost a change to project.json or a chat message before 1.9.0's fourth review, and others besides
for (const [seed, steps, renames] of [
  [47, 60, 'none'],
  [17, 60, 'none'],
  [1010, 80, 'move'],
  [1001, 80, 'move']
]) {
  test(`seed ${seed}: ${steps} steps${renames === 'move' ? ', the cloud copy renamed' : ''}, and nothing lost`, async () => {
    const { violations, trace } = await runSeed(seed, steps, renames);
    assert.deepEqual(violations, [], trace.slice(-60).join('\n'));
  });
}
