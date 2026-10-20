import { withoutComments } from '../../../backend/src/latex/text.js';
import { Annotation, EditorSelection, RangeSetBuilder, StateEffect, StateField, countColumn } from '@codemirror/state';
import type { EditorState, Text } from '@codemirror/state';
import { Decoration, EditorView, GutterMarker, ViewPlugin, WidgetType, gutter } from '@codemirror/view';
import type { Command, DecorationSet, ViewUpdate } from '@codemirror/view';
import { acceptCompletion, completionStatus, currentCompletions, hasNextSnippetField, pickedCompletion, snippet } from '@codemirror/autocomplete';
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { HighlightStyle, getIndentUnit, indentUnit } from '@codemirror/language';
import { indentMore } from '@codemirror/commands';
import { tags } from '@lezer/highlight';
import { ALGORITHM2E_SNIPPET, COMMON_ENVS, ENV_SNIPPETS, MATHS_ONLY_ENVS, availableEnvs, loadedPackages, scanTex } from './latexEnvs';
import type { Project, Snip, TexScan } from './latexEnvs';
import { BIB_STYLES, CLASS_NAMES, MATH_COMMANDS, PACKAGE_NAMES, TEXT_COMMANDS } from './latexCommands';
import type { Cmd } from './latexCommands';
import { ARG_WINDOW, CITE_COMMANDS, REF_COMMANDS, VERBATIM_ENVS, argContext, texContext } from './latexContext';
import type { TexContext } from './latexContext';

// CodeMirror pieces for LaTeX: indentation and wrapping, folding, the environment scope gutter,
// completions, the AI ghost text and the token-based theme.

/** Marks changes the app makes (opening, reloading, applying AI edits) so they don't count as typing. */
export const programmatic = Annotation.define<boolean>();

export const stripComment = withoutComments;

// ─── Outline ───

export type OutlineItem = { title: string; level: number; pos: number; line: number };

const HEADING = /\\(chapter|section|subsection|subsubsection)\*?\s*(?:\[[^\]]*\])?\s*\{/g;
const HEADING_LEVEL: Record<string, number> = { chapter: 0, section: 1, subsection: 2, subsubsection: 3 };

/** The text from `start` up to the brace that closes the group, so \section{Bib\TeX{} Files} keeps its tail; null if it stays open. */
function bracedGroup(line: string, start: number) {
  let depth = 1;
  for (let i = start; i < line.length; i += 1) {
    if (line[i] === '\\') i += 1;
    else if (line[i] === '{') depth += 1;
    else if (line[i] === '}' && --depth === 0) return line.slice(start, i);
  }
  return null;
}

export function parseOutline(text: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  let offset = 0;
  text.split('\n').forEach((line, index) => {
    const code = stripComment(line);
    for (const m of code.matchAll(HEADING)) {
      const title = bracedGroup(code, (m.index ?? 0) + m[0].length);
      if (title === null) continue;
      items.push({ title: title.trim() || '(untitled)', level: HEADING_LEVEL[m[1]], pos: offset + (m.index ?? 0), line: index + 1 });
    }
    offset += line.length + 1;
  });
  return items;
}

export function nearestHeading(text: string, pos: number) {
  const before = parseOutline(text.slice(0, pos));
  return before[before.length - 1] || null;
}

/** Innermost open \begin{…} before the cursor. */
export function currentEnvironment(text: string) {
  const stack: string[] = [];
  for (const m of text.split('\n').map(stripComment).join('\n').matchAll(/\\(begin|end)\s*\{([^}]+)\}/g)) {
    const name = m[2].trim();
    if (m[1] === 'begin') stack.push(name);
    else if (stack.lastIndexOf(name) !== -1) stack.splice(stack.lastIndexOf(name), 1);
  }
  return stack[stack.length - 1] || '';
}

// ─── Folding: environments, sections, \begingroup, \if…\fi, display maths ───

const SECTION_RE = /\\(section|subsection|subsubsection|paragraph|subparagraph)\*?\b/;
const SECTION_LEVELS: Record<string, number> = { section: 1, subsection: 2, subsubsection: 3, paragraph: 4, subparagraph: 5 };
const ENV_RE = /\\(begin|end)\{([^}]+)\}/g;

const count = (text: string, re: RegExp) => [...text.matchAll(re)].length;

function countToken(text: string, token: string) {
  let n = 0;
  for (let i = 0; i <= text.length - token.length; i += 1) {
    if (text.startsWith(token, i) && text[i - 1] !== '\\') {
      n += 1;
      i += token.length - 1;
    }
  }
  return n;
}

/** Scans the lines after `start` until `done(lineText)` says the block closed there. */
function foldUntil(state: EditorState, start: number, lineEnd: number, done: (clean: string) => boolean) {
  for (let n = start + 1; n <= state.doc.lines; n += 1) {
    const line = state.doc.line(n);
    if (done(stripComment(line.text))) return line.from > lineEnd ? { from: lineEnd, to: line.from } : null;
  }
  return null;
}

export function latexFoldService(state: EditorState, lineStart: number, lineEnd: number) {
  const line = state.doc.lineAt(lineStart);
  const clean = stripComment(line.text);
  if (!clean.trim()) return null;

  const env = clean.match(/\\begin\{([^}]+)\}/)?.[1];
  if (env) {
    let depth = 1;
    return foldUntil(state, line.number, lineEnd, (text) => {
      for (const m of text.matchAll(ENV_RE)) {
        if (m[2] !== env) continue;
        depth += m[1] === 'begin' ? 1 : -1;
        if (depth === 0) return true;
      }
      return false;
    });
  }

  const section = clean.match(SECTION_RE)?.[1];
  if (section) {
    const level = SECTION_LEVELS[section];
    const folded = foldUntil(state, line.number, lineEnd, (text) => {
      const next = text.match(SECTION_RE)?.[1];
      return !!next && SECTION_LEVELS[next] <= level;
    });
    // the last section runs to the end of the file
    return folded ?? (state.doc.length > lineEnd ? { from: lineEnd, to: state.doc.length } : null);
  }

  const pairs: [RegExp, RegExp][] = [
    [/\\begingroup\b/g, /\\endgroup\b/g],
    [/\\if[a-zA-Z@]*\b/g, /\\fi\b/g]
  ];
  for (const [open, close] of pairs) {
    if (count(clean, open) > count(clean, close)) {
      let depth = 1;
      return foldUntil(state, line.number, lineEnd, (text) => {
        depth += count(text, open) - count(text, close);
        return depth <= 0;
      });
    }
  }

  if (countToken(clean, '$$') % 2 === 1) return foldUntil(state, line.number, lineEnd, (text) => countToken(text, '$$') > 0);
  if (clean.includes('\\[') && !clean.includes('\\]')) return foldUntil(state, line.number, lineEnd, (text) => text.includes('\\]'));
  return null;
}

// ─── Environment scope gutter: one coloured bar per open environment ───

function envDepths(doc: EditorState['doc']) {
  const depths: number[] = [];
  let depth = 0;
  for (let i = 1; i <= doc.lines; i += 1) {
    let lineDepth = depth;
    for (const m of stripComment(doc.line(i).text).matchAll(ENV_RE)) {
      if (m[1] === 'begin') depth += 1;
      else {
        depth -= 1;
        lineDepth = Math.min(lineDepth, depth);
      }
    }
    depths.push(Math.max(0, lineDepth));
  }
  return depths;
}

const envDepthField = StateField.define<number[]>({
  create: (state) => envDepths(state.doc),
  update: (value, tr) => (tr.docChanged ? envDepths(tr.state.doc) : value)
});

class ScopeMarker extends GutterMarker {
  constructor(readonly depth: number) {
    super();
  }
  eq(other: ScopeMarker) {
    return other.depth === this.depth;
  }
  toDOM() {
    const wrap = document.createElement('div');
    wrap.className = 'cm-scope-marker';
    for (let i = 0; i < Math.min(this.depth, 8); i += 1) {
      const bar = document.createElement('span');
      bar.className = `cm-scope-bar d${i % 6}`;
      wrap.appendChild(bar);
    }
    return wrap;
  }
}

export const scopeGutter = [
  envDepthField,
  gutter({
    class: 'cm-scope-gutter',
    lineMarker(view, line) {
      const depth = view.state.field(envDepthField)[view.state.doc.lineAt(line.from).number - 1] || 0;
      return depth > 0 ? new ScopeMarker(depth) : null;
    }
  })
];

// ─── Indentation: four spaces, and Tab indents where the cursor is ───

export const INDENT = '    ';
export const indentation = indentUnit.of(INDENT);

/** Tab: spaces to the next indent stop at the cursor, or with a selection, indent the selected lines. */
export const insertIndent: Command = (view) => {
  const { state } = view;
  if (state.readOnly) return false;
  if (state.selection.ranges.some((r) => !r.empty)) return indentMore(view);
  const unit = getIndentUnit(state);
  view.dispatch(
    state.changeByRange((range) => {
      const line = state.doc.lineAt(range.head);
      const column = countColumn(line.text.slice(0, range.head - line.from), state.tabSize);
      const spaces = ' '.repeat(unit - (column % unit));
      return { changes: { from: range.head, insert: spaces }, range: EditorSelection.cursor(range.head + spaces.length) };
    }),
    { scrollIntoView: true, userEvent: 'input.indent' }
  );
  return true;
};

/**
 * Return at the end of \begin{name} (with any [options] or {arguments}) closes the environment at the
 * same indent, with the cursor on an indented line between, if the document doesn't already close it.
 */
/** Typing "$" with text selected puts it in maths, as "(" brackets it, and leaves the text selected. */
export function wrapInMaths(view: EditorView, text: string) {
  const { state } = view;
  if (text !== '$' || state.readOnly || state.selection.ranges.every((range) => range.empty)) return false;
  view.dispatch(
    state.changeByRange((range) =>
      range.empty
        ? { changes: { from: range.from, insert: '$' }, range: EditorSelection.cursor(range.from + 1) }
        : {
            changes: [
              { from: range.from, insert: '$' },
              { from: range.to, insert: '$' }
            ],
            range: EditorSelection.range(range.anchor + 1, range.head + 1)
          }
    ),
    { scrollIntoView: true, userEvent: 'input.type' }
  );
  return true;
}

// by the character typed rather than the key, so it works on any keyboard layout
export const mathsWrap = EditorView.inputHandler.of((view, _from, _to, text) => !view.composing && wrapInMaths(view, text));

export const closeEnvironment: Command = (view) => {
  const { state } = view;
  const sel = state.selection.main;
  if (state.readOnly || state.selection.ranges.length > 1 || !sel.empty || completionStatus(state) === 'active') return false;
  const line = state.doc.lineAt(sel.head);
  if (sel.head !== line.to) return false;
  const m = /\\begin\{([^{}]+)\}(?:\s*(?:\[[^\]]*\]|\{[^{}]*\}))*\s*$/.exec(stripComment(line.text));
  if (!m) return false;
  const name = m[1];
  const text = state.doc.toString();
  const count = (word: string) => text.split(`\\${word}{${name}}`).length - 1;
  if (count('begin') <= count('end')) return false;
  const base = /^[ \t]*/.exec(line.text)![0];
  const inner = base + INDENT;
  view.dispatch({
    changes: { from: sel.head, insert: `\n${inner}\n${base}\\end{${name}}` },
    selection: { anchor: sel.head + 1 + inner.length },
    scrollIntoView: true,
    userEvent: 'input'
  });
  return true;
};

// ─── Wrapping: rows of a long line sit under its indent, and formulas break between terms ───

const CONTINUATION = 4;
// a zero-width break after these (in CSS, so nothing is added to the text) and before these commands
const BREAK_AFTER = /[=+&]|,(?!\d)/g;
const BREAK_BEFORE = /\\(?:cdot|approx|times|le|ge|leq|geq|neq|pm|mp|to|equiv|sim|simeq|propto|quad|qquad|implies|iff)(?![A-Za-z])/g;
const breakAfter = Decoration.mark({ class: 'cm-wrap-after' });
const breakBefore = Decoration.mark({ class: 'cm-wrap-before' });
const hangCache = new Map<number, Decoration>();
const hang = (columns: number) => {
  let deco = hangCache.get(columns);
  if (!deco) {
    deco = Decoration.line({ attributes: { style: `padding-left: calc(8px + ${columns}ch); text-indent: -${columns}ch` } });
    hangCache.set(columns, deco);
  }
  return deco;
};

function wrapDecorations(view: EditorView) {
  const builder = new RangeSetBuilder<Decoration>();
  const { doc, tabSize } = view.state;
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = doc.lineAt(pos);
      const indent = countColumn(/^[ \t]*/.exec(line.text)![0], tabSize);
      builder.add(line.from, line.from, hang(indent + CONTINUATION));
      // breaks only matter in long runs without spaces, such as a formula
      if (line.length > 40) {
        const marks: [number, Decoration][] = [];
        for (const m of line.text.matchAll(BREAK_AFTER)) if (line.text[m.index + 1] && line.text[m.index + 1] !== ' ') marks.push([m.index, breakAfter]);
        for (const m of line.text.matchAll(BREAK_BEFORE)) if (m.index > 0 && line.text[m.index - 1] !== ' ') marks.push([m.index, breakBefore]);
        marks.sort((a, b) => a[0] - b[0]);
        for (const [at, deco] of marks) builder.add(line.from + at, line.from + at + 1, deco);
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

/** Hanging indent for wrapped lines and clean break points in formulas (both drawn, never in the text). */
export const wrapLayout = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = wrapDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) this.decorations = wrapDecorations(update.view);
    }
  },
  { decorations: (plugin) => plugin.decorations }
);

// ─── Completions: commands after "\" (or "/" in text), environments, and what \ref, \cite and the like take ───

/** Typing { adds a } after the cursor, which the completion replaces. */
const pastBrace = (state: EditorState, from: number, to: number) => (state.sliceDoc(from, to).includes('{') && state.sliceDoc(to, to + 1) === '}' ? to + 1 : to);

/** The text a snippet template inserts, without its fields. */
const plain = (template: string) => template.replace(/\$\{\}/g, '').replace(/\\([{}])/g, '$1');

/** A command whose arguments are snippet fields: Tab goes on to the next one, then past the end. */
function commandOption(template: string, detail: string): Completion {
  const text = plain(template);
  const fields = template.includes('${') && snippet(`${template}\${}`);
  return {
    // the label shows the empty arguments: \frac{}{}, \left( \right)
    label: text.replace(/\s+/g, ' '),
    detail: detail || undefined,
    type: 'keyword',
    // in another command's field it goes in as text with the cursor in its first argument, as a snippet of its
    // own would end that command's, and Tab would no longer go on to its next field
    apply: !fields
      ? template
      : (view, completion, from, to) => {
          if (!hasNextSnippetField(view.state)) return fields(view, completion, from, to);
          const cursor = from + plain(template.slice(0, template.indexOf('${'))).length;
          view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: cursor }, annotations: pickedCompletion.of(completion), userEvent: 'input.complete' });
        }
  };
}
const snippetOf = (name: string, args = '') => `\\${name}${args.replace(/\{\}/g, '{${}}').replace(/\[\]/g, '[${}]')}`;

// built once: snippet() parses its template
const builtIn = new Map<Cmd, Completion>();
const commandOf = (cmd: Cmd) => {
  let option = builtIn.get(cmd);
  if (!option) builtIn.set(cmd, (option = commandOption(cmd.snippet ?? snippetOf(cmd.name, cmd.args), [cmd.glyph, cmd.pkg].filter(Boolean).join(' '))));
  return option;
};

/**
 * An environment that keeps the indent of the line it's typed on: the body one step in (nested
 * environments a step further), and \end{…} back under \begin{…}. Its snippet (latexEnvs) adds
 * arguments after \begin{…} and the body.
 */
const env = (name: string, detail: string, top: boolean): Completion => {
  const [args, body = [''], cursorLine = 1]: Snip = (/^algorithm\*?$/.test(name) && detail === 'algorithm2e' ? ALGORITHM2E_SNIPPET : ENV_SNIPPETS[name]) || [''];
  return {
    label: `\\begin{${name}}`,
    detail,
    boost: top ? 1 : 0,
    type: 'keyword',
    apply: (view, _completion, from, to) => {
      to = pastBrace(view.state, from, to);
      const base = /^[ \t]*/.exec(view.state.doc.lineAt(from).text)![0];
      let depth = 1;
      const inner = body.map((line) => {
        if (line.startsWith('\\end{')) depth -= 1;
        const out = base + INDENT.repeat(depth) + line;
        if (line.startsWith('\\begin{')) depth += 1;
        return out;
      });
      const lines = [`\\begin{${name}}${args}`, ...inner, `${base}\\end{${name}}`];
      // the cursor goes to the end of its line, or into the {} that ends it
      const cursor = lines.slice(0, cursorLine + 1).join('\n').length - (lines[cursorLine].endsWith('{}') ? 1 : 0);
      view.dispatch({ changes: { from, to, insert: lines.join('\n') }, selection: { anchor: from + cursor } });
    }
  };
};

/** \end{name} for an environment open at the cursor, ranked by depth so the innermost comes first. */
const endOption = (name: string, depth: number): Completion => ({
  label: `\\end{${name}}`,
  boost: depth,
  type: 'keyword',
  apply: (view, _completion, from, to) => {
    const insert = `\\end{${name}}`;
    view.dispatch({ changes: { from, to: pastBrace(view.state, from, to), insert }, selection: { anchor: from + insert.length } });
  }
});

const TOP_ENVS = new Set(COMMON_ENVS);
const COMMANDS = [...MATH_COMMANDS, ...TEXT_COMMANDS];
// nearly every paper loads amsmath and amssymb, so like amsmath's environments their commands are always offered
const ALWAYS = new Set(['', 'amsmath', 'amssymb']);

/** The commands that work here: by mode, by the packages loaded, and the project's own (ranked with the common ones). */
function commandOptions(ctx: TexContext, scans: TexScan[]) {
  const loaded = loadedPackages(scans);
  const own = new Map<string, number>();
  for (const scan of scans) {
    // not a class's: one that ships with a template (IEEEtran.cls) defines hundreds of internals, \labelenumi and the like
    if (/\.cls$/i.test(scan.file ?? '')) continue;
    for (const [name, args, math] of scan.commands) if (!own.has(name) && (ctx.mode !== 'text' || !math)) own.set(name, args);
  }
  // preamble-only commands go once the document has begun, and lead the list before it
  const body = ctx.openEnvs.includes('document');
  const options: Completion[] = [];
  for (const cmd of COMMANDS) {
    if (!(ALWAYS.has(cmd.pkg) || loaded.has(cmd.pkg) || cmd.also?.some((pkg) => loaded.has(pkg)))) continue;
    // what a loaded package defines keeps its arguments and mode when the project redefines it (\renewcommand\section)
    own.delete(cmd.name);
    if (cmd.mode !== 'both' && ctx.mode !== 'both' && cmd.mode !== ctx.mode) continue;
    if ((cmd.numbered && !ctx.numbered) || (cmd.display && !ctx.display) || (cmd.preamble && body)) continue;
    // \label gives way to a symbol that's as common: "\la" lists \lambda first
    options.push({ ...commandOf(cmd), boost: (cmd.common ? 2 : 0) - (cmd.numbered ? 1 : 0) + (cmd.preamble && ctx.preamble ? 4 : 0) });
  }
  for (const [name, args] of own) options.push({ ...commandOption(snippetOf(name, '{}'.repeat(args)), 'this project'), boost: 2 });
  return options;
}

/** The environments the project can use (the common ones, its packages' and classes', and its own) that work here. */
function envOptions(ctx: TexContext, scans: TexScan[]) {
  const math = ctx.mode === 'math';
  return [...availableEnvs(scans)]
    .filter(([name]) => ctx.mode === 'both' || (math ? MATHS_ONLY_ENVS.has(name) || name === 'tikzcd' : !MATHS_ONLY_ENVS.has(name)))
    .map(([name, detail]) => env(name, detail, TOP_ENVS.has(name) || detail === 'this project'));
}

const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);
const IMAGE = /\.(?:png|jpe?g|pdf|eps|svg)$/i;

/** What the argument of \ref, \cite, \usepackage, \includegraphics, \input and the like can be. */
function argOptions(command: string, project: Project, scans: () => TexScan[], open: string): Completion[] {
  if (REF_COMMANDS.test(command)) {
    // the open file's own labels as it is now (it's last), then the rest of the project's
    const labels = new Map<string, string>();
    for (const scan of [...scans()].reverse()) for (const label of scan.labels) if (!labels.has(label)) labels.set(label, nameOf(scan.file ?? open));
    return [...labels].map(([label, file]) => ({ label, detail: file || undefined }));
  }
  if (CITE_COMMANDS.test(command)) {
    const short = (title: string) => (title.length > 40 ? `${title.slice(0, 39).trim()}…` : title);
    return project.bib.map((e) => ({ label: e.key, detail: (e.author ? `${e.author} ${e.year}`.trim() : short(e.title)) || undefined }));
  }
  const dir = project.mainFile.slice(0, project.mainFile.lastIndexOf('/') + 1);
  // a path as the compiler finds it: from the main file's folder, else from the project root
  const paths = (ext: RegExp, keepExt = true) =>
    project.files
      .filter((p) => ext.test(p) && p !== project.mainFile)
      .map((p) => {
        const path = p.startsWith(dir) ? p.slice(dir.length) : p;
        return { label: keepExt ? path : path.replace(ext, '') };
      });
  const names = (list: string[]) => list.map((label) => ({ label }));
  switch (command) {
    case 'usepackage':
    case 'RequirePackage':
      return [...paths(/\.sty$/i, false), ...names(PACKAGE_NAMES)];
    case 'documentclass':
    case 'LoadClass':
      return [...paths(/\.cls$/i, false), ...names(CLASS_NAMES)];
    case 'bibliographystyle':
      return [...paths(/\.bst$/i, false), ...names(BIB_STYLES)];
    case 'bibliography':
      return paths(/\.bib$/i, false);
    case 'addbibresource':
      return paths(/\.bib$/i);
    case 'includegraphics':
      return paths(IMAGE);
    case 'subfile':
      return paths(/\.tex$/i);
    default:
      // \input and \include
      return paths(/\.tex$/i, false);
  }
}

/** What the list completes: a command after \ (or /), or an environment name after \begin{ or \end{. */
const TYPED = /[\\/](?:[A-Za-z]*|(?:begin|end)\{[\w*-]*)$/;
const WHOLE_TYPED = new RegExp(`^${TYPED.source}`);
/**
 * What a typed name gets besides commands: environments from "\be" on (so "\ve" never matches \begin{verse},
 * and Tab after "\be" fills in "\begin{"), and the open ones after "\end".
 */
const group = (typed: string) => {
  const name = typed.slice(1);
  return name.startsWith('begin{') || (name.length >= 2 && 'begin'.startsWith(name)) ? 'begin' : name === 'end' || name.startsWith('end{') ? 'end' : '';
};

// each version of the document scanned once, however often the list asks
const docTexts = new WeakMap<Text, string>();
const docScans = new WeakMap<Text, TexScan>();
const textOf = (doc: Text) => docTexts.get(doc) ?? docTexts.set(doc, doc.toString()).get(doc)!;
const scanOf = (doc: Text) => docScans.get(doc) ?? docScans.set(doc, scanTex(textOf(doc))).get(doc)!;

const TEX_FILE = /\.(?:tex|sty|cls|ltx)$/i;
/** In a file that isn't TeX (a .bib's titles): every command, as nothing says what the text there is. */
const ANYWHERE: TexContext = { mode: 'both', mathEnv: null, numbered: false, display: false, preamble: false, openEnvs: [] };

/**
 * Completion for where the cursor is: a label, citation key, package or file in the braces that take one;
 * otherwise, after "\", the commands and environments that work there (maths or text), from LaTeX, the
 * packages the project loads and the project itself. `project` covers the main file and what it pulls in;
 * the open file (`openFile`), when it's TeX, is scanned as it is now.
 */
export function latexCompletionSource(project: () => Project, openFile: () => string = () => '') {
  return (context: CompletionContext): CompletionResult | null => {
    const { state, pos } = context;
    const open = openFile();
    // a file that isn't TeX (a .bib, which can be megabytes) is neither scanned nor read for its context
    const tex = !open || TEX_FILE.test(open);
    const scans = () => [...project().scans.filter((scan) => !open || scan.file !== open), ...(tex ? [scanOf(state.doc)] : [])];
    const contextAt = (at: number) => (tex ? texContext(textOf(state.doc), at) : ANYWHERE);
    const innermost = (ctx: TexContext) => ctx.openEnvs[ctx.openEnvs.length - 1];
    // the braces are near the cursor, so this doesn't need the whole text
    const start = Math.max(0, pos - ARG_WINDOW);
    const arg = argContext(state.sliceDoc(start, pos), pos - start);
    if (arg) {
      const options = argOptions(arg.command, project(), scans, open);
      // typing on keeps the list until the item ends; in verbatim, \ref{ is just text
      return options.length && !VERBATIM_ENVS.has(innermost(contextAt(pos))) ? { from: start + arg.from, options, validFor: /^[^{},\s]*$/ } : null;
    }
    const before = context.matchBefore(TYPED);
    if (!before) return null;
    const prev = before.from > 0 ? state.doc.sliceString(before.from - 1, before.from) : ' ';
    const trigger = before.text[0];
    // "/" only triggers at the start of a word, and never in URLs
    if (trigger === '/' && (!/[\s({]/.test(prev) || prev === ':')) return null;
    // after an odd run of "\" it's escaped; after \\ (a line break) it starts a command, as in \\\hline
    if (trigger === '\\' && /\\*$/.exec(state.sliceDoc(Math.max(0, before.from - 64), before.from))![0].length % 2) return null;
    const ctx = contextAt(before.from);
    const top = innermost(ctx);
    // in verbatim nothing is a command, and "\end{" only closes it
    if (VERBATIM_ENVS.has(top)) return /^\\end(?:\{|$)/.test(before.text) ? { from: before.from, options: [endOption(top, 1)] } : null;
    // in maths "/" is division
    if (trigger === '/' && ctx.mode === 'math') return null;
    const kind = group(before.text);
    const all = scans();
    let options = before.text.includes('{') ? [] : commandOptions(ctx, all);
    if (kind === 'begin') options.push(...envOptions(ctx, all));
    // each open environment once (nested lists), ranked by its innermost depth
    if (kind === 'end') options.push(...[...new Map(ctx.openEnvs.map((name, depth) => [name, depth]))].map(([name, depth]) => endOption(name, depth)));
    // a scattered fuzzy match ("\ali" finding \smallskip) is noise: keep the commands whose name holds what was
    // typed, and when none does, the environments its first three letters or more start: "\ali" offers \begin{align},
    // labelled \align so it matches and fills in like a command, and shown as \begin{align}
    const typedName = before.text.slice(1).toLowerCase();
    if (kind === '' && typedName) {
      options = options.filter((o) => o.label.slice(1).toLowerCase().includes(typedName));
      if (!options.length && typedName.length >= 3)
        options = envOptions(ctx, all)
          .filter((o) => o.label.slice('\\begin{'.length).toLowerCase().startsWith(typedName))
          .map((o) => ({ ...o, label: `\\${o.label.slice('\\begin{'.length, -1)}`, displayLabel: o.label }));
    }
    // the list filters on the label, so after "/" the labels start with "/" too (and show with "\")
    if (trigger === '/') options = options.map((o) => ({ ...o, label: `/${o.label.slice(1)}`, displayLabel: o.displayLabel ?? o.label }));
    return {
      from: before.from,
      options,
      // typing on keeps the list while it gets the same entries; "/beg" filled in to "\begin{" asks again for the "\" labels
      // a command name asks again on each letter, as the narrowing above depends on all of it
      validFor: (typed) => kind !== '' && typed[0] === trigger && WHOLE_TYPED.test(typed) && group(typed) === kind,
      // an environment shown under another name (\begin{align} for \align) has nothing to highlight
      getMatch: (completion, matched) => (completion.displayLabel && completion.displayLabel.slice(1) !== completion.label.slice(1) ? [] : matched ?? [])
    };
  };
}

/**
 * What every entry starting with the typed text has in common, when that goes further than the
 * typed text without being a whole entry ("\beg" gives "\begin{"), else null. "/" stands for "\".
 * Only commands count, not a path in \input{…} that the "/" in it happens to match.
 */
export function sharedStart(typed: string, labels: string[]) {
  const matching = labels.filter((label) => /^[\\/]/.test(label) && label.slice(1).startsWith(typed.slice(1)));
  if (!matching.length) return null;
  let shared = matching[0];
  for (const label of matching) while (!label.startsWith(shared)) shared = shared.slice(0, -1);
  return shared.length > typed.length && !matching.includes(shared) ? shared : null;
}

/** Tab with the list open: fills in the shared start and keeps the list, or takes the highlighted entry. */
export const completeOrAccept: Command = (view) => {
  const { state } = view;
  if (completionStatus(state) !== 'active') return false;
  const head = state.selection.main.head;
  const typed = TYPED.exec(state.sliceDoc(state.doc.lineAt(head).from, head))?.[0];
  const shared = typed && sharedStart(typed, currentCompletions(state).map((c) => c.label));
  if (!typed || !shared) return acceptCompletion(view);
  const from = head - typed.length;
  // as if typed, so the list stays open and narrows; "/" becomes "\"
  view.dispatch({ changes: { from, to: head, insert: `\\${shared.slice(1)}` }, selection: { anchor: from + shared.length }, userEvent: 'input.type' });
  return true;
};

// ─── AI ghost text after the cursor ───

export const setGhost = StateEffect.define<{ pos: number | null; text: string }>();

class GhostWidget extends WidgetType {
  constructor(private text: string) {
    super();
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-ghost';
    span.textContent = this.text;
    return span;
  }
  ignoreEvent() {
    return true;
  }
}

export const ghostField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setGhost)) {
        const { pos, text } = effect.value;
        return pos == null || !text ? Decoration.none : Decoration.set([Decoration.widget({ widget: new GhostWidget(text), side: 1 }).range(pos)]);
      }
    }
    return tr.docChanged || tr.selection ? Decoration.none : deco.map(tr.changes);
  },
  provide: (field) => EditorView.decorations.from(field)
});

// ─── The highlight left on the line a jump from the PDF landed on ───

/** The lines from–to to highlight, 'fade' when its time is up, or null to clear it. */
export const setJumpHighlight = StateEffect.define<{ from: number; to: number } | 'fade' | null>();

const jumpLine = Decoration.line({ class: 'cm-jump-highlight' });
const jumpFading = Decoration.line({ class: 'cm-jump-highlight cm-jump-fading' });

// decorations only, never a change to the text, so undo and autosave don't see it; typing ends it
export const jumpHighlight = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    if (tr.docChanged) deco = Decoration.none;
    for (const effect of tr.effects) {
      if (!effect.is(setJumpHighlight)) continue;
      const { value } = effect;
      const starts: number[] = [];
      if (value === 'fade') deco.between(0, tr.state.doc.length, (from) => void starts.push(from));
      else if (value) {
        for (let line = tr.state.doc.lineAt(value.from); ; line = tr.state.doc.line(line.number + 1)) {
          starts.push(line.from);
          if (line.to >= value.to || line.number === tr.state.doc.lines) break;
        }
      }
      deco = Decoration.set(starts.map((from) => (value === 'fade' ? jumpFading : jumpLine).range(from)));
    }
    return deco;
  },
  provide: (field) => EditorView.decorations.from(field)
});

// ─── Look: the editor's colours come from the theme in editor-theme.css, the rest from tokens.css ───

// every tag lang.ts emits needs an entry: this highlighter isn't a fallback, so the default style never applies
export const latexHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--syntax-command)' },
  { tag: tags.comment, color: 'var(--syntax-comment)', fontStyle: 'italic' },
  { tag: tags.bracket, color: 'var(--syntax-bracket)' },
  { tag: tags.number, color: 'var(--syntax-math)' },
  { tag: tags.string, color: 'var(--syntax-arg)' },
  { tag: tags.typeName, color: 'var(--syntax-env)' }
]);

export const editorTheme = EditorView.theme({
  // --bg-editor is the theme's background, see-through with glass
  '&': { height: '100%', color: 'var(--editor-fg)', backgroundColor: 'var(--bg-editor)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--editor-font)', fontSize: 'var(--editor-font-size, 13px)', lineHeight: '1.5' },
  '.cm-content': { padding: '10px 0 45vh', caretColor: 'var(--editor-cursor)' },
  '.cm-line': { padding: '0 24px 0 8px' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--editor-cursor)', borderLeftWidth: '1.5px' },
  '.cm-gutters': { backgroundColor: 'var(--bg-editor)', border: 'none', color: 'var(--editor-gutter)' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 6px 0 16px', minWidth: '44px', fontVariantNumeric: 'tabular-nums' },
  // the fold markers and the current line number take the UI greys, as in 1.1 (Spectrum's gutter colour is fainter)
  '.cm-foldGutter .cm-gutterElement': { padding: '0 2px', color: 'var(--text-tertiary)' },
  '.cm-activeLine': { backgroundColor: 'var(--editor-active-line)' },
  // --sync-highlight is set on the editor page from Settings → Editor; jump-fade is in editor.css
  '.cm-line.cm-jump-highlight': { backgroundColor: 'color-mix(in srgb, var(--sync-highlight) 30%, transparent)' },
  '.cm-line.cm-jump-fading': { animation: 'jump-fade 0.5s ease-out forwards' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--text-secondary)' },
  '.cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--editor-selection) !important'
  },
  '.cm-selectionMatch': { backgroundColor: 'var(--accent-soft)' },
  '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, var(--yellow) 30%, transparent)', outline: 'none' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'color-mix(in srgb, var(--orange) 40%, transparent)' },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': { backgroundColor: 'var(--accent-soft)', color: 'inherit', outline: 'none' },
  '.cm-nonmatchingBracket, &.cm-focused .cm-nonmatchingBracket': { backgroundColor: 'transparent', color: 'var(--red)' },
  '.cm-foldPlaceholder': { backgroundColor: 'var(--fill)', border: 'none', color: 'var(--text-secondary)', borderRadius: '6px', padding: '0 6px', margin: '0 4px' },
  '.cm-ghost': { color: 'var(--text-tertiary)', whiteSpace: 'pre-wrap' },
  '.cm-tooltip': {
    backgroundColor: 'var(--bg-elevated)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    boxShadow: 'var(--shadow-md)',
    overflow: 'hidden'
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--editor-font)', fontSize: '12px', padding: '4px' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': { padding: '3px 8px', borderRadius: '6px' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--accent)', color: 'var(--accent-text)' },
  '.cm-completionIcon': { display: 'none' },
  '.cm-panels': { backgroundColor: 'var(--bg-panel)', color: 'var(--text)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--border)' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--border)' },
  '.cm-panel.cm-search': { padding: '8px 36px 8px 12px', fontFamily: 'var(--font-ui)', fontSize: '12px' },
  '.cm-panel.cm-search label': { color: 'var(--text-secondary)', fontSize: '12px' },
  '.cm-panel.cm-search [name=close]': { top: '8px', right: '10px', color: 'var(--text-secondary)', fontSize: '16px' },
  '.cm-textfield': {
    height: '26px',
    padding: '0 9px',
    border: '1px solid var(--border-strong)',
    borderRadius: '8px',
    background: 'transparent',
    color: 'var(--text)',
    fontSize: '12px'
  },
  '.cm-textfield:focus': { outline: 'none', borderColor: 'var(--accent)', boxShadow: '0 0 0 3px var(--accent-soft)' },
  '.cm-button': {
    height: '26px',
    padding: '0 10px',
    border: 'none',
    borderRadius: '999px',
    backgroundImage: 'none',
    backgroundColor: 'var(--fill)',
    color: 'var(--text)',
    fontSize: '12px'
  },
  '.cm-button:active': { backgroundImage: 'none', backgroundColor: 'var(--bg-selected)' }
});
