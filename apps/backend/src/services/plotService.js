import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import { DATA_DIR } from '../config/constants.js';
import { isolationAvailable, killAgentProcess, resolveExecutable, spawnAgentProcess } from './agentSandbox.js';

const execFileAsync = promisify(execFile);

export function resolvePythonExecutable() {
  if (process.env.SPECTRUM_PYTHON) return process.env.SPECTRUM_PYTHON;
  // Windows keeps python.exe at the environment's top, and has no python3 command
  // ponytail: Python installed without "Add to PATH" only has the py launcher; try py too if that bites
  if (process.platform === 'win32') return process.env.CONDA_PREFIX ? path.join(process.env.CONDA_PREFIX, 'python.exe') : 'python';
  if (process.env.CONDA_PREFIX) return `${process.env.CONDA_PREFIX}/bin/python`;
  return 'python3';
}

/** The chart's time limit, and the largest file its script may write or Spectrum takes back. */
const TIME_LIMIT_S = 120;
const MAX_FILE = 50 * 1024 * 1024;
export const PLOT_FORMATS = { png: (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])), pdf: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-', svg: (b) => /<svg[\s>]/.test(b.subarray(0, 4096).toString('utf8')), jpg: (b) => b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) };
PLOT_FORMATS.jpeg = PLOT_FORMATS.jpg;

const runtimes = new Map();
/**
 * The folders the Python needs to read (its install, its packages, the user's site-packages), asked of it once with a
 * fixed script: never a home folder, a drive or the file system's root, which isolation refuses.
 */
async function pythonRuntime(python) {
  if (runtimes.has(python)) return runtimes.get(python);
  const executable = await resolveExecutable(python);
  const query = 'import sys, site, json; print(json.dumps({"paths": [sys.prefix, sys.base_prefix, sys.exec_prefix, site.getusersitepackages()] + [p for p in sys.path if p], "userbase": site.getuserbase()}))';
  const { stdout } = await execFileAsync(executable, ['-c', query], { timeout: 20_000, windowsHide: true, env: { PATH: process.env.PATH || '', HOME: os.homedir(), USERPROFILE: os.homedir(), SystemRoot: process.env.SystemRoot || '', ...(process.env.PYTHONPATH && { PYTHONPATH: process.env.PYTHONPATH }) } });
  const { paths, userbase } = JSON.parse(stdout);
  const home = os.homedir();
  const holds = (outer, inner) => inner === outer || inner.startsWith(outer.endsWith(path.sep) ? outer : outer + path.sep);
  const found = [];
  for (const p of paths) {
    if (!path.isAbsolute(p)) continue;
    const real = await fs.realpath(p).catch(() => null);
    if (!real || real === path.parse(real).root || holds(real, home)) continue;
    found.push(real);
  }
  // the outermost of each, so a folder isn't granted twice (Windows grants each file in it)
  const reads = [...new Set(found)].filter((p, _, all) => !all.some((q) => q !== p && holds(q, p)));
  const runtime = { executable, reads, userbase };
  runtimes.set(python, runtime);
  return runtime;
}

/** A user's words for the script's own report of what stopped it (SPECTRUM_ERROR, from the trusted part). */
function plotError(output, code, signal, python) {
  const report = output.match(/^SPECTRUM_ERROR (.*)$/m);
  let error = null;
  try { error = report && JSON.parse(report[1]); } catch { /* reported badly: the output says the rest */ }
  const at = error?.line ? `Line ${error.line}: ` : '';
  if (error?.kind === 'matplotlib') return `The Python Spectrum uses (${python}) doesn’t have matplotlib. Install it with “${python} -m pip install matplotlib”, then run the code again.`;
  if (error?.kind === 'table') return `The selected table couldn’t be read (${error.message}). Select the whole tabular and write the code again.`;
  if (error?.kind === 'denied') return `${at}${error.message}. The code runs without access to your files or the network: it can use only the table it is given. Edit the code, or write it again.`;
  if (error?.kind === 'code') return `${at}${error.message}. Edit the code, or write it again with what went wrong.`;
  if (signal === 'SIGXFSZ') return `The code wrote a file larger than ${MAX_FILE / 1024 / 1024} MB, and was stopped.`;
  if (signal === 'SIGXCPU') return `The code ran for more than ${TIME_LIMIT_S / 60} minutes, and was stopped.`;
  const last = output.trim().split(/\r?\n/).slice(-3).join('\n');
  return `The code stopped without making a chart${code != null ? ` (exit ${code})` : ''}.${last ? `\n${last}` : ''}`;
}

/** The trusted part of a chart's run: reads the table, runs the chart's code on it, and saves the figure. */
const PLOT_SCRIPT = `
import json, os, sys, re, importlib.util, traceback

def stop(kind, message='', line=None):
    print('SPECTRUM_ERROR ' + json.dumps({'kind': kind, 'message': str(message)[:500], 'line': line}), file=sys.stderr)
    sys.exit(3)

# the files it writes, and the processor time it takes, end with it (macOS; Windows has no resource module)
try:
    import resource
    resource.setrlimit(resource.RLIMIT_FSIZE, (${MAX_FILE}, ${MAX_FILE}))
    resource.setrlimit(resource.RLIMIT_CPU, (${TIME_LIMIT_S}, ${TIME_LIMIT_S}))
except Exception:
    pass

try:
    import matplotlib
except ImportError:
    stop('matplotlib')
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HAS_PANDAS = importlib.util.find_spec("pandas") is not None
HAS_SEABORN = importlib.util.find_spec("seaborn") is not None
pd = None
sns = None
if HAS_PANDAS:
    import pandas as pd
if HAS_SEABORN:
    import seaborn as sns


def parse_table(latex):
    m = re.search(r'\\\\begin{tabular}.*?\\\\end{tabular}', latex, re.S)
    if m:
        latex = m.group(0)
    latex = re.sub(r'\\\\begin{tabular}{[^}]*}', '', latex)
    latex = re.sub(r'\\\\end{tabular}', '', latex)
    latex = re.sub(r'\\\\(toprule|midrule|bottomrule|hline)', '', latex)
    rows = [r.strip() for r in latex.split('\\\\\\\\') if r.strip()]
    data = []
    for row in rows:
        if row.strip().startswith('%'):
            continue
        # split on unescaped &
        raw_cells = [c.strip() for c in re.split(r'(?<!\\\\)&', row)]
        if len(raw_cells) == 1 and raw_cells[0] == '':
            continue
        expanded = []
        for cell in raw_cells:
            m = re.match(r'\\\\multicolumn\\{(\\d+)\\}\\{[^}]*\\}\\{(.+)\\}', cell)
            if m:
                span = int(m.group(1))
                content = m.group(2).strip()
                expanded.append(content)
                for _ in range(span - 1):
                    expanded.append('')
            else:
                m2 = re.match(r'\\\\multirow\\{[^}]*\\}\\{[^}]*\\}\\{(.+)\\}', cell)
                expanded.append(m2.group(1).strip() if m2 else cell)
        data.append(expanded)
    return data


def is_number(val):
    try:
        float(val)
        return True
    except Exception:
        return False


def pick_col(columns, spec, fallback_idx):
    if spec is not None:
        spec = str(spec).strip()
        if spec.isdigit():
            idx = int(spec) - 1
            if 0 <= idx < len(columns):
                return columns[idx]
        if spec in columns:
            return spec
    if 0 <= fallback_idx < len(columns):
        return columns[fallback_idx]
    return columns[0]


payload = json.load(open(sys.argv[1], 'r', encoding='utf-8'))
latex = payload.get('tableLatex', '')
chart_type = payload.get('chartType', 'bar')
title = payload.get('title', '')
output_path = payload.get('outputPath', '')
plot_code = payload.get('plotCode', '')

if not latex or not output_path:
    stop('table', 'Missing input or output path')

data = parse_table(latex)
if not data:
    stop('table', 'No table rows found')

max_cols = max(len(r) for r in data)
if all(not is_number(c) for c in data[0]):
    header = data[0]
    rows = data[1:]
else:
    header = [f'col{i+1}' for i in range(max_cols)]
    rows = data

if len(header) < max_cols:
    header = header + [f'col{i+1}' for i in range(len(header), max_cols)]
elif len(header) > max_cols:
    header = header[:max_cols]

if not rows:
    stop('table', 'No data rows under the header')

rows = [(r + [''] * (max_cols - len(r)))[:max_cols] for r in rows]

plt.figure(figsize=(6, 4))
df = None
df_numeric = None
if HAS_PANDAS:
    df = pd.DataFrame(rows, columns=header)
    df_numeric = df.apply(lambda col: pd.to_numeric(col, errors='coerce'))

if not plot_code:
    stop('code', 'There is no code to run')

try:
    exec(compile(plot_code, '<chart code>', 'exec'), {"df": df, "df_numeric": df_numeric, "rows": rows, "header": header, "sns": sns, "plt": plt})
except SystemExit:
    raise
except BaseException as e:
    line = e.lineno if isinstance(e, SyntaxError) and e.filename == '<chart code>' else next((f.lineno for f in reversed(traceback.extract_tb(e.__traceback__)) if f.filename == '<chart code>'), None)
    stop('denied' if isinstance(e, PermissionError) else 'code', '%s: %s' % (type(e).__name__, e.msg if isinstance(e, SyntaxError) else e), line)

if title:
    plt.title(title)
plt.tight_layout()
plt.savefig(output_path, dpi=150)
`;

/**
 * A run of the Python in the agents' isolation, with no network: work is all it can write besides its own home, it
 * reads only the system and the Python, and it is stopped after TIME_LIMIT_S. { code, signal, output, timedOut }.
 */
async function isolated(runtime, { args, work, home, limit = TIME_LIMIT_S }) {
  const child = await spawnAgentProcess({
    command: runtime.executable,
    args: ['-B', ...args],
    workspace: work,
    home,
    runtimePaths: runtime.reads,
    offline: true,
    // matplotlib's font list and settings in its own home
    env: {
      MPLCONFIGDIR: path.join(home, 'matplotlib'), MPLBACKEND: 'Agg', PYTHONDONTWRITEBYTECODE: '1', PYTHONIOENCODING: 'utf-8',
      ...(runtime.userbase && { PYTHONUSERBASE: runtime.userbase }),
      ...(process.env.PYTHONPATH && { PYTHONPATH: process.env.PYTHONPATH })
    }
  });
  let output = '', timedOut = false;
  // ponytail: only the output's last 8 KB is kept, the part that says what stopped it
  const keep = (chunk) => { output = (output + chunk).slice(-8192); };
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  const done = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })); });
  child.stdin.end();
  const timer = setTimeout(() => { timedOut = true; killAgentProcess(child); }, limit * 1000);
  try {
    return { ...(await done), output, timedOut };
  } finally {
    clearTimeout(timer);
    killAgentProcess(child);
  }
}

/**
 * matplotlib's font list for this Python, which takes it 15 s or more to build: built once by a fixed script (no
 * chart's code) in isolation, kept in Spectrum's data, and copied into each chart's home. Without it, a chart builds
 * its own.
 */
async function fontCache(runtime, tmp) {
  const dir = path.join(DATA_DIR, 'plot-fonts', crypto.createHash('sha256').update(runtime.executable).digest('hex').slice(0, 16));
  const lists = async () => (await fs.readdir(dir).catch(() => [])).filter((name) => /^fontlist.*\.json$/.test(name));
  if (!(await lists()).length) {
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    const home = path.join(tmp, 'fonts-home');
    await fs.mkdir(path.join(home, 'tmp'), { recursive: true, mode: 0o700 });
    const script = 'import os, shutil, matplotlib.font_manager as f; [shutil.copy(os.path.join(os.environ["MPLCONFIGDIR"], n), n) for n in os.listdir(os.environ["MPLCONFIGDIR"]) if n.startswith("fontlist")]';
    await fs.mkdir(path.join(home, 'matplotlib'), { recursive: true });
    await isolated(runtime, { args: ['-c', script], work: dir, home }).catch(() => {});
  }
  return (await lists()).map((name) => path.join(dir, name));
}

/**
 * Runs a chart's script (the model's, shown to the user and run when they said so) in isolation. The table goes in
 * as data; the chart comes back as { ok, bytes } for Spectrum to put in the project, or { ok: false, error } in words
 * the user can act on.
 */
export async function runPlot({ tableLatex, title, plotCode, format = 'png', limit = TIME_LIMIT_S }) {
  if (!PLOT_FORMATS[format]) return { ok: false, error: 'A chart can be saved as PNG, PDF, SVG or JPEG.' };
  if (!(await isolationAvailable())) return { ok: false, error: 'Charts run in Spectrum’s isolation, which isn’t available on this computer. On Windows, reinstall Spectrum to repair it.' };
  const python = resolvePythonExecutable();
  let runtime;
  try {
    runtime = await pythonRuntime(python);
  } catch {
    return { ok: false, error: `Spectrum couldn’t find Python 3 (${python}). Install Python 3 with matplotlib, then run the code again.` };
  }
  const tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-plot-')));
  const work = path.join(tmp, 'work');
  const home = path.join(tmp, 'home');
  try {
    for (const dir of [work, path.join(home, 'tmp'), path.join(home, 'matplotlib')]) await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    for (const file of await fontCache(runtime, tmp)) await fs.copyFile(file, path.join(home, 'matplotlib', path.basename(file)));
    const out = path.join(work, `chart.${format}`);
    await fs.writeFile(path.join(work, 'payload.json'), JSON.stringify({ tableLatex, title, outputPath: out, plotCode }), 'utf8');
    await fs.writeFile(path.join(work, 'plot.py'), PLOT_SCRIPT, 'utf8');
    const { code, signal, output, timedOut } = await isolated(runtime, { args: ['plot.py', 'payload.json'], work, home, limit });
    if (timedOut) return { ok: false, error: `The code ran for more than ${limit < 60 ? `${limit} seconds` : `${limit / 60} minutes`}, and was stopped.` };
    if (code !== 0) return { ok: false, error: plotError(output, code, signal, python) };
    // written in isolation: only a file of its own, never a link, of a size and kind a chart has
    const stat = await fs.lstat(out).catch(() => null);
    if (!stat?.isFile()) return { ok: false, error: 'The code ran but made no chart.' };
    if (stat.size > MAX_FILE) return { ok: false, error: `The chart is larger than ${MAX_FILE / 1024 / 1024} MB.` };
    const bytes = await fs.readFile(out);
    if (!PLOT_FORMATS[format](bytes)) return { ok: false, error: `The code made something that isn’t a ${format.toUpperCase()} image.` };
    return { ok: true, bytes };
  } catch (err) {
    return { ok: false, error: `The code couldn’t be run: ${err.message}` };
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}
