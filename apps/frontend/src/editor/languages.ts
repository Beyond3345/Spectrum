import { Compartment } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { HighlightStyle, Language, LanguageSupport, defaultHighlightStyle, foldService, languageDataProp, syntaxHighlighting } from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { Tag, tags } from '@lezer/highlight';
import type { MarkdownConfig } from '@lezer/markdown';
import { latex } from '../latex/lang';
import { compileLint } from './compileMarks';
import { latexFoldService, latexHighlight, mathsWrap } from './latexEditor';
import { docKind } from './shared';
import { ChunkedParser } from './typstChunks';
import { includedPath } from './outlines';
import { EditorView } from '@codemirror/view';
import { IS_MAC } from '../app/platform';

// The editor's language for a file, swapped as files open: LaTeX has its own mode, highlighting and folding, Typst
// loads its Lezer mode (no WebAssembly) the first time one opens, and Markdown uses CodeMirror's own.

export const languageCompartment = new Compartment();

let typst: Extension | null = null;
let loading: Promise<Extension | null> | null = null;

/** The Typst language, loaded once; null while loading or when the package fails. */
export function loadTypst(): Promise<Extension | null> {
  loading ??= import('codemirror-lang-typst/lezer')
    .then((mode) => (typst = [typstLanguage(mode), compileLint]))
    .catch(() => null);
  return loading;
}

/**
 * The package's own typst_lezer(), part for part, around a parser that parses a long file in chunks and only the
 * changed ones again (typstChunks.ts): its highlighting, completion, indentation, folding, list keys and linter.
 */
export function typstLanguage(mode: typeof import('codemirror-lang-typst/lezer')): Extension {
  const base = new mode.TypstLezerParser(
    languageDataProp.add((type) => (type.isTop ? mode.typstLezerLanguageData : undefined)),
    mode.typstLezerHighlighting,
    mode.typstLezerIndentation,
    mode.typstLezerFolding
  );
  const top = base.nodeSet.types.find((type) => type.isTop)!;
  return new LanguageSupport(new Language(mode.typstLezerLanguageData, new ChunkedParser(base, top), [], 'typst'), [
    syntaxHighlighting(mode.TypstHighlightSytle),
    syntaxHighlighting(defaultHighlightStyle),
    mode.typstLezerIndentService,
    mode.typstLezerListKeymap,
    mode.typstLezerFoldService,
    mode.typstLezerLinter
  ]);
}

/** Whether Typst's own completions run for a project's Typst version: the built-in one's, 0.15 ('' for it). */
const ownCompletions = (version: string) => !version || version.startsWith('0.15');

/** Typst's own completions (0.15's built-ins), only in a .typ file whose project uses the built-in version. */
export function typstCompletions({ path, version }: { path: () => string; version: () => string }) {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    if (docKind(path()) !== 'typst') return null;
    if (!ownCompletions(version())) return null;
    if (!(await loadTypst())) return null;
    const { typstCompletionSource } = await import('codemirror-lang-typst/lezer');
    return typstCompletionSource(context);
  };
}

/** The cross-reference labels of a Markdown document ({#fig:x}, {#tbl:x}, {#eq:x}, {#sec:x}, or fig-x and the like). */
export const markdownLabels = (text: string) => [...text.matchAll(/\{#((?:fig|tbl|tab|eq|sec)[:-][\w:.-]*[\w])/g)].map((m) => m[1]);

/**
 * After @ in Typst (keys and labels), after @ in Markdown (its labels) and [@ or ; @ in Markdown (keys too): the
 * project's bibliography and labels. Where
 * Typst's own completions run (version: the project's Typst version), they list the open file's labels, so only the
 * labels of the project's other files are added here.
 */
export function referenceCompletions({ path, keys, labels, version }: { path: () => string; keys: () => string[]; labels: () => string[]; version: () => string }) {
  return (context: CompletionContext): CompletionResult | null => {
    const kind = docKind(path());
    if (kind !== 'typst' && kind !== 'markdown') return null;
    const match = context.matchBefore(/@[\w:.+-]*$/);
    if (!match) return null;
    const before = match.from > 0 ? context.state.sliceDoc(match.from - 1, match.from) : '';
    // not inside a word (an email address's @ says nothing about citations)
    if (/[\p{L}\p{N}_]/u.test(before)) return null;
    const seen = new Set<string>();
    const options: { label: string; type: string; detail?: string }[] = [];
    if (kind === 'markdown') {
      // the open document's labels anywhere (@fig:x in the text), keys only inside brackets
      for (const label of markdownLabels(context.state.doc.toString())) {
        if (seen.has(label)) continue;
        seen.add(label);
        options.push({ label, type: 'label', detail: 'label' });
      }
      const upTo = context.state.sliceDoc(0, match.from);
      const inside = upTo.lastIndexOf('[') > upTo.lastIndexOf(']');
      const afterSemicolon = match.from >= 2 && context.state.sliceDoc(match.from - 2, match.from) === '; ';
      if (!inside || !(before === '[' || before === '-' || afterSemicolon)) return options.length ? { from: match.from + 1, options, validFor: /^[\w:.+-]*$/ } : null;
    }
    for (const key of keys()) {
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({ label: key, type: 'keyword' });
    }
    if (kind === 'typst') {
      const own = ownCompletions(version()) ? context.state.doc.toString() : '';
      for (const label of labels()) {
        const name = label.replace(/^<|>$/g, '');
        if (!name || seen.has(name) || own.includes('<' + name + '>')) continue;
        seen.add(name);
        options.push({ label: name, type: 'label', detail: 'label' });
      }
    }
    return options.length ? { from: match.from + 1, options, validFor: /^[\w:.+-]*$/ } : null;
  };
}

/** A Typst definition: a #let name, a function when it takes arguments. */
export type TypstDefinition = { name: string; fn: boolean };
const LET = /(?:^|[^\p{L}\p{N}_-])let\s+([\p{L}_][\p{L}\p{N}_-]*)\s*(\(|=)/gu;

/** The #let definitions of Typst source (comments and all: a commented one is rare and does no harm offered). */
export const typstDefinitions = (text: string): TypstDefinition[] => [...text.matchAll(LET)].map((m) => ({ name: m[1], fn: m[2] === '(' }));

/**
 * The project's own Typst functions and values (defs: from its .typ files) after # in markup, or in a call's arguments
 * on that line. Typst's own completions list the open file's, so those are left out where they run (version).
 * ponytail: code mode is guessed from the line, not the syntax tree, so a #{ … } block over several lines gets none
 */
export function definitionCompletions({ path, defs, version }: { path: () => string; defs: () => TypstDefinition[]; version: () => string }) {
  return (context: CompletionContext): CompletionResult | null => {
    if (docKind(path()) !== 'typst') return null;
    const word = context.matchBefore(/[\p{L}_][\p{L}\p{N}_-]*$/u) ?? (context.explicit ? { from: context.pos, to: context.pos, text: '' } : null);
    if (!word) return null;
    const line = context.state.doc.lineAt(context.pos);
    const before = context.state.sliceDoc(line.from, word.from);
    if (!before.endsWith('#') && !/#[^\s]*[({][^)}]*$/.test(before)) return null;
    const own = ownCompletions(version()) ? new Set(typstDefinitions(context.state.doc.toString()).map((d) => d.name)) : new Set<string>();
    const seen = new Set<string>();
    const options = defs().flatMap(({ name, fn }) => {
      if (own.has(name) || seen.has(name)) return [];
      seen.add(name);
      return [{ label: name, type: fn ? 'function' : 'variable', detail: 'this project' }];
    });
    return options.length ? { from: word.from, options, validFor: /^[\p{L}\p{N}_-]*$/u } : null;
  };
}

/**
 * The project file a quoted path at pos names, in a Typst file (#include, image, bibliography, read, json…): from the
 * file it is in, or from the project's root for one starting with /; null when pos is in no such string.
 */
export function typstPathAt(text: string, pos: number, from: string, files: ReadonlySet<string>): string | null {
  const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
  const lineEnd = text.indexOf('\n', pos);
  const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
  for (const m of line.matchAll(/"([^"\\\n]+)"/g)) {
    const start = lineStart + (m.index ?? 0);
    if (pos < start || pos > start + m[0].length) continue;
    const path = includedPath(from, m[1]);
    return files.has(path) ? path : null;
  }
  return null;
}

/** ⌘-click (Ctrl-click) on a project file's path in a Typst file opens it; anywhere else the click goes on to Go to definition. */
export function typstPathClick({ path, files, open }: { path: () => string; files: () => ReadonlySet<string>; open: (path: string) => void }) {
  return EditorView.domEventHandlers({
    mousedown(e, view) {
      if (e.button !== 0 || !(IS_MAC ? e.metaKey : e.ctrlKey) || e.altKey || e.shiftKey || docKind(path()) !== 'typst') return false;
      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
      const target = pos == null ? null : typstPathAt(view.state.doc.toString(), pos, path(), files());
      if (!target) return false;
      e.preventDefault();
      open(target);
      return true;
    }
  });
}

const latexLanguage = (): Extension => [latex(), syntaxHighlighting(latexHighlight), foldService.of(latexFoldService), mathsWrap];

const mathsTag = Tag.define();
const isSpace = (code: number) => code === 32 || code === 9 || code === 10 || code === -1;

/**
 * pandoc's YAML front matter, a --- block on the first line, which CommonMark would read as a rule and a setext
 * heading. ponytail: an unclosed one runs to the end, as there's no looking past the next line
 */
const frontMatter: MarkdownConfig = {
  defineNodes: [{ name: 'FrontMatter', block: true, style: tags.meta }],
  parseBlock: [
    {
      name: 'FrontMatter',
      before: 'HorizontalRule',
      parse(cx, line) {
        if (cx.lineStart !== 0 || !/^---[ \t]*$/.test(line.text)) return false;
        let end = line.text.length;
        while (cx.nextLine()) {
          end = cx.lineStart + line.text.length;
          if (/^(?:---|\.\.\.)[ \t]*$/.test(line.text)) {
            cx.nextLine();
            break;
          }
        }
        cx.addElement(cx.elt('FrontMatter', 0, end));
        return true;
      }
    }
  ]
};

/** pandoc's $…$ (no space inside either $, no digit after the closing one, no other $ between) and $$…$$, as one span of maths. */
const maths: MarkdownConfig = {
  defineNodes: [{ name: 'Maths', style: mathsTag }],
  parseInline: [
    {
      name: 'Maths',
      before: 'Emphasis',
      parse(cx, next, pos) {
        if (next !== 36) return -1;
        const display = cx.char(pos + 1) === 36;
        const open = display ? 2 : 1;
        if (!display && isSpace(cx.char(pos + 1))) return -1;
        for (let i = pos + open; i < cx.end; i += 1) {
          const c = cx.char(i);
          if (c === 92) i += 1;
          else if (display && c === 36 && cx.char(i + 1) === 36) return cx.addElement(cx.elt('Maths', pos, i + 2));
          else if (!display && c === 36) {
            // pandoc gives up at the first $ that can't close: $5 and $6 is no maths
            if (isSpace(cx.char(i - 1)) || (cx.char(i + 1) >= 48 && cx.char(i + 1) <= 57)) return -1;
            return cx.addElement(cx.elt('Maths', pos, i + 1));
          }
        }
        return -1;
      }
    }
  ]
};

const latexCode = latex();

// Markdown in the editor theme's colours: headings as environments, marks as brackets, maths as LaTeX's maths
const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: 'bold', color: 'var(--syntax-env)' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: [tags.link, tags.url, tags.monospace, tags.labelName], color: 'var(--syntax-arg)' },
  { tag: [tags.processingInstruction, tags.contentSeparator, tags.atom], color: 'var(--syntax-bracket)' },
  { tag: [tags.meta, tags.comment, tags.quote], color: 'var(--syntax-comment)' },
  { tag: mathsTag, color: 'var(--syntax-math)' }
]);

/**
 * pandoc's Markdown: GitHub's tables, task lists and strikethrough, front matter, maths and ```latex blocks as LaTeX,
 * coloured by the editor theme (with latexHighlight for the LaTeX inside).
 */
const markdownSupport = (): Extension => [
  markdown({ base: markdownLanguage, extensions: [frontMatter, maths], codeLanguages: (info) => (/^(?:la)?tex$/i.test(info) ? latexCode : null) }),
  syntaxHighlighting(markdownHighlight),
  syntaxHighlighting(latexHighlight)
];

/** A file's editor language: LaTeX as it was, Typst once loaded, Markdown, and plain text for anything else. */
export function languageFor(path: string): Extension {
  const kind = docKind(path);
  if (kind === 'latex') return [latexLanguage(), compileLint];
  if (kind === 'typst') return typst ?? compileLint;
  if (kind === 'markdown') return markdownSupport();
  return [];
}
