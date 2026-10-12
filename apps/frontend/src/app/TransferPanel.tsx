import { useCallback, useEffect, useRef, useState } from 'react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  convertTemplate,
  createVersion,
  getProjectTree,
  listTemplates,
  mineruTransferStart,
  mineruTransferUploadPdf,
  setProjectMainFile,
  transferStart,
  transferStep,
  transferSubmitImages
} from '../api/client';
import type { CompileEngine, PageImage, TemplateMeta } from '../api/client';
import Icon from './Icon';
import Select from './Select';
import { toast } from './Toast';
import { COMPILE_ENGINES, llmConfigFor, useSettings } from './settings';

GlobalWorkerOptions.workerSrc = pdfWorker;

type TransferMode = 'quick' | 'classic' | 'mineru';
type MineruSource = 'project' | 'upload';
export type TransferJob = { jobId: string; status: string; progressLog: string[]; error?: string; newProjectId?: string };

const MAX_LAYOUT_PAGES = 8;

const MODES: [TransferMode, string, string][] = [
  ['quick', 'Quick switch', 'Swaps the preamble for the new template and keeps the body. No AI; a version is saved first.'],
  ['classic', 'Classic (LaTeX → LaTeX, AI)', 'The model rewrites the source for the new template into a new project.'],
  ['mineru', 'MinerU (PDF → Markdown → LaTeX)', 'Converts the compiled PDF with MinerU, then rebuilds it in the new template as a new project.']
];

const STATUS_LABELS: Record<string, string> = {
  starting: 'Starting…',
  uploading_pdf: 'Uploading PDF…',
  started: 'Converting…',
  running: 'Converting…',
  waiting_images: 'Checking the layout…',
  success: 'Finished',
  failed: 'Failed',
  error: 'Failed'
};

export const transferStatusLabel = (status: string) =>
  STATUS_LABELS[status] || status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');

/** Render the first pages of a compiled PDF to PNGs for the VLM layout check. */
async function renderPdfPages(pdfBase64: string): Promise<PageImage[]> {
  const data = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));
  const task = getDocument({ data });
  const pdf = await task.promise;
  const images: PageImage[] = [];
  for (let n = 1; n <= Math.min(pdf.numPages, MAX_LAYOUT_PAGES); n += 1) {
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale: 1.4 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    images.push({ page: n, base64: canvas.toDataURL('image/png').split(',')[1], mime: 'image/png' });
  }
  await task.destroy();
  return images;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export default function TransferPanel({
  projectId,
  onJobUpdate,
  onOpenProject,
  onSwitched
}: {
  projectId: string;
  /** progress of AI transfers, which keep running after the panel closes */
  onJobUpdate?: (job: TransferJob) => void;
  onOpenProject?: (projectId: string) => void;
  /** a quick switch changed this project in place */
  onSwitched?: () => void;
}) {
  const [settings, updateSettings] = useSettings();
  const [mode, setMode] = useState<TransferMode>('quick');
  const [mineruSource, setMineruSource] = useState<MineruSource>('project');
  const [uploadedPdf, setUploadedPdf] = useState<File | null>(null);
  const [sourceFiles, setSourceFiles] = useState<string[]>([]);
  const [sourceMainFile, setSourceMainFile] = useState('');
  const [targetTemplateId, setTargetTemplateId] = useState('');
  const [engine, setEngine] = useState<CompileEngine>(settings.compileEngine);
  const [layoutCheck, setLayoutCheck] = useState(false);
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [status, setStatus] = useState('idle');
  const [progressLog, setProgressLog] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [newProjectId, setNewProjectId] = useState('');
  const [changedFiles, setChangedFiles] = useState<string[]>([]);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getProjectTree(projectId)
      .then((res) => {
        const texFiles = (res.items || []).filter((f) => f.type === 'file' && f.path.endsWith('.tex')).map((f) => f.path);
        setSourceFiles(texFiles);
        setSourceMainFile(
          (res.mainFile && texFiles.includes(res.mainFile) ? res.mainFile : '') ||
            texFiles.find((f) => f === 'main.tex' || f.endsWith('/main.tex')) ||
            texFiles[0] ||
            ''
        );
      })
      .catch((err) => setError(message(err)));
    listTemplates()
      .then((res) => setTemplates(res.templates || []))
      .catch((err) => setError(message(err)));
  }, [projectId]);

  const selectedTemplate = templates.find((tp) => tp.id === targetTemplateId);

  const report = useCallback(
    (job: TransferJob) => {
      setProgressLog(job.progressLog);
      setStatus(job.status);
      onJobUpdate?.(job);
    },
    [onJobUpdate]
  );

  const runGraph = useCallback(
    async (jobId: string, targetId: string) => {
      for (;;) {
        try {
          const res = await transferStep(jobId);
          report({ jobId, status: res.status, progressLog: res.progressLog || [], error: res.error, newProjectId: targetId });
          if (res.status === 'waiting_images') {
            // the job pauses before the VLM layout check: send it the rendered pages
            const images = res.pdf ? await renderPdfPages(res.pdf) : [];
            await transferSubmitImages(jobId, images);
            continue;
          }
          if (res.error) {
            setError(res.error);
            break;
          }
          if (res.status === 'success' || res.status === 'failed') break;
          await new Promise((r) => setTimeout(r, 1000));
        } catch (err) {
          setError(message(err));
          report({ jobId, status: 'error', progressLog: [], error: message(err), newProjectId: targetId });
          break;
        }
      }
      setRunning(false);
    },
    [report]
  );

  const runQuick = async () => {
    if (!selectedTemplate) return;
    try {
      await createVersion(projectId, { reason: 'before-transfer' });
    } catch (err) {
      throw new Error(`Couldn’t save a version first, so nothing was changed. ${message(err)}`);
    }
    const res = await convertTemplate(projectId, selectedTemplate.id, sourceMainFile);
    if (!res.ok) throw new Error(res.error || 'Couldn’t switch the template.');
    // the switched document is what should compile now, wherever the backend wrote it
    if (res.mainFile && res.mainFile !== sourceMainFile) {
      const mainFile = res.mainFile;
      await setProjectMainFile(projectId, mainFile);
      setSourceFiles((prev) => (prev.includes(mainFile) ? prev : [...prev, mainFile]));
      setSourceMainFile(mainFile);
    }
    setChangedFiles(res.changedFiles || []);
    setStatus('success');
    toast(`Switched to ${selectedTemplate.label}. The previous state is saved in Versions.`, { tone: 'success' });
    onSwitched?.();
  };

  const runJob = async () => {
    const targetMainFile = selectedTemplate?.mainFile || 'main.tex';
    const llmConfig = llmConfigFor(settings, 'main');
    const parentDir = settings.projectsDir || undefined;
    let res: { jobId: string; newProjectId: string };
    if (mode === 'mineru') {
      const saved = settings.parserSaved.mineru || { endpoint: '', key: '' };
      const mineruConfig =
        saved.endpoint || saved.key
          ? {
              ...(saved.endpoint ? { apiBase: saved.endpoint } : {}),
              ...(saved.key ? { token: saved.key } : {})
            }
          : undefined;
      res = await mineruTransferStart({
        sourceProjectId: mineruSource === 'project' ? projectId : undefined,
        sourceMainFile: mineruSource === 'project' ? sourceMainFile : undefined,
        targetTemplateId,
        targetMainFile,
        engine,
        layoutCheck,
        llmConfig,
        visionLlmConfig: llmConfigFor(settings, 'vision'),
        mineruConfig,
        parentDir
      });
      if (mineruSource === 'upload' && uploadedPdf) {
        setStatus('uploading_pdf');
        await mineruTransferUploadPdf(res.jobId, uploadedPdf);
      }
    } else {
      res = await transferStart({
        sourceProjectId: projectId,
        sourceMainFile,
        targetTemplateId,
        targetMainFile,
        engine,
        layoutCheck,
        llmConfig,
        visionLlmConfig: llmConfigFor(settings, 'vision'),
        parentDir
      });
    }
    setNewProjectId(res.newProjectId);
    setStatus('started');
    await runGraph(res.jobId, res.newProjectId);
  };

  const handleStart = async () => {
    if (!targetTemplateId) return;
    setError('');
    setProgressLog([]);
    setNewProjectId('');
    setChangedFiles([]);
    setRunning(true);
    setStatus('starting');
    try {
      if (mode === 'quick') {
        await runQuick();
        setRunning(false);
      } else {
        await runJob();
      }
    } catch (err) {
      setError(message(err));
      setRunning(false);
      setStatus('error');
    }
  };

  const usesProjectSource = mode !== 'mineru' || mineruSource === 'project';
  // AI conversions need the main model's key (and MinerU's token); the .env file can supply them instead,
  // so this only warns
  const missingKey =
    running || mode === 'quick'
      ? ''
      : !llmConfigFor(settings, 'main').apiKey
        ? 'Needs an API key for the main model in Settings → Models, or in the .env file.'
        : mode === 'mineru' && !settings.parserSaved.mineru?.key.trim()
          ? 'Needs your MinerU token above, or one in the .env file.'
          : '';
  const canStart = !running && !!targetTemplateId && (usesProjectSource ? !!sourceMainFile : !!uploadedPdf);
  const statusIcon = status === 'success' ? 'checkmark.circle.fill' : status === 'failed' || status === 'error' ? 'xmark.octagon.fill' : 'clock';

  return (
    <div className="transfer-panel">
      <div className="mode-cards" role="radiogroup" aria-label="Method">
        {MODES.map(([value, label, desc]) => (
          <button
            key={value}
            role="radio"
            aria-checked={mode === value}
            className={`mode-card ${mode === value ? 'active' : ''}`}
            disabled={running}
            onClick={() => setMode(value)}
          >
            <span className="mode-card-title">{label}</span>
            <span className="mode-card-desc">{desc}</span>
          </button>
        ))}
      </div>

      {mode === 'mineru' && (
        <div className="field">
          <label id="transfer-source">Source</label>
          <div className="segmented" role="group" aria-labelledby="transfer-source">
            <button className={`segment ${mineruSource === 'project' ? 'active' : ''}`} onClick={() => setMineruSource('project')}>Compile this project</button>
            <button className={`segment ${mineruSource === 'upload' ? 'active' : ''}`} onClick={() => setMineruSource('upload')}>Upload a PDF</button>
          </div>
        </div>
      )}

      <div className="row">
        {usesProjectSource ? (
          <div className="field grow">
            <label id="transfer-main-file">Main file</label>
            <Select
              labelId="transfer-main-file"
              value={sourceMainFile}
              options={sourceFiles.map((f): [string, string] => [f, f])}
              onChange={setSourceMainFile}
              placeholder={sourceFiles.length ? 'Choose a file…' : 'No .tex files found'}
            />
          </div>
        ) : (
          <div className="field grow">
            <label id="transfer-pdf">PDF</label>
            <input
              ref={pdfInputRef}
              type="file"
              accept=".pdf,application/pdf"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setUploadedPdf(file);
                e.target.value = '';
              }}
            />
            <button className="btn full" aria-labelledby="transfer-pdf transfer-pdf-name" onClick={() => pdfInputRef.current?.click()}>
              <Icon name="doc.richtext" /> <span className="truncate" id="transfer-pdf-name">{uploadedPdf ? uploadedPdf.name : 'Choose a PDF…'}</span>
            </button>
          </div>
        )}
        <div className="field grow">
          <label id="transfer-template">New template</label>
          <Select
            labelId="transfer-template"
            value={targetTemplateId}
            options={templates.map((tp): [string, string] => [tp.id, tp.label])}
            onChange={setTargetTemplateId}
            placeholder={templates.length ? 'Choose a template…' : 'No templates available'}
          />
        </div>
      </div>

      {mode !== 'quick' && (
        <>
          <div className="row">
            <div className="field">
              <label id="transfer-compiler">Compiler</label>
              <Select labelId="transfer-compiler" value={engine} options={COMPILE_ENGINES} onChange={(value) => setEngine(value as CompileEngine)} />
            </div>
            <label className="checkbox-row grow align-end">
              <input type="checkbox" checked={layoutCheck} onChange={(e) => setLayoutCheck(e.target.checked)} />
              <span>Check the layout with the vision model</span>
            </label>
          </div>
          {mode === 'mineru' && (
            <div className="row">
              <div className="field grow">
                <label htmlFor="transfer-mineru-api">MinerU API</label>
                <input
                  id="transfer-mineru-api"
                  className="input"
                  placeholder="https://mineru.net/api/v4"
                  spellCheck={false}
                  value={settings.parserSaved.mineru?.endpoint || ''}
                  onChange={(e) =>
                    updateSettings({ parserSaved: { ...settings.parserSaved, mineru: { key: settings.parserSaved.mineru?.key || '', endpoint: e.target.value } } })
                  }
                />
              </div>
              <div className="field grow">
                <label htmlFor="transfer-mineru-token">MinerU token</label>
                <input
                  id="transfer-mineru-token"
                  className="input"
                  type="password"
                  placeholder="Paste your MinerU API token"
                  value={settings.parserSaved.mineru?.key || ''}
                  onChange={(e) =>
                    updateSettings({ parserSaved: { ...settings.parserSaved, mineru: { endpoint: settings.parserSaved.mineru?.endpoint || '', key: e.target.value } } })
                  }
                />
              </div>
            </div>
          )}
          <div className="field-hint">The result is a new project; this one is left as it is.</div>
        </>
      )}

      <button className="btn primary full" disabled={!canStart} aria-describedby={missingKey ? 'transfer-missing-key' : undefined} onClick={handleStart}>
        {running ? (
          <><span className="spinner" /> {mode === 'quick' ? 'Switching…' : 'Converting…'}</>
        ) : (
          <><Icon name="arrow.triangle.2.circlepath" /> {mode === 'quick' ? 'Switch template' : 'Start conversion'}</>
        )}
      </button>
      {missingKey && <div className="field-hint" id="transfer-missing-key">{missingKey}</div>}

      {status !== 'idle' && (
        <div className={`transfer-status ${status}`}>
          <Icon name={statusIcon} />
          <span className="grow">{transferStatusLabel(status)}</span>
          {/* a 'failed' conversion keeps its project: open it to fix the remaining errors */}
          {(status === 'success' || (status === 'failed' && newProjectId)) && onOpenProject && (newProjectId || mode === 'quick') && (
            <button className="btn small primary" onClick={() => onOpenProject(newProjectId || projectId)}>
              {newProjectId ? 'Open new project' : 'Open project'}
            </button>
          )}
        </div>
      )}
      {error && <div className="field-hint error">{error}</div>}
      {changedFiles.length > 0 && (
        <div className="field-hint">Changed: {changedFiles.join(', ')}</div>
      )}
      {progressLog.length > 0 && (
        <div className="log-box">
          {progressLog.map((line, i) => <div key={i}>{line}</div>)}
        </div>
      )}
    </div>
  );
}
