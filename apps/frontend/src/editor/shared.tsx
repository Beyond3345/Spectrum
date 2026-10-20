import { extractJsonBlock } from '../../../backend/src/utils/jsonUtils.js';
export { extractJsonBlock } from '../../../backend/src/utils/jsonUtils.js';
import { withoutComments } from '../../../backend/src/latex/text.js';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AgentPatch } from '../api/client';
import type { EditorApi, PendingChange } from './EditorContext';

// Small helpers shared by the composer and the Tools tabs.

export const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function citationCommand(source: string) {
  const text = withoutComments(source);
  if (/\\addbibresource\b|\\(?:usepackage|RequirePackage)(?:\s*\[[^\]]*\])?\s*\{biblatex\}/.test(text)) return '\\parencite';
  return /\\usepackage(?:\s*\[[^\]]*\])?\s*\{natbib\}/.test(text) ? '\\citep' : '\\cite';
}

export async function citationText(api: EditorApi, keys: string[]) {
  const source = api.activePath === api.mainFile ? api.editorValue : await api.ensureFileContent(api.mainFile).catch(() => '');
  return `${citationCommand(source)}{${keys.join(',')}}`;
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

/** Fired after the editor saves a version (e.g. "Before AI changes") so the Versions tab can refresh. */
export const VERSIONS_CHANGED = 'spectrum-versions-changed';

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

export const extractBibKey = (bibtex: string) => bibtex.match(/@\w+\s*{\s*([^,\s]+)\s*,/)?.[1].trim() || '';

/** Classic BibTeX styles ignore url; keep Research imports visible there too. */
export function bibtexForDocument(bibtex: string, source: string) {
  const text = withoutComments(source);
  const legacyUrls = /\\bibliographystyle\s*\{(?:plain|abbrv|alpha|unsrt|acm|apalike|ieeetr)\}/.test(text)
    && !/\\addbibresource\b|\{biblatex\}/.test(text);
  if (!legacyUrls || !/^@misc\s*\{/i.test(bibtex) || /\bhowpublished\s*=/i.test(bibtex)) return bibtex;
  return bibtex.replace(/^(\s*)url\s*=\s*\{([^{}\r\n]+)\}/m, (_, space, url) => `${space}howpublished = {\\url{${url}}}`);
}

export const isTex = (path: string) => path.toLowerCase().endsWith('.tex');

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

/** Puts a block before \end{document} (or at the end when there is none). */
export function insertBeforeEnd(source: string, block: string) {
  const idx = source.lastIndexOf('\\end{document}');
  if (idx === -1) return `${source.replace(/\s*$/, '')}\n\n${block}\n`;
  return `${source.slice(0, idx).replace(/\s*$/, '')}\n\n${block}\n\n${source.slice(idx)}`;
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
