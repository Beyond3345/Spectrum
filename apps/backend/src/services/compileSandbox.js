// What confines a LaTeX compile on a Mac: every program a compile starts (the engine, Biber and BibTeX, the index and
// glossary programs, and whatever they start in turn) runs under sandbox-exec with the profile written here. A
// document is a program, and one from someone else must not be able to write the user's files, run their programs or
// send anything out. Trust this project (trustService.js) lifts it for a project that is the user's own.
// Windows has no such wrapper yet: there a compile runs as before, with TeX's restricted shell escape.
import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { execFile } from 'child_process';
import { DATA_DIR } from '../config/constants.js';
import { resolveExecutable } from './agentSandbox.js';

export const SANDBOX_EXEC = '/usr/bin/sandbox-exec';
const q = (value) => JSON.stringify(value);
const quoted = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const run = (file, args, options) => new Promise((resolve) => execFile(file, args, { timeout: 20_000, ...options }, (error, stdout, stderr) => resolve({ error, stdout: String(stdout), stderr: String(stderr) })));
const real = (p) => fs.realpath(p).catch(() => p);

/**
 * What a confined compile may write besides its build folder, kept apart from what an unconfined compile reads as
 * code: a TEXMFVAR of its own for LuaTeX's font caches (luaotfload's and LuaTeX-ja's, which are Lua) and the fonts
 * mktexpk makes, and the folder Biber unpacks itself into.
 * ponytail: one cache for every project, so a confined compile can leave Lua for another project's confined compile
 * (still confined); a cache for each project if that ever matters, at a font database's build for each
 */
export const confinedCache = (...parts) => path.join(DATA_DIR, 'compile-cache', ...parts);

let able;
/**
 * Whether this process can confine what it starts: 'yes' on a Mac; 'inside' in an agent's isolation (its tools
 * server's compiles), where sandbox-exec is refused and the agent's own limits hold; 'no' on a Mac whose sandbox-exec
 * doesn't run, which a compile then says; false anywhere else.
 */
export function confinement() {
  if (process.platform !== 'darwin') return Promise.resolve(false);
  able ??= run(SANDBOX_EXEC, ['-p', '(version 1)(allow default)', '/usr/bin/true']).then(({ error, stderr }) => (!error ? 'yes' : /sandbox_apply/.test(stderr) ? 'inside' : 'no'));
  return able;
}

// the small tools TeX's own shell scripts call (mktexpk, mktextfm, latexmk through sh), and the system's Perl and
// Python, which most of TeX's scripts are written in; /usr/bin/python3 hands over to the developer tools' own
const SYSTEM_TOOLS = String.raw`^/(bin/(sh|bash|dash|zsh|cat|cp|mv|rm|mkdir|rmdir|ln|ls|echo|test|\[|expr|pwd|chmod|date|sleep)|usr/bin/(env|perl[0-9.]*|python3|sed|awk|basename|dirname|uname|tr|grep|egrep|fgrep|head|tail|sort|uniq|wc|cut|touch|find|which|id|true|false|printf|tee|mktemp|cmp|diff|file|xcrun|xcode-select|locale|getconf)|(Applications/Xcode[^/]*\.app/Contents/Developer|Library/Developer/CommandLineTools)/(usr/bin/python3[0-9.]*|Library/Frameworks/Python3\.framework/.*))$`;
const TEX_PROGRAMS = ['pdflatex', 'xelatex', 'lualatex', 'latexmk', 'tectonic', 'kpsewhich', 'bibtex', 'biber', 'makeindex', 'makeglossaries', 'xindy', 'latexminted'];
// the interpreters `#!/usr/bin/env …` finds first on the compile's PATH, and Ghostscript, which repstopdf turns an
// .eps figure into a PDF with
const INTERPRETERS = ['perl', 'python3', 'gs'];
// never a whole system folder or the home folder as one program's installation
const TOO_WIDE = new Set(['/', '/usr', '/usr/local', '/opt', '/opt/homebrew', '/opt/local', '/Library', '/Applications', os.homedir(), path.dirname(os.homedir())]);

const programs = new Map();
/**
 * The TeX installation on this PATH: { filters, texmfVar }. filters: what a compile may run, as the profile's filters:
 * each TeX program's own installation (the folder above its bin, where its scripts are too), the folder kpsewhich
 * gives for TeX's scripts when they live elsewhere (MacPorts), and the interpreters, each by its own file. texmfVar:
 * the user's own TEXMFVAR, '' without kpsewhich (Tectonic alone).
 */
function installation(searchPath) {
  if (!programs.has(searchPath)) {
    programs.set(searchPath, (async () => {
      const found = async (name) => resolveExecutable(name, searchPath).catch(() => null);
      const filters = new Set();
      for (const name of TEX_PROGRAMS) {
        const file = await found(name);
        if (!file) continue;
        // /usr/local/texlive/2026/bin/universal-darwin/pdftex and …/2026/texmf-dist/scripts/latexmk/latexmk.pl
        const root = file.match(/^(.+?)\/(bin|texmf[^/]*)\//)?.[1];
        filters.add(root && !TOO_WIDE.has(root) ? `(subpath ${q(root)})` : `(literal ${q(file)})`);
      }
      const kpsewhich = await found('kpsewhich');
      // one at a time: kpsewhich answers only the last -var-value
      const value = async (name) => (kpsewhich ? (await run(kpsewhich, [`-var-value=${name}`])).stdout.trim() : '');
      const [dist, texmfVar] = [await value('TEXMFDIST'), await value('TEXMFVAR')];
      if (path.isAbsolute(dist) && !TOO_WIDE.has(await real(dist))) filters.add(`(subpath ${q(await real(dist))})`);
      for (const name of INTERPRETERS) {
        const file = await found(name);
        if (!file) continue;
        // a framework's python3 starts the Python inside its own Python.app
        const framework = file.match(/^(.+\/Python3?\.framework)\//)?.[1];
        filters.add(framework ? `(subpath ${q(framework)})` : `(literal ${q(file)})`);
      }
      return { filters: [...filters], texmfVar: path.isAbsolute(texmfVar) ? texmfVar : '' };
    })());
  }
  return programs.get(searchPath);
}

// What a compile never reads, though it reads the rest of the disk as TeX always has (fonts, packages and the
// user's own files can be anywhere): Spectrum's data folder but for its caches and engines, the usual stores of keys
// and sign-ins, and key files by name anywhere in the home folder (as the GitHub backup leaves them out).
// ponytail: a list, so a secret kept somewhere else in the home folder is still read; with no network and no writes
// it could only reach the PDF. Reads limited to the project and TeX would close that, and break documents that read
// a bibliography or figures kept elsewhere
const HOME_STORES = ['.ssh', '.gnupg', '.aws', '.azure', '.kube', '.docker', '.config/gh', '.config/gcloud', '.claude', '.codex', '.agents', '.netrc', '.npmrc', '.pypirc', '.git-credentials', '.claude.json', 'Library/Keychains', 'Library/Cookies'];
const KEY_FILES = String.raw`/(\.env(\.[^/]*)?|id_(rsa|dsa|ecdsa|ed25519)[^/]*|[^/]+\.(pem|key|p12|pfx|keystore|jks|ppk|kdbx))$`;

/**
 * A compile's confinement, or null where there is none (not a Mac, or inside an agent's isolation already):
 * { profile, env }. It reads what the user can but the stores above; writes only the build folder, the temp folder,
 * the confined cache's font folders and, in the project (root), the PDF repstopdf makes of an .eps figure beside it
 * (ponytail: by its name, -eps-converted-to.pdf, so a document can make files of that name there); reaches no
 * network; and runs
 * only TeX's own programs and `runs` (programs by their full path: the built-in Tectonic, Spectrum's Biber). tectonic:
 * Tectonic's own profile, which also writes its cache and downloads its packages over HTTPS. root is read even when
 * it is inside the data folder. env: what the programs are told so their temp and cache files go where they can write.
 */
export async function compileSandbox({ build, tmp, searchPath = process.env.PATH || '', tectonic = false, root, runs = [] }) {
  if ((await confinement()) !== 'yes') return null;
  const home = await real(os.homedir());
  const data = await real(DATA_DIR);
  const cache = confinedCache();
  // only its caches and fonts: a .sty or a format written into this TEXMFVAR would be found by the next compile
  const caches = ['par', 'texmf-var/cache', 'texmf-var/luatexja', 'texmf-var/fonts'].map((made) => path.join(cache, made));
  for (const made of caches) await fs.mkdir(made, { recursive: true });
  const { filters, texmfVar } = await installation(searchPath);
  const writable = await Promise.all([build, tmp, ...caches].map(real));
  if (tectonic) {
    const bundles = path.join(home, 'Library', 'Caches', 'Tectonic');
    await fs.mkdir(bundles, { recursive: true }).catch(() => {});
    writable.push(bundles);
  }
  const subpaths = (list) => list.map((p) => `(subpath ${q(p)})`).join(' ');
  const own = await Promise.all(runs.filter((file) => file && path.isAbsolute(file)).map(real));
  // Biber starts the copy of itself it unpacked into the cache
  const may = [...filters, ...own.map((p) => `(literal ${q(p)})`), `(subpath ${q(await real(caches[0]))})`];
  const made = root ? [String.raw`^${quoted(await real(root))}/(.*/)?[^/]+-eps-converted-to\.pdf$`] : [];
  const profile = `(version 1)
(deny default)
(allow process-fork sysctl-read file-map-executable)
(allow process-info* (target same-sandbox))
(allow signal (target same-sandbox))
(allow process-exec (regex ${q(SYSTEM_TOOLS)}) ${may.join(' ')})
(allow file-read*)
(deny file-read* (subpath ${q(data)}))
(allow file-read* ${subpaths([path.join(data, 'cache'), path.join(data, 'engines'), await real(cache), ...(root ? [await real(root)] : [])])})
(deny file-read* ${subpaths(HOME_STORES.map((store) => path.join(home, store)))} (regex ${q(`^${quoted(home)}/.*${KEY_FILES}`)}))
(allow file-read-metadata)
(allow file-write* ${subpaths(writable)} ${made.map((re) => `(regex ${q(re)})`).join(' ')})
(allow file-write-data file-ioctl (literal "/dev/null") (literal "/dev/zero") (literal "/dev/tty") (literal "/dev/dtracehelper") (subpath "/dev/fd"))
(allow mach-lookup
  (global-name "com.apple.system.opendirectoryd.libinfo")
  (global-name "com.apple.system.opendirectoryd.membership")
  (global-name "com.apple.bsd.dirhelper")
  (global-name "com.apple.system.logger")
  (global-name "com.apple.system.notification_center")
  (global-name "com.apple.logd"))
(allow ipc-posix-shm-read-data (ipc-posix-name "apple.shm.notification_center"))
${tectonic ? `(allow mach-lookup
  (global-name "com.apple.networkd")
  (global-name "com.apple.trustd.agent")
  (global-name "com.apple.TrustEvaluationAgent")
  (global-name "com.apple.SystemConfiguration.DNSConfiguration")
  (global-name "com.apple.SystemConfiguration.configd"))
(allow system-socket (require-all (socket-domain AF_SYSTEM) (socket-protocol 2)))
(allow network-outbound (require-all (remote tcp "*:443") (require-not (remote ip "localhost:*"))))
(allow network-outbound (remote udp "*:53") (literal "/private/var/run/mDNSResponder"))` : ''}
`;
  return {
    profile,
    env: {
      TMPDIR: await real(tmp),
      // LuaTeX only writes below TEXMFVAR, whatever the sandbox allows: the confined one, with the user's own still
      // searched (an updmap-user's fonts) and its font caches still read. luaotfload writes in the first folder of
      // TEXMFCACHE it can, which it tests by making a file there
      ...(texmfVar && {
        TEXMFVAR: path.join(cache, 'texmf-var'),
        TEXMFAUXTREES: `${process.env.TEXMFAUXTREES || ''}${texmfVar},`,
        TEXMFCACHE: [caches[1], '$TEXMFSYSVAR', texmfVar].join(path.delimiter)
      }),
      PAR_GLOBAL_TMPDIR: caches[0]
    }
  };
}
