// Rebuild the checked-in runtime from the pinned upstream checkout; normal app builds use the checked-in files.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const revision = '316f9c00814da019ec24d3b06e9866f3be94258d';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.argv[2]) throw new Error('Usage: node scripts/build-pylatexenc.mjs /path/to/pylatexenc-checkout');
const source = path.resolve(process.argv[2]);
if (execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== revision) throw new Error(`Use upstream commit ${revision}`);
execFileSync('git', ['-C', source, 'diff', 'HEAD', '--exit-code', '--', 'pylatexenc', 'js-transcrypt', 'tools', 'uv.lock', 'pyproject.toml'], { stdio: 'inherit' });
execFileSync('uv', ['run', '--frozen', '--group', 'buildjslib', 'python', 'generate_pylatexenc_js.py', '--delete-target-dir'], { cwd: path.join(source, 'js-transcrypt'), stdio: 'inherit' });

const generated = path.join(source, 'js-transcrypt/pylatexenc-js');
const parent = path.join(root, 'apps/backend/src/latex');
const stage = await fs.mkdtemp(path.join(parent, '.pylatexenc-'));
try {
  await fs.chmod(stage, 0o755);
  for (const name of (await fs.readdir(generated)).filter((name) => name.endsWith('.js')).sort()) {
    let code = (await fs.readFile(path.join(generated, name), 'utf8'))
      .replace(/^\/\* \d{6} \*\/ ?/gm, '')
      .replace(/^\/\/ Transcrypt'ed from Python, .*\r?\n/m, '')
      .replace(/^\/\/# sourceMappingURL=.*$/gm, '');
    if (name === 'logging.js') code = code.replace("from 'debug'", "from './debug.js'");
    await fs.writeFile(path.join(stage, name), code);
  }
  // Bundle only debug: the tested parser modules fail when flattened by the app bundler.
  const debug = await esbuild.build({ stdin: { contents: "export { default } from 'debug';", resolveDir: root },
    bundle: true, write: false, platform: 'browser', format: 'esm', target: 'es2020', minify: true, legalComments: 'inline', define: { localStorage: 'undefined' } });
  await fs.writeFile(path.join(stage, 'debug.js'), debug.outputFiles[0].contents);
  await fs.copyFile(path.join(root, 'scripts/pylatexenc-entry.mjs'), path.join(stage, 'index.mjs'));
  await fs.writeFile(path.join(stage, 'package.json'), JSON.stringify({ name: 'spectrum-pylatexenc', version: '3.0.0-beta.2', private: true, type: 'module', license: 'MIT AND Apache-2.0 AND W3C', upstreamRevision: revision }, null, 2) + '\n');
  const licences = path.join(stage, 'licences');
  await fs.mkdir(licences);
  await fs.copyFile(path.join(source, 'LICENSE.txt'), path.join(licences, 'pylatexenc-MIT.txt'));
  await fs.copyFile(path.join(source, 'tools/unicode.xml.LICENSE'), path.join(licences, 'unicode-XML.txt'));
  const python = process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python';
  const transcrypt = execFileSync(path.join(source, python), ['-c', 'from importlib.metadata import distribution; print(distribution("Transcrypt").locate_file("transcrypt-3.9.3.dist-info/LICENSE"))'], { encoding: 'utf8' }).trim();
  await fs.copyFile(transcrypt, path.join(licences, 'Transcrypt-Apache-2.0.txt'));
  for (const name of ['debug', 'ms']) {
    const folder = path.dirname(fileURLToPath(import.meta.resolve(`${name}/package.json`)));
    await fs.copyFile(path.join(folder, name === 'ms' ? 'license.md' : 'LICENSE'), path.join(licences, `${name}-MIT.txt`));
  }
  await fs.writeFile(path.join(stage, 'README.md'), `# Generated pylatexenc runtime\n\nUpstream: https://github.com/phfaist/pylatexenc/tree/${revision}\n\nGenerated from pylatexenc 3.0b2 with its pinned Transcrypt 3.9.3 build. The modules stay separate because ordinary bundling breaks their circular imports. Adapted for Spectrum on 20 October 2026. Source-line annotations, generation timestamps and unused source-map links are removed; logging imports a bundled browser build of debug 4.4.3 without browser storage. Spectrum's entry point supplies the documented default contexts, plain text styles, TeX logos and link labels.\n\nRebuild with node scripts/build-pylatexenc.mjs /path/to/the/pinned/checkout. Build dependencies need uv and Python 3.10 or later. End users and ordinary app builds do not need Python. Do not edit the generated modules; edit the entry point or update the pinned upstream revision and run its tests.\n\nThe runtime is isolated in a worker because Transcrypt extends JavaScript built-in prototypes. Conversion does not enable file input. Licences are in licences/.\n`);
  const target = path.join(parent, 'pylatexenc');
  await fs.rm(target, { recursive: true, force: true });
  await fs.rename(stage, target);
  console.log(`Generated pylatexenc runtime at ${path.relative(root, target)}`);
} finally {
  await fs.rm(stage, { recursive: true, force: true });
}
