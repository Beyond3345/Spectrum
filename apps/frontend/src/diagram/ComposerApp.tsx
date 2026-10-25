import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ReactFlowProvider } from '@xyflow/react';
import type { EditorView } from '@codemirror/view';
import { ApiError, compileProject, getEngines, getFile, getProjectSettings, getProjectTree, runAgent, stopCompile, uploadFiles, writeFile } from '../api/client';
import type { CompileEngine } from '../api/client';
import Icon from '../app/Icon';
import { MenuButton } from '../app/Menu';
import Tabs from '../app/Tabs';
import { toast } from '../app/Toast';
import { effectiveCompile, llmConfigFor, useSettings } from '../app/settings';
import { formatShortcut, matchesShortcut } from '../app/shortcuts';
import { parseCompileLog } from '../editor/compileLog';
import { conflictCopyPath } from '../editor/heldFiles';
import { errorText } from '../editor/shared';
import CodePane from './CodePane';
import { CanvasControls, CanvasPrefsContext } from './FlowCanvas';
import type { CanvasPrefs } from './FlowCanvas';
import Preview, { pdfPageCanvas } from './Preview';
import type { PreviewState } from './Preview';
import { ProjectContext } from './controls';
import { diagramFileText, drawnText, readDiagramFile } from './fileFormat';
import type { DiagramCode } from './fileFormat';
import { MODES, modeFor } from './modes';
import { RASTER_SCALE, renderMermaid, svgToPng } from './modes/mermaid/render';
import { pngToPdf } from './modes/mermaid/pdf';
import type { DiagramFile, DiagramLanguage, DiagramMode } from './types';
import './composer.css';

// The diagram composer, in its own window: a chooser for a new diagram, then the canvas (Draw) and the file (Code),
// the compiled preview below, saved as you go to figures/<name>.tex, .typ or .mmd

/** Messages to the main window: a diagram to insert as a figure, and a diagram file saved. */
type DiagramMessage =
  | { type: 'insert'; projectId: string; path: string; language: DiagramLanguage; packages: string[]; libraries: string[] }
  | { type: 'saved'; projectId: string; path: string };

let channel: BroadcastChannel | null = null;
function post(message: DiagramMessage) {
  try {
    channel ??= new BroadcastChannel('spectrum-diagram');
    channel.postMessage(message);
  } catch {
    // no BroadcastChannel: the main window picks the file up from the folder watch
  }
}

const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);
const folderOf = (path: string) => path.slice(0, path.lastIndexOf('/'));
const stemOf = (path: string) => nameOf(path).replace(/\.[^.]+$/, '');

/** The packages and TikZ libraries a standalone file loads, for the document it goes into. */
function loadsOf(text: string) {
  const names = (re: RegExp) => [...text.matchAll(re)].flatMap((m) => m[1].split(',').map((n) => n.trim())).filter(Boolean);
  return { packages: names(/^[^%\n]*\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/gm), libraries: names(/^[^%\n]*\\usetikzlibrary\{([^}]+)\}/gm) };
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const PREFS_KEY = 'spectrum-diagram-canvas';
function loadPrefs(): CanvasPrefs {
  try {
    return { minimap: false, dark: false, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
  } catch {
    return { minimap: false, dark: false };
  }
}

export default function ComposerApp({ projectId, file, lang }: { projectId: string; file?: string; lang?: DiagramLanguage }) {
  // another file, or a new diagram, starts afresh
  return (
    <ProjectContext.Provider value={projectId}>
      {file ? <Composer key={`${projectId}\n${file}`} projectId={projectId} path={file} /> : <Chooser key={projectId} projectId={projectId} lang={lang} />}
    </ProjectContext.Provider>
  );
}

// ─── the chooser ───

const BLURBS: Record<string, string> = {
  circuitikz: 'Resistors, sources, switches, transistors and gates, wired on a grid',
  pgfplots: 'Functions and data from the project, on axes',
  tikz: 'Flowcharts and block diagrams: boxes and arrows',
  'tikz-cd': 'Maths objects on a grid, with labelled arrows'
};
const BASE_NAMES: Record<string, string> = { circuitikz: 'circuit', pgfplots: 'plot', tikz: 'diagram', 'tikz-cd': 'square', mermaid: 'mermaid', fletcher: 'flow' };
const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function Chooser({ projectId, lang }: { projectId: string; lang?: DiagramLanguage }) {
  const navigate = useNavigate();
  const tikzModes = MODES.filter((m) => m.language === 'tikz');
  const [kind, setKind] = useState<'tikz' | 'typst' | 'mermaid'>(lang === 'mermaid' ? 'mermaid' : lang === 'typst' ? 'typst' : 'tikz');
  const [pkg, setPkg] = useState(tikzModes[0]?.id ?? 'tikz');
  const [typstBuiltIn, setTypstBuiltIn] = useState<boolean | null>(null);
  const [typstVersion, setTypstVersion] = useState('');
  const [taken, setTaken] = useState<Set<string> | null>(null);
  const [typed, setTyped] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const mode = kind === 'mermaid' ? modeFor('mermaid') : kind === 'typst' ? modeFor('fletcher') : modeFor(pkg);
  const ext = kind === 'mermaid' ? 'mmd' : kind === 'typst' ? 'typ' : 'tex';
  useEffect(() => {
    getEngines().then((engines) => setTypstBuiltIn(!!engines.typst.builtIn)).catch(() => setTypstBuiltIn(false));
    getProjectSettings(projectId).then(({ settings }) => setTypstVersion(settings.compile?.typstVersion || '')).catch(() => undefined);
  }, [projectId]);
  // a free name to start with, until one is typed
  const base = BASE_NAMES[mode?.id ?? ''] ?? 'diagram';
  let free = 1;
  while (taken?.has(`${base}-${free}`)) free += 1;
  const name = typed ?? (taken ? `${base}-${free}` : '');

  useEffect(() => {
    document.title = 'Draw a diagram';
    getProjectTree(projectId)
      .then(({ items }) => setTaken(new Set(items.filter((i) => i.path.startsWith('figures/')).map((i) => stemOf(i.path).toLowerCase()))))
      .catch(() => setTaken(new Set()));
  }, [projectId]);

  const create = async () => {
    if (!mode) return;
    if (!NAME.test(name)) {
      setError('Use letters, digits, - and _ only, starting with a letter or digit, so LaTeX can find the file.');
      return;
    }
    const path = `figures/${name}.${ext}`;
    setBusy(true);
    setError('');
    try {
      const diagram: DiagramFile = { language: mode.language, ...(mode.language === 'tikz' && { pkg: mode.id as DiagramFile['pkg'] }), style: {}, model: mode.emptyModel(), version: 1 };
      await writeFile(projectId, path, await diagramFileText(diagram, mode.toCode(diagram.model, diagram.style, { typstVersion })), { create: true, typed: true });
      post({ type: 'saved', projectId, path });
      navigate(`/diagram?${new URLSearchParams({ project: projectId, file: path, lang: mode.language })}`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409 ? `There’s already a figures/${name}.${ext}. Choose another name.` : errorText(err));
      setBusy(false);
    }
  };

  const card = (value: 'tikz' | 'typst' | 'mermaid', title: string, text: string, disabled = false) => (
    <button
      type="button"
      role="radio"
      aria-checked={kind === value}
      disabled={disabled}
      className={`chooser-card${kind === value ? ' active' : ''}`}
      onClick={() => !disabled && setKind(value)}
    >
      <span className="chooser-card-title">{title}</span>
      <span className="chooser-card-text">{text}</span>
    </button>
  );

  return (
    <div className="diagram-app">
      <header className="diagram-header" data-tauri-drag-region />
      <form
        className="diagram-chooser"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <h1>Draw a diagram</h1>
        <div className="chooser-cards" role="radiogroup" aria-label="Kind of diagram">
          {card('tikz', 'TikZ diagram', 'Compiled by LaTeX, so its labels use your document’s fonts and maths')}
          {card('typst', 'Typst diagram', 'Flowcharts and block diagrams drawn with fletcher', typstBuiltIn !== true)}
          {card('mermaid', 'Mermaid diagram', 'Flowcharts, sequence diagrams and Gantt charts, written as text')}
        </div>
        {kind === 'tikz' && (
          <div className="chooser-packages" role="radiogroup" aria-label="TikZ package">
            {tikzModes.map((m) => (
              <label key={m.id} className={`chooser-package${pkg === m.id ? ' active' : ''}`}>
                <input type="radio" name="package" checked={pkg === m.id} onChange={() => setPkg(m.id)} />
                <span>
                  <span className="chooser-package-title">{m.label}</span>
                  {BLURBS[m.id] && <span className="chooser-card-text">{BLURBS[m.id]}</span>}
                </span>
              </label>
            ))}
          </div>
        )}
        <div className="field">
          <label htmlFor="diagram-name">Name</label>
          <div className="chooser-name">
            <span className="muted">figures/</span>
            <input
              id="diagram-name"
              className="input"
              value={name}
              spellCheck={false}
              autoFocus
              onChange={(e) => {
                setTyped(e.target.value.trim());
                setError('');
              }}
            />
            <span className="muted">.{ext}</span>
          </div>
          {error && <div className="field-hint error">{error}</div>}
        </div>
        <div className="chooser-actions">
          <button type="submit" className="btn primary" disabled={busy || !mode || !name}>
            {busy && <span className="spinner" />} Create
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── the composer ───

/**
 * What's being edited: the drawing (none for a file without one), and the code when it's kept as typed. tail: the
 * file's last line, kept as it is under the code when there's no mode here to draw it.
 */
type Doc = { diagram: DiagramFile | null; hand: string | null; tail?: string };

type Loaded = { doc: Doc; edited: boolean; hash: string; needsSave?: boolean };

/** A diagram file opened: its drawing, and its code when that isn't the drawing's (edited by hand, or never drawn). */
async function openDiagram(projectId: string, path: string): Promise<Loaded> {
  const { content, hash } = await getFile(projectId, path);
  const { code, diagram, edited, mark } = await readDiagramFile(content);
  if (/\.mmd$/i.test(path)) {
    // Mermaid's canvas is its code, so what's in the file is the drawing
    const model = { code: diagram ? code : content };
    return { doc: { diagram: { style: {}, ...diagram, language: 'mermaid', model, version: 1 }, hand: null }, edited: false, hash };
  }
  const mode = diagram ? modeFor(diagram.language === 'mermaid' ? 'mermaid' : diagram.language === 'typst' ? 'fletcher' : diagram.pkg) : undefined;
  let needsSave = false;
  try {
    if (!mode || !diagram) throw new Error('Unsupported drawing');
    // a fletcher import line follows the project's Typst version
    const typstVersion = diagram.language === 'typst' ? (await getProjectSettings(projectId).catch(() => null))?.settings.compile?.typstVersion || '' : '';
    const generated = mode.toCode(diagram.model, diagram.style, { typstVersion });
    needsSave = !edited && drawnText(diagram, generated) !== code;
  } catch {
    return { doc: { diagram: null, hand: code, tail: mark ? `${mark}\n` : '' }, edited: false, hash };
  }
  return { doc: { diagram, hand: edited ? code : null }, edited, hash, needsSave };
}

const snapshotOf = (diagram: DiagramFile) => JSON.stringify({ style: diagram.style, model: diagram.model });

function Composer({ projectId, path }: { projectId: string; path: string }) {
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState('');
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    document.title = nameOf(path);
    let live = true;
    openDiagram(projectId, path).then(
      (result) => live && setLoaded(result),
      (err) => live && setLoadError(errorText(err))
    );
    return () => {
      live = false;
    };
  }, [projectId, path, reloads]);

  if (loadError) {
    return (
      <div className="diagram-app">
        <header className="diagram-header" data-tauri-drag-region />
        <div className="empty-state">
          <div className="empty-title">Couldn’t open {path}</div>
          <div className="empty-text">{loadError}</div>
          <div className="empty-actions">
            <button className="btn primary" onClick={() => navigate(`/diagram?${new URLSearchParams({ project: projectId })}`, { replace: true })}>
              Draw a new diagram
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (!loaded) {
    return (
      <div className="diagram-app diagram-loading">
        <span className="spinner" />
      </div>
    );
  }
  return (
    <Editor
      key={reloads}
      projectId={projectId}
      path={path}
      loaded={loaded}
      onReload={() => {
        setLoaded(null);
        setReloads((n) => n + 1);
      }}
    />
  );
}

function Editor({ projectId, path, loaded, onReload }: { projectId: string; path: string; loaded: Loaded; onReload(): void }) {
  const [settings] = useSettings();
  const [doc, setDoc] = useState<Doc>(loaded.doc);
  const mode: DiagramMode<any> | undefined = doc.diagram ? modeFor(doc.diagram.language === 'mermaid' ? 'mermaid' : doc.diagram.language === 'typst' ? 'fletcher' : doc.diagram.pkg) : undefined;
  const language: DiagramLanguage = /\.mmd$/i.test(path) ? 'mermaid' : /\.typ$/i.test(path) ? 'typst' : 'tikz';
  const drawable = !!mode && language !== 'mermaid';
  const [typstVersion, setTypstVersion] = useState('');
  const [tab, setTab] = useState<'draw' | 'code'>(mode && doc.hand === null ? 'draw' : 'code');
  // the hand-edit banner: shown on opening an edited file, and from the first keystroke in the Code tab
  const [editedNote, setEditedNote] = useState(loaded.edited);
  const [selection, setSelection] = useState<string[]>([]);
  const [tool, setTool] = useState('select');
  const [prefs, setPrefs] = useState(loadPrefs);
  const [styleOpen, setStyleOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewState>({ state: 'idle', errors: [], log: '' });
  const [fixing, setFixing] = useState(false);
  const [conflict, setConflict] = useState<'changed' | 'deleted' | null>(null);
  const [savedKey, setSavedKey] = useState(() => loaded.needsSave ? '' : JSON.stringify(loaded.doc));
  const [, historyMoved] = useState(0);
  const codeView = useRef<EditorView | null>(null);
  const name = nameOf(path);

  // the drawing's code; a mode that throws on a damaged model leaves the code as it was in the file
  const code = useMemo<DiagramCode | null>(() => {
    if (!mode || !doc.diagram) return null;
    try {
      return mode.toCode(doc.diagram.model, doc.diagram.style, { typstVersion });
    } catch {
      return null;
    }
  }, [mode, doc.diagram, typstVersion]);
  /** what the Code tab shows, and what's compiled: the file above its last line */
  const text = doc.hand ?? (doc.diagram && code ? drawnText(doc.diagram, code) : '');
  const key = JSON.stringify(doc);
  const dirty = key !== savedKey;

  // the newest of everything, for saves started by timers, keys and the window closing
  const latest = useRef({ doc, code, text, key });
  latest.current = { doc, code, text, key };
  const hashRef = useRef(loaded.hash);
  const savedRef = useRef(savedKey);
  const conflictRef = useRef(conflict);
  conflictRef.current = conflict;
  const writing = useRef<Promise<unknown>>(Promise.resolve());

  /** The whole file as it is now: the drawing (or the code kept as typed) and the drawing's last line. */
  const fileText = async () => {
    const now = latest.current;
    const tail = now.doc.tail ?? '';
    if (!now.doc.diagram || !now.code) return tail && !now.text.endsWith('\n') ? `${now.text}\n${tail}` : now.text + tail;
    return diagramFileText(now.doc.diagram, now.code, now.doc.hand ?? undefined);
  };

  /**
   * Saves what's here, one write at a time and only over the text it was opened or last saved as. overwrite: over
   * whatever's on disk now (or the file made again). Resolves to whether it's saved.
   */
  const save = (overwrite = false): Promise<boolean> => {
    const job = writing.current.then(async () => {
      const now = latest.current;
      if (!overwrite && (now.key === savedRef.current || conflictRef.current)) return now.key === savedRef.current;
      try {
        const { hash } = await writeFile(projectId, path, await fileText(), overwrite ? {} : { base: hashRef.current });
        hashRef.current = hash;
        savedRef.current = now.key;
        setSavedKey(now.key);
        setConflict(null);
        post({ type: 'saved', projectId, path });
        return true;
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) setConflict(err.data.code === 'DELETED_ON_DISK' ? 'deleted' : 'changed');
        else toast(`Couldn’t save ${name}: ${errorText(err)}`, { tone: 'error' });
        return false;
      }
    });
    writing.current = job.catch(() => undefined);
    return job;
  };

  // ─── undo: snapshots of the drawing 400 ms after it last changed ───

  const history = useRef({ past: [] as string[], future: [] as string[], now: doc.diagram ? snapshotOf(doc.diagram) : '' });
  const commit = () => {
    const diagram = latest.current.doc.diagram;
    const h = history.current;
    if (!diagram || snapshotOf(diagram) === h.now) return;
    h.past = [...h.past, h.now].slice(-200);
    h.now = snapshotOf(diagram);
    h.future = [];
    historyMoved((n) => n + 1);
  };
  useEffect(() => {
    const timer = window.setTimeout(commit, 400);
    return () => window.clearTimeout(timer);
  }, [doc.diagram]);
  const step = (back: boolean) => {
    commit();
    const h = history.current;
    const to = (back ? h.past : h.future).pop();
    if (to === undefined) return;
    (back ? h.future : h.past).push(h.now);
    h.now = to;
    const { style, model } = JSON.parse(to);
    setDoc((d) => (d.diagram ? { ...d, diagram: { ...d.diagram, style, model } } : d));
    setSelection([]);
    historyMoved((n) => n + 1);
  };

  const setModel = (model: unknown) => setDoc((d) => (d.diagram ? { ...d, diagram: { ...d.diagram, model } } : d));
  const setStyle = (style: Record<string, unknown>) => setDoc((d) => (d.diagram ? { ...d, diagram: { ...d.diagram, style } } : d));

  // ─── the preview: saved and compiled 700 ms after the last change, a newer compile stopping the one before ───

  const [engine, setEngine] = useState<CompileEngine>('auto');
  useEffect(() => {
    getProjectSettings(projectId)
      .then(({ settings: project }) => {
        const effective = effectiveCompile(project.compile, settings.compileDefaults);
        // latexmk's extra passes buy a picture nothing
        setEngine(effective.engine === 'latexmk' ? 'auto' : effective.engine);
        setTypstVersion(effective.typstVersion || '');
      })
      .catch(() => undefined);
  }, [projectId]);

  const run = useRef({ count: 0, id: '' });
  const compile = async () => {
    if (language === 'mermaid') return;
    const mine = (run.current.count += 1);
    if (run.current.id) stopCompile(run.current.id).catch(() => undefined);
    const compileId = crypto.randomUUID();
    run.current.id = compileId;
    setPreview((p) => ({ ...p, state: 'compiling' }));
    if (!(await save())) {
      if (mine === run.current.count) setPreview((p) => ({ ...p, state: p.pdf ? 'ok' : 'idle' }));
      return;
    }
    if (mine !== run.current.count) return;
    const source = savedRef.current;
    try {
      const res = await compileProject({
        projectId,
        mainFile: path,
        engine,
        compileId,
        draft: false,
        fresh: false,
        texFolder: settings.texFolder || undefined,
        typstInputs: language === 'typst' ? { 'spectrum-diagram': 'standalone' } : undefined
      });
      if (mine !== run.current.count || res.stopped) return;
      const log = res.log || '';
      // Typst brings its diagnostics with it; TeX's come from the log
      const errors = language === 'typst' ? (res.errors ?? []).map((e) => ({ severity: e.severity, message: e.message, line: e.line, file: e.file })) : parseCompileLog(log);
      if (res.ok && res.pdf) {
        setPreview({ state: res.status === 0 ? 'ok' : 'failed', pdf: Uint8Array.from(atob(res.pdf), (c) => c.charCodeAt(0)), errors, log, source });
      } else {
        setPreview((p) => ({ ...p, state: 'failed', errors, log, failure: res.error }));
      }
    } catch (err) {
      if (mine === run.current.count) setPreview((p) => ({ ...p, state: 'failed', errors: [], log: '', failure: errorText(err) }));
    }
  };
  /** Save, and for TikZ compile the preview too (Mermaid draws its own as you type). */
  const refresh = () => (language === 'mermaid' ? save() : compile());
  const actions = useRef({ compile, save, step, refresh });
  actions.current = { compile, save, step, refresh };

  useEffect(() => {
    const timer = window.setTimeout(() => actions.current.refresh(), 700);
    return () => window.clearTimeout(timer);
  }, [text, key]);

  // ─── leaving: the window's closing saves (a save refused because the file changed is kept beside it) ───

  useEffect(() => {
    const hooks = window as Window & { __spectrumFlush?: () => Promise<void> };
    hooks.__spectrumFlush = async () => {
      if (await actions.current.save()) return;
      await writeFile(projectId, conflictCopyPath(path, '', new Date()), await fileText(), { create: true });
    };
    // the browser asks before leaving while a save is still to come
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (latest.current.key === savedRef.current) return;
      actions.current.save();
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      delete hooks.__spectrumFlush;
      actions.current.save();
    };
  }, []);

  // ─── copy, paste, duplicate and delete, through the mode ───

  const clipboard = useRef<unknown>(null);
  const canEdit = tab === 'draw' && drawable && doc.hand === null && !!doc.diagram;
  const edits = {
    copy: () => {
      if (!canEdit || !mode?.copy || !selection.length) return false;
      clipboard.current = mode.copy(doc.diagram!.model, selection);
      return true;
    },
    paste: (clip = clipboard.current) => {
      if (!canEdit || !mode?.paste || !clip) return false;
      const { model, ids } = mode.paste(doc.diagram!.model, JSON.parse(JSON.stringify(clip)));
      setModel(model);
      setSelection(ids);
      return true;
    },
    remove: () => {
      if (!canEdit || !mode?.remove || !selection.length) return false;
      setModel(mode.remove(doc.diagram!.model, selection));
      setSelection([]);
      return true;
    }
  };
  const duplicate = () => !!mode?.copy && edits.paste(mode.copy(doc.diagram!.model, selection));
  const editsRef = useRef({ ...edits, duplicate });
  editsRef.current = { ...edits, duplicate };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = actions.current;
      if (matchesShortcut('Mod-s', e) || matchesShortcut('Mod-Enter', e)) a.refresh();
      else {
        // text fields and the code editor keep their own keys
        const target = e.target as HTMLElement;
        if (target.closest('input, textarea, select, [contenteditable="true"], .cm-editor')) return;
        const x = editsRef.current;
        if (matchesShortcut('Mod-z', e)) a.step(true);
        else if (matchesShortcut('Shift-Mod-z', e) || matchesShortcut('Mod-y', e)) a.step(false);
        else if (matchesShortcut('Mod-c', e)) {
          if (!x.copy()) return;
        } else if (matchesShortcut('Mod-x', e)) {
          if (!x.copy() || !x.remove()) return;
        } else if (matchesShortcut('Mod-v', e)) {
          if (!x.paste()) return;
        } else if (matchesShortcut('Mod-d', e)) {
          if (!x.duplicate()) return;
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          if (!x.remove()) return;
        } else if (e.key === 'Escape') {
          setTool('select');
          setSelection([]);
        } else return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ─── header actions ───

  const choosePrefs = (next: CanvasPrefs) => {
    setPrefs(next);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      // no storage: the canvas just doesn't remember
    }
  };

  const mermaidImage = async (kind: 'pdf' | 'png') => {
    const png = await svgToPng(await renderMermaid(code?.body ?? text));
    return kind === 'png' ? png : new Blob([await pngToPdf(new Uint8Array(await png.arrayBuffer()), RASTER_SCALE)], { type: 'application/pdf' });
  };

  const insert = async () => {
    if (!(await save())) return;
    try {
      if (language === 'mermaid') {
        const { mainFile } = await getProjectTree(projectId);
        const kind = /\.md$/i.test(mainFile || '') ? 'png' : 'pdf';
        const image = path.replace(/\.mmd$/i, `.${kind}`);
        const blob = await mermaidImage(kind);
        await uploadFiles(projectId, [new File([blob], nameOf(image), { type: blob.type })], folderOf(image));
        post({ type: 'insert', projectId, path: image, language, packages: [], libraries: [] });
      } else if (language === 'typst') {
        post({ type: 'insert', projectId, path, language, packages: [], libraries: [] });
      } else {
        post({ type: 'insert', projectId, path, language, ...loadsOf(text) });
      }
      toast('The figure is ready to insert in the editor’s Floats panel.', { tone: 'success' });
    } catch (err) {
      toast(`Couldn’t insert ${name}: ${errorText(err)}`, { tone: 'error' });
    }
  };

  const exportAs = async (kind: 'pdf' | 'png') => {
    try {
      if (language === 'mermaid') download(await mermaidImage(kind), `${stemOf(path)}.${kind}`);
      else if (!preview.pdf || preview.state !== 'ok' || preview.source !== key) toast('Compile the current diagram successfully before exporting.');
      else if (kind === 'pdf') download(new Blob([preview.pdf.slice()], { type: 'application/pdf' }), `${stemOf(path)}.pdf`);
      else {
        // 4 × its size in points: about 290 dpi
        const { canvas } = await pdfPageCanvas(preview.pdf, () => 4);
        canvas.toBlob((blob) => blob && download(blob, `${stemOf(path)}.png`), 'image/png');
      }
    } catch (err) {
      toast(`Couldn’t export ${name}: ${errorText(err)}`, { tone: 'error' });
    }
  };

  const fix = async () => {
    const source = latest.current.key;
    setFixing(true);
    try {
      const errors = preview.errors.filter((e) => e.severity === 'error').map((e) => `${e.line ? `line ${e.line}: ` : ''}${e.message}`);
      const res = await runAgent({
        task: 'fix_diagram',
        prompt: [
          `This standalone ${language === 'typst' ? 'Typst' : 'LaTeX'} file (${mode?.label ?? 'a diagram'}) has errors when it compiles.`,
          errors.length ? `Errors:\n${errors.join('\n')}` : preview.failure || '',
          `End of the log:\n${preview.log.slice(-3000)}`,
          'Fix it and give the whole corrected file as the suggestion, without code fences. Keep the picture as it is apart from the fix.'
        ]
          .filter(Boolean)
          .join('\n\n'),
        selection: '',
        content: text,
        mode: 'direct',
        projectId,
        activePath: path,
        llmConfig: llmConfigFor(settings, 'main'),
        reasoningEffort: settings.reasoningEffort
      });
      const fixed = (res.suggestion || '').replace(/^\s*```[a-z]*\n|\n```\s*$/g, '');
      if (!res.ok) toast(res.reply || 'The request failed.', { tone: 'error' });
      else if (latest.current.key !== source) toast('The diagram changed while the fix was being prepared. Your newer edits were kept; request the fix again.');
      else if (language === 'typst' ? !fixed.includes('#diagram(') : !fixed.includes('\\begin{document}')) toast(res.reply || 'No fix was proposed.');
      else {
        setDoc((d) => ({ ...d, hand: fixed }));
        setEditedNote(true);
        setTab('code');
        toast('The fix is in the Code tab.', { tone: 'success' });
      }
    } catch (err) {
      toast(`Couldn’t get a fix: ${errorText(err)}`, { tone: 'error' });
    } finally {
      setFixing(false);
    }
  };

  const jumpTo = (line: number) => {
    setTab('code');
    window.setTimeout(() => {
      const view = codeView.current;
      if (!view) return;
      const at = view.state.doc.line(Math.min(Math.max(1, line), view.state.doc.lines));
      view.dispatch({ selection: { anchor: at.from, head: at.to }, scrollIntoView: true });
      view.focus();
    });
  };

  const redraw = () => {
    setDoc((d) => ({ ...d, hand: null }));
    setEditedNote(false);
    setTab('draw');
  };

  const h = history.current;
  const chip = language === 'mermaid' ? 'Mermaid' : language === 'typst' ? 'Typst · fletcher' : mode ? `TikZ · ${mode.label.replace(/\s*\(.*\)$/, '')}` : 'TikZ';
  const StyleMenu = drawable && doc.hand === null ? mode?.StyleMenu : undefined;

  return (
    <div className="diagram-app">
      <header className="diagram-header" data-tauri-drag-region>
        <div className="diagram-title" data-tauri-drag-region>
          <span className="diagram-name" title={path}>
            {name}
          </span>
          <span className="chip">{chip}</span>
          <span className="diagram-saved" role="status">
            {conflict ? 'Not saved' : dirty ? 'Saving…' : 'Saved'}
          </span>
        </div>
        {drawable && (
          <Tabs
            className="diagram-tabs"
            value={tab}
            onChange={setTab}
            items={[
              { value: 'draw', label: 'Draw' },
              { value: 'code', label: 'Code' }
            ]}
          />
        )}
        <span className="spacer" data-tauri-drag-region />
        {drawable && (
          <>
            <button className="icon-btn" title={`Undo (${formatShortcut('Mod-z')})`} aria-label="Undo" disabled={!h.past.length && (!doc.diagram || snapshotOf(doc.diagram) === h.now)} onClick={() => step(true)}>
              <Icon name="arrow.uturn.backward" />
            </button>
            <button className="icon-btn" title={`Redo (${formatShortcut('Shift-Mod-z')})`} aria-label="Redo" disabled={!h.future.length} onClick={() => step(false)}>
              <Icon name="arrow.uturn.forward" />
            </button>
          </>
        )}
        {canEdit && mode?.remove && (
          <MenuButton
            icon="ellipsis.circle"
            title="Edit"
            align="end"
            items={[
              { label: 'Copy', onSelect: () => edits.copy(), disabled: !selection.length, shortcut: formatShortcut('Mod-c') },
              { label: 'Paste', onSelect: () => edits.paste(), disabled: !clipboard.current, shortcut: formatShortcut('Mod-v') },
              { label: 'Duplicate', onSelect: () => duplicate(), disabled: !selection.length, shortcut: formatShortcut('Mod-d') },
              { separator: true },
              { label: 'Delete', destructive: true, onSelect: () => edits.remove(), disabled: !selection.length, shortcut: '⌫' }
            ]}
          />
        )}
        {StyleMenu && (
          <div className="diagram-style">
            <button className={`btn small${styleOpen ? ' open' : ''}`} aria-expanded={styleOpen} onClick={() => setStyleOpen((v) => !v)}>
              <Icon name="slider.horizontal.3" /> Style
            </button>
            {styleOpen && (
              <>
                <div className="diagram-style-scrim" onMouseDown={() => setStyleOpen(false)} />
                <div className="diagram-style-panel" onKeyDown={(e) => e.key === 'Escape' && setStyleOpen(false)}>
                  <StyleMenu style={doc.diagram!.style} onChange={setStyle} />
                </div>
              </>
            )}
          </div>
        )}
        {drawable && (
          <button className="btn small" title={`Compile (${formatShortcut('Mod-Enter')})`} onClick={() => compile()}>
            <Icon name="play.fill" /> Compile
          </button>
        )}
        <button className="btn small" title={`Save (${formatShortcut('Mod-s')})`} onClick={refresh}>
          <Icon name="square.and.arrow.down" /> Save
        </button>
        <button className="btn small primary" onClick={insert}>
          <Icon name="text.insert" /> Insert as figure
        </button>
        <MenuButton
          label="Export"
          className="btn small"
          align="end"
          items={
            language === 'mermaid'
              ? [{ label: 'PDF', onSelect: () => exportAs('pdf') }, { label: 'PNG image', onSelect: () => exportAs('png') }]
              : [
                  { label: 'PDF', onSelect: () => exportAs('pdf'), disabled: !preview.pdf || preview.state !== 'ok' || preview.source !== key },
                  { label: 'PNG image', onSelect: () => exportAs('png'), disabled: !preview.pdf || preview.state !== 'ok' || preview.source !== key }
                ]
          }
        />
      </header>

      {conflict && (
        <div className="diagram-banner warning" role="alert">
          <span className="grow">{conflict === 'deleted' ? `${name} was deleted outside the composer.` : `${name} was changed outside the composer.`}</span>
          <button
            className="btn small"
            onClick={() =>
              save(true).then((ok) => {
                if (ok) refresh();
              })
            }
          >
            {conflict === 'deleted' ? 'Save it again' : 'Keep this version'}
          </button>
          {conflict === 'changed' && (
            <button className="btn small" onClick={onReload}>
              Open the changed file
            </button>
          )}
        </div>
      )}
      {drawable && doc.hand !== null && editedNote && (
        <div className="diagram-banner" role="status">
          <span className="grow">Edited by hand: the drawing no longer matches the code.</span>
          <button className="btn small" onClick={redraw}>
            Redraw from the canvas (replaces your edits)
          </button>
          <button className="btn small" onClick={() => setEditedNote(false)}>
            Keep as code
          </button>
        </div>
      )}
      {!mode && language !== 'mermaid' && (
        <div className="diagram-banner" role="status">
          <span className="grow">This file has no drawing Spectrum can open, so it opens as code.</span>
        </div>
      )}

      <div className="diagram-main">
        {tab === 'draw' && mode?.Rail && (
          <aside className="diagram-rail">
            <mode.Rail tool={tool} onPick={setTool} />
          </aside>
        )}
        <div className="diagram-centre">
          {/* the canvas colour, for a canvas that isn't React Flow (circuitikz.css) */}
          <div className="diagram-stage" data-canvas={prefs.dark ? 'dark' : 'light'}>
            {tab === 'draw' && mode && doc.diagram ? (
              <ReactFlowProvider>
                <CanvasPrefsContext.Provider value={{ ...prefs, onPrefs: choosePrefs }}>
                  <mode.Canvas
                    model={doc.diagram.model}
                    onChange={setModel}
                    style={doc.diagram.style}
                    readOnly={doc.hand !== null}
                    selection={selection}
                    onSelect={setSelection}
                    tool={tool}
                    onTool={setTool}
                  />
                  {drawable && <CanvasControls prefs={prefs} onPrefs={choosePrefs} />}
                </CanvasPrefsContext.Provider>
              </ReactFlowProvider>
            ) : (
              <CodePane
                value={text}
                tex={language === 'tikz'}
                viewRef={codeView}
                onChange={(typed) => {
                  setDoc((d) => ({ ...d, hand: typed }));
                  if (doc.hand === null) setEditedNote(true);
                }}
              />
            )}
          </div>
          {drawable && <Preview preview={preview} stale={preview.source !== key} fixing={fixing} onFix={fix} onJump={jumpTo} />}
        </div>
        {canEdit && mode?.Inspector && doc.diagram && (
          <aside className="diagram-inspector">
            <mode.Inspector model={doc.diagram.model} onChange={setModel} selection={selection} />
          </aside>
        )}
      </div>
    </div>
  );
}
