// A project's Git repository (and the settings repository's), through isomorphic-git: pure JavaScript, so it works on
// Windows and on a Mac without the developer tools. Every file it writes goes through writeFileAtomic, whole or not at
// all, so a crash never leaves half a file in .git. Spectrum makes its own commits and its own pull: isomorphic-git's
// merge moves the branch before the files and can't merge a binary file, so the pull merges file by file with the
// cloud mirror's rules (mergeRules.js), writes each file only if it still holds what was just committed, and moves the
// branch once every file is written.
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import { HIDDEN_ENTRIES, listFilesRecursive, writeFileAtomic } from '../utils/fsUtils.js';
import { looksLikeConflictCopy } from '../utils/conflictCopies.js';
import { safeJoinLink } from '../utils/pathUtils.js';
import { mergeText } from '../utils/merge3.js';
import { isDocumentFile } from '../utils/texUtils.js';
import { isText } from './versionService.js';
import { conflictCopyPath, decide, deletionBrake, keepBefore, keyOf, mergeBibFiles, mergeChatFiles, mergeMeta, mergeSessionFiles, placeIfUnchanged, respellKeys } from './mergeRules.js';

const { readFile, mkdir, rmdir, unlink, stat, lstat, readdir, readlink, symlink, chmod, rm } = fs;
const windows = () => process.platform === 'win32';
/**
 * Node's file system for isomorphic-git, with each file written whole through a temp file beside it, a Mac's names
 * composed (NFC) as git's core.precomposeunicode has them, since NTFS keeps a decomposed name apart from the one typed,
 * and a link Windows won't make (without Developer Mode) written as a file holding its target, as Git for Windows does.
 */
export const gitFs = {
  promises: {
    readFile, mkdir, rmdir, unlink, stat, lstat, readlink, chmod, rm,
    readdir: process.platform === 'darwin' ? async (...args) => (await readdir(...args)).map((n) => (typeof n === 'string' ? n.normalize('NFC') : n)) : readdir,
    async symlink(target, file) {
      try {
        await symlink(target, file);
      } catch (err) {
        if (!windows() || err.code !== 'EPERM') throw err;
        await writeFileAtomic(file, target);
      }
    },
    async writeFile(file, data, options) {
      await writeFileAtomic(file, data);
      // isomorphic-git asks 0o777 for an executable and leaves the umask to narrow it
      if (options?.mode) await chmod(file, options.mode & 0o755);
    }
  }
};

/** A name Windows can't give a file: <>:"|?*\, a control character, a trailing dot or space, or a device's (CON, NUL…). */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
export const unfitOnWindows = (rel) => rel.split('/').some((p) => /[<>:"|?*\\\u0000-\u001f]/.test(p) || /[. ]$/.test(p) || RESERVED.test(p));

/** Text as isomorphic-git reads it with core.autocrlf true: CRLF as LF, in UTF-8 only. */
function lf(bytes) {
  try {
    return Buffer.from(new TextDecoder('utf8', { fatal: true }).decode(bytes).replace(/\r\n/g, '\n'));
  } catch {
    return bytes;
  }
}

// GitHub refuses a file over 100 MiB
export const MAX_FILE_BYTES = 100 * 1024 * 1024;
// what of .spectrum goes to GitHub; the rest (checkpoints, presence and the like) stays on each computer
const APP_SHARED = ['project.json', 'settings.json', 'chats', 'todos', 'notes', 'research'];
// what a shared repository's other people would read, so asked about first
export const PERSONAL = /^\.spectrum\/(?:chats|todos|notes|research)\//i;
// read on its own: the computer's other files, never a .tex's line merge
const CHAT = /^\.spectrum\/chats\/[^/]+\.json$/;
const RESEARCH = /^\.spectrum\/research\/[^/]+\.json$/;
// the name a pull gives GitHub's text that didn't merge, which unlike a sync app's copy is committed
const OWN_COPY = 'GitHub’s conflicted copy';
// a .env file, a private key or a keystore (a .key file only when it holds a PEM key: Keynote's decks are .key too)
const SECRET = /^(?:\.env(?:\..*)?|\.netrc|\.npmrc|\.pypirc|id_(?:rsa|dsa|ecdsa|ed25519)|.+\.(?:pem|p12|pfx|keystore|jks|ppk))$/i;
// TeX's build files, for the project's own .gitignore (Spectrum keeps its own outside the project); .bbl stays, as arXiv takes it
const GITIGNORE = `# TeX's build files
*.aux
*.log
*.out
*.toc
*.lof
*.lot
*.fls
*.fdb_latexmk
*.synctex.gz
*.bcf
*.blg
*.run.xml
*.xdv
*.nav
*.snm
*.vrb
_minted-*/
`;

const exists = (p) => fs.lstat(p).then(() => true, () => false);
const join = (root, rel) => path.join(root, ...rel.split('/'));
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

export const secretLooking = (rel) => SECRET.test(rel.split('/').pop());

/** A .key file that starts as a PEM private key does. */
async function pemKey(abs) {
  if (!/\.key$/i.test(abs)) return false;
  const fh = await fs.open(abs, 'r').catch(() => null);
  if (!fh) return false;
  try {
    const { bytesRead, buffer } = await fh.read(Buffer.alloc(10), 0, 10, 0);
    return buffer.subarray(0, bytesRead).toString() === '-----BEGIN';
  } finally {
    await fh.close();
  }
}

/**
 * What never goes in the repository, whatever it holds: app data outside APP_SHARED, the names HIDDEN_ENTRIES lists,
 * Spectrum's save and upload temp files, and a sync app's conflicted copy (a pull's own copy goes in).
 */
export function keptOut(rel) {
  if (/\.(tmp|upload)$/i.test(rel)) return true;
  const parts = rel.split('/');
  const name = parts.at(-1);
  if (parts[0].toLowerCase() === '.spectrum') {
    if (parts.length < 2 || !APP_SHARED.includes(parts[1]) || (parts.length === 2) !== parts[1].endsWith('.json')) return true;
    if (looksLikeConflictCopy(name)) return true;
  } else if (looksLikeConflictCopy(name) && !name.includes(OWN_COPY)) return true;
  return parts.slice(1).some((part) => part.toLowerCase() === '.spectrum') || parts.some((part) => HIDDEN_ENTRIES.has(part) && part !== '.spectrum');
}

/** Why Spectrum leaves the project's repository alone, or null: another program in it, or Git that Spectrum can't sync. */
export async function refusal(root) {
  const dot = path.join(root, '.git');
  const info = await fs.lstat(dot).catch(() => null);
  if (!info) return null;
  if (!info.isDirectory()) return 'This project’s .git points to a repository elsewhere (a Git worktree or submodule), which Spectrum can’t sync.';
  if (await exists(path.join(dot, 'index.lock'))) return 'Another program is working in this project’s Git repository (.git/index.lock is there). Try again once it has finished.';
  for (const name of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply']) {
    if (await exists(path.join(dot, name))) return 'This project’s repository is in the middle of a merge or rebase. Finish or abort it in Git, then try again.';
  }
  const head = await fs.readFile(path.join(dot, 'HEAD'), 'utf8').catch(() => '');
  if (head && !head.startsWith('ref: ')) return 'This project’s repository has a commit checked out rather than a branch (a detached HEAD). Check out a branch in Git, then try again.';
  if (await exists(path.join(root, '.gitmodules'))) return 'This project’s repository uses submodules, which Spectrum can’t sync.';
  if (/\bfilter=/.test(await fs.readFile(path.join(root, '.gitattributes'), 'utf8').catch(() => ''))) return 'This project’s repository uses Git LFS (or another filter), which Spectrum can’t sync.';
  return null;
}

export const isRepo = (root) => exists(path.join(root, '.git'));
export const branchOf = async (root) => (await git.currentBranch({ fs: gitFs, dir: root }).catch(() => null)) || 'main';
const resolve = (root, ref) => git.resolveRef({ fs: gitFs, dir: root, ref }).catch(() => null);
export const headOid = (root) => resolve(root, 'HEAD');
export const remoteHead = async (root) => resolve(root, `refs/remotes/origin/${await branchOf(root)}`);
export const blobOid = async (bytes) => (await git.hashBlob({ object: bytes })).oid;

/** git init on main, with TeX's build files in a .gitignore when the project has none (and gitignore isn't false: Link takes GitHub's). */
export async function initRepo(root, branch = 'main', { gitignore = true } = {}) {
  await git.init({ fs: gitFs, dir: root, defaultBranch: branch });
  const ignore = path.join(root, '.gitignore');
  if (gitignore && !(await exists(ignore))) await writeFileAtomic(ignore, GITIGNORE);
}

export const readBlobAt = async (root, oid) => Buffer.from((await git.readBlob({ fs: gitFs, dir: root, oid })).blob);
export const writeBlobAt = (root, blob) => git.writeBlob({ fs: gitFs, dir: root, blob });

export async function setRemote(root, url) {
  await git.setConfig({ fs: gitFs, dir: root, path: 'remote.origin.url', value: url });
  await git.setConfig({ fs: gitFs, dir: root, path: 'remote.origin.fetch', value: '+refs/heads/*:refs/remotes/origin/*' });
}

export const remoteUrl = (root) => git.getConfig({ fs: gitFs, dir: root, path: 'remote.origin.url' }).catch(() => undefined);
export const deleteRemote = (root) => git.deleteRemote({ fs: gitFs, dir: root, remote: 'origin' });

// a PDF a source includes: LaTeX's \includegraphics or \includepdf, Typst's image("…") and Markdown's ![…](…)
const INCLUDED = /\\include(?:graphics|pdf)\*?\s*(?:\[[^\]]*\]\s*)?\{([^}]*)\}|\bimage\(\s*"([^"]*)"|!\[[^\]]*\]\(\s*<?([^)\s>]*)/g;

/**
 * Each document's PDF that a compile writes beside it (main.tex's main.pdf, main.typ's or main.md's), never a PDF a
 * source includes (by name, wherever it is: one included in any folder is never left out). Any .typ or Markdown file
 * may be compiled on its own, a .tex only with \documentclass.
 */
export async function compiledPdfs(root) {
  const files = (await listFilesRecursive(root)).filter((i) => i.type === 'file' && /\.(tex|ltx|typ|md|markdown)$/i.test(i.path)).map((i) => i.path);
  const included = new Set();
  const docs = [];
  for (const rel of files) {
    if (!/\.(tex|ltx)$/i.test(rel) || (await isDocumentFile(join(root, rel)))) docs.push(rel);
    const text = await fs.readFile(join(root, rel), 'utf8').catch(() => '');
    for (const m of text.matchAll(INCLUDED)) included.add(path.posix.basename(m.slice(1).find((p) => p !== undefined).trim()).replace(/\.pdf$/i, '').toLowerCase());
  }
  return docs.map((rel) => rel.replace(/\.(tex|ltx|typ|md|markdown)$/i, '.pdf')).filter((pdf) => !included.has(path.posix.basename(pdf).slice(0, -4).toLowerCase()));
}

// a path as a pattern that matches only itself, from the top of the project
const literal = (rel) => `/${rel.replace(/[\\*?[\]]/g, '\\$&').replace(/ $/, '\\ ')}`;

const EXCLUDES_START = '# >>> Spectrum';
const EXCLUDES_END = '# <<< Spectrum';

/**
 * Spectrum's section of .git/info/exclude, rewritten before each commit with what keptOut leaves out and each compiled
 * document's PDF, last so that it wins. Every line outside it is the user's and stays, all of a file without the markers.
 */
async function writeExcludes(root, pdfs) {
  const file = path.join(root, '.git', 'info', 'exclude');
  const hidden = [...HIDDEN_ENTRIES].filter((name) => !['.spectrum', '.git'].includes(name) && !/[\r\n]/.test(name));
  const lines = [
    EXCLUDES_START,
    '# Spectrum rewrites this section before each backup. Lines outside it are yours and stay.',
    '/.spectrum/*',
    // without a trailing slash, which isomorphic-git's check of a folder wouldn't match
    ...APP_SHARED.map((name) => `!/.spectrum/${name}`),
    ...hidden.map((name) => name.replace(/[\\*?[\]#!]/g, '\\$&')),
    '*.tmp',
    '*.upload',
    '*conflicted copy*',
    `!*${OWN_COPY}*`,
    ...pdfs.map(literal),
    EXCLUDES_END
  ];
  const own = (await fs.readFile(file, 'utf8').catch(() => '')).split(/\r?\n/);
  const start = own.indexOf(EXCLUDES_START);
  const end = start === -1 ? -1 : own.indexOf(EXCLUDES_END, start);
  if (end !== -1) own.splice(start, end - start + 1);
  while (own.length && own.at(-1) === '') own.pop();
  await writeFileAtomic(file, `${[...own, ...lines].join('\n')}\n`);
}

/**
 * Commit what changed since the last commit, with the excludes rewritten first: { oid, committed, left }. hold(rel): a
 * path whose changes wait for a later commit (chats and research sessions at an idle backup, or what a shared
 * repository leaves out). left: what was refused, a secret-looking file or one over GitHub's limit, for the notice.
 * always: a commit even with nothing changed (a labelled backup). compiled: false where no PDF is a compile's (the
 * settings repository's templates keep theirs).
 * ponytail: statusMatrix hashes every file whose time changed, fine for hundreds of files and slow for many thousands
 */
export async function commitAll(root, { message, author, hold = () => false, always = false, compiled: pdfsCompiled = true }) {
  // Git for Windows checks out with CRLF line ends and reads them as LF through its system config's core.autocrlf,
  // which isomorphic-git never reads: the repository's own says it, so a file isn't taken as changed in every line
  const autocrlf = windows() ? await git.getConfig({ fs: gitFs, dir: root, path: 'core.autocrlf' }) : undefined;
  if (windows() && autocrlf === undefined) await git.setConfig({ fs: gitFs, dir: root, path: 'core.autocrlf', value: 'true' });
  const pdfs = pdfsCompiled ? await compiledPdfs(root) : [];
  await writeExcludes(root, pdfs);
  const compiled = new Set(pdfs.map(keyOf));
  const cache = {};
  const left = [];
  let changes = 0;
  const rows = await git.statusMatrix({ fs: gitFs, dir: root, cache });
  // two committed names for one file, which a Mac's or Windows' disk keeps as one: left as committed, as the disk
  // can't say which it holds, and named for a rename
  const committedKeys = new Map();
  for (const [rel, head] of rows) if (head) committedKeys.set(keyOf(rel), (committedKeys.get(keyOf(rel)) || 0) + 1);
  const named = new Set();
  // the modes committed, where Windows has no execute bit to keep a script's
  const modes = windows() ? await treeFiles(root, await headOid(root)) : new Map();
  // added and removed together after the loop: each add or remove writes the whole index again
  const adds = [];
  const removes = [];
  for (const [rel, head, work, stage] of rows) {
    if (head === 1 && work === 1 && stage === 1) continue;
    // what stays out of this commit goes back to the commit's in the index, which the commit is made from: Git may have
    // staged it already (git add .)
    const leave = () => (stage === head ? null : git.resetIndex({ fs: gitFs, dir: root, filepath: rel, cache }));
    if (keptOut(rel) || compiled.has(keyOf(rel)) || hold(rel)) {
      await leave();
      continue;
    }
    if (committedKeys.get(keyOf(rel)) > 1) {
      if (!named.has(keyOf(rel))) left.push(`“${rel}” and another file differ only in letter case, which macOS and Windows can’t keep apart. Rename one of them`);
      named.add(keyOf(rel));
      continue;
    }
    // a committed name Windows can't have (the Mac's Why?.tex) is never here, and never deleted for that
    if (head && windows() && unfitOnWindows(rel)) continue;
    if (work === 0) {
      if (stage) removes.push(rel);
      if (head) changes++;
      continue;
    }
    const info = await fs.lstat(join(root, rel)).catch(() => null);
    if (!info) continue;
    if (secretLooking(rel) || (await pemKey(join(root, rel)))) {
      left.push(`“${rel}” looks like a password or key file`);
      await leave();
    } else if (info.size > MAX_FILE_BYTES) {
      left.push(`“${rel}” is over GitHub’s 100 MB limit`);
      await leave();
    } else {
      adds.push(rel);
      if (work === 2) changes++;
    }
  }
  if (removes.length) await git.remove({ fs: gitFs, dir: root, filepath: removes, cache });
  // in groups, as git.add opens every file it's given at the same time
  for (let i = 0; i < adds.length; i += 500) await git.add({ fs: gitFs, dir: root, filepath: adds.slice(i, i + 500), cache });
  // a script committed as executable stays so, or the Mac's next pull would take +x away
  for (const rel of adds) {
    if (modes.get(rel)?.mode !== '100755') continue;
    const bytes = await fs.readFile(join(root, rel));
    const { oid } = await git.hashBlob({ object: (autocrlf ?? 'true') === 'true' ? lf(bytes) : bytes });
    await git.updateIndex({ fs: gitFs, dir: root, filepath: rel, oid, mode: 0o100755 });
  }
  const head = await headOid(root);
  if (!changes && head && !always) return { oid: head, committed: false, left };
  return { oid: await git.commit({ fs: gitFs, dir: root, message, author, cache }), committed: true, left };
}

// a token in a header rather than the URL, so it's never in .git/config; isomorphic-git has no SSH, which GitHub doesn't need
const authOf = (token) => (token ? { headers: { Authorization: `Basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}` } } : {});

/** origin's branch fetched into refs/remotes/origin; resolves to its commit, or null when origin has none yet (a new repository). */
export async function fetchOrigin(root, token) {
  const branch = await branchOf(root);
  try {
    await git.fetch({ fs: gitFs, http, dir: root, remote: 'origin', ref: branch, singleBranch: true, tags: false, ...authOf(token) });
  } catch (err) {
    if (err.code === 'NotFoundError' || err.code === 'EmptyServerResponseError') return null;
    throw err;
  }
  return remoteHead(root);
}

export async function pushOrigin(root, token) {
  await git.push({ fs: gitFs, http, dir: root, remote: 'origin', ref: await branchOf(root), ...authOf(token) });
}

/** url cloned into dir, a new folder. */
export async function cloneInto(dir, url, token) {
  await git.clone({ fs: gitFs, http, dir, url, singleBranch: true, noTags: true, ...authOf(token) });
}

/** How many commits this computer has that origin hasn't, and the other way. ponytail: counted to 200 back */
export async function aheadBehind(root) {
  const branch = await branchOf(root);
  const commits = async (ref) => {
    const oid = await resolve(root, ref);
    if (!oid) return new Set();
    return new Set((await git.log({ fs: gitFs, dir: root, ref: oid, depth: 200 }).catch(() => [])).map((c) => c.oid));
  };
  const [ours, theirs] = await Promise.all([commits(branch), commits(`refs/remotes/origin/${branch}`)]);
  return { ahead: [...ours].filter((oid) => !theirs.has(oid)).length, behind: [...theirs].filter((oid) => !ours.has(oid)).length };
}

/** When a commit was made, as ISO text, or null. */
export async function commitTime(root, oid) {
  if (!oid) return null;
  const { commit } = await git.readCommit({ fs: gitFs, dir: root, oid }).catch(() => ({}));
  return commit ? new Date(commit.committer.timestamp * 1000).toISOString() : null;
}

// ─── Pull ───

/** The files of this computer's commit, origin's and their common one (none in common: empty), each as treeFiles gives them. */
export async function mergeSides(root) {
  const [ours, theirs] = [await headOid(root), await remoteHead(root)];
  const [base] = ours && theirs ? await git.findMergeBase({ fs: gitFs, dir: root, oids: [ours, theirs] }).catch(() => []) : [];
  return { base: await treeFiles(root, base), ours: await treeFiles(root, ours), theirs: await treeFiles(root, theirs) };
}

/** A commit's files: Map rel → { oid, mode }. */
export async function treeFiles(root, commit, cache = {}) {
  const files = new Map();
  if (!commit) return files;
  await git.walk({
    fs: gitFs,
    dir: root,
    cache,
    trees: [git.TREE({ ref: commit })],
    map: async (rel, [entry]) => {
      if (rel === '.') return true;
      const type = await entry.type();
      // a submodule's commit
      if (type === 'commit') return null;
      if (type === 'blob') files.set(rel, { oid: await entry.oid(), mode: (await entry.mode()).toString(8) });
      return true;
    }
  });
  return files;
}

const json = (buf) => {
  try {
    const value = JSON.parse(buf.toString('utf8'));
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
};

/**
 * A file of .spectrum changed on both sides, merged, or null to keep this computer's: never a conflicted copy, which no
 * one would see. A chat by message, a research session by search, and project.json, settings.json, a to-do, a PDF
 * note or any other of its JSON files key by key (one level deep) against the base.
 */
function mergeAppFile(key, base, ours, theirs) {
  if (CHAT.test(key)) return mergeChatFiles(ours, theirs)?.data ?? null;
  if (RESEARCH.test(key)) return mergeSessionFiles(ours, theirs);
  const [o, t] = [json(ours), json(theirs)];
  return o && t ? Buffer.from(JSON.stringify(mergeMeta((base && json(base)) || undefined, o, t), null, 2)) : null;
}

/**
 * What merging theirs into ours makes of each file, against base (each treeFiles'), without writing anything:
 * { decisions: [{ key, o, r }] with o this computer's file and r the result (each null for none; r with data when
 * merged), copies: GitHub's files that didn't merge, problems }. side(rel): 'ours' or 'theirs' to take that side's
 * file whatever changed (the settings repository's newer item), or null. compiled: the keys of compiled PDFs.
 */
export async function planMerge({ base, ours, theirs, read, compiled = new Set(), side = () => null }) {
  const decisions = [];
  const copies = [];
  const problems = [];
  const { files, clashes } = respellKeys([...base.keys()], [...ours.keys()], [...theirs.keys()]);
  // two names for one file on one side, which a Mac or Windows disk can't keep apart, and on Windows a name it can't
  // have: each kept in the commit only (treeOnly), never written here, so neither computer deletes it from GitHub
  const clashed = new Set();
  for (const [a, b] of clashes) {
    problems.push(`“${a}” and “${b}” differ only in letter case, which macOS and Windows can’t keep apart. Rename one of them.`);
    clashed.add(keyOf(a));
  }
  if (windows()) {
    for (const rel of new Set([...ours.keys(), ...theirs.keys()])) {
      if (!unfitOnWindows(rel) || clashed.has(keyOf(rel))) continue;
      problems.push(`“${rel}” can’t be a file name on Windows. Rename it on your other computer.`);
      clashed.add(keyOf(rel));
    }
  }
  // each exact path as GitHub has it, unless this computer changed that path since the base
  for (const key of clashed) {
    for (const rel of new Set([...base.keys(), ...ours.keys(), ...theirs.keys()].filter((p) => keyOf(p) === key))) {
      const [b, o, t] = [base.get(rel), ours.get(rel), theirs.get(rel)];
      const r = o?.oid === b?.oid ? t : o;
      if (o || r) decisions.push({ key, o: o && { rel, ...o }, r: r && { rel, ...r }, treeOnly: true });
    }
  }
  const entry = (map, rel) => (rel === undefined ? null : { rel, ...map.get(rel) });
  for (const [key, f] of files) {
    if (clashed.has(key)) continue;
    const [b, o, t] = [entry(base, f.base), entry(ours, f.ours), entry(theirs, f.theirs)];
    const pick = side(f.rel) ?? decide(b?.oid ?? null, o?.oid ?? null, t?.oid ?? null);
    const from = pick === 'theirs' ? t : pick === 'drop' ? null : o;
    let r = from && { ...from, rel: f.rel };
    if (pick === 'merge') {
      const [ob, tb, bb] = await Promise.all([read(o.oid), read(t.oid), b ? read(b.oid) : null]);
      const app = key.startsWith('.spectrum/');
      // a compiled PDF stays this computer's, with no copy
      // a .bib both sides added entries to at its end merges entry by entry
      const text = () => mergeText(bb ?? Buffer.alloc(0), ob, tb) ?? (/\.bib$/i.test(f.rel) ? mergeBibFiles(bb ?? Buffer.alloc(0), ob, tb) : null);
      const data = app ? mergeAppFile(key, bb, ob, tb) : compiled.has(key) ? null : isText(f.rel) ? text() : null;
      if (data) r = { rel: f.rel, data, mode: o.mode };
      else if (!app && !compiled.has(key)) copies.push({ rel: conflictCopyPath(f.rel, 'GitHub'), data: tb, mode: t.mode });
    }
    decisions.push({ key, o, r });
  }
  // a copy's name nothing else has
  const taken = new Set(decisions.map((d) => d.r && keyOf(d.r.rel)));
  for (const c of copies) {
    const dot = c.rel.lastIndexOf('.');
    const [stem, ext] = dot > c.rel.lastIndexOf('/') + 1 ? [c.rel.slice(0, dot), c.rel.slice(dot)] : [c.rel, ''];
    for (let n = 2; taken.has(keyOf(c.rel)); n++) c.rel = `${stem}-${n}${ext}`;
    taken.add(keyOf(c.rel));
  }
  return { decisions, copies, problems };
}

/** Whether a decision leaves this computer's file as it is: the same, or only in the commit (treeOnly). */
const unchanged = ({ o, r, treeOnly }) => treeOnly || (!o && !r) || (o && r && o.rel === r.rel && !r.data && o.oid === r.oid);

/** The commit's tree for the decisions' results and the copies. */
async function writeMergedTree(root, decisions, copies) {
  const top = new Map();
  const put = (rel, entry) => {
    const parts = rel.split('/');
    let dir = top;
    for (const part of parts.slice(0, -1)) {
      if (!dir.has(part)) dir.set(part, new Map());
      dir = dir.get(part);
    }
    dir.set(parts.at(-1), entry);
  };
  const blob = async (x) => ({ mode: x.mode, oid: x.data ? await git.writeBlob({ fs: gitFs, dir: root, blob: x.data }) : x.oid });
  for (const { r } of decisions) if (r) put(r.rel, await blob(r));
  for (const c of copies) put(c.rel, await blob(c));
  const write = async (dir) => {
    const tree = [];
    for (const [name, entry] of dir) {
      tree.push(entry instanceof Map ? { mode: '040000', path: name, oid: await write(entry), type: 'tree' } : { mode: entry.mode, path: name, oid: entry.oid, type: 'blob' });
    }
    return git.writeTree({ fs: gitFs, dir: root, tree });
  };
  return write(top);
}

/** Folders a deletion left empty go too, up to the project's own. */
async function pruneUp(root, abs) {
  for (let dir = path.dirname(abs); dir.startsWith(root + path.sep); dir = path.dirname(dir)) {
    if (!(await fs.rmdir(dir).then(() => true, () => false))) return;
  }
}

/** The file at rel renamed to want, a name that differs only in letter case or Unicode form, a folder at a time. */
async function respell(root, rel, want) {
  const parts = rel.split('/');
  const wanted = want.split('/');
  let at = root;
  for (let i = 0; i < parts.length; i++) {
    // a folder another file in it already renamed isn't there by its old name on a volume that tells case apart
    if (parts[i] !== wanted[i]) await fs.rename(path.join(at, parts[i]), path.join(at, wanted[i])).catch((err) => (err.code === 'ENOENT' ? null : Promise.reject(err)));
    at = path.join(at, wanted[i]);
  }
}

/**
 * A symbolic link at rel to target, in place of what's there; where links can't be made (Windows without the right
 * to), its target in a plain file, as Git for Windows writes one with core.symlinks false.
 */
async function placeLink(root, rel, target) {
  const dest = join(root, rel);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  if (!windows()) {
    const tmp = `${dest}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.symlink(target, tmp);
      await fs.rename(tmp, dest);
      return;
    } catch (err) {
      await fs.rm(tmp, { force: true });
      if (err.code !== 'EPERM') throw err;
    }
  }
  await fs.rm(dest, { force: true });
  await writeFileAtomic(dest, target);
}

/**
 * Write what the merge decided, deletions first: each file only while it still holds this computer's committed bytes
 * (or isn't there, for a new one). keep(rel): a file left as it is here (a compiled PDF, one not committed). On a file
 * that changed meanwhile, or a write that fails, the files already written are put back and it throws CHANGED.
 */
async function writeDecisions(root, decisions, copies, read, keep) {
  const ops = decisions.filter((d) => !unchanged(d) && !keep(d.r?.rel ?? d.o.rel));
  ops.sort((a, b) => Number(!!b.o && !b.r) - Number(!!a.o && !a.r));
  const done = [];
  const changed = () => Object.assign(new Error('A file changed while it was being pulled. Spectrum tries again shortly.'), { code: 'CHANGED' });
  // what's here of a committed file, as placeIfUnchanged checks it (its SHA-256), while it still holds what was
  // committed: as committed, with CRLF line ends (a Git for Windows checkout), or as the link committed ('link'; its
  // target in a plain file where links can't be made); else 'changed', which nothing matches
  const committed = async (o) => {
    if (!o) return null;
    const abs = join(root, o.rel);
    const blob = await read(o.oid);
    if (o.mode === '120000' && (await fs.readlink(abs).then((to) => to === blob.toString(), () => false))) return 'link';
    const now = await fs.readFile(abs).catch(() => null);
    if (!now) return 'changed';
    return now.equals(blob) || Buffer.from(now.toString('latin1').replace(/\r\n/g, '\n'), 'latin1').equals(blob) ? sha256(now) : 'changed';
  };
  const restore = async (o) => (o.mode === '120000' ? placeLink(root, o.rel, (await read(o.oid)).toString()) : writeFileAtomic(join(root, o.rel), await read(o.oid)));
  // every file written, deleted or renamed in a folder of the project's own, before any is and again as each is: a
  // folder here may be a link to one elsewhere (an ignored assets folder, say), or become one as a link GitHub has is
  // placed (Assets beside assets/x, on a disk that ignores case), which nothing from GitHub goes through
  const refused = (rel) => Object.assign(new Error(`“${rel}” is in a folder that links outside the project, so Spectrum won’t pull GitHub’s changes into it. Replace the link with a folder, or leave it out on GitHub too.`), { statusCode: 409, code: 'GIT_REFUSED' });
  const guard = (rel) => {
    try {
      safeJoinLink(root, rel);
    } catch {
      throw refused(rel);
    }
  };
  const links = ops.filter(({ r }) => r?.mode === '120000').map(({ r }) => `${keyOf(r.rel)}/`);
  for (const rel of [...ops.flatMap(({ o, r }) => [o?.rel, r?.rel]), ...copies.map((c) => c.rel)]) {
    if (!rel) continue;
    guard(rel);
    if (links.some((link) => keyOf(rel).startsWith(link))) throw refused(rel);
  }
  try {
    for (const d of ops) {
      const { o, r } = d;
      for (const rel of [o?.rel, r?.rel]) if (rel) guard(rel);
      let expect = await committed(o);
      if (expect === 'changed') throw changed();
      if (o && (!r || o.rel !== r.rel)) {
        if (!r) {
          await fs.rm(join(root, o.rel), { force: true });
          await pruneUp(root, join(root, o.rel));
        } else await respell(root, o.rel, r.rel);
      }
      if (r) {
        const bytes = r.data ?? (await read(r.oid));
        // a link goes before what replaces it, so nothing is written through it to its target
        if (expect === 'link') {
          await fs.rm(join(root, r.rel), { force: true });
          expect = null;
        }
        if (r.mode === '120000') {
          if (expect === null && (await exists(join(root, r.rel)))) throw changed();
          await placeLink(root, r.rel, bytes.toString());
        } else {
          if (!(await placeIfUnchanged(root, r.rel, bytes, expect))) throw changed();
          if (!windows() && r.mode === '100755') await fs.chmod(join(root, r.rel), 0o755);
        }
      }
      done.push(d);
    }
    for (const c of copies) {
      guard(c.rel);
      if (!(await placeIfUnchanged(root, c.rel, c.data, null))) throw changed();
      done.push({ o: null, r: c });
    }
  } catch (err) {
    // this computer's files as they were committed
    for (const { o, r } of done.reverse()) {
      if (r && (!o || o.rel !== r.rel)) await fs.rm(join(root, r.rel), { force: true }).catch(() => {});
      if (o) await restore(o).catch(() => {});
    }
    throw err;
  }
  return ops;
}

/**
 * Merge origin's fetched branch into this computer's committed one, under the caller's project lock: a "Before pull
 * from GitHub" checkpoint when files here change, the files written, a two-parent commit (or a fast-forward), and only
 * then the branch moved. Resolves { state, fromTheirs, conflicts, changedApp, deleting, problems }: state 'current'
 * (nothing to take), 'merged', 'confirm' (it would delete many files at once and allowDeletions wasn't given) or
 * 'preview' (dryRun: what it would do, with nothing written). base: the files to merge against instead of the commits'
 * own common one (Link from a mirror's last sync), as treeFiles gives them. side: planMerge's. Every file the merged
 * commit has is written here, those a shared repository holds back from GitHub too, so the next backup never reads
 * one missing here as deleted.
 */
export async function mergeOrigin(root, { author, allowDeletions = false, dryRun = false, base: given, side, message = 'Pull from GitHub', checkpoint = true }) {
  const branch = await branchOf(root);
  const [ours, theirs] = [await headOid(root), await remoteHead(root)];
  const none = { state: 'current', fromTheirs: 0, conflicts: 0, changedApp: false, deleting: 0, problems: [] };
  if (!theirs || ours === theirs) return none;
  if (ours && (await git.isDescendent({ fs: gitFs, dir: root, oid: ours, ancestor: theirs, depth: -1 }).catch(() => false))) return none;
  const cache = {};
  const [mergeBase] = ours ? await git.findMergeBase({ fs: gitFs, dir: root, oids: [ours, theirs], cache }).catch(() => []) : [];
  const read = async (oid) => Buffer.from((await git.readBlob({ fs: gitFs, dir: root, oid, cache })).blob);
  const compiled = new Set((await compiledPdfs(root)).map(keyOf));
  const [baseFiles, oursFiles, theirsFiles] = await Promise.all([given ?? treeFiles(root, mergeBase, cache), treeFiles(root, ours, cache), treeFiles(root, theirs, cache)]);
  const plan = await planMerge({ base: baseFiles, ours: oursFiles, theirs: theirsFiles, read, compiled, side });
  // a compiled PDF and what this computer doesn't commit stay as they are here
  const kept = (rel) => compiled.has(keyOf(rel)) || keptOut(rel) || secretLooking(rel);
  const working = plan.decisions.filter((d) => !unchanged(d) && !kept(d.r?.rel ?? d.o.rel));
  const deleting = working.filter((d) => d.o && !d.r).map((d) => d.o.rel);
  const summary = {
    fromTheirs: working.length,
    conflicts: plan.copies.length,
    changedApp: [...working.map((d) => d.key), ...plan.copies.map((c) => keyOf(c.rel))].some((key) => key.startsWith('.spectrum/')),
    deleting: deleting.length,
    problems: plan.problems
  };
  if (dryRun) return { state: 'preview', ...summary };
  if (!allowDeletions && deletionBrake(deleting, [...oursFiles.keys()])) return { state: 'confirm', ...summary };
  if (checkpoint && (working.length || plan.copies.length)) await keepBefore(root, 'Before pull from GitHub');
  // a file here that a new one from GitHub would land on, which this computer never committed (an ignored one), stays too
  const uncommitted = new Set();
  for (const d of plan.decisions) if (!d.o && d.r && (await exists(join(root, d.r.rel)))) uncommitted.add(keyOf(d.r.rel));
  const ops = await writeDecisions(root, plan.decisions, plan.copies, read, (rel) => kept(rel) || uncommitted.has(keyOf(rel)));
  const tree = await writeMergedTree(root, plan.decisions, plan.copies);
  const theirsTree = (await git.readCommit({ fs: gitFs, dir: root, oid: theirs, cache })).commit.tree;
  const oid = tree === theirsTree && (!ours || mergeBase === ours)
    ? theirs
    : await git.commit({ fs: gitFs, dir: root, message, author, tree, parent: ours ? [ours, theirs] : [theirs], noUpdateBranch: true, cache });
  await git.writeRef({ fs: gitFs, dir: root, ref: `refs/heads/${branch}`, value: oid, force: true });
  // the index to the new commit for each file that changed in it, so the next backup sees only what changes after;
  // one kept in the commit only goes in the index too, which the next commit's tree is made from
  const touched = new Set([...plan.decisions.filter((d) => !unchanged(d) || d.treeOnly).flatMap((d) => [d.o?.rel, d.r?.rel]), ...plan.copies.map((c) => c.rel)].filter(Boolean));
  for (const filepath of touched) await git.resetIndex({ fs: gitFs, dir: root, filepath, cache }).catch(() => {});
  return { state: 'merged', ...summary, fromTheirs: ops.length };
}
