import { extractJsonBlock } from '../../../backend/src/utils/jsonUtils.js';
export { extractJsonBlock } from '../../../backend/src/utils/jsonUtils.js';
import { escapeTexText, withoutComments } from '../../../backend/src/latex/text.js';
import { docKind } from '../../../backend/src/utils/docLanguage.js';
import { diffLines } from 'diff';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { runAgent } from '../api/client';
import type { AgentPatch, ReferenceResult } from '../api/client';
import type { EditorApi, PendingChange } from './EditorContext';

// Small helpers shared by the composer and the Tools tabs.

export const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

export const NO_ANSWER = 'Spectrum’s server didn’t answer';

/**
 * run(), tried again after a pause when it fails or gives no answer within `timeout` ms, `tries` times in all; the last
 * failure is thrown. stop(): true once the result is no longer wanted (the page left), which ends the tries quietly.
 */
export async function withRetries<T>(run: () => Promise<T>, { tries = 3, timeout = 15000, pause = 1000, stop = (): boolean => false } = {}): Promise<T | undefined> {
  for (let attempt = 1; ; attempt++) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([run(), new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error(NO_ANSWER)), timeout)))]);
    } catch (err) {
      if (stop()) return undefined;
      if (attempt >= tries) throw err;
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => setTimeout(resolve, pause * attempt));
    if (stop()) return undefined;
  }
}

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

/** Where in the work a citation points: a page, pages, a chapter or a section */
export type LocatorKind = 'page' | 'pages' | 'chapter' | 'section';
export type Locator = { kind: LocatorKind; value: string };
export const LOCATOR_KINDS: [LocatorKind | '', string][] = [['', 'None'], ['page', 'Page (p.)'], ['pages', 'Pages (pp.)'], ['chapter', 'Chapter (Ch.)'], ['section', 'Section (§)']];

const LOCATOR_WORDS: Record<'latex' | 'typst' | 'markdown', Record<LocatorKind, string>> = {
  latex: { page: 'p.~', pages: 'pp.~', chapter: 'Ch.~', section: '\\S~' },
  typst: { page: 'p. ', pages: 'pp. ', chapter: 'Ch. ', section: '§ ' },
  // pandoc's own locator terms, which the citation style then words
  markdown: { page: 'p. ', pages: 'pp. ', chapter: 'chap. ', section: 'sec. ' }
};
const RANGE = /\s*[-–—]+\s*/g;

/**
 * The citation of keys in a document of kind, with a locator when it has a value: \cite[p.~42]{Key} (in the command
 * the main file calls for), #cite(<Key>, supplement: [pp. 42–45]) in Typst, [@Key, pp. 42-45] in Markdown.
 */
export function formatCitation(kind: ReturnType<typeof docKind>, command: string, keys: string[], locator?: Locator | null) {
  const value = locator?.value.trim() || '';
  const on = locator && value ? locator : null;
  if (kind === 'typst') {
    const label = (key: string) => (/^[A-Za-z0-9_:.-]+$/.test(key) ? `<${key}>` : `label(${JSON.stringify(key)})`);
    const plain = (key: string) => (/^[A-Za-z0-9_:.-]+$/.test(key) ? `@${key}` : `#cite(${label(key)})`);
    if (!on) return keys.map(plain).join(' ');
    // a locator belongs to the last key, as in LaTeX's and pandoc's
    const supplement = (LOCATOR_WORDS.typst[on.kind] + value.replace(RANGE, '–')).replace(/[\\[\]#*_$@<>`]/g, '\\$&');
    return [...keys.slice(0, -1).map(plain), `#cite(${label(keys[keys.length - 1])}, supplement: [${supplement}])`].join(' ');
  }
  if (kind === 'markdown') {
    const cites = keys.map((key) => `@${key}`).join('; ');
    return on ? `[${cites}, ${LOCATOR_WORDS.markdown[on.kind]}${value.replace(RANGE, '-')}]` : `[${cites}]`;
  }
  const note = on ? `[${LOCATOR_WORDS.latex[on.kind]}${escapeTexText(value.replace(RANGE, '-')).replace(/-/g, '--').replace(/----+/g, '--')}]` : '';
  return `${command}${note}{${keys.join(',')}}`;
}

export async function citationText(api: EditorApi, keys: string[], locator?: Locator | null) {
  const kind = docKind(api.activePath);
  return formatCitation(kind, kind === 'typst' || kind === 'markdown' ? '' : await mainCitationCommand(api), keys, locator);
}

/** lines a suggestion adds and removes, and where the first file's change starts and ends (in its new text) */
export type ChangeStat = { added: number; removed: number; from: number; to: number };

export function changeStat(changes: { original: string; proposed: string }[]): ChangeStat {
  const stat = { added: 0, removed: 0, from: 0, to: 0 };
  changes.forEach((c, i) => {
    let line = 1;
    for (const part of diffLines(c.original, c.proposed)) {
      const n = part.count ?? 0;
      if (part.added || part.removed) {
        if (part.added) stat.added += n;
        else stat.removed += n;
        if (i === 0) {
          stat.from ||= line;
          stat.to = Math.max(stat.to, line + Math.max(0, (part.added ? n : 1) - 1));
        }
      }
      if (!part.removed) line += n;
    }
  });
  return stat;
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

/**
 * Whether a reply's image may be drawn: one carried in the reply itself. Any other address would be fetched as soon as
 * the reply shows, so a model steered by what it read could send the project's text out in it, or call the app's own API.
 */
export const inlineImage = (src: unknown) => typeof src === 'string' && /^(?:data:image\/|blob:)/i.test(src);

export function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // react-markdown drops data: addresses unless told to keep them
        urlTransform={(url) => (inlineImage(url) ? url : defaultUrlTransform(url))}
        components={{
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
          // an image elsewhere is shown as a link to it, which fetches nothing until it's clicked
          img: ({ node: _node, src, alt }) => (inlineImage(src) ? <img src={src} alt={alt} /> : <a href={src} target="_blank" rel="noreferrer">{alt || src}</a>)
        }}
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

/** Fired after Settings changes a project's own language list, so its editor checks in the languages now listed. */
export const LANGUAGES_CHANGED = 'spectrum-languages-changed';

/** Fired after a pull from GitHub changed files in .spectrum, so the to-dos, PDF notes and Research reload. */
export const PROJECT_DATA_CHANGED = 'spectrum-project-data-changed';

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

export type { DocKind } from '../../../backend/src/utils/docLanguage.js';
/** The kind of document a file is, by its extension; null for anything else (.bib, images). */
export { docKind } from '../../../backend/src/utils/docLanguage.js';
export const isDocument = (path: string) => docKind(path) !== null;
/** The line that includes bibFile in a main file of its kind, for the hint shown when it is not included yet. */
export const bibIncludeLine = (mainFile: string, bibFile: string) => {
  const kind = docKind(mainFile);
  if (kind === 'typst') return `#bibliography("${bibFile}")`;
  return `\\bibliography{${bibFile.replace(/\.bib$/i, '')}}`;
};
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

/**
 * Whether applying a change deletes its file. A proposed deletion taken in part (some lines kept, or its text edited in
 * the review) is an edit like any other: only the proposal that still leaves nothing takes the file away.
 */
export const isDeletion = (change: { deleted?: boolean; proposed: string }) => !!change.deleted && change.proposed === '';

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
      source,
      ...(patch.deleted && { deleted: true })
    }))
  );
}

/**
 * Whether a model can answer: a key, or a local server on plain http that takes none (llmService.js missingKey).
 * ponytail: a key only in the backend's .env (SPECTRUM_LLM_API_KEY, a developer's setup) is not seen here.
 */
export const modelSetUp = (llm: { apiKey?: string; endpoint?: string }) => Boolean(llm.apiKey) || /^http:\/\//i.test(llm.endpoint || '');

/** Fix with AI's tooltip: with no model set up it opens Settings › Providers instead */
export const fixTitle = (api: Pick<EditorApi, 'llm'>) => (modelSetUp(api.llm.main) ? undefined : 'No AI model is set up yet: opens Settings › Providers');

/** What Fix with AI says of the compile its run ended with: whether the fix builds, or where it still fails. */
export const buildLine = (build?: { ok: boolean; errors: string[] }) => (!build ? '' : build.ok ? 'Builds.' : `Still fails at ${build.errors[0] || 'the compile'}`);

/**
 * Fix with AI, as the Logs and Review tabs offer it: one tools run asked for a patch, which opens as reviewable changes
 * named `label`, and ends with a compile of the fix (on a copy: nothing is written), told with the reply. file: where the problem is (the open file otherwise); withLog: the compile log goes along. Says how it
 * went itself and returns the AI's reply ('' when the request failed).
 */
export async function fixWithAI(api: EditorApi, { task, prompt, selection = '', file, label, withLog = true }: { task: string; prompt: string; selection?: string; file?: string; label: string; withLog?: boolean }) {
  if (!modelSetUp(api.llm.main)) {
    api.openSettings('providers');
    return '';
  }
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
      reasoningEffort: api.settings.reasoningEffort,
      verify: true,
      compile: { typstVersion: api.settings.compileDefaults.typstVersion, markdownEngine: api.settings.compileDefaults.markdownEngine }
    });
    const changes = await patchesToChanges(api, res.patches || [], label);
    if (changes.length) api.proposeChanges(changes, { open: true });
    else if (res.ok) api.notify('No fix was proposed.');
    else api.notify(res.reply || 'The request failed.', 'error');
    // a failed request's reply is its error, told above already
    return res.ok || changes.length ? [res.reply, buildLine(res.build)].filter(Boolean).join('\n\n') : '';
  } catch (err) {
    api.notify(`Couldn’t get a fix: ${errorText(err)}`, 'error');
    return '';
  }
}
