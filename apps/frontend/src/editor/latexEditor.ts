import { Annotation, StateEffect, StateField } from '@codemirror/state';
import type { EditorState } from '@codemirror/state';
import { Decoration, EditorView, GutterMarker, WidgetType, gutter } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import type { Completion, CompletionContext } from '@codemirror/autocomplete';
import { HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';

// CodeMirror pieces for LaTeX: folding, the environment scope gutter, completions,
// the AI ghost text and the token-based theme.

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

// ─── Completions for "\" (and "/" as a quick trigger) ───

function snippet(label: string, text: string, cursor = text.length): Completion {
  return {
    label,
    type: 'keyword',
    apply: (view, _completion, from, to) => view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + cursor } })
  };
}

const braces = (cmd: string) => snippet(`\\${cmd}{}`, `\\${cmd}{}`, cmd.length + 2);
const env = (name: string, body: string[], cursorLine = 1) => {
  const lines = [`\\begin{${name}}`, ...body, `\\end{${name}}`];
  const cursor = lines.slice(0, cursorLine).join('\n').length + 1 + lines[cursorLine].length;
  return snippet(`\\begin{${name}}`, lines.join('\n'), cursor);
};

const COMPLETIONS: Completion[] = [
  ...['section', 'subsection', 'subsubsection', 'paragraph', 'cite', 'citep', 'citet', 'ref', 'eqref', 'label', 'textbf', 'textit', 'emph', 'texttt', 'footnote', 'url', 'input', 'includegraphics', 'caption'].map(braces),
  env('itemize', ['\\item ']),
  env('enumerate', ['\\item ']),
  env('equation', ['']),
  env('align', ['']),
  env('figure', ['\\centering', '\\includegraphics[width=0.9\\linewidth]{}', '\\caption{}', '\\label{fig:}'], 2),
  env('table', ['\\centering', '\\begin{tabular}{lcc}', '\\toprule', '\\midrule', '\\bottomrule', '\\end{tabular}', '\\caption{}', '\\label{tab:}'], 7)
];

export function latexCompletionSource(context: CompletionContext) {
  const before = context.matchBefore(/[\\/][A-Za-z]*$/);
  if (!before) return null;
  const prev = before.from > 0 ? context.state.doc.sliceString(before.from - 1, before.from) : ' ';
  // "/" only triggers at the start of a word, and never in URLs
  if (before.text.startsWith('/') && (!/[\s({]/.test(prev) || prev === ':')) return null;
  if (before.text.startsWith('\\') && prev === '\\') return null;
  return { from: before.from, options: COMPLETIONS, validFor: /^[\\/][A-Za-z]*$/ };
}

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

// ─── Look: every colour is a token from tokens.css ───

export const latexHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--syntax-command)' },
  { tag: tags.comment, color: 'var(--syntax-comment)', fontStyle: 'italic' },
  { tag: tags.bracket, color: 'var(--syntax-bracket)' },
  { tag: tags.number, color: 'var(--syntax-math)' }
]);

export const editorTheme = EditorView.theme({
  '&': { height: '100%', color: 'var(--text)', backgroundColor: 'var(--bg-editor)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', fontSize: 'var(--editor-font-size, 13px)', lineHeight: '1.5' },
  '.cm-content': { padding: '10px 0 45vh', caretColor: 'var(--text)' },
  '.cm-line': { padding: '0 24px 0 8px' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--text)', borderLeftWidth: '1.5px' },
  '.cm-gutters': { backgroundColor: 'var(--bg-editor)', border: 'none', color: 'var(--editor-gutter)' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 6px 0 16px', minWidth: '44px', fontVariantNumeric: 'tabular-nums' },
  '.cm-foldGutter .cm-gutterElement': { padding: '0 2px', color: 'var(--text-tertiary)' },
  '.cm-activeLine': { backgroundColor: 'var(--editor-active-line)' },
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
  '.cm-tooltip.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--font-mono)', fontSize: '12px', padding: '4px' },
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
