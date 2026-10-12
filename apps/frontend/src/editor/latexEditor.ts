import { Annotation, EditorSelection, RangeSetBuilder, StateEffect, StateField, countColumn } from '@codemirror/state';
import type { EditorState } from '@codemirror/state';
import { Decoration, EditorView, GutterMarker, ViewPlugin, WidgetType, gutter } from '@codemirror/view';
import type { Command, DecorationSet, ViewUpdate } from '@codemirror/view';
import { acceptCompletion, completionStatus, currentCompletions } from '@codemirror/autocomplete';
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { HighlightStyle, getIndentUnit, indentUnit } from '@codemirror/language';
import { indentMore } from '@codemirror/commands';
import { tags } from '@lezer/highlight';
import { ALGORITHM2E_SNIPPET, COMMON_ENVS, ENV_SNIPPETS, availableEnvs, scanTex } from './latexEnvs';
import type { Snip, TexScan } from './latexEnvs';

// CodeMirror pieces for LaTeX: indentation and wrapping, folding, the environment scope gutter,
// completions, the AI ghost text and the token-based theme.

/** Marks changes the app makes (opening, reloading, applying AI edits) so they don't count as typing. */
export const programmatic = Annotation.define<boolean>();

export function stripComment(line: string) {
  let escaped = false;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '%' && !escaped) return line.slice(0, i);
    escaped = line[i] === '\\' && !escaped;
  }
  return line;
}

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

// ─── Completions for "\" (and "/" as a quick trigger) ───

function snippet(label: string, text: string, cursor = text.length): Completion {
  return {
    label,
    type: 'keyword',
    apply: (view, _completion, from, to) => view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + cursor } })
  };
}

const braces = (cmd: string) => snippet(`\\${cmd}{}`, `\\${cmd}{}`, cmd.length + 2);

/**
 * An environment that keeps the indent of the line it's typed on: the body one step in (nested
 * environments a step further), and \end{…} back under \begin{…}. Its snippet (latexEnvs) adds
 * arguments after \begin{…} and the body.
 */
const env = (name: string, detail: string, top: boolean): Completion => {
  const [args, body = [''], cursorLine = 1]: Snip = (name === 'algorithm' && detail === 'algorithm2e' ? ALGORITHM2E_SNIPPET : ENV_SNIPPETS[name]) || [''];
  return {
    label: `\\begin{${name}}`,
    detail,
    boost: top ? 1 : 0,
    type: 'keyword',
    apply: (view, _completion, from, to) => {
      // typing { adds a } after the cursor, which the \end{…} line replaces
      if (view.state.sliceDoc(from, to).includes('{') && view.state.sliceDoc(to, to + 1) === '}') to += 1;
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

const COMMANDS: Completion[] = ['section', 'subsection', 'subsubsection', 'paragraph', 'cite', 'citep', 'citet', 'ref', 'eqref', 'label', 'textbf', 'textit', 'emph', 'texttt', 'footnote', 'url', 'input', 'includegraphics', 'caption'].map(braces);
const TOP_ENVS = new Set(COMMON_ENVS);

/** What the list completes: a command after \ (or /), or an environment name after \begin{. */
const TYPED = /[\\/](?:[A-Za-z]*|begin\{[\w*-]*)$/;
const WHOLE_TYPED = new RegExp(`^${TYPED.source}`);

/**
 * Commands, and the environments the project can use: the common ones, its packages' and classes', and
 * its own. `projectScans` covers the main file and what it pulls in; the open file is scanned as it is now.
 */
export function latexCompletionSource(projectScans: () => TexScan[]) {
  return (context: CompletionContext): CompletionResult | null => {
    const before = context.matchBefore(TYPED);
    if (!before) return null;
    const prev = before.from > 0 ? context.state.doc.sliceString(before.from - 1, before.from) : ' ';
    // "/" only triggers at the start of a word, and never in URLs
    if (before.text.startsWith('/') && (!/[\s({]/.test(prev) || prev === ':')) return null;
    if (before.text.startsWith('\\') && prev === '\\') return null;
    const envs = availableEnvs([...projectScans(), scanTex(context.state.doc.toString())]);
    let options = [...COMMANDS, ...[...envs].map(([name, detail]) => env(name, detail, TOP_ENVS.has(name) || detail === 'this project'))];
    const trigger = before.text[0];
    // the list filters on the label, so after "/" the labels start with "/" too (and show with "\")
    if (trigger === '/') options = options.map((o) => ({ ...o, label: `/${o.label.slice(1)}`, displayLabel: o.label }));
    return {
      from: before.from,
      options,
      // typing on keeps the list; "/beg" filled in to "\begin{" asks again for the "\" labels
      validFor: (text) => text[0] === trigger && WHOLE_TYPED.test(text),
      getMatch: (_completion, matched) => matched ?? []
    };
  };
}

/**
 * What every entry starting with the typed text has in common, when that goes further than the
 * typed text without being a whole entry ("\beg" gives "\begin{"), else null. "/" stands for "\".
 */
export function sharedStart(typed: string, labels: string[]) {
  const matching = labels.filter((label) => label.slice(1).startsWith(typed.slice(1)));
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
  '.cm-foldGutter .cm-gutterElement': { padding: '0 2px', color: 'var(--editor-gutter)' },
  '.cm-activeLine': { backgroundColor: 'var(--editor-active-line)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'color-mix(in srgb, var(--editor-fg) 60%, var(--editor-gutter))' },
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
