import { extractJsonBlock } from '../../../backend/src/utils/jsonUtils.js';
export { extractJsonBlock } from '../../../backend/src/utils/jsonUtils.js';
import { withoutComments } from '../../../backend/src/latex/text.js';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { runAgent } from '../api/client';
import type { AgentPatch, ReferenceResult } from '../api/client';
import type { EditorApi, PendingChange } from './EditorContext';

// Small helpers shared by the composer and the Tools tabs.

export const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function citationCommand(source: string) {
  const text = withoutComments(source);
  if (/\\addbibresource\b|\\(?:usepackage|RequirePackage)(?:\s*\[[^\]]*\])?\s*\{biblatex\}/.test(text)) return '\\parencite';
  return /\\usepackage(?:\s*\[[^\]]*\])?\s*\{natbib\}/.test(text) ? '\\citep' : '\\cite';
}

/** The citation command the main file's packages call for: \parencite, \citep or \cite. */
export async function mainCitationCommand(api: EditorApi) {
  const source = api.activePath === api.mainFile ? api.editorValue : await api.ensureFileContent(api.mainFile).catch(() => '');
  return citationCommand(source);
}

export async function citationText(api: EditorApi, keys: string[]) {
  const kind = docKind(api.activePath);
  if (kind === 'typst') return keys.map((key) => (/^[A-Za-z0-9_:.-]+$/.test(key) ? `@${key}` : `#cite(label(${JSON.stringify(key)}))`)).join(' ');
  if (kind === 'markdown') return `[${keys.map((key) => `@${key}`).join('; ')}]`;
  return `${await mainCitationCommand(api)}{${keys.join(',')}}`;
}

/** After references went into bibFile: the editor reads it again, and the file tree too when the file is new. */
export async function reloadBib(api: EditorApi, results: ReferenceResult[], bibFile: string) {
  if (!results.some((r) => r.status === 'added')) return;
  if (!api.bibFiles.includes(bibFile)) await api.refreshTree();
  await api.reloadFiles([bibFile]);
}

const dateFormat = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
const relativeFormat = new Intl.RelativeTimeFormat('en-AU', { numeric: 'always' });

/** "30 Aug 2026" */
export const formatDate = (iso: string) => dateFormat.format(new Date(iso));

/** "Just now", "3 hours ago", "1 month ago" */
export function relativeTime(iso: string) {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(seconds)) return '';
  if (seconds < 60) return 'Just now';
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * 86400],
    ['month', 30 * 86400],
    ['week', 7 * 86400],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60]
  ];
  const [unit, size] = steps.find(([, s]) => seconds >= s) || steps[steps.length - 1];
  return relativeFormat.format(-Math.floor(seconds / size), unit);
}

export function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" /> }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

/** Fired after a chat is saved or deleted so the Chats list can refresh. */
export const CHATS_CHANGED = 'spectrum-chats-changed';

/** Fired after the editor saves a checkpoint (e.g. "Before AI changes") so Tools › Checkpoints can refresh. */
export const VERSIONS_CHANGED = 'spectrum-versions-changed';
/** Fired after Settings › Engines installs or removes an engine, so the compile menu offers it. */
export const ENGINES_CHANGED = 'spectrum-engines-changed';

/** Fired after Settings › Agents saves an agent's setup, so the agent workspace's picker sees it. */
export const AGENTS_CHANGED = 'spectrum-agents-changed';

/** Fired after a pull from GitHub changed files in .spectrum, so the to-dos, PDF notes and Research reload. */
export const PROJECT_DATA_CHANGED = 'spectrum-project-data-changed';

export type VisionMode = 'equation' | 'table' | 'figure' | 'algorithm' | 'ocr';

export const VISION_MODES: [VisionMode, string, string][] = [
  ['equation', 'Equation', 'function'],
  ['table', 'Table', 'tablecells'],
  ['figure', 'Figure with caption', 'photo'],
  ['algorithm', 'Algorithm', 'list.number'],
  ['ocr', 'Text only', 'text.viewfinder']
];

/** Default extra instructions per image type (sent when the user gives none). */
export const VISION_HINTS: Partial<Record<VisionMode, string>> = {
  equation: 'Only output the equation environment, without a document wrapper.',
  table: 'Only output the LaTeX table (tabular or table), without a document wrapper.',
  algorithm: 'Only output the algorithm/algorithmic environment, without a document wrapper.'
};

// ─── LLM output parsing ───

/** Escapes raw control characters inside JSON strings (models often emit literal newlines). */
function sanitizeJsonString(raw: string) {
  let inString = false;
  let escaped = false;
  let out = '';
  for (const ch of raw) {
    if (!inString) {
      if (ch === '"') inString = true;
      out += ch;
      continue;
    }
    if (escaped) {
      out += ch;
      escaped = false;
    } else if (ch === '\\') {
      out += ch;
      escaped = true;
    } else if (ch === '"') {
      out += ch;
      inString = false;
    } else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (ch.charCodeAt(0) < 0x20) out += `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`;
    else out += ch;
  }
  return out;
}

export function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    try {
      return JSON.parse(sanitizeJsonString(raw)) as T;
    } catch {
      return null;
    }
  }
}

/** JSON object embedded anywhere in a model reply, or null. */
export const parseJsonReply = <T,>(text: string) => {
  const block = extractJsonBlock(text);
  return block ? safeJsonParse<T>(block) : null;
};

// ─── LaTeX helpers ───

export const isTex = (path: string) => path.toLowerCase().endsWith('.tex');

export type DocKind = 'latex' | 'typst' | 'markdown';
/** The kind of document a file is, by its extension; null for anything else (.bib, images). */
export const docKind = (path: string): DocKind | null =>
  /\.(tex|ltx)$/i.test(path) ? 'latex' : /\.typ$/i.test(path) ? 'typst' : /\.(md|markdown)$/i.test(path) ? 'markdown' : null;
export const isDocument = (path: string) => docKind(path) !== null;
/** A file of a document's own source: a document, or a LaTeX package, class or .bib file it reads. */
export const isSource = (path: string) => isDocument(path) || /\.(sty|cls|bib)$/i.test(path);

/**
 * The main file as the tree changes: the current one while it's still a document there, else a main.tex, .typ or .md,
 * else the first document; never a sync app's conflict copy.
 */
export function keptMainFile(current: string, files: string[], conflicts: Record<string, string> = {}) {
  const docs = files.filter(isDocument);
  if (current && docs.includes(current)) return current;
  const usable = docs.filter((p) => !conflicts[p]);
  return usable.find((p) => /(^|\/)main\.(?:tex|typ|md|markdown)$/i.test(p)) || usable[0] || '';
}

export function figureSnippet(filePath: string) {
  return [
    '\\begin{figure}[t]',
    '\\centering',
    `\\includegraphics[width=0.9\\linewidth]{${filePath}}`,
    '\\caption{Caption.}',
    `\\label{fig:${filePath.replace(/[^a-zA-Z0-9]+/g, '-')}}`,
    '\\end{figure}'
  ].join('\n');
}

const parentPath = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

/** File list + section outline of the document, starting at the main file and following \input/\include. */
export async function buildProjectContext(api: Pick<EditorApi, 'mainFile' | 'activePath' | 'ensureFileContent'>) {
  const root = api.mainFile || api.activePath;
  if (!root) return '';
  const visited = new Set<string>();
  const queue = [root];
  const summaries: string[] = [];
  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    if (!isTex(current)) continue;
    let content = '';
    try {
      content = await api.ensureFileContent(current);
    } catch {
      continue;
    }
    const headings: string[] = [];
    const includes: string[] = [];
    for (const line of content.split(/\r?\n/)) {
      const clean = withoutComments(line);
      for (const m of clean.matchAll(/\\+(section|subsection|subsubsection)\*?\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g)) {
        const level = m[1] === 'section' ? 0 : m[1] === 'subsection' ? 1 : 2;
        if (headings.length < 12) headings.push(`${'  '.repeat(level)}- ${m[2].trim() || '(untitled)'}`);
      }
      for (const m of clean.matchAll(/\\(?:input|include)\s*\{([^}]+)\}/g)) includes.push(m[1].trim());
    }
    summaries.push(`File: ${current}\n${headings.join('\n')}`);
    const base = parentPath(current);
    for (const raw of includes) {
      const target = raw.replace(/^\//, '').replace(/(\.tex)?$/, '.tex');
      const resolved = base ? `${base}/${target}` : target;
      if (!visited.has(resolved)) queue.push(resolved);
    }
  }
  return `Project files: ${[...visited].join(', ')}\nOutline:\n${summaries.join('\n')}`;
}

/**
 * Agent patches → reviewable changes. The "before" side is the file as the agent read it (the backend
 * sends it as `original`), so edits made since then are rebased, not reverted, when the change is accepted.
 */
export async function patchesToChanges(api: Pick<EditorApi, 'ensureFileContent'>, patches: AgentPatch[], source?: string) {
  return Promise.all(
    patches.map(async (patch): Promise<PendingChange> => ({
      filePath: patch.path,
      original: patch.original ?? (await api.ensureFileContent(patch.path).catch(() => '')),
      proposed: patch.content,
      source
    }))
  );
}

/**
 * Fix with AI, as the Logs and Review tabs offer it: one tools run asked for a patch, which opens as reviewable changes
 * named `label`. file: where the problem is (the open file otherwise); withLog: the compile log goes along. Says how it
 * went itself and returns the AI's reply ('' when the request failed).
 */
export async function fixWithAI(api: EditorApi, { task, prompt, selection = '', file, label, withLog = true }: { task: string; prompt: string; selection?: string; file?: string; label: string; withLog?: boolean }) {
  try {
    const res = await runAgent({
      task,
      prompt,
      selection,
      content: '',
      mode: 'tools',
      projectId: api.projectId,
      activePath: file || api.activePath,
      compileLog: withLog ? api.compileLog : '',
      llmConfig: api.llm.main,
      interaction: 'agent',
      history: [],
      reasoningEffort: api.settings.reasoningEffort
    });
    const changes = await patchesToChanges(api, res.patches || [], label);
    if (changes.length) api.proposeChanges(changes, { open: true });
    else if (res.ok) api.notify('No fix was proposed.');
    else api.notify(res.reply || 'The request failed.', 'error');
    // a failed request's reply is its error, told above already
    return res.ok || changes.length ? res.reply || '' : '';
  } catch (err) {
    api.notify(`Couldn’t get a fix: ${errorText(err)}`, 'error');
    return '';
  }
}
