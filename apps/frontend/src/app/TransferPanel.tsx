import { useCallback, useEffect, useRef, useState } from 'react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  convertTemplate,
  createVersion,
  getProjectTree,
  listTemplates,
  pdfTransferStart,
  setProjectMainFile,
  transferStart,
  transferStep,
  transferSubmitImages,
  transferUploadPdf
} from '../api/client';
import type { CompileEngine, PageImage, TemplateMeta } from '../api/client';
import Icon from './Icon';
import Select from './Select';
import { toast } from './Toast';
import { COMPILE_ENGINES, llmConfigFor, useSettings } from './settings';
import {
  CUSTOM_PARSER,
  parserConfigFor,
  parserEndpointPatch,
  parserId,
  parserKeyPatch,
  parserPreset,
  parserWarning,
  savedParser,
  useParsers
} from './parsers';

GlobalWorkerOptions.workerSrc = pdfWorker;

type TransferMode = 'quick' | 'classic' | 'pdf';
type PdfSource = 'project' | 'upload';
export type TransferJob = { jobId: string; status: string; progressLog: string[]; error?: string; newProjectId?: string };

const MAX_LAYOUT_PAGES = 8;

const MODES: [TransferMode, string, string][] = [
  ['quick', 'Quick switch', 'Swaps the preamble for the new template and keeps the body. No AI; a version is saved first.'],
  ['classic', 'Classic (LaTeX → LaTeX, AI)', 'The model rewrites the source for the new template into a new project.'],
  ['pdf', 'From the PDF (parser → LaTeX)', 'A parser reads the PDF, then the model rebuilds it in the new template as a new project.']
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
  const [settings] = useSettings();
  const parsers = useParsers();
  const [mode, setMode] = useState<TransferMode>('quick');
  const [pdfSource, setPdfSource] = useState<PdfSource>('project');
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
    if (mode === 'pdf') {
      res = await pdfTransferStart({
        sourceProjectId: pdfSource === 'project' ? projectId : undefined,
        sourceMainFile: pdfSource === 'project' ? sourceMainFile : undefined,
        targetTemplateId,
        targetMainFile,
        engine,
        layoutCheck,
        llmConfig,
        visionLlmConfig: llmConfigFor(settings, 'vision'),
        parser: parserConfigFor(settings, parserPreset(parsers, settings)),
        parentDir
      });
      if (pdfSource === 'upload' && uploadedPdf) {
        setStatus('uploading_pdf');
        await transferUploadPdf(res.jobId, uploadedPdf);
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

  const usesProjectSource = mode !== 'pdf' || pdfSource === 'project';
  // AI conversions need the main model's key (and most parsers one too); the .env file can supply the
  // model's and MinerU's, so this only warns
  const missingKey =
    running || mode === 'quick'
      ? ''
      : !llmConfigFor(settings, 'main').apiKey
        ? 'Needs an API key for the main model in Settings → Models, or in the .env file.'
        : mode === 'pdf'
          ? parserWarning(settings, parserPreset(parsers, settings))
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

      {mode === 'pdf' && (
        <div className="field">
          <label id="transfer-source">Source</label>
          <div className="segmented" role="group" aria-labelledby="transfer-source">
            <button className={`segment ${pdfSource === 'project' ? 'active' : ''}`} onClick={() => setPdfSource('project')}>Compile this project</button>
            <button className={`segment ${pdfSource === 'upload' ? 'active' : ''}`} onClick={() => setPdfSource('upload')}>Upload a PDF</button>
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
          {mode === 'pdf' && <ParserFields inline />}
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

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * The PDF parser and its key: the whole picker in Settings → Template transfer, and `inline` in this
 * panel just the parser and its key fields. Each parser keeps its own endpoint and key.
 */
export function ParserFields({ inline = false }: { inline?: boolean }) {
  const [settings, update] = useSettings();
  const parsers = useParsers();
  const preset = parserPreset(parsers, settings);
  if (!preset) return null;
  const id = parserId(settings, preset);
  const custom = id === CUSTOM_PARSER;
  const saved = savedParser(settings, id);
  const at = inline ? 'transfer' : 'settings';
  const setEndpoint = (endpoint: string) => update(parserEndpointPatch(settings, preset, id, endpoint));
  const own = [preset.endpoint, ...(preset.regions || []).map((r) => r.endpoint)];
  const current = saved.endpoint || preset.endpoint;

  const keyField = (field: 'appId' | 'key', label: string) => (
    <div className={`field ${inline ? 'grow' : ''}`}>
      <label htmlFor={`${at}-parser-${field}`}>{label}</label>
      <input
        id={`${at}-parser-${field}`}
        className="input"
        type={field === 'key' ? 'password' : 'text'}
        value={saved[field] || ''}
        placeholder={field === 'appId' ? 'Paste your app ID' : custom || preset.keyOptional ? 'Optional' : `Paste your ${preset.keyName}`}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        autoComplete="off"
        onChange={(e) => update(parserKeyPatch(settings, id, field, e.target.value))}
      />
    </div>
  );
  const picker = (
    <div className={`field ${inline ? 'grow' : ''}`}>
      <label id={`${at}-parser`}>Parser</label>
      <Select
        labelId={`${at}-parser`}
        value={custom ? CUSTOM_PARSER : preset.id}
        options={[...parsers.map((p): [string, string] => [p.id, p.name]), [CUSTOM_PARSER, 'Other (self-hosted or compatible)']]}
        onChange={(value) => update({ parser: value })}
      />
      {!inline && <div className="field-hint">{custom ? 'A self-hosted or compatible server that speaks one of these APIs.' : preset.note}</div>}
    </div>
  );
  const keys = (
    <>
      {preset.appId && keyField('appId', 'App ID')}
      {keyField('key', capitalise(preset.keyName))}
    </>
  );
  if (inline) return <div className="row">{picker}{keys}</div>;

  return (
    <>
      {picker}
      {custom && (
        <div className="field">
          <label id="settings-parserProtocol">API</label>
          <Select
            labelId="settings-parserProtocol"
            value={preset.id}
            options={parsers.map((p): [string, string] => [p.id, p.name])}
            onChange={(value) => update({ parserProtocol: value })}
          />
        </div>
      )}
      {!custom && preset.regions && (
        <div className="field">
          <label id="settings-parserRegion">Region</label>
          <Select
            labelId="settings-parserRegion"
            value={current}
            options={[
              [preset.endpoint, 'Default'],
              ...preset.regions.map((r): [string, string] => [r.endpoint, r.label]),
              ...(own.includes(current) ? [] : [[current, 'Custom endpoint'] as [string, string]])
            ]}
            onChange={(endpoint) => setEndpoint(endpoint === preset.endpoint ? '' : endpoint)}
          />
        </div>
      )}
      <EndpointField
        key={id}
        id="settings-parserEndpoint"
        value={saved.endpoint}
        placeholder={custom ? 'http://localhost:8000' : preset.endpoint}
        hint={custom ? `The base URL of a server that speaks the ${preset.name} API.` : ''}
        onCommit={setEndpoint}
      />
      {keys}
      <div className="field-hint">
        {custom || preset.keyOptional ? 'Only needed if the server asks for one.' : (
          <>Create one on the <a href={preset.keyUrl} target="_blank" rel="noreferrer">{preset.name} key page</a>.</>
        )}{' '}
        Each parser’s key is kept when you switch.
      </div>
    </>
  );
}

/**
 * Saved when it loses focus (or on Return), so the key is only left behind when the address has
 * really moved to another host, not at every keystroke on the way there.
 */
function EndpointField({ id, value, placeholder, hint, onCommit }: { id: string; value: string; placeholder: string; hint: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const latest = useRef({ draft, value, onCommit });
  latest.current = { draft, value, onCommit };
  useEffect(() => setDraft(value), [value]);
  // closing Settings while typing still keeps the address
  useEffect(
    () => () => {
      const { draft: typed, value: was, onCommit: commit } = latest.current;
      if (typed !== was) commit(typed);
    },
    []
  );
  const commit = () => draft !== value && onCommit(draft);
  return (
    <div className="field">
      <label htmlFor={id}>Endpoint</label>
      <input
        id={id}
        className="input"
        value={draft}
        placeholder={placeholder}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        autoComplete="off"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}
