import path from 'path';
import { promises as fs } from 'fs';
import { safeJoin, sanitizeUploadPath } from '../utils/pathUtils.js';
import { ensureDir, freePath } from '../utils/fsUtils.js';
import { getProjectRoot, mutateProjectRoot, touchProject } from '../services/projectService.js';
import { resolveLLMConfig, callOpenAICompatible, missingKey, NO_API_KEY } from '../services/llmService.js';
import { PLOT_FORMATS, runPlot } from '../services/plotService.js';

const MAX_CODE = 100_000;

export function registerPlotRoutes(fastify) {
  // The model writes the chart's code, which comes back to be shown: nothing runs here. error and code: the last run's,
  // for code that works.
  fastify.post('/api/plot/from-table', async (req) => {
    const { projectId, tableLatex, chartType, prompt, llmConfig, error, code } = req.body || {};
    if (!projectId) return { ok: false, error: 'Missing projectId.' };
    if (!tableLatex) return { ok: false, error: 'Missing tableLatex.' };
    await getProjectRoot(projectId);
    const resolved = resolveLLMConfig(llmConfig);
    if (missingKey(resolved)) return { ok: false, error: NO_API_KEY };
    const system = [
      'You generate python plotting code using matplotlib (and seaborn if available).',
      'You are given: rows (list of rows), header (list of column names).',
      'If pandas is available, df and df_numeric are provided; otherwise df is None.',
      'Do not import packages. Do not call plt.savefig. Do not read or write files or use the network.',
      'Use chart_type if helpful.',
      'Return ONLY python code.'
    ].join(' ');
    const user = [
      `chart_type: ${chartType || 'bar'}`,
      prompt ? `user_prompt: ${prompt}` : '',
      error ? `runtime_error:\n${String(error).slice(0, 4000)}` : '',
      code ? `previous_code:\n${String(code).slice(0, MAX_CODE)}` : ''
    ].filter(Boolean).join('\n');
    const res = await callOpenAICompatible({
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      model: resolved.model,
      endpoint: resolved.endpoint,
      apiKey: resolved.apiKey
    });
    if (!res.ok || !res.content) return { ok: false, error: res.error || 'The model wrote no code.' };
    const plotCode = String(res.content).replace(/```python/g, '').replace(/```/g, '').trim();
    return { ok: true, code: plotCode };
  });

  // The code the user saw (and may have edited), run when they chose Run this code: in isolation, then the chart is
  // saved in assets/plots, never over a file there.
  fastify.post('/api/plot/run', async (req) => {
    const { projectId, tableLatex, title, filename, code } = req.body || {};
    if (!projectId) return { ok: false, error: 'Missing projectId.' };
    if (!tableLatex) return { ok: false, error: 'Missing tableLatex.' };
    if (typeof code !== 'string' || !code.trim()) return { ok: false, error: 'There is no code to run.' };
    if (code.length > MAX_CODE) return { ok: false, error: 'The code is too long.' };
    const root = await getProjectRoot(projectId);
    const base = sanitizeUploadPath(String(filename || '').trim()) || `plot_${Date.now()}`;
    const ext = path.extname(base).slice(1).toLowerCase();
    const format = PLOT_FORMATS[ext] ? ext : 'png';
    const name = PLOT_FORMATS[ext] ? base : `${base}.png`;
    const result = await runPlot({ tableLatex: String(tableLatex), title: title ? String(title) : '', plotCode: code, format });
    if (!result.ok) return result;
    return mutateProjectRoot(root, async () => {
      const abs = await freePath(safeJoin(root, path.join('assets', 'plots', name)));
      await ensureDir(path.dirname(abs));
      await fs.writeFile(abs, result.bytes, { flag: 'wx' });
      await touchProject(root).catch(() => {});
      return { ok: true, assetPath: path.relative(root, abs).replace(/\\/g, '/') };
    });
  });
}
