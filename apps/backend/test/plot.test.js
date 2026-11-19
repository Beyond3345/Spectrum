// A chart's code runs in the agents' isolation: its own folder, no network, nothing of the user's, a time limit.
// Needs a Python with matplotlib (SPECTRUM_PYTHON, CONDA_PREFIX or python3); skipped without one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { promises as fs, mkdtempSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'spectrum-plot-test-')));
process.env.SPECTRUM_DATA_DIR = path.join(tmp, 'data');
const { resolvePythonExecutable, runPlot } = await import('../src/services/plotService.js');
const python = resolvePythonExecutable();
const skip = !['darwin', 'win32'].includes(process.platform) ? 'macOS and Windows only'
  : spawnSync(python, ['-c', 'import matplotlib'], { windowsHide: true }).status !== 0 && 'no Python with matplotlib';

const table = '\\begin{tabular}{lr}\nMethod & Score \\\\\nA & 3 \\\\\nB & 5 \\\\\n\\end{tabular}';
const run = (plotCode, extra = {}) => runPlot({ tableLatex: table, title: 'Scores', plotCode, ...extra });

test('a chart’s code draws the table, and comes back as the image asked for', { skip }, async () => {
  const png = await run("plt.bar([r[0] for r in rows], [float(r[1]) for r in rows])");
  assert.ok(png.ok, png.error);
  assert.deepEqual([...png.bytes.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  const pdf = await run("plt.plot(header)", { format: 'pdf' });
  assert.ok(pdf.ok, pdf.error);
  assert.equal(pdf.bytes.subarray(0, 5).toString(), '%PDF-');
});

test('a chart’s code can’t write or read outside its folder, or reach the network', { skip }, async () => {
  const outside = path.join(tmp, 'outside.txt');
  const secret = path.join(tmp, 'secret.txt');
  await fs.writeFile(secret, 'private');
  const write = await run(`open(${JSON.stringify(outside)}, 'w').write('ran')\nplt.bar([1], [1])`);
  assert.equal(write.ok, false);
  assert.match(write.error, /^Line 1: PermissionError.*without access to your files/);
  await assert.rejects(fs.stat(outside), { code: 'ENOENT' });
  assert.equal((await run(`print(open(${JSON.stringify(secret)}).read())`)).ok, false);
  // a listener on this computer that it can't reach either
  const server = createServer((socket) => socket.end()).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const net = await run(`import socket\nsocket.create_connection(('127.0.0.1', ${server.address().port}), timeout=5)`);
    assert.equal(net.ok, false);
    assert.match(net.error, /PermissionError|Operation not permitted|forbidden|refused/i);
  } finally { server.close(); }
});

test('a chart’s errors say where and what, and a run that goes on too long is stopped', { skip }, async () => {
  assert.match((await run('x = 1\nplt.bar(nope, [1])')).error, /^Line 2: NameError: name 'nope' is not defined\. Edit the code/);
  assert.match((await run('plt.bar([1,2],\n[3,4]')).error, /^Line 1: SyntaxError/);
  assert.match((await run('plt.bar([1], [1])', { tableLatex: 'nothing here' })).error, /table couldn’t be read/);
  assert.match((await run('while True: pass', { limit: 3 })).error, /more than 3 seconds/);
  assert.match((await run('import os\nos._exit(0)')).error, /made no chart/);
  assert.match((await run('plt.bar([1], [1])', { format: 'exe' })).error, /PNG, PDF, SVG or JPEG/);
});

test.after(() => fs.rm(tmp, { recursive: true, force: true }));
