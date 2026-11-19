// What confines a LaTeX compile on a Mac (compileSandbox.js), Trust this project (trustService.js) and what the log
// says when something was stopped. Shell scripts stand in for the engines, so no TeX is needed, and the only network
// is a listener of the test's own on this computer. Run: node --test apps/backend/test/compile-sandbox.test.js
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

const MAC = process.platform === 'darwin';
const skip = MAC ? false : 'compiles are confined on macOS only';
const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-sandbox-')));
const realPath = process.env.PATH;
const home = path.join(tmp, 'home');
Object.assign(process.env, {
  HOME: home,
  SPECTRUM_DATA_DIR: path.join(tmp, 'data'),
  SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects'),
  SPECTRUM_TEMPLATE_DIR: path.join(tmp, 'templates'),
  SPECTRUM_TEMPLATE_SEED_DIR: '',
  OUTSIDE_FILE: path.join(tmp, 'outside', 'written.txt')
});
const write = async (file, text = 'x') => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text);
  return file;
};
await fs.mkdir(path.join(tmp, 'outside'), { recursive: true });
await fs.mkdir(home, { recursive: true });

const { DATA_DIR } = await import('../src/config/constants.js');
const { createProject } = await import('../src/services/projectService.js');
const { runCompile, runSpawn } = await import('../src/services/compileService.js');
const { blockedNotes, compileSandbox, confinement } = await import('../src/services/compileSandbox.js');
const { isTrusted, setTrusted } = await import('../src/services/trustService.js');
const { registerCompileRoutes } = await import('../src/routes/compile.js');
const { default: Fastify } = await import('fastify');

const app = Fastify();
registerCompileRoutes(app);
// a client that hangs up first (a confined program cut off part way) resets the socket: that is not this test's error
const listener = createServer((socket) => { socket.on('error', () => {}); socket.end('hello'); });
await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
after(async () => {
  await app.close();
  listener.close();
  process.env.PATH = realPath;
  rmSync(tmp, { recursive: true, force: true });
});

/** A shell script run in a compile's confinement: { code, output }. */
async function confined(script, { root, tectonic = false } = {}) {
  const build = path.join(tmp, 'build');
  await fs.mkdir(path.join(tmp, 'build-tmp'), { recursive: true });
  await fs.mkdir(build, { recursive: true });
  const box = await compileSandbox({ build, tmp: path.join(tmp, 'build-tmp'), root, tectonic });
  let output = '';
  const { code } = await runSpawn('/bin/sh', ['-c', script], build, (chunk) => (output += chunk), { ...process.env, ...box.env, BUILD: build }, 20_000, null, box.profile);
  return { code, output, build };
}

test('this Mac can confine a compile', { skip }, async () => {
  assert.equal(await confinement(), 'yes');
});

test('a confined program writes its build folder, its temp folder and nothing else', { skip }, async () => {
  const root = path.join(tmp, 'project-writes');
  await write(path.join(root, 'main.tex'));
  const { output, build } = await confined([
    'echo a > "$BUILD/made.txt"',
    'echo b > "$TMPDIR/temp.txt"',
    'echo c > "$OUTSIDE_FILE"',
    `echo d > "${root}/main.tex"`,
    `echo e > "${root}/new.sty"`,
    `echo f > "${root}/plot-eps-converted-to.pdf"`,
    `echo g > "${home}/.zshrc"`,
    'echo done'
  ].join('\n'), { root });
  assert.match(output, /done/);
  assert.equal(await fs.readFile(path.join(build, 'made.txt'), 'utf8'), 'a\n');
  assert.ok(existsSync(path.join(tmp, 'build-tmp', 'temp.txt')), 'TMPDIR is the temp folder');
  assert.equal(existsSync(process.env.OUTSIDE_FILE), false, 'nothing outside');
  assert.equal(await fs.readFile(path.join(root, 'main.tex'), 'utf8'), 'x', 'the project’s own files stay as they were');
  assert.equal(existsSync(path.join(root, 'new.sty')), false);
  assert.ok(existsSync(path.join(root, 'plot-eps-converted-to.pdf')), 'the PDF made of an .eps figure, beside it');
  assert.equal(existsSync(path.join(home, '.zshrc')), false);
  assert.match(output, /Operation not permitted/);
});

test('a confined program reads the project and the user’s files, but not Spectrum’s data or the usual key stores', { skip }, async () => {
  const root = path.join(DATA_DIR, 'old-project');
  const readable = [
    await write(path.join(root, 'main.tex'), 'in a project kept in the data folder'),
    await write(path.join(DATA_DIR, 'cache', 'abc', 'main.aux'), 'kept aux'),
    await write(path.join(home, 'Documents', 'library.bib'), 'a bibliography kept elsewhere')
  ];
  const hidden = [
    await write(path.join(DATA_DIR, 'github.json'), 'DATA-STORE'),
    await write(path.join(home, '.ssh', 'config'), 'SSH-STORE'),
    await write(path.join(home, 'Documents', 'server.pem'), 'PEM-FILE'),
    await write(path.join(home, 'work', '.env'), 'ENV-FILE'),
    await write(path.join(home, '.netrc'), 'NETRC-FILE')
  ];
  const { output } = await confined([...readable, ...hidden].map((file) => `cat "${file}"; echo`).join('\n'), { root });
  for (const text of ['in a project kept in the data folder', 'kept aux', 'a bibliography kept elsewhere']) assert.ok(output.includes(text), text);
  for (const text of ['DATA-STORE', 'SSH-STORE', 'PEM-FILE', 'ENV-FILE', 'NETRC-FILE']) assert.equal(output.includes(text), false, text);
});

test('a confined program runs TeX’s helpers and nothing else, and reaches no network', { skip }, async () => {
  const { port } = listener.address();
  const connect = `/usr/bin/perl -MIO::Socket::INET -e 'print IO::Socket::INET->new(PeerAddr => "127.0.0.1:${port}") ? "CONNECTED" : "REFUSED"'`;
  const script = ['/usr/bin/basename /a/allowed.txt', '/usr/bin/whoami && echo RAN-WHOAMI', '/usr/bin/osascript -e "return 1" && echo RAN-OSASCRIPT', connect].join('\n');
  // the check itself: outside the sandbox the listener answers
  let open = '';
  await runSpawn('/bin/sh', ['-c', connect], tmp, (chunk) => (open += chunk), process.env, 20_000);
  assert.match(open, /CONNECTED/);
  for (const tectonic of [false, true]) {
    const { output } = await confined(script, { tectonic });
    assert.match(output, /allowed\.txt/);
    assert.doesNotMatch(output, /RAN-WHOAMI|RAN-OSASCRIPT/);
    // Tectonic's profile reaches HTTPS hosts for its packages, never this computer's own ports
    assert.match(output, /REFUSED/);
    assert.doesNotMatch(output, /CONNECTED/);
  }
});

test('a program that isn’t installed is still reported as missing', { skip }, async () => {
  const box = await compileSandbox({ build: tmp, tmp });
  await assert.rejects(runSpawn('no-such-engine', [], tmp, () => {}, process.env, 5000, null, box.profile), { code: 'ENOENT' });
});

// a shell script as pdflatex: it prints its arguments, tries to write outside its build folder, and makes the PDF and log
const ENGINE = [
  '#!/bin/sh',
  'for a in "$@"; do case "$a" in -output-directory=*) out="${a#-output-directory=}";; esac; done',
  'echo "ARGS $*"',
  'echo x > "$OUTSIDE_FILE"',
  'echo "This is fake TeX" > "$out/main.log"',
  "printf '%%PDF-1.4\\n%%%%EOF\\n' > \"$out/main.pdf\"",
  ''
].join('\n');
const project = async (name) => {
  const bin = path.join(tmp, 'bin');
  await fs.mkdir(bin, { recursive: true });
  await fs.writeFile(path.join(bin, 'pdflatex'), ENGINE, { mode: 0o755 });
  process.env.PATH = [bin, '/usr/bin', '/bin'].join(path.delimiter);
  return createProject({ name, populate: (root) => fs.writeFile(path.join(root, 'main.tex'), '\\documentclass{article}\\begin{document}x\\end{document}\n') });
};
const compile = async (p, more = {}) => (await app.inject({ method: 'POST', url: '/api/compile', payload: { projectId: p.id, mainFile: 'main.tex', engine: 'pdflatex', ...more } })).json();
const trust = async (p, trusted) => (await app.inject({ method: 'PUT', url: `/api/projects/${p.id}/trust`, payload: { trusted } })).json();

test('a compile is confined and has restricted shell escape until its project is trusted, and its log says what was stopped', { skip }, async () => {
  const p = await project('Trust');
  await fs.rm(process.env.OUTSIDE_FILE, { force: true });
  const first = await compile(p);
  assert.ok(first.ok, first.error || first.log);
  assert.match(first.log, /ARGS .*-shell-restricted/);
  assert.equal(existsSync(process.env.OUTSIDE_FILE), false, 'confined');
  assert.match(first.log, /\[spectrum warning\] Spectrum’s sandbox stopped this compile from using “.*written\.txt”.*“Trust this project” in the Compile menu/);

  // only the switch trusts a project: a request that says so is not believed
  const claimed = await compile(p, { trusted: true });
  assert.match(claimed.log, /-shell-restricted/);
  assert.equal(existsSync(process.env.OUTSIDE_FILE), false);
  assert.equal((await app.inject({ method: 'PUT', url: `/api/projects/${p.id}/trust`, payload: { trusted: 'yes' } })).statusCode, 400);

  assert.deepEqual(await trust(p, true), { ok: true, trusted: true });
  assert.deepEqual((await app.inject({ url: `/api/projects/${p.id}/trust` })).json(), { ok: true, trusted: true, confined: true });
  const trusted = await compile(p);
  assert.match(trusted.log, /ARGS .*-shell-escape/);
  assert.doesNotMatch(trusted.log, /-shell-restricted|\[spectrum/);
  assert.ok(existsSync(process.env.OUTSIDE_FILE), 'a trusted project compiles unconfined');

  await fs.rm(process.env.OUTSIDE_FILE, { force: true });
  assert.deepEqual(await trust(p, false), { ok: true, trusted: false });
  await compile(p);
  assert.equal(existsSync(process.env.OUTSIDE_FILE), false, 'confined again');
});

test('trust is kept in the data folder, and a copied, moved or replaced folder doesn’t inherit it', async () => {
  const p = await createProject({ name: 'Mine', populate: (root) => fs.writeFile(path.join(root, 'main.tex'), 'x') });
  const before = await fs.readdir(path.join(p.path, '.spectrum'));
  assert.equal(await isTrusted(p.id, p.path), false, 'off by default');
  assert.equal(await setTrusted(p.id, p.path, true), true);
  assert.equal(await isTrusted(p.id, p.path), true);
  assert.deepEqual(await fs.readdir(path.join(p.path, '.spectrum')), before, 'nothing in the project records it');
  assert.ok(existsSync(path.join(DATA_DIR, 'trusted-projects.json')));

  // a copy, even one that still carries the project's id
  const copy = `${p.path} copy`;
  await fs.cp(p.path, copy, { recursive: true });
  assert.equal(await isTrusted(p.id, copy), false);
  // the folder moved or renamed
  const moved = `${p.path} moved`;
  await fs.rename(p.path, moved);
  assert.equal(await isTrusted(p.id, moved), false);
  // another folder put where the trusted one was, with the same id in it
  await fs.rename(copy, p.path);
  assert.equal(await isTrusted(p.id, p.path), false);
  // and back in its place it is the trusted folder again, until the switch is turned off
  await fs.rename(p.path, copy);
  await fs.rename(moved, p.path);
  assert.equal(await isTrusted(p.id, p.path), true);
  assert.equal(await setTrusted(p.id, p.path, false), false);
  assert.equal(await isTrusted(p.id, p.path), false);
});

test('the log’s note names what was stopped and where the switch is, and says nothing when nothing was', () => {
  assert.equal(blockedNotes('Output written on main.pdf (1 page).', 'runsystem(kpsewhich x)...executed.', { confined: true, failed: false }), '');
  // the same words from a compile that wasn’t confined are not the sandbox’s
  assert.equal(blockedNotes('touch: /a/b.txt: Operation not permitted', '', { confined: false, failed: true }), '');

  const lua = blockedNotes("[\\directlua]:1: cannot open file '/Users/me/notes.txt' (Operation not permitted)\nsh: /usr/bin/whoami: Operation not permitted", '', { confined: true, failed: true });
  assert.match(lua, /^\n\[spectrum\] Spectrum’s sandbox stopped this compile from using “\/Users\/me\/notes\.txt”, “\/usr\/bin\/whoami”\./);
  assert.match(lua, /turn on “Trust this project” in the Compile menu and compile again\.\n$/);

  const net = blockedNotes("ERROR - Could not fetch 'http://example.org/refs.bib' (HTTP error: 500 Can't connect to example.org:80 (Operation not permitted))", '', { confined: true, failed: true });
  assert.match(net, /stopped this compile from using the network\./);

  const shell = blockedNotes('! LaTeX Error: File `today.txt\' not found.', 'runsystem(date > today.txt)...disabled (restricted).\n', { confined: true, failed: true });
  assert.match(shell, /\[spectrum\] This document needs full shell escape to run “date > today\.txt”\..*Trust this project/);
  assert.match(blockedNotes('! Package minted Error: You must invoke LaTeX with the -shell-escape flag.', '', { confined: false, failed: true }), /needs full shell escape\./);

  const out = blockedNotes('pdflatex: Not writing to /Users/me/out.txt (openout_any = p; no extended check).', '', { confined: true, failed: false });
  assert.match(out, /^\n\[spectrum warning\] TeX didn’t write “\/Users\/me\/out\.txt”/);
});
