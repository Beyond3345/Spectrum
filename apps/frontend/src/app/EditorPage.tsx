import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { EditorState, Prec } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { EditorView, closeHoverTooltips, keymap } from '@codemirror/view';
import { indentLess } from '@codemirror/commands';
import { search } from '@codemirror/search';
import { autocompletion, nextSnippetField, prevSnippetField } from '@codemirror/autocomplete';
import { foldService, syntaxHighlighting } from '@codemirror/language';
import { applyPatch, structuredPatch } from 'diff';
import {
  ApiError,
  blobUrl,
  closeTemplateDraft,
  compileProject,
  saveTemplateDraft,
  stopCompile,
  createVersion as saveVersion,
  deleteNote,
  getFile,
  getFileIfChanged,
  getEngines,
  getProjectSettings,
  getProjectTree,
  getSyncSettings,
  gitHubLeft,
  gitHubOpened,
  listNotes,
  listProjects,
  renameVersion,
  revealProject,
  runAgent,
  saveNote,
  saveThumbnail,
  setProjectMainFile,
  changeSpellWord,
  spellSuggest,
  synctexEdit,
  synctexView,
  searchZotero,
  syncWithGitHub,
  syncZotero,
  updateProjectSettings,
  writeFile
} from '../api/client';
import type { CompileDiagnostic, CompileEngine, CompileOptions, CompileResult, Engines, FileItem, FileOrderMap, PdfNote, PdfPoint, ProjectMeta, TodoLink, VersionMeta, VersionReason } from '../api/client';
import Icon from './Icon';
import Tabs from './Tabs';
import Sheet from './Sheet';
import SettingsSheet from './SettingsSheet';
import type { Section as SettingsSection } from './SettingsSheet';
import { ContextMenu, MenuButton } from './Menu';
import type { MenuItems } from './Menu';
import { confirmDialog, promptDialog } from './Dialogs';
import { SaveTemplateSheet } from './ProjectPage';
import { withDeletionCheck } from './github';
import { toast } from './Toast';
import { IS_DESKTOP, focusWindow, openDiagram } from './desktop';
import { FILE_MANAGER } from './platform';
import { BIB_TOOLS, COMPILE_ENGINES, ERROR_HANDLING, SYNTAX_CHECKS, autoCompileLabel, effectiveCompile, effectiveEffort, llmConfigFor, loadSettings, updateSettings, useProviders, useSettings } from './settings';
import { PDF_PAGES_DARK, PDF_PAGES_LIGHT, useDarkMode } from './appearance';
import { FIND_NEXT, FIND_PREVIOUS, SHORTCUTS, editorBasics, formatShortcut, matchesShortcut, matchesZoomIn, shortcutKey, withShortcut } from './shortcuts';
import type { AppCommand } from './shortcuts';
import { EditorContext } from '../editor/EditorContext';
import type { CompileError, EditorApi, PendingChange } from '../editor/EditorContext';
import Composer from '../editor/Composer';
import ResearchPanel from '../editor/research/ResearchPanel';
import type { ResearchTask } from '../editor/research/ResearchPanel';
import ToolsPanel from '../editor/ToolsPanel';
import FloatsPanel from '../editor/FloatsPanel';
import type { FloatCard } from '../editor/FloatsPanel';
import InsightsPanel from '../editor/InsightsPanel';
import { figureFile, showDiagram, showFigure } from '../editor/tools/FloatsTab';
import { figureLabel, figureMarkdown, figureTypst } from '../editor/floats';
import type { DiagramLanguage } from '../diagram/types';
import SplitDiffView from '../editor/SplitDiffView';
import GrammarPanel, { grammarMarks } from '../editor/GrammarPanel';
import { ignoreSpelling, misspeltAt, recheckSpelling, spellChecker } from '../editor/spellcheck';
import type { ToolsTab } from '../editor/ToolsPanel';
import ReviewChangesSheet from '../editor/ReviewChangesSheet';
import AgentWorkspace, { STATUS_TEXT } from '../editor/agent/AgentWorkspace';
import type { AgentStatus } from '../editor/agent/LocalAgentTab';
import SyncBanners from '../editor/SyncBanners';
import { conflictCopyPath, onDiskChange } from '../editor/heldFiles';
import FileTree from '../editor/FileTree';
import type { FileTreeHandle } from '../editor/FileTree';
import PdfPreview, { MAX_ZOOM, MIN_ZOOM, PageBox, pdfThumbnail, rememberPage } from '../editor/PdfPreview';
import type { PdfDest, PdfHandle, PdfOutlineItem, PdfZoom } from '../editor/PdfPreview';
import PdfSidebar from '../editor/PdfSidebar';
import type { PdfSidebarTab } from '../editor/PdfSidebar';
import PdfFindBar from '../editor/PdfFindBar';
import PdfPresentation from '../editor/PdfPresentation';
import TodosList, { useTodos } from '../editor/TodosList';
import { findKey, findLine, snippetOf } from '../editor/todos';
import { parseCompileLog, projectFile } from '../editor/compileLog';
import { highlightColour, linger } from '../editor/synctex';
import {
  closeEnvironment,
  completeOrAccept,
  currentEnvironment,
  documentOutline,
  editorTheme,
  ghostField,
  indentation,
  insertIndent,
  jumpHighlight,
  latexCompletionSource,
  nearestHeading,
  parseOutline,
  programmatic,
  scopeGutter,
  setGhost,
  setJumpHighlight,
  wrapLayout
} from '../editor/latexEditor';
import { NO_PROJECT, externalDocuments, scanProject, texRoot } from '../editor/latexEnvs';
import type { Project } from '../editor/latexEnvs';
import type { OutlineItem } from '../editor/latexEditor';
import { Texlab, clearMarks, texlabSlot } from '../editor/lsp/texlab';
import type { Reference } from '../editor/lsp/texlab';
import { applyEdits, crossReferred, newName, renameEdits } from '../editor/lsp/rename';
import { syntaxErrors } from '../editor/lsp/syntax';
import { outlineDelay, symbolHeadings } from '../editor/lsp/outline';
import { ENGINES_CHANGED, PROJECT_DATA_CHANGED, VERSIONS_CHANGED, docKind, errorText, figureSnippet, isDocument, type DocKind } from '../editor/shared';
import { languageCompartment, languageFor, loadTypst, referenceCompletions, typstCompletions } from '../editor/languages';
import { includedPath, parseMarkdownOutline, parseTypstOutline } from '../editor/outlines';
import { ZOTERO_CITE, zoteroCompletionSource } from '../editor/zotero';
import { ZoteroCite, addZoteroHit } from '../editor/ZoteroCite';

// ─── helpers ───

const TEXT_FILE = /\.(tex|typ|bib|sty|cls|bst|bbx|cbx|lbx|cfg|def|clo|ltx|dtx|txt|md|mmd|json|ya?ml|csv|tsv)$|(^|\/)\.latexmkrc$/i;
// \includestandalone[…]{figures/name}: the diagram its line takes in
const INCLUDE_STANDALONE = /\\includestandalone\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/;
const FIGURE_FILE = /\.(png|jpe?g|pdf|svg|eps)$/i;
const IMAGE_FILE = /\.(png|jpe?g|svg|gif)$/i;
const isTex = (p: string) => /\.tex$/i.test(p);
const nameOf = (p: string) => p.slice(p.lastIndexOf('/') + 1);
const pdfOf = (tex: string) => tex.replace(/\.(?:tex|ltx|typ|md|markdown)$/i, '.pdf');
/** A source line's words without markup, for finding the line in the PDF. */
const lineWords = (text: string) =>
  text
    .replace(/\\(?:[a-zA-Z@]+\*?|.)/g, ' ')
    .replace(/#[A-Za-z][\w-]*(?:\([^)]*\))?/g, ' ')
    .replace(/[{}[\]$*_<>|]/g, ' ')
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean);
const PART_OF_MAIN = /^[^%\n]*\\documentclass\s*(?:\[[^\]]*\]\s*)?\{(?:subfiles|standalone)\}/m;
// a rough take on the backend's test for a document of its own: an uncommented \documentclass near the top
const DOCUMENT_CLASS = /^[^%\n]*\\documentclass/m;
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

/** What's on disk now for a file a save was refused for (null: it was deleted); undefined for any other failure. */
function refusedFor(err: unknown) {
  if (!(err instanceof ApiError) || err.status !== 409) return undefined;
  if (err.data.code === 'DELETED_ON_DISK') return null;
  if (err.data.code === 'CHANGED_ON_DISK') return { content: String(err.data.content), hash: String(err.data.hash) };
  return undefined;
}

/** A file held back from saving: changed on disk while it had edits here (theirs, the text there now), or gone (null). */
type Held = { theirs: string; hash: string } | null;

type View = 'editor' | 'split' | 'pdf';
const VIEWS: [View, string, string, AppCommand][] = [
  ['editor', 'Editor only', 'rectangle', 'viewEditor'],
  ['split', 'Editor and PDF', 'rectangle.righthalf.filled', 'viewSplit'],
  ['pdf', 'PDF only', 'rectangle.fill', 'viewPdf']
];

/** pdfZoom and the PDF's sidebar are the PDF view, kept between launches like the columns; split is kept while one column shows alone */
type Layout = { sidebarCollapsed: boolean; view: View; split: number; outlineOpen: boolean; pdfZoom: PdfZoom; pdfSidebarOpen: boolean; pdfSidebarTab: PdfSidebarTab };
const LAYOUT_KEY = 'spectrum-editor-layout';
const DEFAULT_LAYOUT: Layout = { sidebarCollapsed: false, view: 'split', split: 0.46, outlineOpen: true, pdfZoom: 'width', pdfSidebarOpen: false, pdfSidebarTab: 'contents' };

function loadLayout(): Layout {
  try {
    // 1.1 also kept darkPages here; main.tsx moves it to the settings before anything renders
    const saved = { ...DEFAULT_LAYOUT, ...JSON.parse(window.localStorage.getItem(LAYOUT_KEY) || '{}') };
    const zoom = saved.pdfZoom;
    if (!(zoom === 'fit' || zoom === 'width' || (typeof zoom === 'number' && zoom >= MIN_ZOOM && zoom <= MAX_ZOOM))) saved.pdfZoom = 'width';
    if (!VIEWS.some(([view]) => view === saved.view)) saved.view = 'split';
    saved.pdfSidebarOpen = saved.pdfSidebarOpen === true;
    if (saved.pdfSidebarTab !== 'pages') saved.pdfSidebarTab = 'contents';
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

type Snippet = { label: string; icon: string; text: string; select: string; block?: boolean; kinds: DocKind[] };
const LATEX: DocKind[] = ['latex'];
const TYPST: DocKind[] = ['typst'];
const MARKDOWN: DocKind[] = ['markdown'];
/** a snippet, the Floats panel's figure or table card, the diagram composer, or a divider */
const SNIPPETS: (Snippet | FloatCard | null)[] = [
  { label: 'Section', icon: 'number', text: '\\section{Section title}', select: 'Section title', block: true, kinds: LATEX },
  { label: 'Subsection', icon: 'list.bullet.indent', text: '\\subsection{Subsection title}', select: 'Subsection title', block: true, kinds: LATEX },
  { label: 'Subsubsection', icon: 'list.bullet.indent', text: '\\subsubsection{Subsubsection title}', select: 'Subsubsection title', block: true, kinds: LATEX },
  null,
  { label: 'Itemize', icon: 'list.bullet', text: '\\begin{itemize}\n    \\item First item\n\\end{itemize}', select: 'First item', block: true, kinds: LATEX },
  { label: 'Enumerate', icon: 'list.number', text: '\\begin{enumerate}\n    \\item First item\n\\end{enumerate}', select: 'First item', block: true, kinds: LATEX },
  { label: 'Equation', icon: 'function', text: '\\begin{equation}\n    E = mc^2\n    \\label{eq:name}\n\\end{equation}', select: 'E = mc^2', block: true, kinds: LATEX },
  {
    label: 'Algorithm',
    icon: 'arrow.triangle.branch',
    text: '\\begin{algorithm}[t]\n    \\caption{Algorithm name}\n    \\label{alg:name}\n    \\begin{algorithmic}[1]\n        \\State Initialise\n    \\end{algorithmic}\n\\end{algorithm}',
    select: 'Algorithm name',
    block: true,
    kinds: LATEX
  },
  null,
  'figure',
  'table',
  'diagram',
  {
    label: 'Code listing',
    icon: 'chevron.left.forwardslash.chevron.right',
    text: '\\begin{lstlisting}[language=Python]\n# code here\n\\end{lstlisting}',
    select: '# code here',
    block: true,
    kinds: LATEX
  },
  null,
  { label: 'Citation', icon: 'quote.opening', text: '\\cite{key}', select: 'key', kinds: LATEX },
  { label: 'Reference', icon: 'link', text: '\\ref{label}', select: 'label', kinds: LATEX },
  { label: 'Label', icon: 'tag', text: '\\label{label}', select: 'label', kinds: LATEX },
  // Typst
  { label: 'Heading', icon: 'number', text: '= Heading', select: 'Heading', block: true, kinds: TYPST },
  { label: 'Emphasis', icon: 'textformat', text: '_text_', select: 'text', kinds: TYPST },
  { label: 'Strong', icon: 'text.bubble', text: '*text*', select: 'text', kinds: TYPST },
  { label: 'List', icon: 'list.bullet', text: '- item', select: 'item', block: true, kinds: TYPST },
  { label: 'Maths', icon: 'function', text: '$x$', select: 'x', kinds: TYPST },
  { label: 'Block maths', icon: 'function', text: '$ x $', select: 'x', block: true, kinds: TYPST },
  { label: 'Citation', icon: 'quote.opening', text: '@key', select: 'key', kinds: TYPST },
  { label: 'Reference', icon: 'link', text: '@fig:x', select: 'fig:x', kinds: TYPST },
  { label: 'Comment', icon: 'text.bubble', text: '// comment', select: 'comment', kinds: TYPST },
  // Markdown
  { label: 'Heading', icon: 'number', text: '## Heading', select: 'Heading', block: true, kinds: MARKDOWN },
  { label: 'Emphasis', icon: 'textformat', text: '_text_', select: 'text', kinds: MARKDOWN },
  { label: 'Strong', icon: 'text.bubble', text: '**text**', select: 'text', kinds: MARKDOWN },
  { label: 'List', icon: 'list.bullet', text: '- item', select: 'item', block: true, kinds: MARKDOWN },
  { label: 'Link', icon: 'link', text: '[text](url)', select: 'text', kinds: MARKDOWN },
  { label: 'Maths', icon: 'function', text: '$x$', select: 'x', kinds: MARKDOWN },
  { label: 'Citation', icon: 'quote.opening', text: '[@key]', select: 'key', kinds: MARKDOWN },
  { label: 'Code block', icon: 'chevron.left.forwardslash.chevron.right', text: '```\ncode\n```', select: 'code', block: true, kinds: MARKDOWN }
];
type CompileState = { state: 'idle' | 'running' | 'ok' | 'failed' | 'stopped'; engine: CompileEngine | string; at?: Date; slow?: boolean };

/** what takes the PDF's place, from the top bar */
type Panel = 'tools' | 'grammar' | 'insights' | 'floats' | 'agent';

/**
 * Why a compile's checkpoint couldn't be saved, or the files it left out that `told` doesn't hold yet (they're added,
 * so a large file is mentioned once, not after every compile); '' when there's nothing new.
 */
function checkpointProblem(checkpoint: CompileResult['checkpoint'], told: Set<string>) {
  if (checkpoint?.error) return `Couldn’t save a checkpoint after compiling: ${checkpoint.error}`;
  const skipped = (checkpoint?.skipped ?? []).filter((file) => !told.has(file));
  if (!skipped.length) return '';
  for (const file of skipped) told.add(file);
  const names = skipped.length > 3 ? `${skipped.slice(0, 3).join(', ')} and ${skipped.length - 3} more` : skipped.join(', ');
  return `The checkpoint after compiling left out ${names}, which can’t be saved (too large or unreadable).`;
}

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
  /** the template this project is a working copy of */
  const draft = project?.templateDraft;
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);

  const [items, setItems] = useState<FileItem[]>([]);
  const [fileOrder, setFileOrder] = useState<FileOrderMap>({});
  const [mainFile, setMainFile] = useState('');
  /** the .tex files with a \documentclass of their own, as the tree last listed them */
  const [documents, setDocuments] = useState<string[]>([]);
  /** the files the diagram composer can open (Edit diagram), as the tree last listed them */
  const [diagrams, setDiagrams] = useState<string[]>([]);
  /** a sync app's conflict copies, each with its original's path */
  const [conflicts, setConflicts] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  /** file contents by path; the open file's entry follows every keystroke */
  const filesRef = useRef(new Map<string, string>());
  /** the hash of each of those files' text on disk as the editor last loaded or saved it, so a save can tell when it changed since */
  const hashesRef = useRef(new Map<string, string>());
  /** open files that aren't saved until the user says what to keep: changed on another computer, or deleted on disk */
  const heldRef = useRef(new Map<string, Held>());
  /** held files with text here that isn't on disk, kept beside them as conflict copies if the user leaves first */
  const unsavedRef = useRef(new Map<string, true>());
  /** this computer's name, for those copies' names; asked for when a file is first held */
  const machineRef = useRef('');
  const [, setHeldVersion] = useState(0);
  const [comparing, setComparing] = useState(false);
  /** editor state (undo history, cursor) per file that has been open */
  const statesRef = useRef(new Map<string, EditorState>());
  /** what the document being edited and the files it pulls in load and define, its .bib entries and its files, for completion */
  const projectScanRef = useRef<Project>(NO_PROJECT);
  /** the newest shared API, for CodeMirror's pieces made once (a Zotero item picked from \cite completion) */
  const apiRef = useRef<EditorApi | null>(null);
  /** .bib files that aren't open, read once per tree or file change rather than after every save */
  const bibRef = useRef(new Map<string, string>());
  // counts writes and reloads, which change filesRef without a render
  const [filesVersion, setFilesVersion] = useState(0);

  const [activePath, setActivePath] = useState('');
  const activeRef = useRef('');
  const [tabs, setTabs] = useState<string[]>([]);
  // the file tabs' strip, scrolled to the open file's tab
  const stripRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
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
  /** each path's writes waiting in writeChain or running */
  const queuedRef = useRef(new Map<string, number>());
  // stops the editor's jump highlight from fading on time (a newer jump replaces it)
  const unlingerRef = useRef(() => {});
  // the last notice a double-click in the source gave, which says it once per PDF and file
  const syncNoticeRef = useRef('');

  const [suggesting, setSuggesting] = useState(false);
  const [ghostText, setGhostText] = useState('');
  const [ghostPos, setGhostPos] = useState<{ left: number; top: number } | null>(null);
  const ghostRef = useRef<{ text: string; pos: number | null }>({ text: '', pos: null });
  const acceptingRef = useRef(false);

  /** the project's own compile choices (.spectrum/settings.json); the app's defaults fill in the rest */
  const [projectCompile, setProjectCompile] = useState<CompileOptions>({});
  const compileOptions = effectiveCompile(projectCompile, settings.compileDefaults);
  // the extension list outlives a render, so the completion source reads this rather than a stale compile setting
  const compileOptionsRef = useRef(compileOptions);
  compileOptionsRef.current = compileOptions;
  const engine = compileOptions.engine;
  const [compile, setCompile] = useState<CompileState>({ state: 'idle', engine });
  const compilingRef = useRef(false);
  // the running compile's id, for Stop
  const compileIdRef = useRef('');
  // auto compile: typed since the last one (in the document Compile built then), the running compile is one, and
  // one is waiting for it to end
  const editedRef = useRef(false);
  const editedDocRef = useRef('');
  // the document whose PDF shows, as of now (shownDoc is as of the last render)
  const shownRef = useRef('');
  // a document's PDF from a compile that couldn't write over the copy on disk, which another program held (Windows),
  // and when that compile started
  const stalePdf = useRef(new Map<string, { blob: Blob; at: number }>());
  const autoRunningRef = useRef(false);
  const autoWaitingRef = useRef(false);
  // the files a checkpoint after compiling left out that the notice has named
  const skippedToldRef = useRef(new Set<string>());
  const [savingVersion, setSavingVersion] = useState(false);
  const savingVersionRef = useRef(false);
  const [compileLog, setCompileLog] = useState('');
  // a Typst compile's own errors and warnings (null: the log is TeX's, for parseCompileLog)
  const [compileDiagnostics, setCompileDiagnostics] = useState<CompileDiagnostic[] | null>(null);
  const [compileFailure, setCompileFailure] = useState('');
  // why the compile stopped before an engine ran, which Logs offers a download or the default for
  const [compileNotice, setCompileNotice] = useState<{ code?: string; version?: string } | null>(null);
  const [compileGenerated, setCompileGenerated] = useState<'latex' | 'typst' | null>(null);
  // the installed Typst versions and pandoc, for the compile menu
  const [engines, setEngines] = useState<Engines | null>(null);
  useEffect(() => {
    const load = () => getEngines().then(setEngines).catch(() => undefined);
    load();
    window.addEventListener(ENGINES_CHANGED, load);
    return () => window.removeEventListener(ENGINES_CHANGED, load);
  }, [projectId]);
  const [pdf, setPdf] = useState<{ url: string; blob: boolean } | null>(null);
  /** the document whose PDF the pane shows, and the one compiled last (whose log shows) */
  const [shownDoc, setShownDoc] = useState('');
  const [compiledDoc, setCompiledDoc] = useState('');
  const [pdfPages, setPdfPages] = useState<number | null>(null);
  // the page count of the PDF at url, from as soon as it opens (pdfPages waits for its pages to be laid out)
  const [pagesOf, setPagesOf] = useState({ url: '', pages: 0 });
  const [pdfOutline, setPdfOutline] = useState<PdfOutlineItem[]>([]);
  /** the contents entry being read */
  const [pdfSection, setPdfSection] = useState(-1);
  const [scale, setScale] = useState(1);
  const [page, setPage] = useState(1);
  const [spread, setSpread] = useState(false);
  const [annotate, setAnnotate] = useState(false);
  /** the shown document's notes, saved with the project */
  const [notes, setNotes] = useState<PdfNote[]>([]);
  /** the PDF whose pages are laid out, for what's drawn from them */
  const [loadedUrl, setLoadedUrl] = useState('');
  const [findOpen, setFindOpen] = useState(false);
  const [findSignal, setFindSignal] = useState(0);
  const [presenting, setPresenting] = useState(false);
  const [pdfMenu, setPdfMenu] = useState<{ x: number; y: number; at: PdfPoint; text: string } | null>(null);
  const pdfRef = useRef<PdfHandle>(null);

  const [layout, setLayoutState] = useState(loadLayout);
  // read after awaits, when a handler's own `layout` may be out of date
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const dark = useDarkMode();
  const setLayout = (patch: Partial<Layout>) => setLayoutState((prev) => ({ ...prev, ...patch }));
  const zoom = layout.pdfZoom;
  const setZoom = (pdfZoom: PdfZoom) => setLayout({ pdfZoom });
  const [panel, setPanel] = useState<Panel | null>(null);
  // Tools, insights and floats stay mounted once opened, so their results and typing survive closing; the grammar check runs afresh.
  // The agent workspace is mounted from the start, hidden, so its button's dot shows a run or changes to review at once
  const [keptPanels, setKeptPanels] = useState<Panel[]>(['agent']);
  // the agent workspace's dot on its button, and a chat it's asked to carry on
  const [agentStatus, setAgentStatus] = useState<AgentStatus>(null);
  const [agentThread, setAgentThread] = useState<{ id: string; n: number } | null>(null);
  // a task from Research, for the workspace's message box
  const [agentTask, setAgentTask] = useState<(ResearchTask & { n: number }) | null>(null);
  const [floatsCard, setFloatsCard] = useState<{ card: FloatCard | null; signal: number }>({ card: null, signal: 0 });
  const [spellMenu, setSpellMenu] = useState<{ x: number; y: number; from: number; to: number; word: string; suggestions: string[] | null } | null>(null);
  // right-click elsewhere in the editor: pos is where
  const [lineMenu, setLineMenu] = useState<{ x: number; y: number; pos: number } | null>(null);
  const [toolsTab, setToolsTab] = useState<ToolsTab>('versions');
  const [sidebarTab, setSidebarTab] = useState<'files' | 'research' | 'todos'>('files');
  const [searchOpen, setSearchOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [focusSignal, setFocusSignal] = useState(0);
  const [pending, setPending] = useState<PendingChange[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  // true: Settings at its first section; a section's name: open at that one
  const [settingsOpen, setSettingsOpen] = useState<boolean | SettingsSection>(false);
  const [preview, setPreview] = useState('');
  /** the project's TexLab while the editor is open, and whether it's answering (editor/lsp/texlab.ts) */
  const texlabRef = useRef<Texlab | null>(null);
  const [texlabOn, setTexlabOn] = useState(false);
  /** ⇧F12's list: where what's at the cursor is used */
  const [references, setReferences] = useState<Reference[] | null>(null);
  /** the outline TexLab gives for a document: its root, the headings and floats, and the files it read */
  const [symbolOutline, setSymbolOutline] = useState<{ root: string; items: (OutlineItem & { file: string })[]; seen: Set<string> } | null>(null);
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
  const mainPdf = pdfOf(mainFile);
  // the main file first, even before the tree counts it
  const docs = useMemo(() => [...new Set([mainFile, ...documents])].filter(Boolean), [mainFile, documents]);
  // the open file when it's a document of its own, else the main file: what completion scans and ⇧⌘↩ compiles
  const docRoot = docs.includes(activePath) ? activePath : mainFile;
  // with PDF follows the open file, Compile and auto compile build the document showing; without, the main file
  const compileTarget = (settings.pdfFollowsFile && shownDoc) || mainFile;
  const compileErrors = useMemo<CompileError[]>(() => {
    const files = items.map((i) => i.path);
    // a Typst compile brings its diagnostics with it; an empty list is a Typst compile with nothing to report
    const parsed = compileDiagnostics !== null
      ? compileDiagnostics.map((e) => ({ severity: e.severity, message: e.message, line: e.line, file: projectFile(e.file, compiledDoc, files) }))
      : parseCompileLog(compileLog, project?.path).map((e) => (e.file ? { ...e, file: projectFile(e.file, compiledDoc, files) } : e));
    return compileFailure && !parsed.some((e) => e.severity === 'error') ? [{ severity: 'error', message: compileFailure }, ...parsed] : parsed;
  }, [compileDiagnostics, compileLog, compileFailure, project?.path, items, compiledDoc]);
  const selectionText = selectionRange[0] === selectionRange[1] ? '' : editorValue.slice(selectionRange[0], selectionRange[1]);
  const fileSet = useMemo(() => new Set(items.filter((i) => i.type === 'file').map((i) => i.path)), [items]);
  // the files to-dos are looked for in, never a sync app's conflict copy
  const todoSources = useMemo(
    () => items.filter((i) => i.type === 'file' && /\.(tex|sty|cls|ltx|bib)$/i.test(i.path) && !conflicts[i.path]).map((i) => i.path),
    [items, conflicts]
  );
  const todos = useTodos({ projectId, sources: todoSources, loaded: (path) => filesRef.current.get(path), revision: `${filesVersion} ${dirty}`, notify });

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
    setDocuments(res.documents ?? []);
    setDiagrams(res.diagrams ?? []);
    setConflicts(res.conflicts ?? {});
    return res;
  };

  /** The diagram composer's window, at its chooser or at a diagram of the project (a figures/*.tex or an .mmd). */
  const drawDiagram = (file?: string) =>
    openDiagram(projectId, file, file ? (/\.mmd$/i.test(file) ? 'mermaid' : 'tikz') : undefined).catch((err) =>
      notify(`Couldn’t open the diagram composer: ${errorText(err)}`, 'error')
    );

  /** A file's text: the editor's when it has it, else from disk without keeping it (so it can't go stale here). */
  const readText = async (path: string) => filesRef.current.get(path) ?? (await getFile(projectId, path)).content;

  const ensureFileContent = async (path: string) => {
    const cached = filesRef.current.get(path);
    if (cached !== undefined) return cached;
    const { content, hash } = await getFile(projectId, path);
    filesRef.current.set(path, content);
    hashesRef.current.set(path, hash);
    return content;
  };

  /**
   * One write at a time, so an autosave can never land after a newer write. Each goes from the text last loaded
   * or saved, so a file changed or deleted on disk since (another computer, through a sync client) isn't written over.
   * create: only made if nothing (in any letter case) is there.
   */
  const queueWrite = (path: string, content: string, create = false) => {
    const queued = queuedRef.current;
    queued.set(path, (queued.get(path) ?? 0) + 1);
    const job = writeChain.current.then(async () => {
      try {
        const { hash } = await writeFile(projectId, path, content, create ? { create } : { base: hashesRef.current.get(path) });
        hashesRef.current.set(path, hash);
      } finally {
        queued.set(path, (queued.get(path) ?? 1) - 1);
      }
    });
    writeChain.current = job.catch(() => undefined);
    return job;
  };

  const markClean = () => {
    dirtyRef.current = false;
    setDirty(false);
  };

  const hold = (path: string, value?: Held) => {
    if (value === undefined) {
      heldRef.current.delete(path);
      unsavedRef.current.delete(path);
    } else {
      heldRef.current.set(path, value);
      if (!machineRef.current) getSyncSettings().then((s) => (machineRef.current = s.machineName), () => undefined);
    }
    setHeldVersion((v) => v + 1);
  };

  /** The file has text here that isn't on disk: typed in the open file, or kept while it's held. */
  const hasUnsaved = (path: string) => unsavedRef.current.has(path) || (path === activeRef.current && dirtyRef.current);

  /** A file's text as it is on disk now: cached, and shown (undoably) when it's the open file. */
  const adoptDiskText = (path: string, content: string, hash: string) => {
    filesRef.current.set(path, content);
    hashesRef.current.set(path, hash);
    if (heldRef.current.has(path)) hold(path);
    if (path === activeRef.current) {
      setComparing(false);
      markClean();
      setDoc(content);
    }
  };

  /**
   * A loaded file isn't on disk as the editor last loaded or saved it (disk null: it was deleted). One with unsaved
   * text here (a deleted tab's too), or already held for a change, is held for the user to say which to keep,
   * unless the disk has that text now; a file without edits here takes the new text; a deleted tab is marked, and
   * anything else deleted is forgotten. While a save of it is queued, that save's refusal says so instead.
   */
  const changedOnDisk = (path: string, disk: { content: string; hash: string } | null) => {
    const queued = !!queuedRef.current.get(path);
    const action = onDiskChange({ queued, changed: !!heldRef.current.get(path), unsaved: hasUnsaved(path), mine: filesRef.current.get(path), disk: disk && disk.content });
    if (action === 'wait') return;
    if (!disk) {
      // a closed tab's unsaved text is kept like an open one's, so leaving writes it as a copy
      if (tabsRef.current.includes(path) || unsavedRef.current.has(path)) hold(path, null);
      else for (const cache of [filesRef.current, hashesRef.current, statesRef.current] as Map<string, unknown>[]) cache.delete(path);
    } else if (action === 'ask') hold(path, { theirs: disk.content, hash: disk.hash });
    else adoptDiskText(path, disk.content, disk.hash);
    setFilesVersion((v) => v + 1);
  };

  /**
   * Asks the disk again for files the editor has loaded (all of them by default), after the folder watch says
   * they changed or when the window comes back. Its own saves come back as the same hash, without the text.
   */
  const recheck = (paths = [...hashesRef.current.keys()]) => {
    const job = writeChain.current.then(() =>
      Promise.all(
        paths.map(async (path) => {
          const known = hashesRef.current.get(path);
          if (known === undefined) return;
          try {
            // a deleted tab's file that's back comes with its text, to compare with the tab's
            const disk = heldRef.current.get(path) === null ? await getFile(projectId, path) : await getFileIfChanged(projectId, path, known);
            if (disk.content !== undefined) changedOnDisk(path, { content: disk.content, hash: disk.hash });
          } catch (err) {
            if (err instanceof ApiError && err.status === 404) changedOnDisk(path, null);
          }
        })
      )
    );
    writeChain.current = job.catch(() => undefined);
    return job;
  };

  const saveNow = async (announce = false) => {
    const path = activeRef.current;
    const view = viewRef.current;
    if (!path || !view) return;
    // a held file waits for the user to say what to keep, its text kept should they leave first
    if (heldRef.current.has(path)) {
      if (dirtyRef.current) unsavedRef.current.set(path, true);
      return;
    }
    if (dirtyRef.current) {
      const content = view.state.doc.toString();
      markClean();
      try {
        await queueWrite(path, content);
      } catch (err) {
        dirtyRef.current = true;
        setDirty(true);
        const disk = refusedFor(err);
        if (disk !== undefined) changedOnDisk(path, disk);
        else notify(`Couldn’t save ${nameOf(path)}: ${errorText(err)}`, 'error');
        return;
      }
      // a .tex that gained or lost its \documentclass: the tree says again which files are documents
      if (isTex(path) && DOCUMENT_CLASS.test(content.slice(0, 16384)) !== documents.includes(path)) refreshTree().catch(() => undefined);
    }
    if (announce) notify(`Saved ${nameOf(path)}`, 'success');
  };

  /** Replaces the open document without counting it as typing (it stays undoable). Only the part that differs changes, so the cursor stays put outside it. */
  const setDoc = (content: string) => {
    const view = viewRef.current;
    const old = view?.state.doc.toString();
    if (!view || old === undefined || old === content) return;
    let from = 0;
    while (from < old.length && from < content.length && old[from] === content[from]) from += 1;
    let end = 0;
    while (end < old.length - from && end < content.length - from && old[old.length - 1 - end] === content[content.length - 1 - end]) end += 1;
    view.dispatch({ changes: { from, to: old.length - end, insert: content.slice(from, content.length - end) }, annotations: programmatic.of(true) });
  };

  const showEmptyEditor = () => {
    activeRef.current = '';
    setActivePath('');
    markClean();
    viewRef.current?.setState(EditorState.create({ doc: '', extensions: extensionsRef.current }));
    setEditorValue('');
    setSelectionRange([0, 0]);
  };

  /** TexLab's squiggles, hovers and jumps for the open file, when TexLab is answering and reads that kind of file. */
  const attachTexlab = () => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: texlabSlot.reconfigure(texlabRef.current?.extensionFor(activeRef.current) ?? []) });
    const clear = texlabRef.current?.available ? null : clearMarks(view.state);
    if (clear) view.dispatch(clear);
  };

  const openFile = async (path: string) => {
    if (!path) return;
    if (!TEXT_FILE.test(path)) {
      const doc = docs.find((d) => pdfOf(d) === path);
      if (doc) {
        setPanel(null);
        // from editor only, the PDF comes back beside the editor
        if (layoutRef.current.view === 'editor') setLayout({ view: 'split' });
        if (!pdf || doc !== shownDoc) loadPdf(doc);
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
      // a jump highlight would otherwise come back with the file and never fade, and a hover with no pointer over it
      view.dispatch({ effects: [setJumpHighlight.of(null), closeHoverTooltips] });
      if (activeRef.current) statesRef.current.set(activeRef.current, view.state);
      const saved = statesRef.current.get(path);
      clearGhost();
      view.setState(saved && saved.doc.toString() === content ? saved : EditorState.create({ doc: content, extensions: extensionsRef.current }));
      // a saved state keeps its own language configuration, so every open says again which file this is
      view.dispatch({ effects: languageCompartment.reconfigure(languageFor(path)) });
      if (docKind(path) === 'typst') loadTypst().then((language) => { if (language && activeRef.current === path) viewRef.current?.dispatch({ effects: languageCompartment.reconfigure(language) }); });
      activeRef.current = path;
      attachTexlab();
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
    try {
      await queueWrite(path, content);
    } catch (err) {
      // changed or deleted on disk since it loaded: the open file's text is held as unsaved, another takes the disk's
      const disk = refusedFor(err);
      if (disk !== undefined) {
        if (path === activeRef.current) {
          dirtyRef.current = true;
          setDirty(true);
        }
        changedOnDisk(path, disk);
      }
      throw err;
    }
    filesRef.current.set(path, content);
    setFilesVersion((v) => v + 1);
    if (path === activeRef.current) setDoc(content);
    if (!items.some((i) => i.path === path)) await refreshTree();
  };

  const reloadFiles = async (paths: string[]) => {
    for (const path of paths) {
      const { content, hash } = await getFile(projectId, path);
      adoptDiskText(path, content, hash);
    }
    setFilesVersion((v) => v + 1);
  };

  // ─── a file changed on another computer, or deleted on disk ───

  /**
   * Keep mine: a version of the project as it is on disk first, with their text, then this text over it. Restore,
   * for a deleted file: this text, made again, unless a file has taken its place since.
   */
  const keepMine = async (path: string) => {
    const held = heldRef.current.get(path);
    if (held === undefined) return;
    setComparing(false);
    const active = path === activeRef.current;
    try {
      if (held) {
        const res = await saveVersion(projectId, { reason: 'manual', label: `${nameOf(path)} from another computer` });
        if (!res.ok) throw new Error('The checkpoint couldn’t be saved.');
        if (!res.unchanged) window.dispatchEvent(new Event(VERSIONS_CHANGED));
        hashesRef.current.set(path, held.hash);
      }
      hold(path);
      if (active) markClean();
      await queueWrite(path, filesRef.current.get(path) ?? '', !held);
      if (!held) await refreshTree();
    } catch (err) {
      if (active) {
        dirtyRef.current = true;
        setDirty(true);
      }
      const disk = refusedFor(err);
      // changed again meanwhile: asked again
      if (disk !== undefined) changedOnDisk(path, disk);
      // a file is there again (back, or in another letter case): asked about as one changed on another computer
      else if (!held && err instanceof ApiError && err.status === 409) {
        hold(path, null);
        await recheck([path]);
      } else notify(`Couldn’t ${held ? 'keep your' : 'restore'} ${nameOf(path)}: ${errorText(err)}`, 'error');
    }
  };

  /** Use theirs: the text on disk, undoably, so the editor's own is a ⌘Z away. */
  const takeTheirs = (path: string) => {
    const held = heldRef.current.get(path);
    setComparing(false);
    if (held) adoptDiskText(path, held.theirs, held.hash);
    setFilesVersion((v) => v + 1);
  };

  /** Close a deleted file's tab, and forget its text. */
  const closeGone = async (path: string) => {
    await closeTab(path);
    for (const cache of [filesRef.current, hashesRef.current, heldRef.current, unsavedRef.current] as Map<string, unknown>[]) cache.delete(path);
    setHeldVersion((v) => v + 1);
  };

  /** Each held file with text here that isn't on disk, and the conflict copy beside it that leaving keeps it in. */
  const heldCopies = () =>
    [...heldRef.current.keys()]
      // never an empty copy: only text this editor still has
      .filter((path) => hasUnsaved(path) && filesRef.current.has(path))
      .map((path) => ({ path, copy: conflictCopyPath(path, machineRef.current, new Date()), content: filesRef.current.get(path) ?? '' }));

  /**
   * Leaving or quitting before saying what to keep of held files: each one's text here goes beside it as a conflict
   * copy, which the conflict-copy banner offers, so it's neither lost nor written over the text on disk.
   */
  const keepHeldText = async () => {
    const copies = heldCopies();
    for (const { path } of copies) unsavedRef.current.delete(path);
    if (heldRef.current.has(activeRef.current)) dirtyRef.current = false;
    try {
      await Promise.all(copies.map(({ copy, content }) => writeFile(projectId, copy, content, { create: true })));
    } catch (err) {
      for (const { path } of copies) unsavedRef.current.set(path, true);
      throw err;
    }
  };

  /** Leaving the project or quitting: the open file saved, and held files' text kept. */
  const saveAll = () => saveNow().then(keepHeldText);

  /** Files replaced by an upload: forget their cached text and undo history, and show the new contents. */
  const onUploaded = async (paths: string[]) => {
    for (const path of paths) statesRef.current.delete(path);
    await reloadFiles(paths.filter((p) => filesRef.current.has(p) || p === activeRef.current));
  };

  const reloadProject = async () => {
    setPending([]);
    for (const cache of [filesRef.current, statesRef.current, hashesRef.current, heldRef.current, unsavedRef.current]) cache.clear();
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
    for (const cache of [filesRef.current, statesRef.current, hashesRef.current, heldRef.current, unsavedRef.current] as Map<string, unknown>[]) {
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
      // TexLab knows it by its new name
      attachTexlab();
    }
    if (mainFile && remap(mainFile) !== mainFile) chooseMain(remap(mainFile), true);
    setShownDoc(remap);
    shownRef.current = remap(shownRef.current);
    setCompiledDoc(remap);
  };

  const onDeleted = (path: string) => {
    const gone = (p: string) => p === path || p.startsWith(`${path}/`);
    for (const cache of [filesRef.current, statesRef.current, hashesRef.current, heldRef.current, unsavedRef.current] as Map<string, unknown>[]) {
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
    // the pane shows main's PDF instead, when it has one
    if (gone(shownDoc)) showPdf(mainFile, items.some((i) => i.path === mainPdf && !gone(i.path)) ? { url: blobUrl(projectId, mainPdf, Date.now()), blob: false } : null);
    if (gone(compiledDoc)) setCompiledDoc(mainFile);
  };

  // keep a main file whenever there is a .tex file. Runs when the tree changes, not when the main file
  // does: a rename sets the new name before the refreshed tree contains it.
  useEffect(() => {
    if (!loaded || (mainFile && texFiles.includes(mainFile))) return;
    // never a sync app's conflict copy
    const tex = texFiles.filter((p) => !conflicts[p]);
    setMainFile(tex.find((p) => /(^|\/)main\.tex$/i.test(p)) || tex[0] || '');
  }, [loaded, texFiles]);

  // a tab whose file went from the tree (deleted or renamed on another computer, in Finder, by git) is marked
  // and not saved back unasked; one marked that's back is checked against the disk
  useEffect(() => {
    if (!loaded) return;
    const files = new Set(items.filter((i) => i.type === 'file').map((i) => i.path));
    const back = tabs.filter((p) => files.has(p) && heldRef.current.get(p) === null);
    for (const path of tabs) if (!files.has(path) && heldRef.current.get(path) !== null) hold(path, null);
    if (back.length) recheck(back).catch(() => undefined);
  }, [items]);

  // a reloaded tree or file can mean a .bib changed on disk
  useEffect(() => bibRef.current.clear(), [items, filesVersion]);

  // completion rescans the project a moment after the tree, the document being edited or a file changes, and
  // after each save rather than while typing; the completion source scans the open file's text itself
  useEffect(() => {
    if (dirty) return;
    let live = true;
    const timer = window.setTimeout(() => {
      const files = new Set(items.filter((i) => i.type === 'file').map((i) => i.path));
      // open files from their live text, the rest from disk each time: caching those here would show stale
      // text, and autosave it, if the file changes on disk before it's opened. A .bib (a Zotero export can be
      // megabytes) is kept until the tree or a file reloads.
      const read = async (path: string) => {
        const text = filesRef.current.get(path) ?? bibRef.current.get(path) ?? (await getFile(projectId, path)).content;
        if (/\.bib$/i.test(path) && !filesRef.current.has(path)) bibRef.current.set(path, text);
        return text;
      };
      // a subfiles chapter or a standalone figure is a document of its own, but completes with what main has
      const root = docRoot !== mainFile && PART_OF_MAIN.test(filesRef.current.get(docRoot) ?? '') ? mainFile : docRoot;
      scanProject(root, files, read).then((scan) => {
        if (live) projectScanRef.current = scan;
      });
    }, 400);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [items, docRoot, mainFile, dirty, filesVersion]);

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
    if (opts.focus !== false) showEditor();
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

  /** To a line (1-based), and to its column (1-based) when there is one. */
  const jumpTo = async (file: string, line: number, column?: number | null) => {
    if (!items.some((i) => i.path === file)) {
      notify(`${file} isn’t one of this project’s files.`);
      return;
    }
    showEditor();
    await openFile(file);
    const view = viewRef.current;
    if (!view || activeRef.current !== file) return;
    const target = view.state.doc.line(Math.min(Math.max(1, line), view.state.doc.lines));
    const at = Math.min(target.to, target.from + Math.max(0, (column ?? 1) - 1));
    view.dispatch({ selection: { anchor: at }, effects: EditorView.scrollIntoView(at, { y: 'center' }) });
    cursorPlacedRef.current = true;
    view.focus();
  };

  // the outline and a double-click on PDF text land here; from PDF only, the editor shows again
  const select = async (file: string, from: number, to = from) => {
    showEditor();
    await openFile(file);
    const view = viewRef.current;
    if (!view || activeRef.current !== file) return;
    const end = Math.min(to, view.state.doc.length);
    view.dispatch({ selection: { anchor: Math.min(from, end), head: end }, effects: EditorView.scrollIntoView(from, { y: 'center' }) });
    cursorPlacedRef.current = true;
    view.focus();
  };

  /**
   * PDF text without SyncTeX: find the line in the open file first, then in the other documents of its kind.
   * Source line breaks may sit anywhere, a hyphenated last word won't match and macros
   * change the text, so shorter word runs are tried when the whole line isn't found.
   */
  const findInSource = async (text: string) => {
    const words = text.replace(/\S*-$/, '').trim().split(/\s+/).filter(Boolean);
    const runs = [words, words.slice(0, 6), words.slice(0, 4)].filter((run, i, all) => run.join(' ').length >= 4 && all.findIndex((r) => r.length === run.length) === i);
    const kind = docKind(shownDoc);
    const sameKind = items.filter((i) => i.type === 'file' && docKind(i.path) === kind && !conflicts[i.path]).map((i) => i.path);
    const order = [activeRef.current, ...sameKind].filter((p, i, all) => docKind(p) === kind && all.indexOf(p) === i);
    for (const run of runs) {
      const pattern = new RegExp(run.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'));
      for (const path of order) {
        const content = path === activeRef.current ? viewRef.current?.state.doc.toString() || '' : await ensureFileContent(path).catch(() => '');
        const match = pattern.exec(content);
        if (match) {
          await select(path, match.index, match.index + match[0].length);
          return activeRef.current === path;
        }
      }
    }
    return false;
  };

  /** Double-click on the PDF: the source line SyncTeX gives for that spot, else the text there found in the source. */
  const jumpFromPdf = async (at: PdfPoint, text: string) => {
    if (!settings.syncDoubleClick) return;
    // Typst and Markdown have no SyncTeX: their PDF text finds the source line
    const kind = docKind(shownDoc);
    let landed = false;
    if (kind !== 'latex') {
      if (text.length >= 3) landed = await findInSource(text);
    } else {
      const res = await synctexEdit(projectId, at, shownDoc).catch(() => null);
      if (res?.ok && items.some((i) => i.path === res.file)) {
        await jumpTo(res.file, res.line, res.column);
        landed = activeRef.current === res.file;
      } else if (text.length >= 3) landed = await findInSource(text);
    }
    const view = viewRef.current;
    if (!landed || !view) return;
    // the line landed on (or the text found) stays highlighted for as long as Settings → Editor says
    const { from, to } = view.state.selection.main;
    const highlight = (value: 'fade' | null) => viewRef.current?.dispatch({ effects: setJumpHighlight.of(value) });
    unlingerRef.current();
    view.dispatch({ effects: setJumpHighlight.of({ from, to }) });
    unlingerRef.current = linger(settings.syncHighlightSeconds, () => highlight('fade'), () => highlight(null));
  };

  /** Double-click in a document (CodeMirror selects the word as ever): where that line went, when the PDF shows beside it. */
  const showInPdf = async (pos: number) => {
    const view = viewRef.current;
    const file = activeRef.current;
    if (!settings.syncDoubleClick || !view || !pdf || !isDocument(file) || layout.view !== 'split' || panel) return;
    const line = view.state.doc.lineAt(pos);
    const kind = docKind(file);
    // Typst and Markdown have no SyncTeX: the line's words find it in the PDF
    if (kind !== 'latex') {
      const words = lineWords(line.text);
      const runs = [words, words.slice(0, 8), words.slice(0, 4)].filter((run, i, all) => run.length >= 2 && all.findIndex((r) => r.join(' ') === run.join(' ')) === i);
      for (const run of runs) {
        const boxes = (await pdfRef.current?.firstMatch(run.join(' ')).catch(() => [])) ?? [];
        if (boxes.length) {
          pdfRef.current?.highlight(boxes, settings.syncHighlightSeconds);
          return;
        }
      }
      // a double-click is also how a word is selected, so the same notice doesn't come back every time
      const notice = `${pdf.url}\n${file}`;
      if (syncNoticeRef.current !== notice) notify('Couldn’t find this line in the PDF.');
      syncNoticeRef.current = notice;
      return;
    }
    const res = await synctexView(projectId, { file, line: line.number, column: pos - line.from + 1 }, shownDoc).catch((err) => ({ ok: false as const, error: errorText(err) }));
    const notice = `${pdf.url}\n${file}\n${res.ok ? '' : res.error}`;
    if (res.ok) pdfRef.current?.highlight(res.boxes, settings.syncHighlightSeconds);
    // a double-click is also how a word is selected, so the same notice doesn't come back every time
    else if (syncNoticeRef.current !== notice) notify(res.error);
    syncNoticeRef.current = notice;
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
    if (!res.ok) throw new Error('The checkpoint couldn’t be saved.');
    if (!res.unchanged) window.dispatchEvent(new Event(VERSIONS_CHANGED));
    return res;
  };

  // the Save checkpoint button and shortcut; Tools › Checkpoints has its own, with a label field
  const saveVersionNow = async () => {
    if (savingVersionRef.current) return;
    savingVersionRef.current = true;
    setSavingVersion(true);
    try {
      const { version, unchanged } = await createVersion('manual');
      if (unchanged || !version) notify('Nothing has changed since the last checkpoint.');
      else toast(`Saved checkpoint ${version.number}`, { tone: 'success', action: { label: 'Rename', onClick: () => renameSavedVersion(version) } });
    } catch (err) {
      notify(`Couldn’t save a checkpoint: ${errorText(err)}`, 'error');
    } finally {
      savingVersionRef.current = false;
      setSavingVersion(false);
    }
  };

  const renameSavedVersion = async (version: VersionMeta) => {
    const label = (await promptDialog({ title: `Rename checkpoint ${version.number}`, placeholder: 'Name, e.g. Submitted draft', confirmLabel: 'Rename' }))?.trim();
    if (!label) return;
    try {
      await renameVersion(projectId, version.id, label);
      window.dispatchEvent(new Event(VERSIONS_CHANGED));
      notify(`Renamed checkpoint ${version.number} “${label}”`, 'success');
    } catch (err) {
      notify(`Couldn’t rename the checkpoint: ${errorText(err)}`, 'error');
    }
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
    if (!ready.length) return { applied: [], stale, checkpoint: null };
    const { version } = await createVersion('before-ai');
    for (const change of ready) await writeProjectFile(change.filePath, change.proposed);
    setPending((prev) => prev.filter((p) => !ready.some((c) => c.filePath === p.filePath)));
    notify(ready.length === 1 ? `Applied the changes to ${nameOf(ready[0].filePath)}` : `Applied changes to ${ready.length} files`, 'success');
    return { applied: ready, stale, checkpoint: version };
  };

  /**
   * F2 on a label, citation key or command: TexLab's edits across the project, the .bib included, listed for a yes, then
   * written through the save route with each file's change check after a "Before rename" checkpoint, all or none.
   */
  const renameSymbol = async () => {
    const view = viewRef.current;
    const texlab = texlabRef.current;
    if (!view || !texlab?.available || !activeRef.current) return;
    const pos = view.state.selection.main.head;
    try {
      const found = await texlab.renameTarget(view, pos);
      if (!found) {
        notify('There’s nothing here to rename. Put the cursor on a label, citation key or command.');
        return;
      }
      const target = found.text;
      const typed = await promptDialog({ title: `Rename “${target}”`, message: 'Every use of it in the project changes too.', defaultValue: target, confirmLabel: 'Rename' });
      const name = newName(typed ?? '', found.command);
      if (!name || name === target) return;
      // TexLab doesn't check either: a second \label or .bib entry by that name
      const scan = projectScanRef.current;
      if (!found.command && (scan.scans.some((s) => s.labels.includes(name)) || scan.bib.some((b) => b.key === name))) {
        throw new Error(`“${name}” is already used in this project. Pick another name.`);
      }
      // nor rename a key where another .bib entry inherits from it
      if (!found.command && scan.bib.some((b) => b.key === target)) {
        for (const file of [...fileSet].filter((f) => /\.bib$/i.test(f))) {
          if (crossReferred(await readText(file).catch(() => ''), target)) throw new Error(`“${target}” is named in a crossref, xref, xdata or related field in ${file}. Rename it there too, or rename by hand.`);
        }
      }
      // TexLab plans against the open file's text and the others' on disk, so the open file goes to disk first
      await saveNow();
      const edits = renameEdits(await texlab.renameEdits(view, pos, name), (uri) => {
        // TexLab read a file brought in under another spelling of its name once, and plans that copy's edits from it
        const file = texlab.pathOf(uri);
        const spelt = texlab.spelling(uri);
        if (file && spelt && file !== spelt) throw new Error(`The document brings in ${file} as ${spelt}. Make the \\input match the file’s name, then rename.`);
        return file;
      });
      if (!edits.size) {
        notify(`TexLab found nothing to rename for “${target}”.`);
        return;
      }
      const held = [...edits.keys()].find((file) => heldRef.current.has(file));
      if (held) throw new Error(`${nameOf(held)} is waiting for you to choose which version to keep.`);
      const plan = await Promise.all(
        [...edits].map(async ([file, list]) => {
          const before = file === activeRef.current ? view.state.doc.toString() : await ensureFileContent(file);
          try {
            // each edit must replace the old name, or TexLab planned it against other text than this
            return { file, before, after: applyEdits(before, list, target), count: list.length };
          } catch (err) {
            throw new Error(`${nameOf(file)}: ${errorText(err)}`);
          }
        })
      );
      const ok = await confirmDialog({
        title: `Rename “${target}” to “${name}”?`,
        message: `${plan.map((p) => `${p.file}: ${plural(p.count, 'change')}`).join('\n')}\n\nA “Before rename” checkpoint is saved first.`,
        confirmLabel: 'Rename'
      });
      if (!ok) return;
      const { version } = await createVersion('manual', `Before rename of “${target}” to “${name}”`);
      const written: typeof plan = [];
      try {
        for (const p of plan) {
          // the open file may have been typed in since TexLab's edits were made for it
          if (p.file === activeRef.current && view.state.doc.toString() !== p.before) throw new Error(`${nameOf(p.file)} changed meanwhile.`);
          await writeProjectFile(p.file, p.after);
          written.push(p);
        }
      } catch (err) {
        // all or none: what was written goes back to its text from before, which the checkpoint holds too
        const stuck: string[] = [];
        for (const p of written.reverse()) await writeProjectFile(p.file, p.before).catch(() => stuck.push(p.file));
        const after = stuck.length ? ` ${stuck.join(', ')} couldn’t be put back; checkpoint ${version?.number} has them as they were.` : ' Nothing was renamed.';
        throw new Error(`${errorText(err)}${after}`);
      }
      notify(`Renamed “${target}” to “${name}” in ${plural(plan.length, 'file')}`, 'success');
      // ⇧F12's list shows the old name and lines
      setReferences(null);
    } catch (err) {
      notify(`Couldn’t rename: ${errorText(err)}`, 'error');
    }
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

  /** Puts a PDF in the pane (null: none), freeing the blob URL of the one it replaces. */
  const showPdf = (doc: string, next: { url: string; blob: boolean } | null) => {
    const old = pdfNow.current;
    setPdf(next);
    setShownDoc(doc);
    shownRef.current = doc;
    if (old?.blob) window.setTimeout(() => URL.revokeObjectURL(old.url), 10_000);
  };

  /** A document's PDF from its last compile: the copy on disk, or the compile's own when it couldn't write over that. */
  const pdfFor = (doc: string) => {
    const kept = stalePdf.current.get(doc);
    return kept ? { url: URL.createObjectURL(kept.blob), blob: true } : { url: blobUrl(projectId, pdfOf(doc), Date.now()), blob: false };
  };

  /** A document's PDF from its last compile; returns the URL it shows from. */
  const loadPdf = (doc: string) => {
    const next = pdfFor(doc);
    showPdf(doc, next);
    return next.url;
  };

  /** A link in the PDF to another PDF (xr-hyper's links to a linked document): that document's PDF, at the spot. */
  const followFileLink = (target: string) => {
    // a stray % (a file called "50% draft.pdf") isn't an escape
    const decode = (text: string) => {
      try {
        return decodeURIComponent(text);
      } catch {
        return text;
      }
    };
    const [file, fragment = ''] = target.replace(/^file:(\/\/)?/, '').split('#');
    // the link is written from the shown PDF's folder
    const parts: string[] = [];
    for (const part of `${shownDoc.slice(0, shownDoc.lastIndexOf('/') + 1)}${decode(file)}`.split('/')) {
      if (part === '..') parts.pop();
      else if (part && part !== '.') parts.push(part);
    }
    const wanted = parts.join('/').toLowerCase();
    const doc = pdfDocs.find((d) => pdfOf(d).toLowerCase() === wanted);
    if (!doc) {
      notify(`That link goes to ${file}, which isn’t the PDF of a document in this project.`);
      return;
    }
    const name = decode(fragment).replace(/^nameddest=/, '');
    const page = name.match(/^page=(\d+)/);
    let dest: PdfDest = page ? [Number(page[1]) - 1, { name: 'Fit' }] : name;
    if (name.startsWith('[')) {
      try {
        dest = JSON.parse(name);
      } catch {
        // a name after all
      }
    }
    const url = doc === shownDoc ? undefined : loadPdf(doc);
    if (name) pdfRef.current?.goTo(dest, url);
  };

  /**
   * The syntax check before compiling: TexLab's brace and environment errors in the document's files and, if there are
   * any, whether to compile anyway (No goes to the first). Passes without TexLab, or when TexLab takes too long.
   */
  const syntaxCheckPasses = async (doc: string) => {
    const texlab = texlabRef.current;
    if (!texlab?.available) return true;
    const found = await Promise.race([texlab.diagnostics(), new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 5000))]).catch(() => null);
    if (!found?.available) return true;
    const texts = new Map<string, string>();
    const read = async (path: string) => {
      const text = await readText(path);
      texts.set(path, text);
      return text;
    };
    const { scans } = await scanProject(doc, fileSet, read, false);
    const errors = syntaxErrors(scans.map(({ file = '' }) => file), found.files, texts);
    if (!errors.length) return true;
    const listed = errors.slice(0, 6).map((e) => `${e.file}, line ${e.line}: ${e.message}`);
    if (errors.length > 6) listed.push(`and ${errors.length - 6} more`);
    const message = `TexLab found ${plural(errors.length, 'syntax error')} in ${nameOf(doc)}:\n${listed.join('\n')}`;
    if (await confirmDialog({ title: 'Compile anyway?', message, confirmLabel: 'Compile anyway' })) return true;
    await jumpTo(errors[0].file, errors[0].line, errors[0].col);
    return false;
  };

  /**
   * The document Compile builds (compileTarget), or another once. fresh: its kept build files are cleared first.
   * auto: auto compile started it. Says how it ended ('busy': another compile was running).
   */
  const runCompile = async (doc = compileTarget, opts: { fresh?: boolean; auto?: boolean } = {}): Promise<CompileState['state'] | 'busy'> => {
    if (compilingRef.current) return 'busy';
    if (!doc) {
      notify('There’s no document to compile. Add one, or choose “Set as main file” from a file’s menu.');
      return 'failed';
    }
    // not for auto compile, which would ask at every pause in typing
    // TexLab reads LaTeX only, so its check is for a .tex document
    if (compileOptions.syntaxCheck && !opts.auto && isTex(doc)) {
      compilingRef.current = true;
      const go = await syntaxCheckPasses(doc)
        .catch(() => true)
        .finally(() => (compilingRef.current = false));
      if (!go) return 'stopped';
    }
    compilingRef.current = true;
    // this compile builds every edit so far; one made from now on is owed another
    editedRef.current = false;
    autoRunningRef.current = !!opts.auto;
    compileIdRef.current = crypto.randomUUID();
    const used = engine;
    let ended: CompileState['state'] = 'failed';
    // a chapter's % !TEX root can send the compile to its document
    let built = doc;
    setCompile({ state: 'running', engine: used });
    try {
      await saveNow();
      const startedAt = Date.now();
      const res = await compileProject({
        projectId,
        mainFile: doc,
        engine: used,
        compileId: compileIdRef.current,
        haltOnError: compileOptions.haltOnError,
        bibTool: compileOptions.bibTool,
        draft: compileOptions.draft,
        fresh: opts.fresh,
        texFolder: settings.texFolder || undefined,
        checkpoint: settings.checkpointOnCompile
      });
      const actual = res.engine || used;
      built = res.doc || doc;
      if (res.checkpoint?.saved) window.dispatchEvent(new Event(VERSIONS_CHANGED));
      const problem = checkpointProblem(res.checkpoint, skippedToldRef.current);
      if (problem && settings.checkpointNotice) notify(problem, 'error');
      setCompileLog(`Engine: ${engineLabel(actual)}\nDocument: ${built}\n\n${res.log || ''}`.trim());
      setCompileDiagnostics(res.errors ?? null);
      setCompileNotice(res.code ? { code: res.code, version: res.version } : null);
      setCompileGenerated(res.generated ?? null);
      // an install from Logs' notice changes what the compile menu can offer
      if (res.code) getEngines().then(setEngines).catch(() => undefined);
      if (res.ok && res.pdf) {
        const bytes = Uint8Array.from(atob(res.pdf), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        // an auto compile of a document whose PDF was put away meanwhile (another file opened) leaves the pane be;
        // the copy on disk, or stalePdf, shows when it comes back
        if (!opts.auto || built === shownRef.current) showPdf(built, { url, blob: true });
        else window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
        // a copy on disk another program holds (Windows) is older: this one shows when the document's PDF comes back
        if (res.pdfStale) stalePdf.current.set(built, { blob, at: startedAt });
        else stalePdf.current.delete(built);
        setCompileFailure('');
        ended = 'ok';
        if (built === mainFile)
          pdfThumbnail(url)
            .then((png) => saveThumbnail(projectId, png))
            .catch(() => undefined);
      } else if (res.stopped) {
        setCompileFailure('');
        ended = 'stopped';
      } else {
        setCompileFailure(res.error || 'No PDF was produced.');
      }
      setCompile({ state: ended, engine: actual, at: new Date() });
      // a linked document compiled first writes its PDF too, whether or not this one compiled
      const made = [res.ok ? res.pdfPath : undefined, ...(res.linked ?? []).filter((l) => l.ok).map((l) => pdfOf(l.file))];
      if (made.some((p) => p && !items.some((i) => i.path === p))) refreshTree().catch(() => undefined);
    } catch (err) {
      setCompileLog(`Compile request failed: ${errorText(err)}`);
      setCompileDiagnostics(null);
      setCompileNotice(null);
      setCompileGenerated(null);
      setCompileFailure(errorText(err));
      setCompile({ state: 'failed', engine: used, at: new Date() });
    } finally {
      compilingRef.current = false;
      setCompiledDoc(built);
    }
    // not for auto compile, which would open them at every pause in typing
    if (ended === 'failed' && !opts.auto && settings.openLogsOnFail) openTools('logs');
    // an automatic compile that came while this one ran goes now
    if (autoWaitingRef.current) {
      autoWaitingRef.current = false;
      window.setTimeout(() => actions.current.autoCompile());
    }
    return ended;
  };

  /**
   * Auto compile, the chosen pause after the last edit: the edit is saved first. One that comes while a compile runs
   * waits for it to end, and stops it first when that one was automatic too, since it's now out of date.
   */
  const autoCompile = () => {
    if (compilingRef.current) {
      autoWaitingRef.current = true;
      if (autoRunningRef.current) stopCompile(compileIdRef.current).catch(() => undefined);
      return;
    }
    // a compile since the edits (Compile pressed during the pause) already built them
    if (!editedRef.current) return;
    // the document they were made in, which opening another file with PDF follows the open file may have put away
    runCompile(editedDocRef.current || compileTarget, { auto: true });
  };

  /** Every document from scratch, each after the documents it links (xr-hyper reads their .aux); Stop ends the run. */
  const recompileAll = async () => {
    const order: string[] = [];
    const visit = async (doc: string, path: string[]) => {
      if (order.includes(doc) || path.includes(doc)) return;
      const text = await ensureFileContent(doc).catch(() => '');
      for (const linked of externalDocuments(doc, text)) if (docs.includes(linked)) await visit(linked, [...path, doc]);
      order.push(doc);
    };
    for (const doc of docs) await visit(doc, []);
    const shown = shownDoc;
    // it has a PDF to come back to: from before, or one this run made (items is still the tree from before it)
    let made = items.some((i) => i.path === pdfOf(shown));
    try {
      for (const doc of order) {
        const ended = await runCompile(doc, { fresh: true });
        if (doc === shown && ended === 'ok') made = true;
        if (ended === 'stopped' || ended === 'busy') break;
      }
    } finally {
      // each compile that worked showed its own PDF; the one that was showing comes back (a failed compile left it as
      // it was), so Compile goes on building it
      if (shown && shownRef.current !== shown && made) loadPdf(shown);
    }
  };

  /** A project compile choice (null: back to the app's default), kept in the project's .spectrum/settings.json. */
  const setCompileOption = <K extends keyof CompileOptions>(key: K, value: CompileOptions[K] | null) => {
    setProjectCompile((prev) => {
      const next = { ...prev };
      if (value === null) delete next[key];
      else next[key] = value;
      return next;
    });
    return updateProjectSettings(projectId, { compile: { [key]: value } })
      .then((res) => setProjectCompile(res.settings.compile ?? {}))
      .catch((err) => {
        notify(`Couldn’t save the project’s compile settings: ${errorText(err)}`, 'error');
        getProjectSettings(projectId).then((res) => setProjectCompile(res.settings.compile ?? {}), () => undefined);
      });
  };

  /** Use for all projects: the project's choice becomes the app's default, and the project follows it. */
  const useForAllProjects = (key: keyof CompileOptions) => {
    updateSettings({ compileDefaults: { ...settings.compileDefaults, [key]: compileOptions[key] } });
    setCompileOption(key, null);
  };

  // Tectonic fetches its packages the first time; say so instead of looking stuck
  useEffect(() => {
    if (compile.state !== 'running' || compile.engine !== 'tectonic') return;
    const timer = window.setTimeout(() => setCompile((c) => (c.state === 'running' ? { ...c, slow: true } : c)), 10_000);
    return () => window.clearTimeout(timer);
  }, [compile.state, compile.engine]);

  // ─── view and panels ───

  // the panels take the PDF's place and are opened from the editor's top bar, so they only show with both
  // columns: picking a view closes them (Editor and PDF shows the PDF), and opening one brings both back
  const setView = (view: View) => {
    // WebKit can leave focus on an element that's hidden, and typing would go on landing there
    const hidden = view === 'pdf' ? '.editor-column, .tools-column' : view === 'editor' ? '.right-column' : '.tools-column';
    const active = document.activeElement;
    const fromSwitcher = !!active?.closest('.view-switcher');
    if (active instanceof HTMLElement && active.closest(hidden)) active.blur();
    flushSync(() => {
      setPanel(null);
      setLayout({ view });
    });
    // focus carries on: to the switcher now showing (each header has its own), or back into the editor
    if (fromSwitcher) [...document.querySelectorAll<HTMLElement>('.view-switcher .segment.active')].find((el) => el.offsetParent)?.focus();
    else if (view !== 'pdf' && document.activeElement === document.body) viewRef.current?.focus();
  };

  /** Before something moves the cursor or focuses the editor: from PDF only, both columns show again, straight away so it can take focus. */
  const showEditor = () => {
    if (layoutRef.current.view === 'pdf') flushSync(() => setLayout({ view: 'split' }));
  };

  const openPanel = (next: Panel) => {
    if (next !== 'grammar') setKeptPanels((list) => (list.includes(next) ? list : [...list, next]));
    setPanel(next);
    setLayout({ view: 'split' });
  };

  /** A panel's top-bar button: opens it, or closes it when it's open. */
  const togglePanel = (next: Panel) => (panel === next ? setPanel(null) : openPanel(next));

  const openTools = (tab?: ToolsTab) => {
    if (tab) setToolsTab(tab);
    openPanel('tools');
  };

  /** Floats, at its figure or table card. */
  const openFloats = (card: FloatCard) => {
    setFloatsCard((was) => ({ card, signal: was.signal + 1 }));
    openPanel('floats');
  };

  const closePanel = () => {
    setPanel(null);
    viewRef.current?.focus();
  };

  const toggleGrammar = () => togglePanel('grammar');

  // the assistant sits under the editor, so in PDF only it opens (or shows, if it's open) with both columns
  const toggleComposer = () => {
    if (composerOpen && layout.view !== 'pdf') {
      setComposerOpen(false);
      viewRef.current?.focus();
    } else {
      showEditor();
      setComposerOpen(true);
      setFocusSignal((n) => n + 1);
    }
  };

  const openAgentTask = (task: ResearchTask) => {
    setAgentTask((was) => ({ ...task, n: (was?.n || 0) + 1 }));
    openPanel('agent');
  };

  // an Edit chat from before 2.0 leaves the bottom card for the Spectrum agent
  const continueInAgent = (id: string) => {
    setChatId(null);
    setComposerOpen(false);
    setAgentThread((was) => ({ id, n: (was?.n || 0) + 1 }));
    openPanel('agent');
  };

  const leave = async (to: string) => {
    try {
      await saveAll();
    } catch (err) {
      // staying, with the text still here
      notify(`Couldn’t keep your unsaved changes: ${errorText(err)}`, 'error');
      return;
    }
    navigate(to);
  };

  // ─── a working copy of a template ───

  const openSaveTemplate = () => saveNow().then(() => setSaveTemplateOpen(true));

  const saveTemplate = async () => {
    setSavingTemplate(true);
    try {
      await saveNow();
      await saveTemplateDraft(projectId);
      notify(`Saved the “${project?.name}” template.`, 'success');
    } catch (err) {
      notify(`Couldn’t save the template: ${errorText(err)}`, 'error');
    } finally {
      setSavingTemplate(false);
    }
  };

  // Done: the copy goes, after asking when it has changes the template doesn't
  const closeTemplate = async () => {
    try {
      await saveNow();
      try {
        await closeTemplateDraft(projectId);
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 409)) throw err;
        const discard = await confirmDialog({
          title: `Discard your changes to the “${project?.name}” template?`,
          message: 'They aren’t saved to the template yet. To keep them, choose Save template or Save as new template… first.',
          confirmLabel: 'Discard changes',
          destructive: true
        });
        if (!discard) return;
        await closeTemplateDraft(projectId, true);
      }
      navigate('/projects');
    } catch (err) {
      notify(`Couldn’t close the template: ${errorText(err)}`, 'error');
    }
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

  // ─── PDF notes and to-dos ───

  /** Saves a note, showing it while its document's PDF shows; one that can't be saved can be tried again. */
  const keepNote = (note: PdfNote) => {
    if (note.doc === shownRef.current) setNotes((prev) => [...prev.filter((n) => n.id !== note.id), note]);
    saveNote(projectId, note).catch((err) => {
      setNotes((prev) => prev.filter((n) => n.id !== note.id));
      const what = note.text.length > 60 ? `${note.text.slice(0, 59)}…` : note.text;
      toast(`Couldn’t save the note “${what}”: ${errorText(err)}`, { tone: 'error', action: { label: 'Try again', onClick: () => keepNote(note) } });
    });
  };

  const addAnnotation = async (at: PdfPoint) => {
    const doc = shownDoc;
    const text = (await promptDialog({ title: 'Add a note', message: `Page ${at.page}`, placeholder: 'Note', confirmLabel: 'Add' }))?.trim();
    if (!text) return;
    const now = new Date().toISOString();
    keepNote({ id: crypto.randomUUID(), doc, ...at, text: text.slice(0, 2000), createdAt: now, updatedAt: now });
  };

  const removeNotes = async (gone: PdfNote[]) => {
    setNotes((prev) => prev.filter((n) => !gone.includes(n)));
    try {
      await Promise.all(gone.map((n) => deleteNote(projectId, n.id)));
      toast(gone.length === 1 ? 'Deleted the note' : `Deleted ${gone.length} notes`, { action: { label: 'Undo', onClick: () => gone.forEach(keepNote) } });
    } catch (err) {
      notify(`Couldn’t delete ${gone.length === 1 ? 'the note' : 'the notes'}: ${errorText(err)}`, 'error');
      listNotes(projectId, shownDoc)
        .then((res) => setNotes(res.notes || []))
        .catch(() => undefined);
    }
  };

  /** A page of a document's PDF in the pane: another document's opens there, the one showing scrolls to it. */
  const showPdfPage = (doc: string, at: number) => {
    if (!items.some((i) => i.path === pdfOf(doc))) {
      notify(`${nameOf(doc)} has no PDF yet. Compile it first.`);
      return;
    }
    rememberPage(`${projectId}:${doc}`, at);
    open(pdfOf(doc));
    if (doc === shownDoc && pdf) requestAnimationFrame(() => pdfRef.current?.scrollToPage(at));
  };

  /** From a panel: where a source line went in a document's PDF, which comes back in the panel's place lit up there. */
  const showLineInPdf = async (doc: string, file: string, line: number) => {
    const res = await synctexView(projectId, { file, line }, doc).catch((err) => ({ ok: false as const, error: errorText(err) }));
    if (!res.ok) return notify(res.error);
    // another document's PDF opens at the page; the one showing has its pages laid out to light up
    if (doc !== shownDoc || !pdf) return showPdfPage(doc, res.page);
    open(pdfOf(doc));
    requestAnimationFrame(() => pdfRef.current?.highlight(res.boxes, settings.syncHighlightSeconds));
  };

  /** Where a to-do links to: its line (found again by its text if lines moved), its PDF page, or its reference's definition. */
  const openTodoLink = async (link: TodoLink) => {
    if ('doc' in link) showPdfPage(link.doc, link.page);
    else if ('file' in link) {
      const text = await readText(link.file).catch(() => null);
      if (text === null) notify(`${link.file} isn’t one of this project’s files.`);
      else await jumpTo(link.file, findLine(text, link.line, link.snippet));
    } else {
      const files = await Promise.all([...texFiles, ...bibFiles].map(async (path) => ({ path, text: await readText(path).catch(() => '') })));
      const found = findKey(files, link.key);
      if (found) await jumpTo(found.file, found.line);
      else notify(`Couldn’t find ${link.key} in this project.`);
    }
  };

  /** Add to-do here: asks what it is, then keeps it with the link. */
  const addTodo = async (link: TodoLink, where: string) => {
    const text = (await promptDialog({ title: 'Add a to-do', message: where, placeholder: 'To-do', confirmLabel: 'Add' }))?.trim();
    if (text && (await todos.add(text.slice(0, 2000), link))) notify(`Added “${text}” to your to-dos`, 'success');
  };

  /** The line at `pos` in the open file, linked with its text so it's found again once lines move. */
  const addTodoAtLine = (pos: number) => {
    const view = viewRef.current;
    const path = activeRef.current;
    if (!view || !path) return;
    const line = view.state.doc.lineAt(Math.min(pos, view.state.doc.length));
    addTodo({ file: path, line: line.number, snippet: snippetOf(line.text) }, `${nameOf(path)}, line ${line.number}`).catch(() => undefined);
  };

  /** A heading the PDF's contents took from the source: where SyncTeX puts it. */
  const showHeading = async (file: string, line: number) => {
    const res = await synctexView(projectId, { file, line }, shownDoc).catch((err) => ({ ok: false as const, error: errorText(err) }));
    if (res.ok) pdfRef.current?.highlight(res.boxes, settings.syncHighlightSeconds);
    else notify(res.error);
  };

  const openFind = () => {
    setFindOpen(true);
    setFindSignal((n) => n + 1);
  };

  // with the pages focused (the page box and Find's search box have keys of their own)
  const onPdfKey = (e: ReactKeyboardEvent) => {
    if (!(e.target as HTMLElement).closest('.pdf-scroll') || !pdfPages) return;
    const plain = !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey;
    // F3 too, which would otherwise open WebView2's own find over the pages
    if (matchesShortcut('Mod-f', e.nativeEvent) || matchesShortcut(FIND_NEXT, e.nativeEvent) || matchesShortcut(FIND_PREVIOUS, e.nativeEvent)) openFind();
    else if (plain && e.key === 'PageDown') pdfRef.current?.scrollToPage(Math.min(pdfPages, page + step));
    else if (plain && e.key === 'PageUp') pdfRef.current?.scrollToPage(Math.max(1, page - step));
    else if (plain && e.key === 'Home') pdfRef.current?.scrollToPage(1);
    else if (plain && e.key === 'End') pdfRef.current?.scrollToPage(pdfPages);
    else return;
    e.preventDefault();
  };

  const downloadPdf = () => {
    if (!pdf) return;
    const link = document.createElement('a');
    link.href = pdf.url;
    // main's under the project's name, another document's under its own
    link.download =
      shownDoc !== mainFile
        ? nameOf(pdfOf(shownDoc))
        : `${(project?.name || nameOf(mainPdf).replace(/\.pdf$/i, '') || 'document').replace(/[\\/:*?"<>|]+/g, '').trim() || 'document'}.pdf`;
    document.body.append(link);
    link.click();
    link.remove();
  };

  // shortcuts and CodeMirror key bindings call the newest handlers through this
  const actions = useRef({
    save: () => {},
    saveVersion: () => {},
    compile: () => {},
    compileOpen: () => {},
    toggleComposer: () => {},
    toggleGrammar: () => {},
    toggleSidebar: () => {},
    setView: (_view: View) => {},
    openSettings: () => {},
    zoomBy: (_steps: number) => {},
    fitWidth: () => {},
    fitPage: () => {},
    suggest: () => {},
    acceptGhost: (_word: boolean) => {},
    clearGhost: () => false as boolean,
    placeGhost: () => {},
    showInPdf: (_pos: number) => {},
    recheck: (_paths?: string[]) => {},
    autoCompile: () => {},
    target: () => '' as string,
    openFloats: (_card: FloatCard) => {},
    showFile: async (_path: string) => {},
    readText: async (_path: string) => '' as string,
    files: (): ReadonlySet<string> => new Set(),
    renameSymbol: () => {}
  });
  actions.current = {
    save: () => saveNow(true),
    saveVersion: () => saveVersionNow(),
    compile: () => runCompile(),
    compileOpen: () => runCompile(docRoot),
    toggleComposer,
    toggleGrammar,
    toggleSidebar: () => setLayout({ sidebarCollapsed: !layout.sidebarCollapsed }),
    setView,
    openSettings: () => setSettingsOpen(true),
    // not in editor only, where the PDF's hidden
    zoomBy: (steps: number) => pdf && layout.view !== 'editor' && zoomBy(steps),
    fitWidth: () => pdf && layout.view !== 'editor' && setZoom('width'),
    fitPage: () => pdf && layout.view !== 'editor' && setZoom('fit'),
    suggest: () => suggest(),
    acceptGhost,
    clearGhost,
    placeGhost: () => placeGhost(ghostRef.current.pos),
    showInPdf: (pos: number) => showInPdf(pos),
    recheck: (paths?: string[]) => {
      recheck(paths).catch(() => undefined);
    },
    autoCompile,
    target: () => compileTarget,
    openFloats,
    showFile: async (path: string) => {
      showEditor();
      await openFile(path);
    },
    readText,
    files: () => fileSet,
    renameSymbol: () => {
      renameSymbol();
    }
  };

  // ─── effects: unsaved edits, CodeMirror, first load, shortcuts ───

  // declared before CodeMirror so its cleanup runs while the view still exists
  useEffect(() => {
    // what closing the page still has to write: the open file's unsaved text, or held files' as conflict copies.
    // Browsers refuse keepalive bodies over 64 KiB, all of a page's together.
    // ponytail: a keepalive save refused because the file changed on disk in the last moments is lost; the
    // desktop app quits through __spectrumFlush, which keeps it as a conflict copy
    const keepaliveBodies = () => {
      const path = activeRef.current;
      const view = viewRef.current;
      const bodies = heldCopies().map(({ copy, content }) => JSON.stringify({ path: copy, content, create: true }));
      if (dirtyRef.current && path && view && !heldRef.current.has(path)) {
        bodies.push(JSON.stringify({ path, content: view.state.doc.toString(), base: hashesRef.current.get(path) }));
      }
      return new Blob(bodies).size <= 60 * 1024 ? bodies : null;
    };
    const onHide = () => {
      const bodies = keepaliveBodies();
      // too big: beforeunload has already started normal saves and held the page for them
      if (!bodies) return;
      dirtyRef.current = false;
      unsavedRef.current.clear();
      for (const body of bodies) {
        fetch(`/api/projects/${projectId}/file`, { method: 'PUT', keepalive: true, headers: { 'Content-Type': 'application/json' }, body }).catch(
          () => undefined
        );
      }
    };
    // too big for keepalive: saved normally, and the browser's leave prompt holds the page until it lands
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (keepaliveBodies()) return;
      saveAll().catch(() => undefined);
      e.preventDefault();
      e.returnValue = '';
    };
    // switching away (another app, another tab) saves with a normal request, which has no size limit; coming back
    // (or waking from sleep) checks the loaded files against the disk, for changes the folder watch missed
    const onVisibility = () => (document.visibilityState === 'hidden' ? saveNow() : actions.current.recheck());
    const onFocus = () => actions.current.recheck();
    // the desktop shell calls this before it closes the window (pagehide may not run there)
    const hooks = window as Window & { __spectrumFlush?: () => Promise<void> };
    hooks.__spectrumFlush = () => saveAll();
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      delete hooks.__spectrumFlush;
      saveAll().catch(() => undefined);
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
          editedRef.current = true;
          editedDocRef.current = a().target();
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
      saveVersion: () => a().saveVersion(),
      compile: () => a().compile(),
      compileOpen: () => a().compileOpen(),
      assistant: () => a().toggleComposer(),
      grammar: () => a().toggleGrammar(),
      suggest: () => a().suggest(),
      sidebar: () => a().toggleSidebar(),
      viewEditor: () => a().setView('editor'),
      viewSplit: () => a().setView('split'),
      viewPdf: () => a().setView('pdf'),
      zoomIn: () => a().zoomBy(1),
      zoomOut: () => a().zoomBy(-1),
      zoomWidth: () => a().fitWidth(),
      zoomPage: () => a().fitPage()
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
        // in a command's arguments, on to the next one (⇧Tab back)
        { key: 'Tab', run: nextSnippetField, shift: prevSnippetField },
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
      languageCompartment.of(languageFor('')),
      scopeGutter,
      EditorView.lineWrapping,
      editorTheme,
      ghostField,
      jumpHighlight,
      search({ top: true }),
      // picking \ref{}, \cite{} or \input{} opens the list of what goes in the braces
      autocompletion({
        override: [
          latexCompletionSource(() => projectScanRef.current, () => activeRef.current),
          typstCompletions({ path: () => activeRef.current, version: () => compileOptionsRef.current.typstVersion ?? '' }),
          referenceCompletions({ path: () => activeRef.current, keys: () => projectScanRef.current.bib.map((entry) => entry.key), labels: () => typstLabelsRef.current }),
          zoteroCompletionSource({
            enabled: () => loadSettings().zoteroCompletion,
            search: (q, signal) => searchZotero(q, signal).then((res) => res.items),
            own: () => new Set(projectScanRef.current.bib.map((e) => e.key.toLowerCase())),
            pick: (hit) => (apiRef.current ? addZoteroHit(apiRef.current, hit) : Promise.resolve(null))
          })
        ],
        activateOnCompletion: (c) => /\{\}$/.test(c.displayLabel ?? c.label)
      }),
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
      texlabSlot.of([]),
      // an image dropped on the editor goes to the Floats panel's Insert figure instead of into the text
      EditorView.domEventHandlers({
        drop(e, view) {
          const file = figureFile(e.dataTransfer);
          if (!file) return false;
          e.preventDefault();
          // the figure goes where it was dropped, as the drop cursor showed; a user 'select' counts as placing the cursor
          const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
          if (pos != null) view.dispatch({ selection: { anchor: pos }, userEvent: 'select.pointer' });
          showFigure(file);
          a().openFloats('figure');
          return true;
        },
        // CodeMirror has already selected the word; the PDF shows where the line went too
        dblclick(e, view) {
          const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
          if (pos != null) a().showInPdf(pos);
          return false;
        }
      }),
      listener
    ];
    const view = new EditorView({ state: EditorState.create({ doc: '', extensions: extensionsRef.current }), parent: hostRef.current! });
    viewRef.current = view;
    const onScroll = () => a().placeGhost();
    // right-click: on a misspelt word, suggestions and the word lists; elsewhere the clipboard and Add to-do here
    const onContextMenu = (e: MouseEvent) => {
      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
      if (pos == null || !activeRef.current) return;
      e.preventDefault();
      const hit = misspeltAt(view.state, pos);
      if (!hit) {
        setLineMenu({ x: e.clientX, y: e.clientY, pos });
        return;
      }
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

  // ?file=: a file opened from Finder or Explorer (App.tsx)
  const [params, setParams] = useSearchParams();
  const wanted = params.get('file');

  useEffect(() => {
    let live = true;
    // without them (unreadable, or none yet) the app's defaults apply
    getProjectSettings(projectId).then((res) => live && setProjectCompile(res.settings.compile ?? {}), () => undefined);
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
      const docsInTree = tree.items.filter((i) => i.type === 'file' && isDocument(i.path) && !tree.conflicts?.[i.path]).map((i) => i.path);
      const main = tree.mainFile && docsInTree.includes(tree.mainFile) ? tree.mainFile : docsInTree.find((p) => /(^|\/)main\.(?:tex|typ|md|markdown)$/i.test(p)) || docsInTree[0] || '';
      setMainFile(main);
      setLoaded(true);
      // show the PDF from the last compile straight away, before the first file opens, so following the open file
      // finds it showing
      const existing = pdfOf(main);
      setShownDoc(main);
      shownRef.current = main;
      if (main && tree.items.some((i) => i.path === existing)) {
        const url = blobUrl(projectId, existing, Date.now());
        setPdf({ url, blob: false });
        if (!current.hasThumbnail) pdfThumbnail(url).then((png) => saveThumbnail(projectId, png)).catch(() => undefined);
      }
      // a wanted file opens instead, below
      const first = tree.items.some((i) => i.path === wanted) ? '' : main || (await smallTextFile(projectId, tree.items));
      if (first) await openFile(first);
    })().catch((err) => notify(`Couldn’t open the project: ${errorText(err)}`, 'error'));
    return () => {
      live = false;
    };
  }, []);

  // the files no editor has open, as TexLab's outline read them: once until the tree or a file changes, rather than
  // after each pause in typing
  const outlineReads = useRef(new Map<string, string>());
  useEffect(() => outlineReads.current.clear(), [fileSet, filesVersion]);

  // files added, removed or renamed outside the app (Finder, another editor, a git pull, a sync client) show in the
  // list as they happen, and loaded files changed there are checked against the editor's text
  useEffect(() => {
    const events = new EventSource(`/api/projects/${projectId}/events`);
    events.addEventListener('tree', () => refreshTree().catch(() => undefined));
    events.addEventListener('changed', (e) => {
      const { paths, all } = JSON.parse((e as MessageEvent<string>).data) as { paths?: string[]; all?: boolean };
      outlineReads.current.clear();
      actions.current.recheck(all ? undefined : paths);
    });
    return () => events.close();
  }, [projectId]);

  // a linked project: pulled from GitHub as it opens (the files it changes come through the folder watch, and the panels
  // that read .spectrum reload), and backed up as the editor leaves it, chats and research sessions too
  const pulledOnOpen = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    let live = true;
    const opened = gitHubOpened(projectId);
    pulledOnOpen.current = opened.catch(() => undefined);
    opened.then(
      async (res) => {
        if (!live || !res.linked) return;
        if (res.message) notify(res.message);
        // GitHub's changes would delete many files here: asked now, as the backups wait for the answer
        const result =
          res.result?.state === 'confirm'
            ? await withDeletionCheck((allowDeletions) => syncWithGitHub(projectId, allowDeletions)).catch((err) => (notify(errorText(err), 'error'), null))
            : res.result;
        if (!live || !result) return;
        if (result.changedApp) window.dispatchEvent(new Event(PROJECT_DATA_CHANGED));
        for (const problem of result.problems || []) notify(problem, 'error');
      },
      () => undefined
    );
    const leave = () => gitHubLeft(projectId);
    window.addEventListener('pagehide', leave);
    return () => {
      live = false;
      window.removeEventListener('pagehide', leave);
      leave();
    };
  }, [projectId]);

  // the project's Zotero collection, brought up to the .bib on opening and on coming back to the window (adding only:
  // entries leave it after a .bib save); a wait for Zotero's sync, or a fault, is said once. The first waits for the pull
  // on opening, which may bring the collection the other computer made, so a second one isn't made here; so do the
  // syncs on focus, which start only once it's done
  useEffect(() => {
    let told = false;
    let live = true;
    const sync = () =>
      syncZotero(projectId).then((res) => {
        if (told || !res.message || (res.state !== 'waiting' && res.state !== 'error')) return;
        told = true;
        notify(res.message, res.state === 'error' ? 'error' : 'info');
      }, () => undefined);
    pulledOnOpen.current.then(() => {
      if (!live) return;
      sync();
      window.addEventListener('focus', sync);
    });
    return () => {
      live = false;
      window.removeEventListener('focus', sync);
    };
  }, []);

  // the PDF notes again after a pull brought other ones
  const [notesPulled, setNotesPulled] = useState(0);
  useEffect(() => {
    const onPull = () => setNotesPulled((n) => n + 1);
    window.addEventListener(PROJECT_DATA_CHANGED, onPull);
    return () => window.removeEventListener(PROJECT_DATA_CHANGED, onPull);
  }, []);

  // the project's TexLab, while the editor is open: a jump to another file opens it here, and the open file gets its
  // extensions whenever TexLab starts answering or stops
  useEffect(() => {
    const texlab = new Texlab(
      projectId,
      {
        open: async (path) => {
          await actions.current.showFile(path);
          return activeRef.current === path ? viewRef.current : null;
        },
        read: (path) => actions.current.readText(path),
        files: () => actions.current.files(),
        showReferences: setReferences,
        rename: () => actions.current.renameSymbol()
      },
      setTexlabOn
    );
    texlabRef.current = texlab;
    return () => {
      texlab.close();
      texlabRef.current = null;
    };
  }, [projectId]);

  useEffect(() => attachTexlab(), [texlabOn]);

  // TexLab's outline of the document being edited, a moment after typing stops, a file changes, a compile ends or
  // TexLab starts. A compile's numbers reach TexLab two seconds after it ends (the backend's auxKept), so no outline
  // comes before then, even when the compile's new PDF reloads the tree meanwhile.
  const outlinedLog = useRef(compileLog);
  const compiledAt = useRef(0);
  const outlinedWith = useRef<unknown[]>([]);
  useEffect(() => {
    const texlab = texlabRef.current;
    if (!texlabOn || !texlab || !docRoot) {
      setSymbolOutline(null);
      return;
    }
    if (outlinedLog.current !== compileLog) compiledAt.current = Date.now();
    outlinedLog.current = compileLog;
    const deps = [texlabOn, docRoot, fileSet, filesVersion, compileLog];
    const typing = deps.every((dep, i) => dep === outlinedWith.current[i]);
    outlinedWith.current = deps;
    const wait = outlineDelay(typing, compiledAt.current, Date.now());
    // an open file's live text, and a file read before it was opened is read again once it's closed
    const read = async (path: string) => {
      const open = filesRef.current.get(path);
      if (open !== undefined) {
        outlineReads.current.delete(path);
        return open;
      }
      const kept = outlineReads.current.get(path) ?? (await getFile(projectId, path)).content;
      outlineReads.current.set(path, kept);
      return kept;
    };
    let live = true;
    const timer = window.setTimeout(async () => {
      try {
        const symbols = await texlab.symbols();
        const seen = new Set<string>();
        const found = await documentOutline(docRoot, fileSet, read, symbolHeadings(symbols), seen);
        if (live) setSymbolOutline({ root: docRoot, items: found, seen });
      } catch {
        // the parser's outline shows meanwhile
      }
    }, wait);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [texlabOn, docRoot, editorValue, fileSet, filesVersion, compileLog]);

  // the diagram composer's window (desktop.ts openDiagram): its Insert as figure hands the diagram to the Floats panel's
  // Insert diagram card and brings this window forward, and its saves show without waiting for the folder watch
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel('spectrum-diagram');
    channel.onmessage = ({ data }: MessageEvent) => {
      if (data?.projectId !== projectId || typeof data.path !== 'string') return;
      const path: string = data.path;
      if (data.type === 'saved') {
        refreshTree().catch(() => undefined);
        actions.current.recheck([path]);
        return;
      }
      const language = (['tikz', 'typst', 'mermaid'] as DiagramLanguage[]).find((l) => l === data.language);
      if (data.type !== 'insert' || !language) return;
      // names only, as they go into the preamble
      const names = (list: unknown) => (Array.isArray(list) ? list.filter((n): n is string => typeof n === 'string' && /^[\w.-]+$/.test(n)) : []);
      // its exported image may be newer than the file list
      refreshTree()
        .catch(() => undefined)
        .finally(() => {
          showDiagram({ path, language, packages: names(data.packages), libraries: names(data.libraries) });
          actions.current.openFloats('diagram');
          focusWindow();
        });
    };
    return () => channel.close();
  }, [projectId]);

  // the wanted file, once the project has loaded and whenever another comes while it's open; then the
  // address drops it, so a reload opens the project as usual
  useEffect(() => {
    if (!loaded || !wanted) return;
    setParams(
      (p) => {
        p.delete('file');
        return p;
      },
      { replace: true }
    );
    const has = (list: FileItem[]) => list.some((i) => i.type === 'file' && i.path === wanted);
    (async () => {
      // or one made since the tree was listed
      if (has(items) || has((await refreshTree()).items)) await openFile(wanted);
    })().catch((err) => notify(`Couldn’t open ${nameOf(wanted)}: ${errorText(err)}`, 'error'));
  }, [loaded, wanted]);

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
      else if (is('saveVersion')) a.saveVersion();
      else if (is('compile')) a.compile();
      else if (is('compileOpen')) a.compileOpen();
      else if (is('assistant')) a.toggleComposer();
      else if (is('grammar')) a.toggleGrammar();
      else if (is('sidebar')) a.toggleSidebar();
      else if (is('viewEditor')) a.setView('editor');
      else if (is('viewSplit')) a.setView('split');
      else if (is('viewPdf')) a.setView('pdf');
      else if (matchesZoomIn(shortcutsRef.current, e)) a.zoomBy(1);
      else if (is('zoomOut')) a.zoomBy(-1);
      else if (is('zoomWidth')) a.fitWidth();
      else if (is('zoomPage')) a.fitPage();
      else if (matchesShortcut('Mod-,', e)) a.openSettings();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // the editor's column came back or changed width: CodeMirror measures it again, and the ghost text's buttons follow
  useEffect(() => {
    if (layout.view !== 'pdf') viewRef.current?.requestMeasure({ read: () => null, write: () => actions.current.placeGhost() });
  }, [layout.view]);

  // the open file's tab scrolls into the strip's view, and stays there as the strip narrows (the window, the split);
  // by hand, as scrollIntoView would slide the editor's column too
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const show = () => {
      const tab = strip.querySelector<HTMLElement>('.file-tab.active');
      if (!tab) return;
      const s = strip.getBoundingClientRect();
      const t = tab.getBoundingClientRect();
      if (t.left < s.left) strip.scrollLeft -= s.left - t.left;
      else if (t.right > s.right) strip.scrollLeft += Math.min(t.right - s.right, t.left - s.left);
    };
    // it also reports the strip's size as soon as it's watched
    const observer = new ResizeObserver(show);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [activePath, tabs, panel]);

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

  // auto compile, the chosen pause after the last keystroke
  useEffect(() => {
    if (!compileOptions.autoCompile || !editedRef.current) return;
    const timer = window.setTimeout(() => actions.current.autoCompile(), compileOptions.autoCompile * 1000);
    return () => window.clearTimeout(timer);
  }, [editorValue, compileOptions.autoCompile]);

  // PDF follows the open file: another document's .tex, or a chapter whose % !TEX root names one, shows that
  // document's PDF; any other file leaves it. A subfiles chapter or a standalone figure is part of its document, so it
  // leaves it too (it can still be picked by hand). A PDF or document picked by hand stays until the next file switch.
  useEffect(() => {
    if (!settings.pdfFollowsFile || !activePath) return;
    const text = filesRef.current.get(activePath) ?? '';
    const root = texRoot(activePath, text);
    const own = docs.includes(activePath) && !PART_OF_MAIN.test(text);
    const doc = own ? activePath : docs.includes(root) ? root : '';
    if (!doc || doc === shownDoc) return;
    showPdf(doc, items.some((i) => i.path === pdfOf(doc)) || stalePdf.current.has(doc) ? pdfFor(doc) : null);
  }, [activePath]);

  // the notes of the document whose PDF shows, from the project
  useEffect(() => {
    setNotes([]);
    if (!shownDoc) return;
    let live = true;
    listNotes(projectId, shownDoc)
      .then((res) => live && setNotes(res.notes || []))
      .catch((err) => live && notify(`Couldn’t load the PDF’s notes: ${errorText(err)}`, 'error'));
    return () => {
      live = false;
    };
  }, [shownDoc, notesPulled]);

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
    projectFiles: [...fileSet],
    selectionText,
    selectionRange,
    editorValue,
    compileLog,
    compileErrors,
    compiledDoc,
    compileFailed: Boolean(compileFailure),
    compileNotice,
    compileGenerated,
    setCompileOption,
    // only for the PDF showing, when it's the document Document insights describes; another's, or none, is '—'
    pdfPages: pdf && pagesOf.url === pdf.url && shownDoc === compileTarget ? pagesOf.pages : null,
    // a level the main model can't use is sent as its recommended one
    settings: { ...settings, reasoningEffort: effectiveEffort(settings, providers) },
    llm,
    notify,
    insertAtCursor: (text, opts) => {
      const done = insertAtCursor(text, opts);
      return done && viewRef.current ? viewRef.current.state.doc.lineAt(done.from + done.insert.length).number : null;
    },
    editOpenFile: (change) => viewRef.current?.dispatch({ changes: change }),
    ensureFileContent,
    writeProjectFile,
    createBibFile,
    refreshTree: async () => {
      await refreshTree();
    },
    reloadProject,
    reloadFiles,
    openFile,
    jumpTo,
    showPdfPage,
    showLineInPdf,
    proposeChanges,
    applyChanges: acceptChanges,
    prepareAgent: async () => {
      await saveNow();
      if (heldRef.current.size) throw new Error('Resolve the files changed on disk before starting or applying agent work.');
    },
    // by default the document whose log the AI read, so a fix loop stays on it
    compile: (doc) => runCompile(doc || compiledDoc || mainFile),
    save: () => saveNow(),
    keptPdf: (doc) => stalePdf.current.get(doc) ?? null,
    diagnostics: async () => (texlabRef.current?.available ? texlabRef.current.diagnostics() : { available: false, files: {} }),
    createVersion
  };

  // ─── render pieces ───

  const held = heldRef.current.get(activePath);
  const outlineFile = isDocument(activePath) ? activePath : mainFile;
  const outlineText = outlineFile === activePath ? editorValue : filesRef.current.get(outlineFile) || '';
  // Typst's headings, with those in the files it includes one level deep; and the project's labels to complete after @
  const [typstOutline, setTypstOutline] = useState<(OutlineItem & { file: string })[]>([]);
  const [typstLabels, setTypstLabels] = useState<string[]>([]);
  const typstLabelsRef = useRef<string[]>([]);
  typstLabelsRef.current = typstLabels;
  const includeFileSet = useMemo(() => new Set(items.filter((i) => i.type === 'file' && /\.typ$/i.test(i.path) && !conflicts[i.path]).map((i) => i.path)), [items, conflicts]);
  useEffect(() => {
    if (!includeFileSet.size) {
      setTypstLabels([]);
      return;
    }
    let live = true;
    Promise.all([...includeFileSet].map((path) => ensureFileContent(path).catch(() => ''))).then((texts) => {
      if (!live) return;
      const labels = new Set<string>();
      for (const text of texts) for (const m of text.matchAll(/<([A-Za-z0-9_:.-]+)>/g)) labels.add(m[1]);
      setTypstLabels([...labels]);
    });
    return () => {
      live = false;
    };
  }, [includeFileSet]);
  useEffect(() => {
    if (docKind(outlineFile) !== 'typst') {
      setTypstOutline([]);
      return;
    }
    let live = true;
    const own = parseTypstOutline(outlineText);
    const includes = [...outlineText.matchAll(/^\s*#include\s+"([^"]+)"/gm)]
      .map((m) => ({ line: outlineText.slice(0, m.index).split('\n').length, path: includedPath(outlineFile, m[1]) }))
      .filter(({ path }) => fileSet.has(path));
    Promise.all(includes.map(async ({ line, path }) => ({ line, path, items: parseTypstOutline(await ensureFileContent(path).catch(() => '')) }))).then((parts) => {
      if (!live) return;
      const entries = own.map((item) => ({ key: item.line, item: { ...item, file: outlineFile } }));
      for (const part of parts) part.items.forEach((item, index) => entries.push({ key: part.line + (index + 1) / (part.items.length + 1), item: { ...item, file: part.path } }));
      entries.sort((a, b) => a.key - b.key);
      setTypstOutline(entries.map(({ item }) => item));
    });
    return () => {
      live = false;
    };
  }, [outlineFile, outlineText, fileSet]);
  const parsedOutline = useMemo(() => {
    if (docKind(outlineFile) === 'typst') return typstOutline;
    const items = docKind(outlineFile) === 'markdown' ? parseMarkdownOutline(outlineText) : parseOutline(outlineText);
    return items.map((item) => ({ ...item, file: outlineFile }));
  }, [outlineText, outlineFile, typstOutline]);
  // TexLab's, across the files the document pulls in, once it has one that takes in the open file
  const projectOutline = symbolOutline?.root === docRoot && symbolOutline.items.length && (!isTex(activePath) || symbolOutline.seen.has(activePath)) ? symbolOutline : null;
  const outline = projectOutline?.items ?? parsedOutline;
  const outlineName = projectOutline ? docRoot : outlineFile;
  const outlineBase = Math.min(...outline.map((o) => o.level), 9);
  const currentHeading = outline.filter((o) => o.file === activePath && o.pos <= selectionRange[0]).pop();

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
        : compile.state === 'stopped'
          ? 'Stopped'
          : '';

  const switcherItems: MenuItems = [
    ...projects
      .filter((p) => p.id === projectId || (!p.missing && !p.archived && !p.templateDraft))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 12)
      .map((p) => ({ label: p.name, checked: p.id === projectId, onSelect: () => p.id !== projectId && leave(`/editor/${p.id}`) })),
    { separator: true },
    { label: 'All projects', icon: 'square.grid.2x2', onSelect: () => leave('/projects') },
    // a working copy has its own Save as new template… above the editor
    !draft && { label: 'Save as template…', icon: 'square.and.arrow.down', onSelect: openSaveTemplate },
    IS_DESKTOP && { label: `Show in ${FILE_MANAGER}`, icon: 'folder', onSelect: () => revealProject(projectId).catch(() => undefined) }
  ];

  const filesMenu: MenuItems = [
    { label: 'New file…', icon: 'doc.badge.plus', onSelect: () => treeRef.current?.beginCreate('file') },
    { label: 'New folder…', icon: 'folder.badge.plus', onSelect: () => treeRef.current?.beginCreate('folder') },
    { label: 'New .bib', icon: 'books.vertical', onSelect: () => createBibFile().catch((err) => notify(`Couldn’t create the .bib file: ${errorText(err)}`, 'error')) },
    { separator: true },
    { label: 'Upload files…', icon: 'square.and.arrow.up', onSelect: () => treeRef.current?.upload('files') },
    { label: 'Upload folder…', icon: 'tray.and.arrow.down', onSelect: () => treeRef.current?.upload('folder') }
  ];

  // page colours for the mode showing; both modes are in Settings → Appearance
  const pageItems: MenuItems = dark
    ? PDF_PAGES_DARK.map(([value, label]) => ({ label: `${label} pages`, checked: settings.pdfPageDark === value, onSelect: () => updateSettings({ pdfPageDark: value }) }))
    : PDF_PAGES_LIGHT.map(([value, label]) => ({ label: `${label} pages`, checked: settings.pdfPageLight === value, onSelect: () => updateSettings({ pdfPageLight: value }) }));

  // with other documents, the compile menu lists them above the compile settings: picking one compiles it once
  const shortcutOf = (id: AppCommand) => formatShortcut(shortcutKey(settings.shortcuts, id));
  /**
   * One compile setting: its choices, the one in use ticked. Once the project has its own, it can go back to the
   * app's default, or make it the default for every project.
   */
  const compileChoice = <K extends keyof CompileOptions>(key: K, heading: string, choices: [CompileOptions[K], string][]): MenuItems => {
    const own = projectCompile[key] != null;
    const fallback = settings.compileDefaults[key];
    return [
      { heading: true, label: heading },
      ...choices.map(([value, label]) => ({ label, checked: compileOptions[key] === value, onSelect: () => setCompileOption(key, value) })),
      own && { label: `Use the default (${choices.find(([value]) => value === fallback)?.[1] ?? String(fallback)})`, onSelect: () => setCompileOption(key, null) },
      own && compileOptions[key] !== fallback && { label: 'Use for all projects', onSelect: () => useForAllProjects(key) },
      { separator: true }
    ];
  };
  const pauses = [...new Set([0, 1, 2, 3, 5, 10, compileOptions.autoCompile, settings.compileDefaults.autoCompile])].sort((a, b) => a - b);
  const compileKind = docKind(compileTarget) ?? 'latex';
  // a Typst project pins a Typst version instead of choosing a TeX engine
  const typstVersionChoices: MenuItems = [
    { heading: true, label: 'Typst version (this project)' },
    { label: `Default${settings.compileDefaults.typstVersion ? ` (${settings.compileDefaults.typstVersion})` : engines?.typst.builtIn ? ` (${engines.typst.builtIn}, built in)` : ''}`, checked: projectCompile.typstVersion == null, onSelect: () => setCompileOption('typstVersion', null) },
    ...(engines?.typst.builtIn ? [{ label: `Typst ${engines.typst.builtIn} (built in)`, checked: compileOptions.typstVersion === engines.typst.builtIn, onSelect: () => setCompileOption('typstVersion', engines.typst.builtIn) }] : []),
    ...(engines?.typst.installed ?? []).map((version) => ({ label: `Typst ${version}`, checked: compileOptions.typstVersion === version, onSelect: () => setCompileOption('typstVersion', version) })),
    ...(compileOptions.typstVersion && compileOptions.typstVersion !== engines?.typst.builtIn && !(engines?.typst.installed ?? []).includes(compileOptions.typstVersion)
      ? [{ label: `Typst ${compileOptions.typstVersion} (not installed)`, disabled: true }]
      : []),
    { separator: true }
  ];
  const compileItems: MenuItems = [
    ...(docs.length > 1
      ? [
          { heading: true, label: 'Compile' },
          ...docs.map((doc) => ({
            label: doc,
            disabled: running,
            shortcut: doc === compileTarget ? shortcutOf('compile') : doc === docRoot ? shortcutOf('compileOpen') : undefined,
            onSelect: () => runCompile(doc)
          })),
          { separator: true }
        ]
      : []),
    ...(compileKind === 'markdown' ? compileChoice('markdownEngine', 'PDF engine (this project)', [['latex', 'LaTeX'], ['typst', 'Typst']]) : []),
    ...(compileKind === 'typst' ? typstVersionChoices : compileChoice('engine', 'Compiler (this project)', COMPILE_ENGINES)),
    ...compileChoice('autoCompile', 'Auto compile', pauses.map((n): [number, string] => [n, autoCompileLabel(n)])),
    ...compileChoice('haltOnError', 'Compile error handling', ERROR_HANDLING),
    ...compileChoice('syntaxCheck', 'Syntax checks', SYNTAX_CHECKS),
    ...compileChoice('bibTool', 'Bibliography tool', BIB_TOOLS),
    ...compileChoice('draft', 'Fast draft mode', [
      [false, 'Off'],
      [true, 'On: one pass, images as boxes']
    ]),
    { label: 'Stop compilation', disabled: !running, onSelect: () => stopCompile(compileIdRef.current).catch(() => undefined) },
    { label: 'Recompile from scratch', disabled: running, onSelect: () => runCompile(compileTarget, { fresh: true }) },
    docs.length > 1 && { label: 'Recompile all', disabled: running, onSelect: () => recompileAll() }
  ];
  // the documents with a PDF to show; the PDF's page bar names the one showing when there's a choice, by the
  // part of its name the others don't share (ELEC2410_Tutorial_Solutions.pdf beside ELEC2410_Lecture_Notes.pdf
  // is Tutorial_Solutions)
  const pdfDocs = docs.filter((doc) => items.some((i) => i.path === pdfOf(doc)));
  const baseOf = (doc: string) => nameOf(doc).replace(/\.tex$/i, '');
  const commonStart = (a: string, b: string) => {
    let i = 0;
    while (i < a.length && a[i] === b[i]) i += 1;
    return a.slice(0, i);
  };
  const others = pdfDocs.filter((doc) => doc !== shownDoc);
  const shared = others.length ? others.map(baseOf).reduce(commonStart, baseOf(shownDoc)) : '';
  const pdfLabel = others.some((doc) => baseOf(doc) === baseOf(shownDoc))
    ? shownDoc.replace(/\.tex$/i, '')
    : baseOf(shownDoc).slice(shared.search(/[^_\- .]*$/)) || baseOf(shownDoc);
  const pdfSwitcher = (pdfDocs.length > 1 || shownDoc !== mainFile) && (
    <>
      <MenuButton
        className="btn ghost small pdf-switcher"
        icon="doc.richtext"
        label={pdfLabel}
        title={`PDF: ${pdfOf(shownDoc)}`}
        items={pdfDocs.map((doc) => ({ label: pdfOf(doc), checked: doc === shownDoc, onSelect: () => doc !== shownDoc && loadPdf(doc) }))}
      />
      <span className="pdf-pill-sep" />
    </>
  );

  const insertKind: DocKind = docKind(activePath) ?? 'latex';
  const insertItems: MenuItems = SNIPPETS.filter((s) => !s || typeof s === 'string' || !('kinds' in s) || s.kinds.includes(insertKind)).map((s) =>
    s === 'diagram'
      ? { label: 'Draw a diagram…', icon: 'pencil', onSelect: () => drawDiagram() }
      : s === 'figure' || s === 'table'
        ? { label: s === 'figure' ? 'Figure…' : 'Table…', icon: s === 'figure' ? 'photo' : 'tablecells', onSelect: () => openFloats(s) }
        : s
          ? { label: s.label, icon: s.icon, onSelect: () => insertSnippet(s) }
          : { separator: true }
  );

  const zoomLabel = ZOOMS.find(([z]) => z === zoom)?.[1] || `${Math.round(scale * 100)}%`;
  // in two-page view `page` is the left page of a row, so the next row starts two pages on
  const step = spread ? 2 : 1;
  // in steps of a tenth, the way a pinch scales; from the zoom already asked for, so quick presses add up
  const zoomBy = (steps: number) =>
    setLayoutState((prev) => {
      const from = typeof prev.pdfZoom === 'number' ? prev.pdfZoom : scale;
      return { ...prev, pdfZoom: Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, from * 1.1 ** steps)) * 100) / 100 };
    });

  // at the top right of the window, in the rightmost header showing: the editor's in editor only, else the right column's
  const viewSwitcher = (
    <div className="segmented view-switcher" role="radiogroup" aria-label="View">
      {VIEWS.map(([value, label, icon, command]) => (
        <button
          key={value}
          className={`segment ${layout.view === value ? 'active' : ''}`}
          role="radio"
          aria-checked={layout.view === value}
          title={withShortcut(settings.shortcuts, label, command)}
          aria-label={label}
          onClick={() => setView(value)}
        >
          <Icon name={icon} />
        </button>
      ))}
    </div>
  );
  const compileStatus = (
    <span role="status" className={`compile-status ${compile.state}`} title={compile.state === 'ok' ? `${status} · ${engineLabel(String(compile.engine))} · ${compiledDoc}` : status}>
      {compile.state === 'failed' ? (
        <button className="compile-status failed" onClick={() => openTools('logs')}>
          Failed — see Logs
        </button>
      ) : (
        status
      )}
    </span>
  );
  // in the PDF header, or in the editor's top bar while a panel has the PDF's place
  const compileSplit = (
    <div className="compile-split">
      {/* while it runs, Compile is Stop: a TeX run can only be ended, not paused */}
      <button
        className={`compile-main ${running ? 'stop' : ''}`}
        // the second click of a double-click on Compile would land on Stop
        onClick={(event) => (running ? event.detail <= 1 && stopCompile(compileIdRef.current).catch(() => undefined) : runCompile())}
        title={running ? 'Stop compiling' : withShortcut(settings.shortcuts, 'Compile', 'compile')}
        aria-label={running ? 'Stop compiling' : 'Compile'}
      >
        <Icon name={running ? 'stop.fill' : 'play.fill'} />
        <span className="btn-label">{running ? 'Stop' : 'Compile'}</span>
      </button>
      <MenuButton className="compile-engine" icon="chevron.down" chevron={false} title={`Compile options (${engineLabel(engine)})`} items={compileItems} />
    </div>
  );
  // ends each panel's header
  const panelEnd = (
    <>
      <button className="icon-btn" title="Close and show the PDF" aria-label="Close" onClick={closePanel}>
        <Icon name="xmark" />
      </button>
      {viewSwitcher}
    </>
  );
  const sidebarButton = layout.sidebarCollapsed && (
    <button className="icon-btn" title={withShortcut(settings.shortcuts, 'Show sidebar', 'sidebar')} aria-label="Show sidebar" onClick={() => setLayout({ sidebarCollapsed: false })}>
      <Icon name="sidebar.left" />
    </button>
  );
  apiRef.current = api;

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
                  { value: 'research', label: 'Research' },
                  { value: 'todos', label: 'To-dos', badge: todos.open || undefined }
                ]}
              />
              <span className="spacer" />
              <button
                className={`icon-btn small ${searchOpen ? 'active' : ''}`}
                title={sidebarTab === 'files' ? 'Search files' : sidebarTab === 'research' ? 'Search research' : 'Search to-dos'}
                aria-label="Search"
                onClick={() => {
                  setSearchOpen((v) => !v);
                  setFilter('');
                }}
              >
                <Icon name="magnifyingglass" />
              </button>
              {sidebarTab === 'files' && <MenuButton icon="plus" className="icon-btn small" title="Add" align="end" items={filesMenu} />}
            </div>

            {searchOpen && (
              <label className="search-field sidebar-search">
                <Icon name="magnifyingglass" />
                <input
                  autoFocus
                  value={filter}
                  placeholder={sidebarTab === 'files' ? 'Search files' : sidebarTab === 'research' ? 'Search research' : 'Search to-dos'}
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
                conflicts={conflicts}
                onOpen={(path) => {
                  // a source file opened from the tree in PDF only shows in the editor beside it
                  if (TEXT_FILE.test(path)) showEditor();
                  open(path);
                }}
                onRefresh={async () => {
                  await refreshTree();
                }}
                beforeUpload={() => saveNow()}
                onUploaded={onUploaded}
                onMoved={onMoved}
                onDeleted={onDeleted}
                onSetMain={(path) => chooseMain(path)}
                diagrams={diagrams}
                onEditDiagram={(path) => drawDiagram(path)}
                onNewBib={() => createBibFile().catch((err) => notify(`Couldn’t create the .bib file: ${errorText(err)}`, 'error'))}
                notify={notify}
              />
            </div>
            {/* mounted while hidden, so a search running keeps its answer */}
            <div className="sidebar-list" hidden={sidebarTab !== 'research'}>
              <ResearchPanel filter={sidebarTab === 'research' ? filter : ''} onAgentTask={openAgentTask} />
            </div>
            {sidebarTab === 'todos' && (
              <div className="sidebar-list">
                <TodosList todos={todos} filter={filter} mainFile={mainFile} onOpen={(link) => openTodoLink(link).catch((err) => notify(errorText(err), 'error'))} />
              </div>
            )}

            {sidebarTab === 'files' && (
              <div className={`sidebar-outline ${layout.outlineOpen ? 'open' : ''}`}>
                <button className="sidebar-section-title" aria-expanded={layout.outlineOpen} onClick={() => setLayout({ outlineOpen: !layout.outlineOpen })}>
                  <span>
                    Outline{outlineName && <span className="outline-file"> · {nameOf(outlineName)}</span>}
                  </span>
                  <Icon name="chevron.right" className={`disclosure ${layout.outlineOpen ? 'open' : ''}`} />
                </button>
                {layout.outlineOpen && (
                  <div className="outline-list">
                    {outline.map((item) => (
                      <button
                        key={`${item.file}-${item.pos}-${item.title}`}
                        className={`outline-item ${item.float ? 'float' : ''} ${item === currentHeading ? 'active' : ''}`}
                        style={{ paddingLeft: 10 + (item.level - outlineBase) * 14 }}
                        title={`${item.title} (${item.file === outlineName ? '' : `${item.file}, `}line ${item.line})`}
                        onClick={() => select(item.file, item.pos)}
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
              <button className="nav-row" onClick={() => setSettingsOpen(true)} title={`Settings (${formatShortcut('Mod-,')})`}>
                <Icon name="gearshape" />
                <span className="nav-label">Settings</span>
              </button>
            </div>
          </aside>
        )}

        <main
          className={`main-panel editor-panel view-${layout.view}`}
          ref={panelRef}
          style={{ '--sync-highlight': highlightColour(settings, dark) } as CSSProperties}
        >
          {/* hidden in PDF only rather than unmounted, so its files, undo history and scroll stay as they were */}
          <section className="editor-column" hidden={layout.view === 'pdf'}>
            <div className="editor-topbar" data-tauri-drag-region>
              {sidebarButton}
              <MenuButton icon="plus.circle" className="icon-btn" title="Insert" items={insertItems} disabled={!activePath} />
              {/* a narrow editor leaves these to Insert (+) */}
              <button className="icon-btn float-button" title="Insert figure" aria-label="Insert figure" onClick={() => openFloats('figure')}>
                <Icon name="photo" />
              </button>
              <button className="icon-btn float-button" title="Insert table" aria-label="Insert table" onClick={() => openFloats('table')}>
                <Icon name="tablecells" />
              </button>
              <button className="icon-btn float-button" title="Draw a diagram" aria-label="Draw a diagram" onClick={() => drawDiagram()}>
                <Icon name="pencil" />
              </button>
              <div ref={stripRef} className="file-tabs" role="tablist" data-tauri-drag-region>
                {tabs.map((path) => (
                  <div
                    key={path}
                    role="tab"
                    tabIndex={0}
                    aria-selected={path === activePath}
                    className={`file-tab ${path === activePath ? 'active' : ''} ${heldRef.current.has(path) ? 'held' : ''} ${heldRef.current.get(path) === null ? 'gone' : ''}`}
                    title={heldRef.current.get(path) === null ? `${path} · Deleted on disk` : heldRef.current.get(path) ? `${path} · Changed on another computer` : path}
                    onClick={() => open(path)}
                    onKeyDown={(e) => e.key === 'Enter' && open(path)}
                    onAuxClick={(e) => e.button === 1 && closeTab(path).catch(() => undefined)}
                  >
                    <Icon name={heldRef.current.has(path) ? 'exclamationmark.triangle' : /\.bib$/i.test(path) ? 'books.vertical' : 'doc.text'} className="file-tab-icon" />
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
                className={`icon-btn ${panel === 'grammar' ? 'active' : ''}`}
                title={withShortcut(settings.shortcuts, 'Check grammar', 'grammar')}
                aria-label="Check grammar"
                aria-pressed={panel === 'grammar'}
                onClick={toggleGrammar}
              >
                <Icon name="text.badge.checkmark" />
              </button>
              <button
                className={`icon-btn ${panel === 'insights' ? 'active' : ''}`}
                title="Document insights"
                aria-label="Document insights"
                aria-pressed={panel === 'insights'}
                onClick={() => togglePanel('insights')}
              >
                <Icon name="chart.bar.xaxis" />
              </button>
              <button
                className={`tools-toggle ${panel === 'tools' ? 'open' : ''}`}
                aria-pressed={panel === 'tools'}
                // its words go in a narrow editor
                aria-label={panel === 'tools' ? 'Close Tools' : problems > 0 ? `Tools, ${plural(problems, 'problem')}` : 'Tools'}
                title={panel === 'tools' ? 'Close Tools' : 'Tools'}
                onClick={() => (panel === 'tools' ? setPanel(null) : openTools())}
              >
                <span>{panel === 'tools' ? 'Close' : 'Tools'}</span>
                <Icon name={panel === 'tools' ? 'xmark' : 'square.grid.2x2'} />
                {panel !== 'tools' && problems > 0 && (
                  <span className={`tools-badge ${errorCount ? 'error' : ''}`} title={`${plural(errorCount, 'error')}, ${plural(problems - errorCount, 'warning')}`}>
                    {problems}
                  </span>
                )}
              </button>
              <button
                className={`icon-btn agent-toggle ${panel === 'agent' ? 'active' : ''}`}
                title={agentStatus ? `Agent · ${STATUS_TEXT[agentStatus]}` : 'Agent'}
                aria-label={agentStatus ? `Agent, ${STATUS_TEXT[agentStatus].toLowerCase()}` : 'Agent'}
                aria-pressed={panel === 'agent'}
                onClick={() => togglePanel('agent')}
              >
                <Icon name="wand.and.stars" />
                {agentStatus && <span className={`agent-dot ${agentStatus}`} />}
              </button>
              {/* while a panel has the PDF header's place, compiling stays here */}
              {panel && compileSplit}
              {/* the PDF header's is hidden in editor only or behind a panel; this one stays from the first compile, so changes are heard */}
              {(panel || (layout.view === 'editor' && compile.state !== 'idle')) && compileStatus}
              {layout.view === 'editor' && viewSwitcher}
            </div>

            <SyncBanners conflicts={conflicts} onDeleted={onDeleted} />

            {draft && (
              <div className="review-banner template-banner" role="status">
                <Icon name="square.and.pencil" />
                <span className="grow truncate">Editing the “{project?.name}” template</span>
                <button className="btn small ghost" onClick={closeTemplate}>Done</button>
                <button className="btn small ghost" onClick={openSaveTemplate}>Save as new template…</button>
                <button className="btn small primary" disabled={savingTemplate} onClick={saveTemplate}>
                  Save template
                </button>
              </div>
            )}

            {held === null && (
              <div className="review-banner template-banner" role="status">
                <Icon name="exclamationmark.triangle" />
                <span className="grow truncate">{nameOf(activePath)} was deleted on disk</span>
                <button className="btn small ghost" onClick={() => closeGone(activePath).catch((err) => notify(errorText(err), 'error'))}>
                  Close
                </button>
                <button className="btn small primary" onClick={() => keepMine(activePath)}>
                  Restore
                </button>
              </div>
            )}

            {held && (
              <div className="review-banner template-banner" role="status">
                <Icon name="exclamationmark.triangle" />
                <span className="grow truncate">{nameOf(activePath)} was changed on another computer</span>
                <button className="btn small ghost" onClick={() => setComparing(true)}>
                  Compare
                </button>
                <button className="btn small ghost" onClick={() => takeTheirs(activePath)}>
                  Use theirs
                </button>
                <button className="btn small primary" onClick={() => keepMine(activePath)}>
                  Keep mine
                </button>
              </div>
            )}

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

            {references && (
              <div
                className="references-panel"
                role="region"
                aria-label="References"
                onKeyDown={(e) => {
                  if (e.key !== 'Escape') return;
                  setReferences(null);
                  viewRef.current?.focus();
                }}
              >
                <div className="references-head">
                  <span className="grow">{references.length ? plural(references.length, 'reference') : 'No references found'}</span>
                  <button className="icon-btn" aria-label="Close" onClick={() => setReferences(null)}>
                    <Icon name="xmark" />
                  </button>
                </div>
                <div className="references-list">
                  {references.map((r, i) => (
                    <button
                      key={`${r.path}:${r.line}:${r.col}`}
                      className="reference-row"
                      title={`${r.path}, line ${r.line}`}
                      autoFocus={i === 0}
                      onClick={() => jumpTo(r.path, r.line, r.col)}
                    >
                      <span className="reference-place">
                        {nameOf(r.path)}:{r.line}
                      </span>
                      <span className="reference-text">{r.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Composer
              open={composerOpen}
              onOpenChange={(open) => {
                setComposerOpen(open);
                if (!open) viewRef.current?.focus();
              }}
              chatId={chatId}
              onChatIdChange={setChatId}
              focusSignal={focusSignal}
              onContinueInAgent={continueInAgent}
              onManagePersonas={() => setSettingsOpen('personas')}
            />
            <ZoteroCite />
          </section>

          {layout.view === 'split' && <div className="column-divider" role="separator" aria-orientation="vertical" aria-label="Resize" onMouseDown={startResize} />}

          {/* hidden in editor only, so the PDF needn't load again */}
          <section className="right-column" hidden={layout.view === 'editor'} style={layout.view === 'split' ? { width: `${layout.split * 100}%` } : undefined}>
            <div className="pdf-column" hidden={!!panel}>
              <div className="pdf-header" data-tauri-drag-region>
                {layout.view === 'pdf' && sidebarButton}
                {!panel && compileSplit}
                <button
                  className="btn save-version"
                  onClick={saveVersionNow}
                  disabled={savingVersion}
                  title={withShortcut(settings.shortcuts, 'Save checkpoint', 'saveVersion')}
                  aria-label="Save checkpoint"
                >
                  {savingVersion ? <span className="spinner" /> : <Icon name="clock.arrow.circlepath" />}
                  <span className="btn-label">Save checkpoint</span>
                </button>
                {/* always mounted, so screen readers hear each change */}
                {compileStatus}
                <span className="spacer" data-tauri-drag-region />
                <button
                  className={`icon-btn ${layout.pdfSidebarOpen ? 'active' : ''}`}
                  title="Document outline"
                  aria-label="Document outline"
                  aria-pressed={layout.pdfSidebarOpen}
                  disabled={!pdf}
                  onClick={() => setLayout({ pdfSidebarOpen: !layout.pdfSidebarOpen })}
                >
                  <Icon name="sidebar.left" />
                </button>
                <MenuButton
                  className="btn ghost small zoom-button"
                  icon="plus.magnifyingglass"
                  title={`Zoom: ${zoomLabel}`}
                  label={zoomLabel}
                  disabled={!pdf}
                  align="end"
                  items={ZOOMS.map(([z, label]) => ({
                    label,
                    checked: zoom === z,
                    shortcut: z === 'width' ? shortcutOf('zoomWidth') : z === 'fit' ? shortcutOf('zoomPage') : undefined,
                    onSelect: () => setZoom(z)
                  }))}
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
                    { label: 'Annotate', icon: 'note.text.badge.plus', checked: annotate, disabled: !pdf, onSelect: () => setAnnotate((v) => !v) },
                    { label: 'Find in PDF', icon: 'magnifyingglass', shortcut: formatShortcut('Mod-f'), disabled: !pdf, onSelect: openFind },
                    { label: 'Presentation mode', icon: 'play.fill', disabled: !pdf || !pdfPages, onSelect: () => setPresenting(true) },
                    { separator: true },
                    ...pageItems,
                    { separator: true },
                    { label: 'Show logs', icon: 'terminal', checked: false, onSelect: () => openTools('logs') }
                  ]}
                />
                {viewSwitcher}
              </div>

              <div className={`pdf-body ${pdf && layout.pdfSidebarOpen ? 'with-sidebar' : ''}`} onKeyDown={onPdfKey}>
                {pdf && layout.pdfSidebarOpen && (
                  <PdfSidebar
                    tab={layout.pdfSidebarTab}
                    onTabChange={(pdfSidebarTab) => setLayout({ pdfSidebarTab })}
                    pdf={pdfRef}
                    loadedUrl={loadedUrl === pdf.url ? loadedUrl : ''}
                    pages={pdfPages ?? 0}
                    page={page}
                    outline={pdfOutline}
                    section={pdfSection}
                    doc={shownDoc}
                    files={fileSet}
                    read={readText}
                    revision={`${filesVersion} ${dirty}`}
                    onHeading={(file, line) => showHeading(file, line).catch(() => undefined)}
                  />
                )}
                {pdf ? (
                  <PdfPreview
                    ref={pdfRef}
                    url={pdf.url}
                    pageKey={`${projectId}:${shownDoc}`}
                    zoom={zoom}
                    spread={spread}
                    annotateMode={annotate}
                    annotations={notes}
                    onAddAnnotation={addAnnotation}
                    onDoubleClick={(at, text) => jumpFromPdf(at, text).catch((err) => notify(`Couldn’t jump to the source: ${errorText(err)}`, 'error'))}
                    onPageMenu={(at, x, y) => {
                      const selection = window.getSelection();
                      const text = selection?.anchorNode?.parentElement?.closest('.pdf-scroll') ? selection.toString() : '';
                      setPdfMenu({ x, y, at, text });
                    }}
                    onFileLink={followFileLink}
                    onPages={(pages) => setPagesOf({ url: pdf.url, pages })}
                    onLoad={({ pages, outline: toc }) => {
                      setPdfPages(pages);
                      setPdfOutline(toc);
                      setLoadedUrl(pdf.url);
                    }}
                    onScale={setScale}
                    onZoom={setZoom}
                    onPage={setPage}
                    onSection={setPdfSection}
                  />
                ) : (
                  <div className="empty-state">
                    <Icon name="doc.richtext" size={40} />
                    <div className="empty-title">No PDF yet</div>
                    <div className="empty-text">Compile the project to see it here.</div>
                    <div className="empty-actions">
                      <button className="btn primary" onClick={() => runCompile()} disabled={running || !mainFile}>
                        {running ? <span className="spinner" /> : <Icon name="play.fill" />} Compile
                      </button>
                    </div>
                  </div>
                )}

                {pdf && annotate && <div className="pdf-annotate-hint">Click the page to add a note</div>}

                {pdf && findOpen && (
                  <PdfFindBar
                    pdf={pdfRef}
                    loadedUrl={loadedUrl}
                    focusSignal={findSignal}
                    onClose={() => {
                      setFindOpen(false);
                      // without scrolling, which would stop the scroll to the last match
                      document.querySelector<HTMLElement>('.pdf-scroll')?.focus({ preventScroll: true });
                    }}
                  />
                )}

                {pdf && (
                  <div className="pdf-pill">
                    {pdfSwitcher}
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
                      <PageBox page={page} pages={pdfPages} onGo={(at) => pdfRef.current?.scrollToPage(at)} /> / {pdfPages ?? '–'}
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

              </div>

              {notes.length > 0 && (
                <div className="pdf-notes">
                  <div className="pdf-notes-head">
                    <span>Notes</span>
                    <button
                      className="btn small ghost"
                      onClick={async () => {
                        const sure = await confirmDialog({
                          title: `Delete the ${plural(notes.length, 'note')} on this PDF?`,
                          message: 'They’re removed from the project.',
                          confirmLabel: 'Delete',
                          destructive: true
                        });
                        if (sure) removeNotes(notes);
                      }}
                    >
                      Clear all
                    </button>
                  </div>
                  {notes.map((note) => (
                    <div key={note.id} className="pdf-note">
                      <button className="pdf-note-page" onClick={() => pdfRef.current?.scrollToPage(note.page)}>
                        p. {note.page}
                      </button>
                      <span className="pdf-note-text">{note.text}</span>
                      <button
                        className="icon-btn small"
                        title="Remove note"
                        aria-label="Remove note"
                        onClick={() => removeNotes([note])}
                      >
                        <Icon name="xmark" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {keptPanels.includes('tools') && (
              <div className="tools-column" hidden={panel !== 'tools'}>
                <ToolsPanel tab={toolsTab} onTabChange={setToolsTab} doc={compileTarget} trailing={panelEnd} onOpenSettings={setSettingsOpen} />
              </div>
            )}

            {keptPanels.includes('insights') && (
              <div className="tools-column" hidden={panel !== 'insights'}>
                <InsightsPanel doc={compileTarget} active={panel === 'insights'} trailing={panelEnd} />
              </div>
            )}

            {keptPanels.includes('floats') && (
              <div className="tools-column" hidden={panel !== 'floats'}>
                <FloatsPanel card={floatsCard.card} signal={floatsCard.signal} trailing={panelEnd} />
              </div>
            )}

            {keptPanels.includes('agent') && (
              <div className="tools-column" hidden={panel !== 'agent'}>
                <AgentWorkspace
                  active={panel === 'agent'}
                  todos={todos}
                  openThread={agentThread}
                  task={agentTask}
                  onStatus={setAgentStatus}
                  onOpenSettings={setSettingsOpen}
                  trailing={
                    <>
                      <button className="btn small ghost" title="Show the PDF; the agent carries on" onClick={closePanel}>
                        <Icon name="doc.richtext" /> PDF
                      </button>
                      {viewSwitcher}
                    </>
                  }
                />
              </div>
            )}

            {panel === 'grammar' && (
              <div className="tools-column">
                <GrammarPanel
                  view={() => viewRef.current}
                  projectId={projectId}
                  path={activePath}
                  revision={editorValue}
                  settings={settings}
                  onClose={closePanel}
                  trailing={viewSwitcher}
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
            { label: 'Ignore', onSelect: () => viewRef.current?.dispatch({ effects: ignoreSpelling.of(spellMenu.word) }) },
            { separator: true },
            { label: 'Add to-do here', onSelect: () => addTodoAtLine(spellMenu.from) }
          ]}
        />
      )}

      {lineMenu && (
        <ContextMenu
          x={lineMenu.x}
          y={lineMenu.y}
          onClose={() => setLineMenu(null)}
          items={(() => {
            const view = viewRef.current;
            const { from, to } = view?.state.selection.main ?? { from: 0, to: 0 };
            const selected = view?.state.sliceDoc(from, to) ?? '';
            // the menu has focus meanwhile; the edit goes back to the editor
            const edit = (insert: string, userEvent: string) => {
              view?.dispatch({ ...view.state.replaceSelection(insert), userEvent, scrollIntoView: true });
              view?.focus();
            };
            const copied = () => navigator.clipboard.writeText(selected);
            // a diagram the line takes in, by its name from the main file's folder or the project's, as TeX finds it
            const included = view && INCLUDE_STANDALONE.exec(view.state.doc.lineAt(lineMenu.pos).text)?.[1].trim().replace(/\.tex$/i, '');
            const dir = mainFile.slice(0, mainFile.lastIndexOf('/') + 1);
            const diagram = included && [`${dir}${included}.tex`, `${included}.tex`].find((p) => diagrams.includes(p));
            return [
              { label: 'Cut', shortcut: formatShortcut('Mod-x'), disabled: !selected, onSelect: () => copied().then(() => edit('', 'delete.cut'), () => undefined) },
              { label: 'Copy', shortcut: formatShortcut('Mod-c'), disabled: !selected, onSelect: () => copied().catch(() => undefined) },
              {
                label: 'Paste',
                shortcut: formatShortcut('Mod-v'),
                onSelect: () =>
                  navigator.clipboard.readText().then(
                    (text) => edit(text, 'input.paste'),
                    () => notify(`Press ${formatShortcut('Mod-v')} to paste.`)
                  )
              },
              { separator: true },
              !!diagram && { label: 'Edit diagram', onSelect: () => drawDiagram(diagram) },
              isDocument(activePath) && { label: 'Cite from Zotero…', onSelect: () => window.dispatchEvent(new Event(ZOTERO_CITE)) },
              { label: 'Add to-do here', onSelect: () => addTodoAtLine(lineMenu.pos) }
            ];
          })()}
        />
      )}

      {pdfMenu && (
        <ContextMenu
          x={pdfMenu.x}
          y={pdfMenu.y}
          onClose={() => setPdfMenu(null)}
          items={[
            !!pdfMenu.text && { label: 'Copy', shortcut: formatShortcut('Mod-c'), onSelect: () => navigator.clipboard.writeText(pdfMenu.text).catch(() => undefined) },
            !!pdfMenu.text && { separator: true },
            { label: 'Add a note here', onSelect: () => addAnnotation(pdfMenu.at) },
            {
              label: 'Add to-do here',
              onSelect: () => addTodo({ doc: shownDoc, page: pdfMenu.at.page }, `${nameOf(pdfOf(shownDoc))}, page ${pdfMenu.at.page}`).catch(() => undefined)
            }
          ]}
        />
      )}

      {presenting && pdf && pdfPages && (
        <PdfPresentation
          pdf={pdfRef}
          loadedUrl={loadedUrl}
          pages={pdfPages}
          start={page}
          onClose={(at) => {
            setPresenting(false);
            pdfRef.current?.scrollToPage(at);
          }}
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
                  Show in {FILE_MANAGER}
                </button>
              )}
              {FIGURE_FILE.test(preview) && (
                <button
                  className="btn primary"
                  disabled={!isDocument(activePath)}
                  title={isDocument(activePath) ? undefined : 'Open a document first'}
                  onClick={() => {
                    const kind = docKind(activePath);
                    const figure = { path: preview, width: 0.9, caption: 'Caption.', label: figureLabel(preview) };
                    insertAtCursor(kind === 'typst' ? figureTypst(figure) : kind === 'markdown' ? figureMarkdown(figure) : figureSnippet(preview), { block: true });
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

      {comparing && held && (
        <Sheet
          title={`${nameOf(activePath)}: theirs and mine`}
          onClose={() => setComparing(false)}
          width={1080}
          className="review-sheet"
          actions={
            <>
              <button className="btn" onClick={() => takeTheirs(activePath)}>Use theirs</button>
              <button className="btn primary" onClick={() => keepMine(activePath)}>Keep mine</button>
            </>
          }
        >
          <div className="review-layout compare-layout">
            <div className="review-diff">
              <SplitDiffView original={held.theirs} proposed={editorValue} leftLabel="Theirs" rightLabel="Mine" />
            </div>
          </div>
        </Sheet>
      )}

      {settingsOpen && <SettingsSheet projectId={projectId} section={settingsOpen === true ? undefined : settingsOpen} onClose={() => setSettingsOpen(false)} />}

      {saveTemplateOpen && project && (
        <SaveTemplateSheet
          projectId={projectId}
          name={draft ? `${project.name} copy` : project.name}
          template={draft}
          onClose={() => setSaveTemplateOpen(false)}
          onSaved={() => {
            setSaveTemplateOpen(false);
            // a working copy is now the new template's: its name changes
            if (draft) listProjects().then((list) => setProjects(list.projects)).catch(() => undefined);
          }}
        />
      )}
    </EditorContext.Provider>
  );
}
