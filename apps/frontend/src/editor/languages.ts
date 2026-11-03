import { Compartment } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { foldService, syntaxHighlighting } from '@codemirror/language';
import { markdown } from '@codemirror/lang-markdown';
import { latex } from '../latex/lang';
import { compileLint } from './compileMarks';
import { latexFoldService, latexHighlight, mathsWrap } from './latexEditor';
import { docKind } from './shared';

// The editor's language for a file, swapped as files open: LaTeX has its own mode, highlighting and folding, Typst
// loads its Lezer mode (no WebAssembly) the first time one opens, and Markdown uses CodeMirror's own.

export const languageCompartment = new Compartment();

let typst: Extension | null = null;
let loading: Promise<Extension | null> | null = null;

/** The Typst language, loaded once; null while loading or when the package fails. */
export function loadTypst(): Promise<Extension | null> {
  loading ??= import('codemirror-lang-typst/lezer')
    .then(({ typst_lezer }) => (typst = [typst_lezer(), compileLint]))
    .catch(() => null);
  return loading;
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

/**
 * After @ in Typst (keys and labels) and [@ or ; @ in Markdown (keys): the project's bibliography and labels. Typst's
 * labels only where its own completions, which list them, don't run (version: the project's Typst version).
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
    if (kind === 'markdown') {
      const upTo = context.state.sliceDoc(0, match.from);
      const inside = upTo.lastIndexOf('[') > upTo.lastIndexOf(']');
      const afterSemicolon = match.from >= 2 && context.state.sliceDoc(match.from - 2, match.from) === '; ';
      if (!inside || !(before === '[' || afterSemicolon)) return null;
    }
    const seen = new Set<string>();
    const options: { label: string; type: string; detail?: string }[] = [];
    for (const key of keys()) {
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({ label: key, type: 'keyword' });
    }
    if (kind === 'typst' && !ownCompletions(version())) {
      for (const label of labels()) {
        const name = label.replace(/^<|>$/g, '');
        if (!name || seen.has(name)) continue;
        seen.add(name);
        options.push({ label: name, type: 'label', detail: 'label' });
      }
    }
    return options.length ? { from: match.from + 1, options, validFor: /^[\w:.+-]*$/ } : null;
  };
}

const latexLanguage = (): Extension => [latex(), syntaxHighlighting(latexHighlight), foldService.of(latexFoldService), mathsWrap];

/** A file's editor language: LaTeX as it was, Typst once loaded, Markdown, and plain text for anything else. */
export function languageFor(path: string): Extension {
  const kind = docKind(path);
  if (kind === 'latex') return latexLanguage();
  if (kind === 'typst') return typst ?? compileLint;
  if (kind === 'markdown') return markdown();
  return [];
}
