import { StateEffect, StateField } from '@codemirror/state';
import type { Extension, Text } from '@codemirror/state';
import type { CompletionContext, CompletionResult, CompletionSource } from '@codemirror/autocomplete';
import { linter } from '@codemirror/lint';
import type { Diagnostic } from '@codemirror/lint';
import { keymap } from '@codemirror/view';
import type { EditorView } from '@codemirror/view';
import { LSPPlugin, formatDocument, hoverTooltips, serverCompletionSource, serverDiagnostics, signatureHelp } from '@codemirror/lsp-client';
import type { LSPClient } from '@codemirror/lsp-client';
import type * as lsp from 'vscode-languageserver-protocol';
import { Texlab } from './texlab';
import type { TexlabHost } from './texlab';

// The editor's side of the project's Tinymist (the backend's tinymist route), on TexLab's kind of line: completion,
// hovers, signature help, Go to definition, Find references, F2's rename, Format document (⇧⌥F) and errors as you type
// in .typ files, and the word count of the document it compiles. The errors only when the project's Typst is the one
// inside Tinymist, which would judge another version's code by its own rules: Typst's syntax check and the last
// compile's marks show then, as they do without Tinymist.

/** Tinymist's count of the words in the document it compiled (main: its project path) */
export type TypstWords = { main: string; words: number; chars: number; cjkChars: number };

const SOURCE = 'Tinymist';
const SEVERITY = { 1: 'error', 2: 'warning', 3: 'info', 4: 'hint' } as const;

const setMarks = StateEffect.define<Diagnostic[]>();
// Tinymist's latest marks for the open file, moved along as the text is edited until its next ones come
const marksField = StateField.define<Diagnostic[]>({
  create: () => [],
  update(marks, tr) {
    for (const effect of tr.effects) if (effect.is(setMarks)) return effect.value;
    return tr.docChanged && marks.length ? marks.map((d) => ({ ...d, from: tr.changes.mapPos(d.from), to: tr.changes.mapPos(d.to) })) : marks;
  }
});

/** An LSP position in doc, or null past its end (marks for text that has changed since). */
function offset(doc: Text, { line, character }: lsp.Position) {
  if (line < 0 || line >= doc.lines) return null;
  const at = doc.line(line + 1);
  return Math.min(at.to, at.from + character);
}

/** Tinymist's marks as the open file's lint marks, mapped on to its text as it is now. */
export function lspMarks(diagnostics: lsp.Diagnostic[], synced: Text, mapPos: (pos: number) => number): Diagnostic[] {
  return diagnostics.flatMap((d) => {
    const from = offset(synced, d.range.start);
    const to = offset(synced, d.range.end);
    if (from == null || to == null) return [];
    return [{ from: mapPos(from), to: mapPos(Math.max(from, to)), severity: SEVERITY[d.severity ?? 1] ?? 'error', message: d.message, source: SOURCE }];
  });
}

/**
 * The marks to show where Tinymist checks the file: its own only, as it compiles what the syntax check and the last
 * compile looked at, live and with exact ranges. Elsewhere its own never show.
 */
export const markFilter = (checks: boolean) => (diagnostics: readonly Diagnostic[]) => diagnostics.filter((d) => (d.source === SOURCE) === checks);

// tags a hover from a package's docs may hold; any other element gives way to its text, and scripts and the like go
const KEEP = new Set(['P', 'BR', 'PRE', 'CODE', 'SPAN', 'EM', 'STRONG', 'B', 'I', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR', 'BLOCKQUOTE', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD']);
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'IMG', 'SVG', 'MATH', 'FORM', 'INPUT', 'BUTTON', 'TEMPLATE', 'LINK', 'META']);

/**
 * Tinymist's hovers are Markdown, rendered to HTML with the editor's own highlighting: the formatting stays, with only
 * a span's highlighting class, and links become their text (a click would take the app's window elsewhere).
 */
export function safeHTML(html: string) {
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  for (const el of [...body.querySelectorAll('*')].reverse()) {
    if (DROP.has(el.tagName)) el.remove();
    else if (!KEEP.has(el.tagName)) el.replaceWith(...el.childNodes);
    else for (const { name } of [...el.attributes]) if (!(name === 'class' && el.tagName === 'SPAN')) el.removeAttribute(name);
  }
  return body.innerHTML;
}

/**
 * One project's line to its Tinymist. checks() says whether the project's Typst is the one inside Tinymist, so its
 * errors count and its preview's jumps land where Spectrum's PDF has the text.
 */
export class Tinymist extends Texlab {
  /** the latest word count, for Document insights */
  words: TypstWords | null = null;
  private lint: Extension;

  constructor(projectId: string, host: TexlabHost, onAvailable: (available: boolean) => void, readonly checks: () => boolean) {
    // the handlers run once the line is up, long after this is set
    let self: Tinymist;
    super(projectId, host, onAvailable, {
      name: 'Tinymist',
      route: 'tinymist',
      languageOf: (path) => (/\.typ$/i.test(path) ? 'typst' : null),
      config: {
        sanitizeHTML: safeHTML,
        // serverDiagnostics for its sending of edits half a second after typing; its marks go through marks() instead
        extensions: [serverDiagnostics(), hoverTooltips(), signatureHelp(), keymap.of([{ key: 'Shift-Alt-f', run: formatDocument, preventDefault: true }])],
        // the client's own handlers, which come before its extensions'
        notificationHandlers: {
          'textDocument/publishDiagnostics': (client, params: lsp.PublishDiagnosticsParams) => self.marks(client, params),
          'tinymist/compileStatus': (_client, params: { status: string; path: string; wordsCount: Omit<TypstWords, 'main'> | null }) => {
            if (params.status === 'compileSuccess' && params.wordsCount) self.words = { main: params.path.replace(/\\/g, '/').replace(/^\//, ''), ...params.wordsCount };
            return true;
          }
        }
      }
    });
    self = this;
    // a lint source beside Typst's syntax check and the compile's marks, which @codemirror/lint shows together
    this.lint = [
      marksField,
      linter((view) => (this.checks() ? view.state.field(marksField) : []), {
        needsRefresh: (update) => update.transactions.some((tr) => tr.effects.some((e) => e.is(setMarks))),
        markerFilter: (diagnostics) => markFilter(this.checks())(diagnostics),
        tooltipFilter: (diagnostics) => markFilter(this.checks())(diagnostics)
      })
    ];
  }

  private marks(client: LSPClient, params: lsp.PublishDiagnosticsParams) {
    const file = client.workspace.getFile(params.uri);
    const view = file?.getView();
    const plugin = view && LSPPlugin.get(view);
    if (!file || !view || !plugin || (params.version != null && params.version !== file.version)) return true;
    view.dispatch({ effects: setMarks.of(lspMarks(params.diagnostics, plugin.syncedDoc, (pos) => plugin.unsyncedChanges.mapPos(pos))) });
    return true;
  }

  extensionFor(path: string): Extension {
    const extension = super.extensionFor(path);
    return Array.isArray(extension) && !extension.length ? extension : [extension, this.lint];
  }

  /** Whether the preview's exact jumps work for the project. */
  exact() {
    return this.available && this.checks();
  }

  /** Format document: typstyle's layout for the open .typ file. */
  format(view: EditorView) {
    return formatDocument(view);
  }
}

/** In a .typ file, Tinymist's completions while it runs there, else Spectrum's own (own). */
export function tinymistCompletions(server: () => Tinymist | null, own: CompletionSource): CompletionSource {
  return (context: CompletionContext): Promise<CompletionResult | null> | CompletionResult | null => {
    const plugin = context.view && LSPPlugin.get(context.view);
    return server()?.available && plugin && /\.typ$/i.test(plugin.uri) ? serverCompletionSource(context) : own(context);
  };
}
