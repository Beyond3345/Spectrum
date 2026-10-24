import { promises as fs, constants as fsConstants } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { APP_VERSION, DATA_DIR, SKILLS_SEED_DIR } from '../config/constants.js';
import { readJson, writeFileAtomic, writeJsonAtomic } from '../utils/fsUtils.js';
import { safeJoin } from '../utils/pathUtils.js';
import { httpError, serialiser } from './projectService.js';
import { readProjectSettings } from './projectSettings.js';

// Skills in the Agent Skills format: a folder with SKILL.md, whose front matter names and describes it. The app's own,
// read-only, are copied from its resources into bundled/ when its version changes; the user's are in own/. Skills
// switched off on this computer are in state.json, a project's own choices in its .spectrum/settings.json.
export const SKILLS_DIR = path.join(DATA_DIR, 'skills');
const BUNDLED_DIR = path.join(SKILLS_DIR, 'bundled');
const OWN_DIR = path.join(SKILLS_DIR, 'own');
const STATE_FILE = path.join(SKILLS_DIR, 'state.json');
export const SKILL_ID = /^(?=.{1,64}$)[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_FILES = 500;
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_TEXT = 1024 * 1024;
const lock = serialiser();

/** A string from SKILL.md's front matter: plain, quoted, or a | or > block. */
function scalar(lines, i, indent, raw) {
  raw = raw.trim();
  const more = [];
  let next = i;
  const deeper = (line) => !line.trim() || line.match(/^ */)[0].length > indent;
  while (next + 1 < lines.length && deeper(lines[next + 1])) more.push(lines[++next]);
  if (/^[|>][-+]?$/.test(raw)) {
    const min = Math.min(...more.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
    const text = more.map((l) => l.slice(min));
    return { value: (raw[0] === '|' ? text.join('\n') : text.join(' ').replace(/\s+/g, ' ')).trim(), next };
  }
  if (raw.startsWith('"')) {
    try { return { value: JSON.parse(raw), next }; } catch { return { value: raw.slice(1, -1), next }; }
  }
  if (raw.startsWith("'")) return { value: raw.slice(1, -1).replace(/''/g, "'"), next };
  // a plain string may go on over more-indented lines
  return { value: [raw.replace(/\s+#.*$/, ''), ...more.map((l) => l.trim())].filter(Boolean).join(' '), next };
}

/**
 * { data, body } of a SKILL.md: its front matter's strings, and one level of map (metadata) as an object of strings.
 * ponytail: a subset of YAML, enough for the keys Spectrum reads; lists and deeper maps are passed over
 */
export function readFrontMatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!match) return { data: {}, body: text };
  const lines = match[1].split(/\r?\n/);
  const data = {};
  for (let i = 0; i < lines.length; i++) {
    const top = /^([A-Za-z0-9_.-]+):(?:\s+(.*)|\s*)$/.exec(lines[i]);
    if (!top) continue;
    const [, key, raw = ''] = top;
    if (raw.trim()) {
      ({ value: data[key], next: i } = scalar(lines, i, 0, raw));
      continue;
    }
    // a map of strings, one level down; anything deeper or a list is skipped
    const map = {};
    let indent = null;
    while (i + 1 < lines.length && (!lines[i + 1].trim() || /^\s/.test(lines[i + 1]))) {
      const line = lines[++i];
      const own = line.match(/^ */)[0].length;
      const entry = /^\s+([A-Za-z0-9_.-]+):\s+(.*)$/.exec(line);
      indent ??= entry ? own : null;
      if (entry && own === indent) ({ value: map[entry[1]], next: i } = scalar(lines, i, own, entry[2]));
    }
    data[key] = map;
  }
  return { data, body: text.slice(match[0].length) };
}

const text = (value) => (typeof value === 'string' ? value : '');

async function exists(p) {
  return fs.lstat(p).then(() => true, (err) => (err.code === 'ENOENT' ? false : Promise.reject(err)));
}

/** The regular files of a skill's folder, '/'-separated, with their sizes. */
async function walk(dir, rel = '', out = []) {
  for (const entry of await fs.readdir(path.join(dir, rel), { withFileTypes: true })) {
    const itemRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await walk(dir, itemRel, out);
    else if (entry.isFile()) out.push({ path: itemRel, size: (await fs.stat(path.join(dir, itemRel))).size });
  }
  return out;
}

// The bundled skills follow the app: copied in afresh once per version. ponytail: a skill edited in the repo's skills/
// folder reaches a development data folder only when the version changes; remove data/skills/bundled to see it sooner
let seeded = null;
function seedBundled() {
  seeded ??= (async () => {
    const stamp = path.join(BUNDLED_DIR, '.version');
    if ((await fs.readFile(stamp, 'utf8').catch(() => '')) === APP_VERSION) return;
    const staged = path.join(SKILLS_DIR, `.bundled-${crypto.randomUUID()}`);
    await fs.mkdir(staged, { recursive: true });
    try {
      for (const entry of await fs.readdir(SKILLS_SEED_DIR, { withFileTypes: true }).catch(() => [])) {
        if (entry.isDirectory() && SKILL_ID.test(entry.name) && await exists(path.join(SKILLS_SEED_DIR, entry.name, 'SKILL.md'))) {
          await fs.cp(path.join(SKILLS_SEED_DIR, entry.name), path.join(staged, entry.name), { recursive: true });
        }
      }
      await fs.copyFile(path.join(SKILLS_SEED_DIR, 'manifest.json'), path.join(staged, 'manifest.json')).catch(() => {});
      await fs.writeFile(path.join(staged, '.version'), APP_VERSION);
      await fs.rm(BUNDLED_DIR, { recursive: true, force: true });
      await fs.rename(staged, BUNDLED_DIR);
    } finally { await fs.rm(staged, { recursive: true, force: true }); }
  })();
  // a failed copy is tried again next time
  seeded.catch(() => { seeded = null; });
  return seeded;
}

async function readState() {
  const state = await readJson(STATE_FILE).catch(() => ({}));
  return { off: Array.isArray(state.off) ? state.off.filter((id) => SKILL_ID.test(id)) : [], share: state.share === true };
}

/** Every skill: { id, dir, source, data, body }, the user's first, which hide a bundled skill of the same id. */
async function allSkills() {
  await seedBundled();
  const manifest = await readJson(path.join(BUNDLED_DIR, 'manifest.json')).catch(() => ({}));
  const found = new Map();
  for (const [source, root] of [['own', OWN_DIR], ['bundled', BUNDLED_DIR]]) {
    for (const entry of await fs.readdir(root, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isDirectory() || !SKILL_ID.test(entry.name) || found.has(entry.name)) continue;
      const dir = path.join(root, entry.name);
      const skill = await fs.readFile(path.join(dir, 'SKILL.md'), 'utf8').catch(() => null);
      if (skill === null) continue;
      found.set(entry.name, { id: entry.name, dir, source, ...readFrontMatter(skill), shipped: source === 'bundled' ? manifest.skills?.[entry.name] : undefined });
    }
  }
  return [...found.values()].sort((a, b) => a.id.localeCompare(b.id));
}

async function findSkill(id, { own = false } = {}) {
  if (!SKILL_ID.test(String(id || ''))) throw httpError('Invalid skill id.', 400);
  const skill = (await allSkills()).find((s) => s.id === id);
  if (!skill) throw httpError('Skill not found.', 404);
  if (own && skill.source !== 'own') throw httpError('Built-in skills can’t be changed. Duplicate one to edit it.', 403);
  return skill;
}

/** A project's choices: { on, off } from its settings. */
async function projectChoices(root) {
  const skills = root ? (await readProjectSettings(root)).skills : null;
  return { on: Array.isArray(skills?.on) ? skills.on : [], off: Array.isArray(skills?.off) ? skills.off : [] };
}

/**
 * Every skill as Settings lists it. enabled: on for this computer; project: the project's own choice, if it made one;
 * active: whether it is on in that project (the project's choice, else enabled).
 */
export async function listSkills(projectRoot) {
  const [{ off }, choices] = await Promise.all([readState(), projectChoices(projectRoot)]);
  return Promise.all((await allSkills()).map(async (skill) => {
    const meta = skill.data.metadata && typeof skill.data.metadata === 'object' ? skill.data.metadata : {};
    const enabled = !off.includes(skill.id);
    const project = choices.on.includes(skill.id) ? 'on' : choices.off.includes(skill.id) ? 'off' : undefined;
    return {
      id: skill.id,
      name: text(meta.title) || text(skill.data.name) || skill.id,
      description: text(skill.data.description).slice(0, 1024),
      author: skill.shipped?.author || text(meta['skill-author']) || text(meta.author),
      licence: skill.shipped?.licence || text(skill.data.license),
      version: text(meta.version),
      source: skill.source,
      files: (await walk(skill.dir)).length,
      ...(text(skill.data.compatibility) && { compatibility: text(skill.data.compatibility) }),
      enabled,
      ...(project && { project }),
      active: project ? project === 'on' : enabled
    };
  }));
}

/** The skills on in a project (or on this computer, without one): { id, dir, description }. */
export async function activeSkills(projectRoot) {
  return (await listSkills(projectRoot)).filter((s) => s.active).map((s) => ({ id: s.id, description: s.description, dir: path.join(s.source === 'own' ? OWN_DIR : BUNDLED_DIR, s.id) }));
}

export function setSkillEnabled(id, enabled) {
  if (typeof enabled !== 'boolean') throw httpError('Say whether the skill is on.', 400);
  return lock(async () => {
    await findSkill(id);
    const state = await readState();
    state.off = enabled ? state.off.filter((other) => other !== id) : [...new Set([...state.off, id])];
    await writeJsonAtomic(STATE_FILE, state);
    await syncShare(state);
  });
}

/** A skill's SKILL.md: name and description in its front matter, and the user's title for it under metadata. */
const skillText = ({ id, name, description, body }) => `---\nname: ${id}\ndescription: ${JSON.stringify(description)}\n${name ? `metadata:\n  title: ${JSON.stringify(name)}\n` : ''}---\n\n${body.trim()}\n`;

async function freeId(id) {
  if ((await allSkills()).some((s) => s.id === id)) throw httpError(`A skill called “${id}” already exists.`, 409);
}

export function createSkill({ id, name = '', description, body = '' } = {}) {
  return lock(async () => {
    if (!SKILL_ID.test(String(id || ''))) throw httpError('A skill’s id is up to 64 lowercase letters, digits and single hyphens.', 400);
    if (typeof description !== 'string' || !description.trim() || description.length > 1024) throw httpError('A skill needs a description of up to 1,024 characters.', 400);
    if (typeof name !== 'string' || name.length > 200 || typeof body !== 'string' || body.length > MAX_TEXT) throw httpError('Invalid skill.', 400);
    await freeId(id);
    await writeFileAtomic(path.join(OWN_DIR, id, 'SKILL.md'), skillText({ id, name: name.trim(), description: description.trim(), body }));
    await syncShare();
    return (await listSkills()).find((s) => s.id === id);
  });
}

/** Copies only regular files and folders, and refuses a folder with a link, a device or more than the limits in it. */
async function copySkillFolder(from, to) {
  let count = 0, total = 0;
  const copy = async (rel) => {
    for (const entry of await fs.readdir(path.join(from, rel), { withFileTypes: true })) {
      const itemRel = path.join(rel, entry.name);
      const stat = await fs.lstat(path.join(from, itemRel));
      if (stat.isDirectory()) {
        await fs.mkdir(path.join(to, itemRel), { recursive: true });
        await copy(itemRel);
        continue;
      }
      if (!stat.isFile()) throw httpError(`“${itemRel}” is a link or not an ordinary file, so the folder wasn’t added.`, 400);
      if (++count > MAX_FILES || (total += stat.size) > MAX_BYTES) throw httpError('This folder is too large for a skill (over 500 files or 20 MB).', 400);
      // opened without following a link that took the file's place since
      const handle = await fs.open(path.join(from, itemRel), fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
      try {
        if (!(await handle.stat()).isFile()) throw httpError(`“${itemRel}” is not an ordinary file.`, 400);
        await fs.writeFile(path.join(to, itemRel), await handle.readFile());
      } finally { await handle.close(); }
    }
  };
  await fs.mkdir(to, { recursive: true });
  await copy('');
}

/** Adds a copy of the folder at `folder` as one of the user's skills, named by its SKILL.md, else by the folder. */
export function importSkill(folder) {
  return lock(async () => {
    if (typeof folder !== 'string' || !path.isAbsolute(folder)) throw httpError('Choose a skill’s folder.', 400);
    const stat = await fs.lstat(folder).catch(() => null);
    if (!stat?.isDirectory()) throw httpError('That isn’t a folder.', 400);
    const skill = await fs.readFile(path.join(folder, 'SKILL.md'), 'utf8').catch(() => null);
    if (skill === null) throw httpError('A skill’s folder has a SKILL.md in it, and this one doesn’t.', 400);
    const named = text(readFrontMatter(skill).data.name);
    const id = SKILL_ID.test(named) ? named : path.basename(folder);
    if (!SKILL_ID.test(id)) throw httpError('A skill’s name is up to 64 lowercase letters, digits and single hyphens, and this one’s isn’t.', 400);
    await freeId(id);
    const staged = path.join(OWN_DIR, `.import-${crypto.randomUUID()}`);
    try {
      await copySkillFolder(folder, staged);
      await fs.rename(staged, path.join(OWN_DIR, id));
    } finally { await fs.rm(staged, { recursive: true, force: true }); }
    await syncShare();
    return (await listSkills()).find((s) => s.id === id);
  });
}

/** An editable copy, <id>-copy (then -copy-2…), its SKILL.md named after it; the licence and author lines go with it. */
export function duplicateSkill(id) {
  return lock(async () => {
    const skill = await findSkill(id);
    const taken = new Set((await allSkills()).map((s) => s.id));
    let copy = `${id.slice(0, 59)}-copy`;
    for (let n = 2; taken.has(copy); n += 1) copy = `${id.slice(0, 64 - `-copy-${n}`.length)}-copy-${n}`;
    const staged = path.join(OWN_DIR, `.copy-${crypto.randomUUID()}`);
    try {
      await copySkillFolder(skill.dir, staged);
      const file = path.join(staged, 'SKILL.md');
      const source = await fs.readFile(file, 'utf8');
      const head = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
      const renamed = !head ? `---\nname: ${copy}\ndescription: ${JSON.stringify(text(skill.data.description) || copy)}\n---\n\n${source}`
        : (/^name:.*$/m.test(head[1]) ? head[0].replace(/^name:.*$/m, `name: ${copy}`) : head[0].replace(/^---\r?\n/, `---\nname: ${copy}\n`)) + source.slice(head[0].length);
      await fs.writeFile(file, renamed);
      await fs.rename(staged, path.join(OWN_DIR, copy));
    } finally { await fs.rm(staged, { recursive: true, force: true }); }
    await syncShare();
    return (await listSkills()).find((s) => s.id === copy);
  });
}

export function deleteSkill(id) {
  return lock(async () => {
    const skill = await findSkill(id, { own: true });
    await fs.rm(skill.dir, { recursive: true, force: true });
    const state = await readState();
    if (state.off.includes(id)) await writeJsonAtomic(STATE_FILE, { ...state, off: state.off.filter((other) => other !== id) });
    await syncShare();
  });
}

export async function skillFiles(id) {
  return (await walk((await findSkill(id)).dir)).sort((a, b) => a.path.localeCompare(b.path));
}

/** A text file of a skill, up to max bytes. */
export async function readSkillFile(id, rel, max = MAX_TEXT) {
  const skill = await findSkill(id);
  const file = safeJoin(skill.dir, String(rel || ''));
  const stat = await fs.lstat(file).catch(() => null);
  if (!stat?.isFile()) throw httpError('That file isn’t in the skill.', 404);
  if (stat.size > max) throw httpError(`That file is over ${Math.round(max / 1024)} KB.`, 413);
  const bytes = await fs.readFile(file);
  if (bytes.includes(0)) throw httpError('That file isn’t text.', 415);
  return bytes.toString('utf8');
}

export function writeSkillFile(id, rel, content) {
  return lock(async () => {
    const skill = await findSkill(id, { own: true });
    if (typeof content !== 'string' || Buffer.byteLength(content) > MAX_TEXT) throw httpError('A skill’s file is text of up to 1 MB.', 400);
    const file = safeJoin(skill.dir, String(rel || ''));
    if (file === skill.dir || (await fs.lstat(file).catch(() => null))?.isDirectory()) throw httpError('Invalid path.', 400);
    if ((await walk(skill.dir)).length >= MAX_FILES && !(await exists(file))) throw httpError('A skill has at most 500 files.', 400);
    await writeFileAtomic(file, content);
  });
}

/** The skill's instructions and files, as an agent loads it. */
export async function loadSkill(id) {
  const skill = await findSkill(id);
  return { id: skill.id, description: text(skill.data.description), body: skill.body.trim(), files: (await walk(skill.dir)).map((f) => f.path).sort() };
}

// ─── Sharing with agents run outside Spectrum ───

// ~/.agents/skills (Codex, OpenCode, Cursor, Kimi) and ~/.claude/skills (Claude), used only where ~/.agents or ~/.claude is
const shareTargets = () => [['agents', '.agents'], ['claude', '.claude']].map(([agent, folder]) => ({ agent, parent: path.join(os.homedir(), folder), dir: path.join(os.homedir(), folder, 'skills') }));
const inStore = (target) => target.replace(/^\\\\\?\\/, '').toLowerCase().startsWith(SKILLS_DIR.toLowerCase() + path.sep);

/** The links of ours in a target's folder: name → where it points. */
async function ourLinks(dir) {
  const links = new Map();
  for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const link = path.join(dir, entry.name);
    const target = await fs.readlink(link).catch(() => null); // only a link (or a junction) has one
    if (target && inStore(path.resolve(dir, target))) links.set(entry.name, link);
  }
  return links;
}

/**
 * With sharing on, a link to each of the user's skills that is on, in every target whose agent folder exists; never in
 * place of something already there. Links of ours to anything else are removed, and every one when sharing is off.
 */
async function syncShare(state) {
  state ??= await readState();
  const wanted = state.share ? (await allSkills()).filter((s) => s.source === 'own' && !state.off.includes(s.id)) : [];
  for (const { parent, dir } of shareTargets()) {
    if (!(await fs.stat(parent).catch(() => null))?.isDirectory()) continue;
    const links = await ourLinks(dir);
    for (const [name, link] of links) {
      const keep = wanted.find((s) => s.id === name);
      if (!keep || path.resolve(dir, await fs.readlink(link)).replace(/^\\\\\?\\/, '') !== keep.dir) {
        await fs.unlink(link).catch(() => fs.rmdir(link)); // a junction goes with rmdir
        links.delete(name);
      }
    }
    if (!wanted.length) continue;
    await fs.mkdir(dir, { recursive: true });
    for (const skill of wanted) {
      if (links.has(skill.id) || await exists(path.join(dir, skill.id))) continue;
      // a junction needs no Developer Mode on Windows
      await fs.symlink(skill.dir, path.join(dir, skill.id), process.platform === 'win32' ? 'junction' : 'dir');
    }
  }
}

export async function shareStatus() {
  const { share } = await readState();
  return {
    enabled: share,
    targets: await Promise.all(shareTargets().map(async ({ agent, parent, dir }) => ({
      agent,
      path: dir,
      exists: !!(await fs.stat(parent).catch(() => null))?.isDirectory(),
      linked: (await ourLinks(dir)).size > 0
    })))
  };
}

export function setSharing(enabled) {
  if (typeof enabled !== 'boolean') throw httpError('Say whether to share skills.', 400);
  return lock(async () => {
    const state = { ...(await readState()), share: enabled };
    await writeJsonAtomic(STATE_FILE, state);
    await syncShare(state);
    return shareStatus();
  });
}
