// \cite{…} completion from the Zotero library: a source of its own, asked once three letters of a key are typed and
// listed under the project's own keys. Picking an item puts its key in and its entry into the .bib, and when the .bib
// gives it another key (one it has for another work) the cite takes that one.
import { pickedCompletion } from '@codemirror/autocomplete';
import type { Completion, CompletionContext, CompletionResult, CompletionSource } from '@codemirror/autocomplete';
import type { ZoteroHit } from '../api/client';
import { ARG_WINDOW, CITE_COMMANDS, argContext } from './latexContext';

/** Fired to cite from Zotero at the cursor (the editor's right-click, the References card); the editor page answers it. */
export const ZOTERO_CITE = 'spectrum-zotero-cite';

// sectioned, so the list puts the library under the project's own keys, with a heading
const SECTION = { name: 'Zotero', rank: 1 };
// a moment after the last letter, so typing on doesn't ask Zotero on every one
const QUIET_MS = 250;

/** "Vaswani 2017", the first author's surname and the year, else the title cut short. */
export function hitDetail(hit: ZoteroHit) {
  const author = hit.authors[0]?.split(' ').pop();
  if (author || hit.year) return [author, hit.year].filter(Boolean).join(' ');
  return hit.title.length > 40 ? `${hit.title.slice(0, 39).trim()}…` : hit.title;
}

/**
 * enabled: Settings › Zotero's switch. search: the library, for what's typed. own: the project's keys in lower case,
 * whose items the project's list offers already. pick: adds the item's entry to the .bib and gives the key it is under
 * there, or null when it couldn't (and has said why).
 */
export function zoteroCompletionSource({
  enabled,
  search,
  own,
  pick,
  quietMs = QUIET_MS
}: {
  enabled: () => boolean;
  search: (q: string, signal: AbortSignal) => Promise<ZoteroHit[]>;
  own: () => Set<string>;
  pick: (hit: ZoteroHit) => Promise<string | null>;
  quietMs?: number;
}): CompletionSource {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    if (!enabled()) return null;
    const { state, pos } = context;
    const start = Math.max(0, pos - ARG_WINDOW);
    const arg = argContext(state.sliceDoc(start, pos), pos - start);
    if (!arg || !CITE_COMMANDS.test(arg.command) || arg.typed.length < 3) return null;
    await new Promise((resolve) => setTimeout(resolve, quietMs));
    if (context.aborted) return null;
    const controller = new AbortController();
    context.addEventListener('abort', () => controller.abort());
    const hits = await search(arg.typed, controller.signal).catch(() => [] as ZoteroHit[]);
    if (context.aborted) return null;
    const mine = own();
    const options = hits.filter((hit) => !mine.has(hit.key.toLowerCase())).map((hit) => option(hit, pick));
    // no validFor: each letter asks again, as Zotero searched for what was typed
    return options.length ? { from: start + arg.from, options } : null;
  };
}

function option(hit: ZoteroHit, pick: (hit: ZoteroHit) => Promise<string | null>): Completion {
  return {
    // the list matches what's typed against all of this, as Zotero's search did; the key is what shows and goes in
    label: [hit.key, hit.title, ...hit.authors, hit.year].filter(Boolean).join(' '),
    displayLabel: hit.key,
    detail: hitDetail(hit),
    info: hit.title || undefined,
    section: SECTION,
    apply: (view, completion, from, to) => {
      view.dispatch({ changes: { from, to, insert: hit.key }, selection: { anchor: from + hit.key.length }, annotations: pickedCompletion.of(completion), userEvent: 'input.complete' });
      pick(hit).then((key) => {
        // ponytail: only where the key still is, unmoved; an edit before it in the moment the add takes leaves it
        const end = from + hit.key.length;
        if (key && key !== hit.key && view.state.sliceDoc(from, end) === hit.key) {
          const after = view.state.selection.main.empty && view.state.selection.main.head === end;
          view.dispatch({ changes: { from, to: end, insert: key }, ...(after && { selection: { anchor: from + key.length } }), userEvent: 'input.complete' });
        }
      });
    }
  };
}
