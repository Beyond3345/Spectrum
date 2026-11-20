import { snippet } from '@codemirror/autocomplete';
import type { Command, EditorView } from '@codemirror/view';

// The user's own snippets (Settings › Snippets): a name, a trigger typed then Tab, the kinds of file they work in and a
// body with tab stops. They go with the other settings to the user's other computers.

export type SnippetKind = 'latex' | 'typst' | 'markdown';
export type UserSnippet = { id: string; name: string; trigger: string; kinds: SnippetKind[]; body: string };

export const SNIPPET_KINDS: [SnippetKind, string][] = [
  ['latex', 'LaTeX'],
  ['typst', 'Typst'],
  ['markdown', 'Markdown']
];
export const SNIPPET_NAME_MAX = 80;
export const SNIPPET_BODY_MAX = 10_000;
const SNIPPETS_MAX = 300;
/** a trigger: letters, digits and _, typed at the start of a word */
export const TRIGGER = /^[A-Za-z0-9_]{1,32}$/;

/** The starters, seeded once: a list emptied by the user stays empty. */
export const DEFAULT_SNIPPETS: UserSnippet[] = [
  {
    id: 'starter-theorem',
    name: 'Theorem and proof',
    trigger: 'thm',
    kinds: ['latex'],
    body: '\\begin{theorem}\n    ${1:Statement}\n\\end{theorem}\n\\begin{proof}\n    ${0}\n\\end{proof}'
  },
  {
    id: 'starter-cases',
    name: 'Cases',
    trigger: 'cases',
    kinds: ['latex', 'markdown'],
    body: '\\begin{cases}\n    ${1:a} & \\text{if } ${2:x > 0} \\\\\n    ${3:b} & \\text{otherwise}\n\\end{cases}${0}'
  },
  {
    id: 'starter-subfigures',
    name: 'Two figures side by side',
    trigger: 'twofig',
    kinds: ['latex'],
    body: [
      '\\begin{figure}[htbp]',
      '    \\centering',
      '    \\begin{subfigure}{0.48\\linewidth}',
      '        \\includegraphics[width=\\linewidth]{${1:figures/left}}',
      '        \\caption{${2:Left}}',
      '    \\end{subfigure}\\hfill',
      '    \\begin{subfigure}{0.48\\linewidth}',
      '        \\includegraphics[width=\\linewidth]{${3:figures/right}}',
      '        \\caption{${4:Right}}',
      '    \\end{subfigure}',
      '    \\caption{${5:Caption}}',
      '    \\label{fig:${6:name}}',
      '\\end{figure}'
    ].join('\n')
  },
  {
    id: 'starter-typst-figure',
    name: 'Figure',
    trigger: 'fig',
    kinds: ['typst'],
    body: '#figure(\n    image("${1:figures/name.png}", width: ${2:80%}),\n    caption: [${3:Caption}],\n) <fig:${4:name}>'
  },
  {
    id: 'starter-markdown-figure',
    name: 'Figure',
    trigger: 'fig',
    kinds: ['markdown'],
    body: '![${1:Caption}](${2:figures/name.png}){#fig:${3:name}}'
  }
];

/**
 * Snippets as stored, checked: each needs an id of its own, a name, at least one kind Spectrum knows and a body; a
 * trigger that isn't a word is dropped (the snippet stays, for the Insert menu). Anything but a list is the starters.
 */
export function cleanSnippets(value: unknown): UserSnippet[] {
  if (!Array.isArray(value)) return DEFAULT_SNIPPETS;
  const ids = new Set<string>();
  return value.slice(0, SNIPPETS_MAX).flatMap((item) => {
    const { id, name, trigger, kinds, body } = (typeof item === 'object' && item ? item : {}) as Record<string, unknown>;
    if (typeof id !== 'string' || !id || ids.has(id) || typeof name !== 'string' || !name.trim() || typeof body !== 'string' || !body) return [];
    const known = Array.isArray(kinds) ? SNIPPET_KINDS.map(([kind]) => kind).filter((kind) => kinds.includes(kind)) : [];
    if (!known.length) return [];
    ids.add(id);
    return [{ id, name: name.slice(0, SNIPPET_NAME_MAX), trigger: typeof trigger === 'string' && TRIGGER.test(trigger) ? trigger : '', kinds: known, body: body.slice(0, SNIPPET_BODY_MAX) }];
  });
}

/**
 * A body in the VS Code form (${1:placeholder}, ${1}, ${0} for where the cursor ends) as CodeMirror's snippet template,
 * or why it can't be one. Only the braced forms are tab stops, so a $1 in maths stays text. The same number twice is
 * one field, filled with the first one's placeholder in both places. Every other brace is the text's own, so LaTeX's
 * \{ and ${}^{14}C come out as written.
 */
export function snippetTemplate(body: string): { template: string } | { error: string } {
  const placeholders = new Map<string, string>();
  let template = '';
  for (let i = 0; i < body.length; ) {
    const rest = body.slice(i);
    const field = /^\$\{(\d+)(?::([^{}]*))?\}/.exec(rest);
    if (field) {
      const [whole, n, text = ''] = field;
      if (!placeholders.has(n)) placeholders.set(n, text);
      const shown = placeholders.get(n)!;
      template += shown ? `\${${n}:${shown}}` : `\${${n}}`;
      i += whole.length;
      continue;
    }
    if (/^\$\{\d+:/.test(rest)) return { error: `A placeholder can’t hold { or }: ${rest.slice(0, 30)}…` };
    // CodeMirror reads \{ and \} as the braces themselves
    template += rest[0] === '{' || rest[0] === '}' ? `\\${rest[0]}` : rest[0];
    i += 1;
  }
  return { template };
}

/** The snippet in place of from–to, with its first tab stop selected (Tab goes on to the next). */
export function insertSnippet(view: EditorView, item: UserSnippet, from = view.state.selection.main.from, to = view.state.selection.main.to) {
  const parsed = snippetTemplate(item.body);
  if ('error' in parsed) return false;
  snippet(parsed.template)(view, null, from, to);
  return true;
}

/** A snippet of this kind of file whose trigger ends the text before the cursor, as a word of its own (not \thm). */
export function triggerBefore(before: string, kind: SnippetKind, snippets: UserSnippet[]) {
  const word = /(?:^|[^A-Za-z0-9_\\])([A-Za-z0-9_]{1,32})$/.exec(before)?.[1];
  return word ? snippets.find((s) => s.trigger === word && s.kinds.includes(kind) && !('error' in snippetTemplate(s.body))) ?? null : null;
}

/** Tab after a trigger: the snippet in its place. */
export function expandTrigger(snippets: () => UserSnippet[], kind: () => SnippetKind | null): Command {
  return (view) => {
    const { state } = view;
    const sel = state.selection.main;
    const k = kind();
    if (!k || state.readOnly || state.selection.ranges.length > 1 || !sel.empty) return false;
    const line = state.doc.lineAt(sel.head);
    const found = triggerBefore(line.text.slice(0, sel.head - line.from), k, snippets());
    return !!found && insertSnippet(view, found, sel.head - found.trigger.length, sel.head);
  };
}
