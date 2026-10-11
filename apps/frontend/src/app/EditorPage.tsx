import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { EditorState, Prec } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { indentLess } from '@codemirror/commands';
import { search } from '@codemirror/search';
import { autocompletion } from '@codemirror/autocomplete';
import { foldService, syntaxHighlighting } from '@codemirror/language';
import { applyPatch, structuredPatch } from 'diff';
import {
  ApiError,
  blobUrl,
  compileProject,
  createVersion as saveVersion,
  getFile,
  getProjectTree,
  listProjects,
  revealProject,
  runAgent,
  saveThumbnail,
  setProjectMainFile,
  changeSpellWord,
  spellSuggest,
  writeFile
} from '../api/client';
import type { CompileEngine, FileItem, FileOrderMap, ProjectMeta, VersionReason } from '../api/client';
import { latex } from '../latex/lang';
import Icon from './Icon';
import Tabs from './Tabs';
import Sheet from './Sheet';
import SettingsSheet from './SettingsSheet';
import { ContextMenu, MenuButton } from './Menu';
import type { MenuItems } from './Menu';
import { promptDialog } from './Dialogs';
import { toast } from './Toast';
import { IS_DESKTOP } from './desktop';
import { COMPILE_ENGINES, effectiveEffort, llmConfigFor, useProviders, useSettings } from './settings';
import { SHORTCUTS, editorBasics, matchesShortcut, matchesZoomIn, shortcutKey, withShortcut } from './shortcuts';
import type { AppCommand } from './shortcuts';
import { EditorContext } from '../editor/EditorContext';
import type { CompileError, EditorApi, PendingChange } from '../editor/EditorContext';
import Composer from '../editor/Composer';
import ChatsList from '../editor/ChatsList';
import ToolsPanel from '../editor/ToolsPanel';
import GrammarPanel, { grammarMarks } from '../editor/GrammarPanel';
import { ignoreSpelling, misspeltAt, recheckSpelling, spellChecker } from '../editor/spellcheck';
import type { ToolsTab } from '../editor/ToolsPanel';
import ReviewChangesSheet from '../editor/ReviewChangesSheet';
import FileTree from '../editor/FileTree';
import type { FileTreeHandle } from '../editor/FileTree';
import PdfPreview, { MAX_ZOOM, MIN_ZOOM, pdfThumbnail } from '../editor/PdfPreview';
import type { PdfAnnotation, PdfHandle, PdfOutlineItem, PdfZoom } from '../editor/PdfPreview';
import { parseCompileLog, projectFile } from '../editor/compileLog';
import {
  currentEnvironment,
  editorTheme,
  ghostField,
  latexCompletionSource,
  latexFoldService,
  closeEnvironment,
  completeOrAccept,
  indentation,
  insertIndent,
  latexHighlight,
  nearestHeading,
  parseOutline,
  programmatic,
  scopeGutter,
  setGhost,
  wrapLayout
} from '../editor/latexEditor';
import { VERSIONS_CHANGED, errorText, extractBibKey, figureSnippet } from '../editor/shared';

// ─── helpers ───

const TEXT_FILE = /\.(tex|bib|sty|cls|bst|bbx|cbx|lbx|cfg|def|clo|ltx|dtx|txt|md|json|ya?ml|csv|tsv)$|(^|\/)\.latexmkrc$/i;
const FIGURE_FILE = /\.(png|jpe?g|pdf|svg|eps)$/i;
const IMAGE_FILE = /\.(png|jpe?g|svg|gif)$/i;
const isTex = (p: string) => /\.tex$/i.test(p);
const nameOf = (p: string) => p.slice(p.lastIndexOf('/') + 1);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const MAX_TABS = 6;
const timeFormat = new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit' });
const engineLabel = (engine: string) => COMPILE_ENGINES.find(([value]) => value === engine)?.[1] || engine;

/** The first text file, or '' when it's 1 MB or more: with no .tex to show, never open a huge log or data file unasked. */
async function smallTextFile(projectId: string, items: FileItem[]) {
  const path = items.find((i) => i.type === 'file' && TEXT_FILE.test(i.path))?.path;
  if (!path) return '';
  const head = await fetch(blobUrl(projectId, path), { method: 'HEAD' }).catch(() => null);
  const size = head?.ok ? head.headers.get('Content-Length') : null;
  return size !== null && Number(size) < 1024 * 1024 ? path : '';
}

// the compiler picked in the PDF header lasts for the session, across projects
let sessionEngine: CompileEngine | null = null;

/** pdfZoom and darkPages are the PDF view, kept between launches like the columns */
type Layout = { sidebarCollapsed: boolean; split: number; outlineOpen: boolean; pdfZoom: PdfZoom; darkPages: boolean };
const LAYOUT_KEY = 'spectrum-editor-layout';
const DEFAULT_LAYOUT: Layout = { sidebarCollapsed: false, split: 0.46, outlineOpen: true, pdfZoom: 'width', darkPages: true };

function loadLayout(): Layout {
  try {
    const saved = { ...DEFAULT_LAYOUT, ...JSON.parse(window.localStorage.getItem(LAYOUT_KEY) || '{}') };
    const zoom = saved.pdfZoom;
    if (!(zoom === 'fit' || zoom === 'width' || (typeof zoom === 'number' && zoom >= MIN_ZOOM && zoom <= MAX_ZOOM))) saved.pdfZoom = 'width';
    return saved;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

const ZOOMS: [PdfZoom, string][] = [
  ['width', 'Fit width'],
  ['fit', 'Fit page'],
  [0.5, '50%'],
  [0.75, '75%'],
  [1, '100%'],
  [1.25, '125%'],
  [1.5, '150%'],
  [2, '200%']
];

type Snippet = { label: string; icon: string; text: string; select: string; block?: boolean };
const SNIPPETS: (Snippet | null)[] = [
  { label: 'Section', icon: 'number', text: '\\section{Section title}', select: 'Section title', block: true },
  { label: 'Subsection', icon: 'list.bullet.indent', text: '\\subsection{Subsection title}', select: 'Subsection title', block: true },
  { label: 'Subsubsection', icon: 'list.bullet.indent', text: '\\subsubsection{Subsubsection title}', select: 'Subsubsection title', block: true },
  null,
  { label: 'Itemize', icon: 'list.bullet', text: '\\begin{itemize}\n    \\item First item\n\\end{itemize}', select: 'First item', block: true },
  { label: 'Enumerate', icon: 'list.number', text: '\\begin{enumerate}\n    \\item First item\n\\end{enumerate}', select: 'First item', block: true },
  { label: 'Equation', icon: 'function', text: '\\begin{equation}\n    E = mc^2\n    \\label{eq:name}\n\\end{equation}', select: 'E = mc^2', block: true },
  {
    label: 'Algorithm',
    icon: 'arrow.triangle.branch',
    text: '\\begin{algorithm}[t]\n    \\caption{Algorithm name}\n    \\label{alg:name}\n    \\begin{algorithmic}[1]\n        \\State Initialise\n    \\end{algorithmic}\n\\end{algorithm}',
    select: 'Algorithm name',
    block: true
  },
  null,
  {
    label: 'Figure',
    icon: 'photo',
    text: '\\begin{figure}[t]\n    \\centering\n    \\includegraphics[width=0.9\\linewidth]{figures/example.png}\n    \\caption{Caption.}\n    \\label{fig:name}\n\\end{figure}',
    select: 'figures/example.png',
    block: true
  },
  {
    label: 'Table',
    icon: 'tablecells',
    text: '\\begin{table}[t]\n    \\centering\n    \\begin{tabular}{lcc}\n        \\toprule\n        Method & A & B \\\\\n        \\midrule\n        Ours & 0.0 & 0.0 \\\\\n        \\bottomrule\n    \\end{tabular}\n    \\caption{Table caption.}\n    \\label{tab:name}\n\\end{table}',
    select: 'Table caption.',
    block: true
  },
  {
    label: 'Code listing',
    icon: 'chevron.left.forwardslash.chevron.right',
    text: '\\begin{lstlisting}[language=Python]\n# code here\n\\end{lstlisting}',
    select: '# code here',
    block: true
  },
  null,
  { label: 'Citation', icon: 'quote.opening', text: '\\cite{key}', select: 'key' },
  { label: 'Reference', icon: 'link', text: '\\ref{label}', select: 'label' },
  { label: 'Label', icon: 'tag', text: '\\label{label}', select: 'label' }
];

type CompileState = { state: 'idle' | 'running' | 'ok' | 'failed'; engine: CompileEngine | string; at?: Date; slow?: boolean };

export default function EditorPage() {
  const { projectId = '' } = useParams();
  // a fresh editor per project, so open files, chats and the PDF never leak between projects
  return <Editor key={projectId} projectId={projectId} />;
}

function Editor({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const [settings] = useSettings();
  const providers = useProviders();
  // read by the key handlers and the spell checker, which are set up once
  const shortcutsRef = useRef(settings.shortcuts);
  shortcutsRef.current = settings.shortcuts;
  const spellOnRef = useRef(settings.spellCheck);
  spellOnRef.current = settings.spellCheck;
  const spellFailedRef = useRef(false);
  const llm = useMemo(
    () => ({
      main: llmConfigFor(settings, 'main'),
      search: llmConfigFor(settings, 'search'),
      vision: llmConfigFor(settings, 'vision'),
      quick: llmConfigFor(settings, 'quick')
    }),
    [settings]
  );
  const notify = (message: string, tone: 'info' | 'success' | 'error' = 'info') => toast(message, { tone });

  // ─── state ───

  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const project = projects.find((p) => p.id === projectId);

  const [items, setItems] = useState<FileItem[]>([]);
  const [fileOrder, setFileOrder] = useState<FileOrderMap>({});
  const [mainFile, setMainFile] = useState('');
  const [loaded, setLoaded] = useState(false);
  /** file contents by path; the open file's entry follows every keystroke */
  const filesRef = useRef(new Map<string, string>());
  /** editor state (undo history, cursor) per file that has been open */
  const statesRef = useRef(new Map<string, EditorState>());

  const [activePath, setActivePath] = useState('');
  const activeRef = useRef('');
  const [tabs, setTabs] = useState<string[]>([]);
  const usedRef = useRef(new Map<string, number>());
  const [editorValue, setEditorValue] = useState('');
  const [selectionRange, setSelectionRange] = useState<[number, number]>([0, 0]);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const viewRef = useRef<EditorView | null>(null);
  /** the user has clicked, moved or typed in the open file (its cursor isn't just where the file opened) */
  const cursorPlacedRef = useRef(false);
  const extensionsRef = useRef<Extension[]>([]);
  const hostRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const writeChain = useRef<Promise<unknown>>(Promise.resolve());

  const [suggesting, setSuggesting] = useState(false);
  const [ghostText, setGhostText] = useState('');
  const [ghostPos, setGhostPos] = useState<{ left: number; top: number } | null>(null);
  const ghostRef = useRef<{ text: string; pos: number | null }>({ text: '', pos: null });
  const acceptingRef = useRef(false);

  const [engine, setEngine] = useState<CompileEngine>(() => sessionEngine || settings.compileEngine);
  const [compile, setCompile] = useState<CompileState>({ state: 'idle', engine });
  const compilingRef = useRef(false);
  const [compileLog, setCompileLog] = useState('');
  const [compileFailure, setCompileFailure] = useState('');
  const [pdf, setPdf] = useState<{ url: string; blob: boolean } | null>(null);
  const [pdfPages, setPdfPages] = useState<number | null>(null);
  const [pdfOutline, setPdfOutline] = useState<PdfOutlineItem[]>([]);
  const [scale, setScale] = useState(1);
  const [page, setPage] = useState(1);
  const [spread, setSpread] = useState(false);
  const [annotate, setAnnotate] = useState(false);
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([]);
  const [tocOpen, setTocOpen] = useState(false);
  const pdfRef = useRef<PdfHandle>(null);
  const tocRef = useRef<HTMLDivElement>(null);

  const [layout, setLayoutState] = useState(loadLayout);
  const setLayout = (patch: Partial<Layout>) => setLayoutState((prev) => ({ ...prev, ...patch }));
  const zoom = layout.pdfZoom;
  const setZoom = (pdfZoom: PdfZoom) => setLayout({ pdfZoom });
  const [toolsOpen, setToolsOpen] = useState(false);
  // the grammar check takes the PDF's place while it's open, as Tools does
  const [grammarOpen, setGrammarOpen] = useState(false);
  const [spellMenu, setSpellMenu] = useState<{ x: number; y: number; from: number; to: number; word: string; suggestions: string[] | null } | null>(null);
  const [toolsMounted, setToolsMounted] = useState(false);
  const [toolsTab, setToolsTab] = useState<ToolsTab>('info');
  const [sidebarTab, setSidebarTab] = useState<'files' | 'chats'>('files');
  const [searchOpen, setSearchOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [focusSignal, setFocusSignal] = useState(0);
  const [pending, setPending] = useState<PendingChange[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preview, setPreview] = useState('');
  const treeRef = useRef<FileTreeHandle>(null);
  const panelRef = useRef<HTMLElement>(null);

  // ─── derived ───

  const texFiles = useMemo(() => items.filter((i) => i.type === 'file' && isTex(i.path)).map((i) => i.path), [items]);
  const bibFiles = useMemo(() => items.filter((i) => i.type === 'file' && /\.bib$/i.test(i.path)).map((i) => i.path), [items]);
  // compiled PDFs (x.pdf next to x.tex) aren't figures
  const figureFiles = useMemo(
    () =>
      items
        .filter((i) => i.type === 'file' && FIGURE_FILE.test(i.path) && !(/\.pdf$/i.test(i.path) && texFiles.includes(i.path.replace(/\.pdf$/i, '.tex'))))
        .map((i) => i.path),
    [items, texFiles]
  );
  const mainPdf = mainFile ? mainFile.replace(/\.tex$/i, '.pdf') : '';
  const compileErrors = useMemo<CompileError[]>(() => {
    const files = items.map((i) => i.path);
    const parsed = parseCompileLog(compileLog, project?.path).map((e) => (e.file ? { ...e, file: projectFile(e.file, mainFile, files) } : e));
    return compileFailure && !parsed.some((e) => e.severity === 'error') ? [{ severity: 'error', message: compileFailure }, ...parsed] : parsed;
  }, [compileLog, compileFailure, project?.path, items, mainFile]);
  const selectionText = selectionRange[0] === selectionRange[1] ? '' : editorValue.slice(selectionRange[0], selectionRange[1]);

  useEffect(() => {
    try {
      window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
    } catch {
      // storage unavailable: the layout just isn't remembered
    }
  }, [layout]);

  // ─── files ───

  const refreshTree = async () => {
    const res = await getProjectTree(projectId);
    setItems(res.items);
    setFileOrder(res.fileOrder || {});
    return res;
  };

  const ensureFileContent = async (path: string) => {
    const cached = filesRef.current.get(path);
    if (cached !== undefined) return cached;
    const { content } = await getFile(projectId, path);
    filesRef.current.set(path, content);
    return content;
  };

  /** One write at a time, so an autosave can never land after a newer write. */
  const queueWrite = (path: string, content: string) => {
    const job = writeChain.current.then(() => writeFile(projectId, path, content));
    writeChain.current = job.catch(() => undefined);
    return job;
  };

  const markClean = () => {
    dirtyRef.current = false;
    setDirty(false);
  };

  const saveNow = async (announce = false) => {
    const path = activeRef.current;
    const view = viewRef.current;
    if (!path || !view) return;
    if (dirtyRef.current) {
      const content = view.state.doc.toString();
      markClean();
      try {
        await queueWrite(path, content);
      } catch (err) {
        dirtyRef.current = true;
        setDirty(true);
        notify(`Couldn’t save ${nameOf(path)}: ${errorText(err)}`, 'error');
        return;
      }
    }
    if (announce) notify(`Saved ${nameOf(path)}`, 'success');
  };

  /** Replaces the open document without counting it as typing (it stays undoable). */
  const setDoc = (content: string) => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === content) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content }, annotations: programmatic.of(true) });
  };

  const showEmptyEditor = () => {
    activeRef.current = '';
    setActivePath('');
    markClean();
    viewRef.current?.setState(EditorState.create({ doc: '', extensions: extensionsRef.current }));
    setEditorValue('');
    setSelectionRange([0, 0]);
  };

  const openFile = async (path: string) => {
    if (!path) return;
    if (!TEXT_FILE.test(path)) {
      if (path === mainPdf) {
        setToolsOpen(false);
        if (!pdf) setPdf({ url: blobUrl(projectId, path, Date.now()), blob: false });
      } else {
        setPreview(path);
      }
      return;
    }
    const view = viewRef.current;
    if (!view) return;
    usedRef.current.set(path, Date.now());
    if (path !== activeRef.current) {
      await saveNow();
      const content = await ensureFileContent(path);
      // typed into the old file while the new one loaded
      if (dirtyRef.current) await saveNow();
      if (activeRef.current) statesRef.current.set(activeRef.current, view.state);
      const saved = statesRef.current.get(path);
      clearGhost();
      view.setState(saved && saved.doc.toString() === content ? saved : EditorState.create({ doc: content, extensions: extensionsRef.current }));
      activeRef.current = path;
      cursorPlacedRef.current = false;
      setActivePath(path);
      setEditorValue(content);
      const sel = view.state.selection.main;
      setSelectionRange([sel.from, sel.to]);
      markClean();
    }
    setTabs((prev) => {
      if (prev.includes(path)) return prev;
      const next = [...prev, path];
      if (next.length <= MAX_TABS) return next;
      const used = usedRef.current;
      const oldest = next.filter((p) => p !== path).sort((a, b) => (used.get(a) || 0) - (used.get(b) || 0))[0];
      return next.filter((p) => p !== oldest);
    });
  };

  /** For clicks: report a failed open instead of leaving a rejected promise behind. */
  const open = (path: string) => {
    openFile(path).catch((err) => notify(`Couldn’t open ${nameOf(path)}: ${errorText(err)}`, 'error'));
  };

  const closeTab = async (path: string) => {
    const rest = tabs.filter((p) => p !== path);
    statesRef.current.delete(path);
    if (path === activeRef.current) {
      await saveNow();
      const next = rest[Math.min(tabs.indexOf(path), rest.length - 1)];
      setTabs(rest);
      if (next) await openFile(next);
      else showEmptyEditor();
      return;
    }
    setTabs(rest);
  };

  const writeProjectFile = async (path: string, content: string) => {
    if (path === activeRef.current) markClean();
    await queueWrite(path, content);
    filesRef.current.set(path, content);
    if (path === activeRef.current) setDoc(content);
    if (!items.some((i) => i.path === path)) await refreshTree();
  };

  const reloadFiles = async (paths: string[]) => {
    for (const path of paths) {
      const { content } = await getFile(projectId, path);
      filesRef.current.set(path, content);
      if (path === activeRef.current) {
        markClean();
        setDoc(content);
      }
    }
  };

  /** Files replaced by an upload: forget their cached text and undo history, and show the new contents. */
  const onUploaded = async (paths: string[]) => {
    for (const path of paths) statesRef.current.delete(path);
    await reloadFiles(paths.filter((p) => filesRef.current.has(p) || p === activeRef.current));
  };

  const reloadProject = async () => {
    setPending([]);
    filesRef.current.clear();
    statesRef.current.clear();
    const res = await refreshTree();
    const exists = (p: string) => res.items.some((i) => i.path === p && i.type === 'file');
    const keep = [activeRef.current, mainFile].find((p) => p && exists(p)) || (await smallTextFile(projectId, res.items));
    setTabs((prev) => prev.filter(exists));
    showEmptyEditor();
    if (keep) await openFile(keep);
  };

  const chooseMain = (path: string, quiet = false) => {
    setMainFile(path);
    setProjectMainFile(projectId, path)
      .then(() => !quiet && notify(`${nameOf(path)} is now the main file`, 'success'))
      .catch((err) => notify(`Couldn’t set the main file: ${errorText(err)}`, 'error'));
  };

  const onMoved = (from: string, to: string) => {
    const remap = (p: string) => (p === from ? to : p.startsWith(`${from}/`) ? to + p.slice(from.length) : p);
    for (const cache of [filesRef.current, statesRef.current] as Map<string, unknown>[]) {
      for (const [key, value] of [...cache]) {
        if (remap(key) === key) continue;
        cache.delete(key);
        cache.set(remap(key), value);
      }
    }
    setTabs((prev) => prev.map(remap));
    setPending((prev) => prev.map((c) => ({ ...c, filePath: remap(c.filePath) })));
    if (activeRef.current && remap(activeRef.current) !== activeRef.current) {
      activeRef.current = remap(activeRef.current);
      setActivePath(activeRef.current);
    }
    if (mainFile && remap(mainFile) !== mainFile) chooseMain(remap(mainFile), true);
  };

  const onDeleted = (path: string) => {
    const gone = (p: string) => p === path || p.startsWith(`${path}/`);
    for (const cache of [filesRef.current, statesRef.current] as Map<string, unknown>[]) {
      for (const key of [...cache.keys()]) if (gone(key)) cache.delete(key);
    }
    const rest = tabs.filter((p) => !gone(p));
    setTabs(rest);
    setPending((prev) => prev.filter((c) => !gone(c.filePath)));
    if (gone(activeRef.current)) {
      // forget the editor contents first, so an autosave can't bring the file back
      showEmptyEditor();
      if (rest[0]) open(rest[0]);
    }
  };

  // keep a main file whenever there is a .tex file. Runs when the tree changes, not when the main file
  // does: a rename sets the new name before the refreshed tree contains it.
  useEffect(() => {
    if (!loaded || (mainFile && texFiles.includes(mainFile))) return;
    setMainFile(texFiles.find((p) => /(^|\/)main\.tex$/i.test(p)) || texFiles[0] || '');
  }, [loaded, texFiles]);

  // ─── editor actions ───

  const insertAtCursor = (text: string, opts: { block?: boolean; afterSelection?: boolean; focus?: boolean; placedOnly?: boolean } = {}) => {
    const view = viewRef.current;
    if (!view || !activeRef.current) {
      notify('Open a file first.');
      return null;
    }
    const sel = view.state.selection.main;
    const from = opts.afterSelection ? sel.to : sel.from;
    if (opts.placedOnly) {
      // a fresh file's cursor sits before \documentclass; only a spot the user picked in the body will do
      const body = view.state.doc.toString().indexOf('\\begin{document}');
      if (!cursorPlacedRef.current || (body !== -1 && from < body + '\\begin{document}'.length)) return null;
    }
    let insert = text;
    if (opts.block) {
      const before = from > 0 ? view.state.doc.sliceString(from - 1, from) : '';
      if (before && before !== '\n') insert = `\n${insert}`;
      if (!insert.endsWith('\n\n')) insert = insert.endsWith('\n') ? `${insert}\n` : `${insert}\n\n`;
    }
    view.dispatch({ changes: { from, to: sel.to, insert }, selection: { anchor: from + insert.length }, scrollIntoView: true });
    if (opts.focus !== false) view.focus();
    return { from, insert };
  };

  const insertSnippet = (snippet: Snippet) => {
    // every line after the first keeps the indent of the line the snippet goes into
    const view = viewRef.current;
    const indent = view ? /^[ \t]*/.exec(view.state.doc.lineAt(view.state.selection.main.from).text)![0] : '';
    const done = insertAtCursor(snippet.text.replace(/\n/g, `\n${indent}`), { block: snippet.block });
    const at = done ? done.insert.indexOf(snippet.select) : -1;
    if (done && at !== -1) viewRef.current?.dispatch({ selection: { anchor: done.from + at, head: done.from + at + snippet.select.length } });
  };

  const jumpTo = async (file: string, line: number) => {
    if (!items.some((i) => i.path === file)) {
      notify(`${file} isn’t one of this project’s files.`);
      return;
    }
    await openFile(file);
    const view = viewRef.current;
    if (!view || activeRef.current !== file) return;
    const target = view.state.doc.line(Math.min(Math.max(1, line), view.state.doc.lines));
    view.dispatch({ selection: { anchor: target.from }, effects: EditorView.scrollIntoView(target.from, { y: 'center' }) });
    cursorPlacedRef.current = true;
    view.focus();
  };

  const select = async (file: string, from: number, to = from) => {
    await openFile(file);
    const view = viewRef.current;
    if (!view || activeRef.current !== file) return;
    const end = Math.min(to, view.state.doc.length);
    view.dispatch({ selection: { anchor: Math.min(from, end), head: end }, effects: EditorView.scrollIntoView(from, { y: 'center' }) });
    cursorPlacedRef.current = true;
    view.focus();
  };

  /**
   * Click on PDF text: find the line in the open file first, then in the other .tex files.
   * Source line breaks may sit anywhere, a hyphenated last word won't match and macros
   * change the text, so shorter word runs are tried when the whole line isn't found.
   */
  const findInSource = async (text: string) => {
    const words = text.replace(/\S*-$/, '').trim().split(/\s+/).filter(Boolean);
    const runs = [words, words.slice(0, 6), words.slice(0, 4)].filter((run, i, all) => run.join(' ').length >= 4 && all.findIndex((r) => r.length === run.length) === i);
    const order = [activeRef.current, ...texFiles].filter((p, i, all) => isTex(p) && all.indexOf(p) === i);
    for (const run of runs) {
      const pattern = new RegExp(run.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'));
      for (const path of order) {
        const content = path === activeRef.current ? viewRef.current?.state.doc.toString() || '' : await ensureFileContent(path).catch(() => '');
        const match = pattern.exec(content);
        if (match) {
          await select(path, match.index, match.index + match[0].length);
          return;
        }
      }
    }
  };

  const writeBibEntries = async (entries: string[], bibFile?: string) => {
    const target = bibFile || bibFiles[0] || 'references.bib';
    let content = await ensureFileContent(target).catch(() => '');
    const keys: string[] = [];
    for (const raw of entries) {
      const entry = raw.replace(/\\n/g, '\n').trim();
      const key = extractBibKey(entry);
      if (!key) continue;
      keys.push(key);
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`@\\w+\\s*{\\s*${escaped}\\s*,`, 'i').test(content)) continue;
      content = `${content.replace(/\s*$/, '')}${content.trim() ? '\n\n' : ''}${entry}\n`;
    }
    await writeProjectFile(target, content);
    return { target, keys };
  };

  const createBibFile = async () => {
    // create-only, so a references.bib the tree hasn't shown yet (or in another letter case) is never replaced
    for (let n = 1; ; n += 1) {
      const path = n === 1 ? 'references.bib' : `references-${n}.bib`;
      if (items.some((i) => i.path === path)) continue;
      try {
        await writeFile(projectId, path, '% BibTeX entries\n', { create: true });
      } catch (err) {
        if (n < 50 && err instanceof ApiError && err.status === 409) continue;
        throw err;
      }
      await refreshTree();
      await openFile(path);
      return path;
    }
  };

  /**
   * A suggestion moved onto the file as it is now, keeping edits made since it was asked for.
   * ok is false when those edits overlap the suggestion: the change then shows the current file
   * against the suggestion, so the review shows exactly what accepting would replace.
   */
  const rebase = async (change: PendingChange) => {
    const current = await ensureFileContent(change.filePath).catch(() => '');
    if (current === change.original) return { change, ok: true };
    const merged = applyPatch(current, structuredPatch(change.filePath, change.filePath, change.original, change.proposed, undefined, undefined, { context: 1 }));
    return { change: { ...change, original: current, proposed: merged === false ? change.proposed : merged }, ok: merged !== false };
  };

  const replacePending = (list: PendingChange[]) => setPending((prev) => prev.map((p) => list.find((c) => c.filePath === p.filePath) || p));

  const openReview = async (list: PendingChange[]) => {
    replacePending((await Promise.all(list.map(rebase))).map((r) => r.change));
    setReviewOpen(true);
  };

  const proposeChanges = (changes: PendingChange[], opts?: { open?: boolean }) => {
    const useful = changes.filter((c) => c.original !== c.proposed);
    if (!useful.length) return;
    setPending((prev) => [...prev.filter((p) => !useful.some((c) => c.filePath === p.filePath)), ...useful]);
    if (opts?.open) openReview(useful).catch(() => setReviewOpen(true));
  };

  const createVersion = async (reason: VersionReason, label?: string) => {
    await saveNow();
    const res = await saveVersion(projectId, { reason, label });
    if (!res.ok) throw new Error('The version couldn’t be saved.');
    if (!res.unchanged) window.dispatchEvent(new Event(VERSIONS_CHANGED));
    return res;
  };

  const acceptChanges = async (list: PendingChange[]) => {
    const rebased = await Promise.all(list.map(rebase));
    const stale = rebased.filter((r) => !r.ok).map((r) => r.change);
    const ready = rebased.filter((r) => r.ok).map((r) => r.change);
    if (stale.length) {
      replacePending(stale);
      notify(
        stale.length === 1
          ? `“${nameOf(stale[0].filePath)}” has changed since this suggestion. Review it again.`
          : `${stale.length} files have changed since these suggestions. Review them again.`,
        'error'
      );
    }
    if (!ready.length) return;
    await createVersion('before-ai');
    for (const change of ready) await writeProjectFile(change.filePath, change.proposed);
    setPending((prev) => prev.filter((p) => !ready.some((c) => c.filePath === p.filePath)));
    notify(ready.length === 1 ? `Applied the changes to ${nameOf(ready[0].filePath)}` : `Applied changes to ${ready.length} files`, 'success');
  };

  // ─── AI autocomplete (ghost text) ───

  const placeGhost = (pos: number | null) => {
    const view = viewRef.current;
    const area = areaRef.current;
    const coords = pos == null ? null : view?.coordsAtPos(pos);
    if (!area || !coords) {
      setGhostPos(null);
      return;
    }
    const rect = area.getBoundingClientRect();
    const left = Math.min(Math.max(12, coords.left - rect.left), Math.max(12, rect.width - 330));
    let top = coords.bottom - rect.top + 8;
    if (top + 50 > rect.height) top = Math.max(8, coords.top - rect.top - 46);
    setGhostPos({ left, top });
  };

  function clearGhost() {
    if (ghostRef.current.pos == null) return false;
    ghostRef.current = { text: '', pos: null };
    setGhostText('');
    setGhostPos(null);
    viewRef.current?.dispatch({ effects: setGhost.of({ pos: null, text: '' }) });
    return true;
  }

  const suggest = async () => {
    const view = viewRef.current;
    const path = activeRef.current;
    if (!view || !path || suggesting) return;
    clearGhost();
    const pos = view.state.selection.main.head;
    const doc = view.state.doc.toString();
    const heading = nearestHeading(doc, pos);
    const env = currentEnvironment(doc.slice(0, pos));
    ghostRef.current = { text: '', pos };
    setSuggesting(true);
    placeGhost(pos);
    try {
      const res = await runAgent({
        task: 'autocomplete',
        prompt: [
          'You are a LaTeX writing assistant.',
          'Continue after <CURSOR> with a coherent next block (1-2 paragraphs or a full environment).',
          heading ? `Current section: ${heading.title}.` : '',
          env ? `You are inside the ${env} environment.` : '',
          'Preserve style and formatting.',
          'Return only the continuation text, no commentary.'
        ]
          .filter(Boolean)
          .join(' '),
        selection: '',
        content: `${doc.slice(Math.max(0, pos - 4000), pos)}<CURSOR>${doc.slice(pos, pos + 400)}`,
        mode: 'direct',
        projectId,
        activePath: path,
        compileLog,
        llmConfig: llm.quick
      });
      // a failed request explains itself in `reply`; that's not text to insert
      if (!res.ok) throw new Error(res.reply || 'The request failed.');
      const text = (res.suggestion || res.reply || '').trim();
      // only if the cursor is still where it was asked for
      if (!text || ghostRef.current.pos !== pos || activeRef.current !== path || viewRef.current !== view) return;
      ghostRef.current = { text, pos };
      setGhostText(text);
      view.dispatch({ effects: setGhost.of({ pos, text }) });
      placeGhost(pos);
    } catch (err) {
      notify(`Autocomplete failed: ${errorText(err)}`, 'error');
    } finally {
      setSuggesting(false);
      if (!ghostRef.current.text) clearGhost();
    }
  };

  const acceptGhost = (wordOnly = false) => {
    const view = viewRef.current;
    const { text, pos } = ghostRef.current;
    if (!view || !text || pos == null) return;
    const chunk = wordOnly ? text.match(/^\s*\S+\s*/)?.[0] || text : text;
    const rest = text.slice(chunk.length);
    acceptingRef.current = true;
    view.dispatch({ changes: { from: pos, insert: chunk }, selection: { anchor: pos + chunk.length } });
    acceptingRef.current = false;
    if (!rest) {
      clearGhost();
      return;
    }
    ghostRef.current = { text: rest, pos: pos + chunk.length };
    setGhostText(rest);
    view.dispatch({ effects: setGhost.of({ pos: pos + chunk.length, text: rest }) });
  };

  // ─── compile ───

  const runCompile = async () => {
    if (compilingRef.current) return;
    if (!mainFile) {
      notify('There’s no .tex file to compile. Add one, or choose “Set as main file” from a file’s menu.');
      return;
    }
    compilingRef.current = true;
    const used = engine;
    setCompile({ state: 'running', engine: used });
    try {
      await saveNow();
      const res = await compileProject({ projectId, mainFile, engine: used });
      const actual = res.engine || used;
      setCompileLog(`Engine: ${engineLabel(actual)}\nMain file: ${mainFile}\n\n${res.log || ''}`.trim());
      if (res.ok && res.pdf) {
        const bytes = Uint8Array.from(atob(res.pdf), (c) => c.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        const old = pdf;
        setPdf({ url, blob: true });
        if (old?.blob) window.setTimeout(() => URL.revokeObjectURL(old.url), 10_000);
        setCompileFailure('');
        setCompile({ state: 'ok', engine: actual, at: new Date() });
        if (res.pdfPath && !items.some((i) => i.path === res.pdfPath)) refreshTree().catch(() => undefined);
        pdfThumbnail(url)
          .then((png) => saveThumbnail(projectId, png))
          .catch(() => undefined);
      } else {
        setCompileFailure(res.error || 'No PDF was produced.');
        setCompile({ state: 'failed', engine: actual, at: new Date() });
      }
    } catch (err) {
      setCompileLog(`Compile request failed: ${errorText(err)}`);
      setCompileFailure(errorText(err));
      setCompile({ state: 'failed', engine: used, at: new Date() });
    } finally {
      compilingRef.current = false;
    }
  };

  // Tectonic fetches its packages the first time; say so instead of looking stuck
  useEffect(() => {
    if (compile.state !== 'running' || compile.engine !== 'tectonic') return;
    const timer = window.setTimeout(() => setCompile((c) => (c.state === 'running' ? { ...c, slow: true } : c)), 10_000);
    return () => window.clearTimeout(timer);
  }, [compile.state, compile.engine]);

  const chooseEngine = (value: CompileEngine) => {
    sessionEngine = value;
    setEngine(value);
  };

  // ─── panels ───

  const openTools = (tab?: ToolsTab) => {
    if (tab) setToolsTab(tab);
    setToolsMounted(true);
    setToolsOpen(true);
    setGrammarOpen(false);
  };

  const toggleGrammar = () => {
    if (grammarOpen) {
      setGrammarOpen(false);
      return;
    }
    setToolsOpen(false);
    setGrammarOpen(true);
  };

  const toggleComposer = () => {
    if (composerOpen) {
      setComposerOpen(false);
      viewRef.current?.focus();
    } else {
      setComposerOpen(true);
      setFocusSignal((n) => n + 1);
    }
  };

  const openChat = (id: string | null) => {
    setChatId(id);
    setComposerOpen(true);
    setFocusSignal((n) => n + 1);
  };

  const leave = async (to: string) => {
    await saveNow();
    navigate(to);
  };

  const startResize = (e: ReactMouseEvent) => {
    e.preventDefault();
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    document.body.classList.add('resizing-columns');
    const move = (ev: MouseEvent) => setLayout({ split: Math.min(0.72, Math.max(0.26, (rect.right - ev.clientX) / rect.width)) });
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      document.body.classList.remove('resizing-columns');
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const addAnnotation = async (pageNumber: number, x: number, y: number) => {
    const text = (await promptDialog({ title: 'Add a note', message: `Page ${pageNumber}`, placeholder: 'Note', confirmLabel: 'Add' }))?.trim();
    if (text) setAnnotations((prev) => [...prev, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, page: pageNumber, x, y, text }]);
  };

  const downloadPdf = () => {
    if (!pdf) return;
    const link = document.createElement('a');
    link.href = pdf.url;
    link.download = `${(project?.name || nameOf(mainPdf).replace(/\.pdf$/i, '') || 'document').replace(/[\\/:*?"<>|]+/g, '').trim() || 'document'}.pdf`;
    document.body.append(link);
    link.click();
    link.remove();
  };

  // shortcuts and CodeMirror key bindings call the newest handlers through this
  const actions = useRef({
    save: () => {},
    compile: () => {},
    toggleComposer: () => {},
    toggleGrammar: () => {},
    toggleSidebar: () => {},
    openSettings: () => {},
    zoomBy: (_steps: number) => {},
    fitWidth: () => {},
    suggest: () => {},
    acceptGhost: (_word: boolean) => {},
    clearGhost: () => false as boolean,
    placeGhost: () => {}
  });
  actions.current = {
    save: () => saveNow(true),
    compile: () => runCompile(),
    toggleComposer,
    toggleGrammar,
    toggleSidebar: () => setLayout({ sidebarCollapsed: !layout.sidebarCollapsed }),
    openSettings: () => setSettingsOpen(true),
    zoomBy: (steps: number) => pdf && zoomBy(steps),
    fitWidth: () => pdf && setZoom('width'),
    suggest: () => suggest(),
    acceptGhost,
    clearGhost,
    placeGhost: () => placeGhost(ghostRef.current.pos)
  };

  // ─── effects: unsaved edits, CodeMirror, first load, shortcuts ───

  // declared before CodeMirror so its cleanup runs while the view still exists
  useEffect(() => {
    // browsers refuse keepalive bodies over 64 KiB
    const keepaliveBody = () => {
      const body = JSON.stringify({ path: activeRef.current, content: viewRef.current?.state.doc.toString() ?? '' });
      return new Blob([body]).size <= 60 * 1024 ? body : null;
    };
    const flush = (keepalive: boolean) => {
      const path = activeRef.current;
      const view = viewRef.current;
      if (!dirtyRef.current || !path || !view) return;
      if (!keepalive) {
        dirtyRef.current = false;
        queueWrite(path, view.state.doc.toString()).catch(() => undefined);
        return;
      }
      const body = keepaliveBody();
      // too big: beforeunload has already started a normal save and held the page for it
      if (!body) return;
      dirtyRef.current = false;
      fetch(`/api/projects/${projectId}/file`, { method: 'PUT', keepalive: true, headers: { 'Content-Type': 'application/json' }, body }).catch(
        () => undefined
      );
    };
    const onHide = () => flush(true);
    // a file too big for keepalive is saved normally, and the browser's leave prompt holds the page until it lands
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current || keepaliveBody()) return;
      saveNow();
      e.preventDefault();
      e.returnValue = '';
    };
    // switching away (another app, another tab) saves with a normal request, which has no size limit
    const onVisibility = () => document.visibilityState === 'hidden' && saveNow();
    // the desktop shell calls this before it closes the window (pagehide may not run there)
    const hooks = window as Window & { __spectrumFlush?: () => Promise<void> };
    hooks.__spectrumFlush = () => saveNow();
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibility);
      delete hooks.__spectrumFlush;
      flush(false);
    };
  }, []);

  useEffect(() => {
    const a = () => actions.current;
    const listener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const value = update.state.doc.toString();
        const path = activeRef.current;
        if (path) filesRef.current.set(path, value);
        setEditorValue(value);
        if (path && !update.transactions.some((tr) => tr.annotation(programmatic))) {
          dirtyRef.current = true;
          setDirty(true);
        }
      }
      if (update.transactions.some((tr) => tr.isUserEvent('select') || tr.isUserEvent('input') || tr.isUserEvent('delete'))) cursorPlacedRef.current = true;
      if (update.docChanged || update.selectionSet) {
        const { from, to } = update.state.selection.main;
        setSelectionRange([from, to]);
        // typing or moving away drops a pending suggestion (accepting one doesn't)
        if (ghostRef.current.pos != null && !acceptingRef.current) {
          ghostRef.current = { text: '', pos: null };
          setGhostText('');
          setGhostPos(null);
        }
      }
    });
    const appCommands: Record<AppCommand, () => void> = {
      save: () => a().save(),
      compile: () => a().compile(),
      assistant: () => a().toggleComposer(),
      grammar: () => a().toggleGrammar(),
      suggest: () => a().suggest(),
      sidebar: () => a().toggleSidebar(),
      zoomIn: () => a().zoomBy(1),
      zoomOut: () => a().zoomBy(-1),
      zoomWidth: () => a().fitWidth()
    };
    // matched by hand rather than with keymap.of, which can't see ⌥ shortcuts on a Mac (⌥/ types "÷")
    const shortcuts = EditorView.domEventHandlers({
      keydown(e, view) {
        for (const s of SHORTCUTS) {
          const hit = s.id === 'zoomIn' ? matchesZoomIn(shortcutsRef.current, e) : matchesShortcut(shortcutKey(shortcutsRef.current, s.id), e);
          if (!hit) continue;
          const handled = s.run ? s.run(view) : (appCommands[s.id as AppCommand](), true);
          if (!handled) continue;
          e.preventDefault();
          return true;
        }
        return false;
      }
    });
    const keys = Prec.highest([
      shortcuts,
      keymap.of([
        { key: 'Tab', run: () => (ghostRef.current.text ? (a().acceptGhost(false), true) : false) },
        // with the completion list open, fill in or pick an entry
        { key: 'Tab', run: completeOrAccept },
        // otherwise indent: spaces at the cursor, or the selected lines (⇧Tab takes them back)
        { key: 'Tab', run: insertIndent, shift: indentLess },
        { key: 'Enter', run: closeEnvironment },
        {
          key: 'ArrowRight',
          run: (view) => (ghostRef.current.text && ghostRef.current.pos === view.state.selection.main.head ? (a().acceptGhost(true), true) : false)
        },
        { key: 'Escape', run: () => a().clearGhost() }
      ])
    ]);
    extensionsRef.current = [
      keys,
      editorBasics,
      indentation,
      wrapLayout,
      latex(),
      syntaxHighlighting(latexHighlight),
      foldService.of(latexFoldService),
      scopeGutter,
      EditorView.lineWrapping,
      editorTheme,
      ghostField,
      search({ top: true }),
      autocompletion({ override: [latexCompletionSource] }),
      spellChecker({
        enabled: () => spellOnRef.current,
        path: () => activeRef.current,
        projectId: () => projectId,
        onError: (message) => {
          // once a session is enough; the editor works on without it
          if (spellFailedRef.current) return;
          spellFailedRef.current = true;
          notify(message, 'error');
        }
      }),
      grammarMarks,
      listener
    ];
    const view = new EditorView({ state: EditorState.create({ doc: '', extensions: extensionsRef.current }), parent: hostRef.current! });
    viewRef.current = view;
    const onScroll = () => a().placeGhost();
    // right-click on a misspelt word: suggestions and the word lists instead of the browser menu
    const onContextMenu = (e: MouseEvent) => {
      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
      const hit = pos == null ? null : misspeltAt(view.state, pos);
      if (!hit) return;
      e.preventDefault();
      setSpellMenu({ x: e.clientX, y: e.clientY, ...hit, suggestions: null });
      spellSuggest(hit.word)
        .then((res) => setSpellMenu((m) => (m && m.from === hit.from ? { ...m, suggestions: res.suggestions } : m)))
        .catch(() => setSpellMenu((m) => (m && m.from === hit.from ? { ...m, suggestions: [] } : m)));
    };
    view.scrollDOM.addEventListener('scroll', onScroll, { passive: true });
    view.contentDOM.addEventListener('contextmenu', onContextMenu);
    return () => {
      view.scrollDOM.removeEventListener('scroll', onScroll);
      view.contentDOM.removeEventListener('contextmenu', onContextMenu);
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      const [list, tree] = await Promise.all([listProjects(), refreshTree()]);
      if (!live) return;
      setProjects(list.projects);
      const current = list.projects.find((p) => p.id === projectId);
      if (!current || current.missing) {
        notify(current ? `The folder of “${current.name}” is missing. Locate it from the projects list.` : 'That project isn’t in the list any more.', 'error');
        navigate('/projects', { replace: true });
        return;
      }
      const tex = tree.items.filter((i) => i.type === 'file' && isTex(i.path)).map((i) => i.path);
      const main = tree.mainFile && tex.includes(tree.mainFile) ? tree.mainFile : tex.find((p) => /(^|\/)main\.tex$/i.test(p)) || tex[0] || '';
      setMainFile(main);
      setLoaded(true);
      const first = main || (await smallTextFile(projectId, tree.items));
      if (first) await openFile(first);
      // show the PDF from the last compile straight away
      const existing = main.replace(/\.tex$/i, '.pdf');
      if (main && tree.items.some((i) => i.path === existing)) {
        const url = blobUrl(projectId, existing, Date.now());
        setPdf({ url, blob: false });
        if (!current.hasThumbnail) pdfThumbnail(url).then((png) => saveThumbnail(projectId, png)).catch(() => undefined);
      }
    })().catch((err) => notify(`Couldn’t open the project: ${errorText(err)}`, 'error'));
    return () => {
      live = false;
    };
  }, []);

  // the compiled PDF lives in a blob URL; free it when the page goes away
  const pdfNow = useRef(pdf);
  pdfNow.current = pdf;
  useEffect(
    () => () => {
      if (pdfNow.current?.blob) URL.revokeObjectURL(pdfNow.current.url);
    },
    []
  );

  useEffect(() => {
    if (project) document.title = `${project.name} – Spectrum`;
    return () => {
      document.title = 'Spectrum';
    };
  }, [project?.name]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const a = actions.current;
      const is = (id: AppCommand) => matchesShortcut(shortcutKey(shortcutsRef.current, id), e);
      if (is('save')) a.save();
      else if (is('compile')) a.compile();
      else if (is('assistant')) a.toggleComposer();
      else if (is('grammar')) a.toggleGrammar();
      else if (is('sidebar')) a.toggleSidebar();
      else if (matchesZoomIn(shortcutsRef.current, e)) a.zoomBy(1);
      else if (is('zoomOut')) a.zoomBy(-1);
      else if (is('zoomWidth')) a.fitWidth();
      else if (matchesShortcut('Mod-,', e)) a.openSettings();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // turning spell checking on or off in Settings applies straight away
  useEffect(() => {
    viewRef.current?.dispatch({ effects: recheckSpelling.of(null) });
  }, [settings.spellCheck]);

  // autosave 1.5 s after the last keystroke
  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(() => saveNow(), 1500);
    return () => window.clearTimeout(timer);
  }, [dirty, editorValue]);

  // the table of contents closes on any click elsewhere
  useEffect(() => {
    if (!tocOpen) return;
    const close = (e: Event) => {
      if (!tocRef.current?.contains(e.target as Node)) setTocOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setTocOpen(false);
    document.addEventListener('mousedown', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [tocOpen]);

  // ─── shared API for the composer, chats and Tools ───

  const api: EditorApi = {
    projectId,
    projectName: project?.name || '',
    projectPath: project?.path || '',
    activePath,
    mainFile,
    texFiles,
    bibFiles,
    figureFiles,
    selectionText,
    selectionRange,
    editorValue,
    compileLog,
    compileErrors,
    pdfPages,
    // a level the main model can't use is sent as its recommended one
    settings: { ...settings, reasoningEffort: effectiveEffort(settings, providers) },
    llm,
    notify,
    insertAtCursor: (text, opts) => {
      const done = insertAtCursor(text, opts);
      return done && viewRef.current ? viewRef.current.state.doc.lineAt(done.from + done.insert.length).number : null;
    },
    ensureFileContent,
    writeProjectFile,
    writeBibEntries,
    createBibFile,
    refreshTree: async () => {
      await refreshTree();
    },
    reloadProject,
    reloadFiles,
    openFile,
    jumpTo,
    proposeChanges,
    compile: runCompile,
    createVersion
  };

  // ─── render pieces ───

  const outlineFile = isTex(activePath) ? activePath : mainFile;
  const outlineText = outlineFile === activePath ? editorValue : filesRef.current.get(outlineFile) || '';
  const outline = useMemo(() => parseOutline(outlineText), [outlineText]);
  const outlineBase = Math.min(...outline.map((o) => o.level), 9);
  const currentHeading = outlineFile === activePath ? outline.filter((o) => o.pos <= selectionRange[0]).pop() : undefined;

  const problems = compileErrors.length;
  const errorCount = compileErrors.filter((e) => e.severity === 'error').length;
  const running = compile.state === 'running';
  const status =
    compile.state === 'running'
      ? compile.slow
        ? 'Tectonic is downloading packages on first use…'
        : 'Compiling…'
      : compile.state === 'ok' && compile.at
        ? `Compiled ${timeFormat.format(compile.at)}`
        : '';

  const switcherItems: MenuItems = [
    ...projects
      .filter((p) => !p.missing && (!p.archived || p.id === projectId))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 12)
      .map((p) => ({ label: p.name, checked: p.id === projectId, onSelect: () => p.id !== projectId && leave(`/editor/${p.id}`) })),
    { separator: true },
    { label: 'All projects', icon: 'square.grid.2x2', onSelect: () => leave('/projects') },
    IS_DESKTOP && { label: 'Show in Finder', icon: 'folder', onSelect: () => revealProject(projectId).catch(() => undefined) }
  ];

  const filesMenu: MenuItems = [
    { label: 'New file…', icon: 'doc.badge.plus', onSelect: () => treeRef.current?.beginCreate('file') },
    { label: 'New folder…', icon: 'folder.badge.plus', onSelect: () => treeRef.current?.beginCreate('folder') },
    { label: 'New .bib', icon: 'books.vertical', onSelect: () => createBibFile().catch((err) => notify(`Couldn’t create the .bib file: ${errorText(err)}`, 'error')) },
    { separator: true },
    { label: 'Upload files…', icon: 'square.and.arrow.up', onSelect: () => treeRef.current?.upload('files') },
    { label: 'Upload folder…', icon: 'tray.and.arrow.down', onSelect: () => treeRef.current?.upload('folder') }
  ];

  const insertItems: MenuItems = SNIPPETS.map((s) => (s ? { label: s.label, icon: s.icon, onSelect: () => insertSnippet(s) } : { separator: true }));

  const zoomLabel = ZOOMS.find(([z]) => z === zoom)?.[1] || `${Math.round(scale * 100)}%`;
  // in two-page view `page` is the left page of a row, so the next row starts two pages on
  const step = spread ? 2 : 1;
  // in steps of a tenth, the way a pinch scales; from the zoom already asked for, so quick presses add up
  const zoomBy = (steps: number) =>
    setLayoutState((prev) => {
      const from = typeof prev.pdfZoom === 'number' ? prev.pdfZoom : scale;
      return { ...prev, pdfZoom: Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, from * 1.1 ** steps)) * 100) / 100 };
    });

  return (
    <EditorContext.Provider value={api}>
      <div className={`app-shell editor-page ${layout.sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        {!layout.sidebarCollapsed && (
          <aside className="app-sidebar editor-sidebar">
            <div className="sidebar-top" data-tauri-drag-region>
              <img className="app-icon" src="/app-icon.png" alt="Spectrum" draggable={false} data-tauri-drag-region />
              <button className="icon-btn" title={withShortcut(settings.shortcuts, 'Hide sidebar', 'sidebar')} aria-label="Hide sidebar" onClick={() => setLayout({ sidebarCollapsed: true })}>
                <Icon name="sidebar.left" />
              </button>
            </div>

            <div className="sidebar-project">
              <MenuButton className="project-switcher" label={project?.name || 'Loading…'} items={switcherItems} title="Switch project" />
            </div>

            <div className="sidebar-tabs">
              <Tabs
                value={sidebarTab}
                onChange={(tab) => {
                  setSidebarTab(tab);
                  setFilter('');
                }}
                items={[
                  { value: 'files', label: 'Files' },
                  { value: 'chats', label: 'Chats' }
                ]}
              />
              <span className="spacer" />
              <button
                className={`icon-btn small ${searchOpen ? 'active' : ''}`}
                title={sidebarTab === 'files' ? 'Search files' : 'Search chats'}
                aria-label="Search"
                onClick={() => {
                  setSearchOpen((v) => !v);
                  setFilter('');
                }}
              >
                <Icon name="magnifyingglass" />
              </button>
              {sidebarTab === 'files' ? (
                <MenuButton icon="plus" className="icon-btn small" title="Add" align="end" items={filesMenu} />
              ) : (
                <button className="icon-btn small" title="New chat" aria-label="New chat" onClick={() => openChat(null)}>
                  <Icon name="plus" />
                </button>
              )}
            </div>

            {searchOpen && (
              <label className="search-field sidebar-search">
                <Icon name="magnifyingglass" />
                <input
                  autoFocus
                  value={filter}
                  placeholder={sidebarTab === 'files' ? 'Search files' : 'Search chats'}
                  aria-label="Search"
                  onChange={(e) => setFilter(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setFilter('');
                      setSearchOpen(false);
                    }
                  }}
                />
                {filter && (
                  <button className="search-clear" aria-label="Clear search" onClick={() => setFilter('')}>
                    <Icon name="xmark.circle.fill" />
                  </button>
                )}
              </label>
            )}

            <div className="sidebar-list" hidden={sidebarTab !== 'files'}>
              <FileTree
                ref={treeRef}
                projectId={projectId}
                items={items}
                fileOrder={fileOrder}
                filter={sidebarTab === 'files' ? filter : ''}
                activePath={activePath}
                mainFile={mainFile}
                onOpen={open}
                onRefresh={async () => {
                  await refreshTree();
                }}
                beforeUpload={() => saveNow()}
                onUploaded={onUploaded}
                onMoved={onMoved}
                onDeleted={onDeleted}
                onSetMain={(path) => chooseMain(path)}
                onNewBib={() => createBibFile().catch((err) => notify(`Couldn’t create the .bib file: ${errorText(err)}`, 'error'))}
                notify={notify}
              />
            </div>
            {sidebarTab === 'chats' && (
              <div className="sidebar-list">
                <ChatsList activeChatId={chatId} filter={filter} onOpen={openChat} onNew={() => openChat(null)} refreshSignal={0} />
              </div>
            )}

            {sidebarTab === 'files' && (
              <div className={`sidebar-outline ${layout.outlineOpen ? 'open' : ''}`}>
                <button className="sidebar-section-title" aria-expanded={layout.outlineOpen} onClick={() => setLayout({ outlineOpen: !layout.outlineOpen })}>
                  <span>
                    Outline{outlineFile && <span className="outline-file"> · {nameOf(outlineFile)}</span>}
                  </span>
                  <Icon name="chevron.right" className={`disclosure ${layout.outlineOpen ? 'open' : ''}`} />
                </button>
                {layout.outlineOpen && (
                  <div className="outline-list">
                    {outline.map((item) => (
                      <button
                        key={`${item.pos}-${item.title}`}
                        className={`outline-item ${item === currentHeading ? 'active' : ''}`}
                        style={{ paddingLeft: 10 + (item.level - outlineBase) * 14 }}
                        title={`${item.title} (line ${item.line})`}
                        onClick={() => select(outlineFile, item.pos)}
                      >
                        {item.title}
                      </button>
                    ))}
                    {!outline.length && <div className="sidebar-hint">{outlineFile ? 'No headings yet' : 'Open a .tex file to see its outline'}</div>}
                  </div>
                )}
              </div>
            )}

            <div className="sidebar-bottom">
              <button className="nav-row" onClick={() => setSettingsOpen(true)} title="Settings (⌘,)">
                <Icon name="gearshape" />
                <span className="nav-label">Settings</span>
              </button>
            </div>
          </aside>
        )}

        <main className="main-panel editor-panel" ref={panelRef}>
          <section className="editor-column">
            <div className="editor-topbar" data-tauri-drag-region>
              {layout.sidebarCollapsed && (
                <button className="icon-btn" title={withShortcut(settings.shortcuts, 'Show sidebar', 'sidebar')} aria-label="Show sidebar" onClick={() => setLayout({ sidebarCollapsed: false })}>
                  <Icon name="sidebar.left" />
                </button>
              )}
              <MenuButton icon="plus.circle" className="icon-btn" title="Insert" items={insertItems} disabled={!activePath} />
              <div className="file-tabs" role="tablist" data-tauri-drag-region>
                {tabs.map((path) => (
                  <div
                    key={path}
                    role="tab"
                    tabIndex={0}
                    aria-selected={path === activePath}
                    className={`file-tab ${path === activePath ? 'active' : ''}`}
                    title={path}
                    onClick={() => open(path)}
                    onKeyDown={(e) => e.key === 'Enter' && open(path)}
                    onAuxClick={(e) => e.button === 1 && closeTab(path).catch(() => undefined)}
                  >
                    <Icon name={/\.bib$/i.test(path) ? 'books.vertical' : 'doc.text'} className="file-tab-icon" />
                    <span className="file-tab-name">{nameOf(path)}</span>
                    {path === activePath && dirty && <span className="file-tab-dot" title="Unsaved changes" />}
                    <button
                      className="file-tab-close"
                      title="Close"
                      aria-label={`Close ${nameOf(path)}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(path).catch((err) => notify(errorText(err), 'error'));
                      }}
                    >
                      <Icon name="xmark" />
                    </button>
                  </div>
                ))}
              </div>
              <button className={`icon-btn ${composerOpen ? 'active' : ''}`} title={withShortcut(settings.shortcuts, 'Assistant', 'assistant')} aria-label="Assistant" aria-pressed={composerOpen} onClick={toggleComposer}>
                <Icon name="sparkles" />
              </button>
              <button
                className={`icon-btn ${grammarOpen ? 'active' : ''}`}
                title={withShortcut(settings.shortcuts, 'Check grammar', 'grammar')}
                aria-label="Check grammar"
                aria-pressed={grammarOpen}
                onClick={toggleGrammar}
              >
                <Icon name="text.badge.checkmark" />
              </button>
              <button className={`tools-toggle ${toolsOpen ? 'open' : ''}`} aria-pressed={toolsOpen} onClick={() => (toolsOpen ? setToolsOpen(false) : openTools())}>
                <span>{toolsOpen ? 'Close' : 'Tools'}</span>
                <Icon name={toolsOpen ? 'xmark' : 'square.grid.2x2'} />
                {!toolsOpen && problems > 0 && (
                  <span className={`tools-badge ${errorCount ? 'error' : ''}`} title={`${plural(errorCount, 'error')}, ${plural(problems - errorCount, 'warning')}`}>
                    {problems}
                  </span>
                )}
              </button>
            </div>

            {pending.length > 0 && (
              <div className="review-banner" role="status">
                <Icon name="plus.forwardslash.minus" />
                <span className="grow">Suggested changes to {plural(pending.length, 'file')}</span>
                <button className="btn small ghost" onClick={() => setPending([])}>
                  Discard
                </button>
                <button className="btn small primary" onClick={() => openReview(pending).catch(() => setReviewOpen(true))}>
                  Review
                </button>
              </div>
            )}

            <div className="editor-area" ref={areaRef}>
              <div className="editor-host" ref={hostRef} style={{ '--editor-font-size': `${settings.editorFontSize}px` } as CSSProperties} />
              {!activePath && loaded && (
                <div className="editor-empty">
                  <Icon name="doc.text" size={34} />
                  <div className="empty-title">No file open</div>
                  <div className="empty-text">Choose a file in the sidebar, or create one with + above the file list.</div>
                </div>
              )}
              {ghostPos && (suggesting || ghostText) && (
                <div className="ghost-hint" style={{ left: ghostPos.left, top: ghostPos.top }}>
                  {ghostText ? (
                    <>
                      <button className="ghost-action" onMouseDown={(e) => e.preventDefault()} onClick={() => acceptGhost()}>
                        Accept <kbd>Tab</kbd>
                      </button>
                      <button className="ghost-action" onMouseDown={(e) => e.preventDefault()} onClick={() => acceptGhost(true)}>
                        Word <kbd>→</kbd>
                      </button>
                      <button className="ghost-action" onMouseDown={(e) => e.preventDefault()} onClick={() => clearGhost()}>
                        Dismiss <kbd>Esc</kbd>
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="spinner" /> Writing a suggestion…
                    </>
                  )}
                </div>
              )}
            </div>

            <Composer
              open={composerOpen}
              onOpenChange={(open) => {
                setComposerOpen(open);
                if (!open) viewRef.current?.focus();
              }}
              chatId={chatId} onChatIdChange={setChatId} focusSignal={focusSignal} />
          </section>

          <div className="column-divider" role="separator" aria-orientation="vertical" aria-label="Resize" onMouseDown={startResize} />

          <section className="right-column" style={{ width: `${layout.split * 100}%` }}>
            <div className="pdf-column" hidden={toolsOpen || grammarOpen}>
              <div className="pdf-header" data-tauri-drag-region>
                <div className="compile-split">
                  <button className="compile-main" onClick={runCompile} disabled={running} title={withShortcut(settings.shortcuts, 'Compile', 'compile')}>
                    {running ? <span className="spinner" /> : <Icon name="play.fill" />}
                    <span>Compile</span>
                  </button>
                  <MenuButton
                    className="compile-engine"
                    icon="chevron.down"
                    chevron={false}
                    title={`Compiler (${engineLabel(engine)})`}
                    items={COMPILE_ENGINES.map(([value, label]) => ({ label, checked: engine === value, onSelect: () => chooseEngine(value) }))}
                  />
                </div>
                {/* always mounted, so screen readers hear each change */}
                <span role="status" className={`compile-status ${compile.state}`} title={compile.state === 'ok' ? `${status} · ${engineLabel(String(compile.engine))} · ${mainFile}` : status}>
                  {compile.state === 'failed' ? (
                    <button className="compile-status failed" onClick={() => openTools('logs')}>
                      Failed — see Logs
                    </button>
                  ) : (
                    status
                  )}
                </span>
                <span className="spacer" data-tauri-drag-region />
                <MenuButton
                  className="btn ghost small zoom-button"
                  icon="plus.magnifyingglass"
                  title={`Zoom: ${zoomLabel}`}
                  label={zoomLabel}
                  disabled={!pdf}
                  align="end"
                  items={ZOOMS.map(([z, label]) => ({ label, checked: zoom === z, onSelect: () => setZoom(z) }))}
                />
                <button className="icon-btn" title="Download PDF" aria-label="Download PDF" disabled={!pdf} onClick={downloadPdf}>
                  <Icon name="arrow.down.to.line" />
                </button>
                <MenuButton
                  icon="ellipsis"
                  title="More"
                  align="end"
                  items={[
                    { label: 'Two-page view', icon: 'book.pages', checked: spread, disabled: !pdf, onSelect: () => setSpread((v) => !v) },
                    { label: 'Dark pages in dark mode', icon: 'moon', checked: layout.darkPages, onSelect: () => setLayout({ darkPages: !layout.darkPages }) },
                    { label: 'Annotate', icon: 'note.text.badge.plus', checked: annotate, disabled: !pdf, onSelect: () => setAnnotate((v) => !v) },
                    { label: 'Table of contents', icon: 'list.bullet.indent', checked: false, disabled: !pdf, onSelect: () => setTocOpen(true) },
                    { separator: true },
                    { label: 'Show logs', icon: 'terminal', checked: false, onSelect: () => openTools('logs') }
                  ]}
                />
              </div>

              <div className="pdf-body">
                {pdf ? (
                  <PdfPreview
                    ref={pdfRef}
                    url={pdf.url}
                    zoom={zoom}
                    spread={spread}
                    darkPages={layout.darkPages}
                    annotateMode={annotate}
                    annotations={annotations}
                    onAddAnnotation={addAnnotation}
                    onTextClick={(text) => findInSource(text)}
                    onLoad={({ pages, outline: toc }) => {
                      setPdfPages(pages);
                      setPdfOutline(toc);
                    }}
                    onScale={setScale}
                    onZoom={setZoom}
                    onPage={setPage}
                  />
                ) : (
                  <div className="empty-state">
                    <Icon name="doc.richtext" size={40} />
                    <div className="empty-title">No PDF yet</div>
                    <div className="empty-text">Compile the project to see it here.</div>
                    <div className="empty-actions">
                      <button className="btn primary" onClick={runCompile} disabled={running || !mainFile}>
                        {running ? <span className="spinner" /> : <Icon name="play.fill" />} Compile
                      </button>
                    </div>
                  </div>
                )}

                {pdf && annotate && <div className="pdf-annotate-hint">Click the page to add a note</div>}

                {pdf && (
                  <div className="pdf-pill">
                    <button
                      className="icon-btn small"
                      title="Previous page"
                      aria-label="Previous page"
                      disabled={page <= 1}
                      onClick={() => pdfRef.current?.scrollToPage(Math.max(1, page - step))}
                    >
                      <Icon name="chevron.left" />
                    </button>
                    <span className="pdf-pill-label">
                      {page} / {pdfPages ?? '–'}
                    </span>
                    <button
                      className="icon-btn small"
                      title="Next page"
                      aria-label="Next page"
                      disabled={!pdfPages || page + step > pdfPages}
                      onClick={() => pdfRef.current?.scrollToPage(Math.min(pdfPages!, page + step))}
                    >
                      <Icon name="chevron.right" />
                    </button>
                    <span className="pdf-pill-sep" />
                    <button className="icon-btn small" title="Zoom out" aria-label="Zoom out" onClick={() => zoomBy(-1)}>
                      <Icon name="minus" />
                    </button>
                    <span className="pdf-pill-label">{Math.round(scale * 100)}%</span>
                    <button className="icon-btn small" title="Zoom in" aria-label="Zoom in" onClick={() => zoomBy(1)}>
                      <Icon name="plus" />
                    </button>
                  </div>
                )}

                {tocOpen && (
                  <div className="toc-popover" ref={tocRef} role="dialog" aria-label="Table of contents">
                    <div className="toc-title">Table of contents</div>
                    {pdfOutline.length ? (
                      <div className="toc-list">
                        {pdfOutline.map((item, i) => (
                          <button
                            key={i}
                            className="toc-item"
                            style={{ paddingLeft: 10 + item.level * 14 }}
                            disabled={!item.page}
                            onClick={() => {
                              if (item.page) pdfRef.current?.scrollToPage(item.page);
                              setTocOpen(false);
                            }}
                          >
                            <span className="toc-item-title">{item.title}</span>
                            {item.page && <span className="toc-page">{item.page}</span>}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="toc-empty">This PDF has no table of contents. Add \usepackage{'{hyperref}'} to the preamble to create one.</div>
                    )}
                  </div>
                )}
              </div>

              {annotations.length > 0 && (
                <div className="pdf-notes">
                  <div className="pdf-notes-head">
                    <span>Notes</span>
                    <button className="btn small ghost" onClick={() => setAnnotations([])}>
                      Clear all
                    </button>
                  </div>
                  {annotations.map((note) => (
                    <div key={note.id} className="pdf-note">
                      <button className="pdf-note-page" onClick={() => pdfRef.current?.scrollToPage(note.page)}>
                        p. {note.page}
                      </button>
                      <span className="pdf-note-text">{note.text}</span>
                      <button
                        className="icon-btn small"
                        title="Remove note"
                        aria-label="Remove note"
                        onClick={() => setAnnotations((prev) => prev.filter((n) => n.id !== note.id))}
                      >
                        <Icon name="xmark" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {toolsMounted && (
              <div className="tools-column" hidden={!toolsOpen}>
                <ToolsPanel tab={toolsTab} onTabChange={setToolsTab} />
              </div>
            )}

            {grammarOpen && (
              <div className="tools-column">
                <GrammarPanel
                  view={() => viewRef.current}
                  projectId={projectId}
                  path={activePath}
                  revision={editorValue}
                  settings={settings}
                  onClose={() => {
                    setGrammarOpen(false);
                    viewRef.current?.focus();
                  }}
                />
              </div>
            )}
          </section>
        </main>
      </div>

      {spellMenu && (
        <ContextMenu
          x={spellMenu.x}
          y={spellMenu.y}
          onClose={() => setSpellMenu(null)}
          items={[
            ...(spellMenu.suggestions === null
              ? [{ label: 'Looking for suggestions…', disabled: true }]
              : spellMenu.suggestions.length
                ? spellMenu.suggestions.map((suggestion) => ({
                    label: suggestion,
                    onSelect: () => {
                      const view = viewRef.current;
                      // only if the word is still there as it was
                      if (view && view.state.sliceDoc(spellMenu.from, spellMenu.to) === spellMenu.word) {
                        view.dispatch({ changes: { from: spellMenu.from, to: spellMenu.to, insert: suggestion }, userEvent: 'input.spell' });
                      }
                    }
                  }))
                : [{ label: 'No suggestions', disabled: true }]),
            { separator: true },
            ...(['global', 'project'] as const).map((scope) => ({
              label: scope === 'global' ? 'Add to dictionary' : 'Add to project dictionary',
              onSelect: () => {
                const word = spellMenu.word;
                changeSpellWord({ word, scope, projectId })
                  .then(() => viewRef.current?.dispatch({ effects: recheckSpelling.of([word]) }))
                  .catch((err) => notify(`Couldn’t add “${word}”: ${errorText(err)}`, 'error'));
              }
            })),
            { label: 'Ignore', onSelect: () => viewRef.current?.dispatch({ effects: ignoreSpelling.of(spellMenu.word) }) }
          ]}
        />
      )}

      {reviewOpen && (
        <ReviewChangesSheet
          changes={pending}
          onAccept={acceptChanges}
          onReject={(list) => setPending((prev) => prev.filter((p) => !list.some((c) => c.filePath === p.filePath)))}
          onClose={() => setReviewOpen(false)}
        />
      )}

      {preview && (
        <Sheet
          title={preview}
          onClose={() => setPreview('')}
          width={760}
          actions={
            <>
              {IS_DESKTOP && (
                <button className="btn" onClick={() => revealProject(projectId, preview).catch(() => undefined)}>
                  Show in Finder
                </button>
              )}
              {FIGURE_FILE.test(preview) && (
                <button
                  className="btn primary"
                  disabled={!isTex(activePath)}
                  title={isTex(activePath) ? undefined : 'Open a .tex file first'}
                  onClick={() => {
                    insertAtCursor(figureSnippet(preview), { block: true });
                    setPreview('');
                  }}
                >
                  <Icon name="plus" /> Insert figure
                </button>
              )}
            </>
          }
        >
          <div className="figure-large">
            {IMAGE_FILE.test(preview) ? (
              <img src={blobUrl(projectId, preview)} alt={preview} />
            ) : /\.pdf$/i.test(preview) ? (
              <object data={blobUrl(projectId, preview)} type="application/pdf" aria-label={preview} />
            ) : (
              <div className="tool-empty">There’s no preview for this kind of file.</div>
            )}
          </div>
        </Sheet>
      )}

      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}
    </EditorContext.Provider>
  );
}
