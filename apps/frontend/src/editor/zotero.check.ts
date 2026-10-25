// Self-check for \cite completion from Zotero and the keys of a pick: the source asks only in a citation's braces, three
// letters on; lists the library in a section of its own, without the keys the project has; a pick puts the key in, and
// the key the .bib gave instead when it gave another; the picker's citation keeps its options when its keys change. Run:
// npx esbuild apps/frontend/src/editor/zotero.check.ts --bundle --platform=node --log-level=warning | node
import { CompletionContext } from '@codemirror/autocomplete';
import type { Completion, CompletionResult } from '@codemirror/autocomplete';
import { EditorSelection, EditorState, Transaction } from '@codemirror/state';
import type { TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { citeKeys, renameCiteKeys } from '../../../backend/src/latex/text.js';
import type { ZoteroHit } from '../api/client';
import { latexCompletionSource } from './latexEditor';
import { NO_PROJECT } from './latexEnvs';
import { hitDetail, zoteroCompletionSource } from './zotero';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

const hit = (key: string, title: string, authors: string[] = [], year?: string): ZoteroHit => ({ itemKey: `ITEM${key.length}`, key, title, authors, year });
const LIBRARY = [hit('vaswani2017', 'Attention Is All You Need', ['Ashish Vaswani'], '2017'), hit('Smith2021', 'Attention in brains', ['Ann Smith'], '2021'), hit('LeCun2015', 'Deep learning', [], '2015')];

let asked: string[] = [];
let picked: string[] = [];
let gives: string | null = null;
let on = true;
const source = zoteroCompletionSource({
  enabled: () => on,
  search: async (q) => {
    asked.push(q);
    return LIBRARY;
  },
  own: () => new Set(['lecun2015']),
  pick: async (h) => {
    picked.push(h.key);
    return gives;
  },
  quietMs: 0
});

/** An editor on the text with the cursor at "|". */
function editor(text: string) {
  let state = EditorState.create({ doc: text.replace('|', ''), selection: EditorSelection.cursor(text.indexOf('|')) });
  const view = {
    get state() {
      return state;
    },
    dispatch: (...specs: (TransactionSpec | Transaction)[]) => (state = specs[0] instanceof Transaction ? specs[0].state : state.update(...(specs as TransactionSpec[])).state)
  } as unknown as EditorView;
  return {
    view,
    complete: () => source(new CompletionContext(state, state.selection.main.head, false)) as Promise<CompletionResult | null>,
    marked: () => state.doc.toString().slice(0, state.selection.main.head) + '|' + state.doc.toString().slice(state.selection.main.head)
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

(async () => {
  // where it asks
  eq(await editor('\\cite{va|').complete(), null, 'two letters are too few');
  eq(await editor('\\ref{vas|').complete(), null, 'only a citation’s braces');
  eq(await editor('\\textcite[see][]{a, vas|').complete() !== null, true, 'the item after a comma, past options');
  eq(asked[asked.length - 1], 'vas', 'what’s typed of the item is searched for');
  on = false;
  eq(await editor('\\cite{vas|').complete(), null, 'off in Settings');
  on = true;

  // what it lists
  const result = (await editor('\\parencite{atte|').complete())!;
  eq(result.from, '\\parencite{'.length, 'it replaces what’s typed of the key');
  eq(result.options.map((o) => o.displayLabel), ['vaswani2017', 'Smith2021'], 'the project’s own key is left to the project’s list');
  eq(result.options.map((o) => o.detail), ['Vaswani 2017', 'Smith 2021'], 'surname and year');
  eq(result.options.every((o) => typeof o.section === 'object' && o.section.rank === 1 && o.section.name === 'Zotero'), true, 'a section of its own');
  eq(result.options[0].label.includes('Attention Is All You Need'), true, 'matched against the title too, as Zotero searched it');
  eq(hitDetail(hit('k', 'A title that runs on for rather more than forty characters')), 'A title that runs on for rather more th…', 'no author or year: the title');
  // the project's list has no section, so CodeMirror ranks it first
  const project = latexCompletionSource(() => ({ ...NO_PROJECT, bib: [{ key: 'Attention2020', author: 'Bloggs', year: '2020', title: 'x' }] }))(
    new CompletionContext(EditorState.create({ doc: '\\cite{Atte' }), '\\cite{Atte'.length, false)
  ) as CompletionResult;
  eq(project.options.map((o: Completion) => [o.label, o.section]), [['Attention2020', undefined]], 'the project’s keys have no section');

  // picking one
  const pick = async (text: string, give: string | null) => {
    gives = give;
    const e = editor(text);
    const r = (await e.complete())!;
    const o = r.options.find((x) => x.displayLabel === 'vaswani2017')!;
    (o.apply as (view: EditorView, completion: Completion, from: number, to: number) => void)(e.view, o, r.from, e.view.state.selection.main.head);
    const now = e.marked();
    await settle();
    return [now, e.marked()];
  };
  picked = [];
  eq(await pick('\\cite{atte|} and', 'vaswani2017'), ['\\cite{vaswani2017|} and', '\\cite{vaswani2017|} and'], 'its key goes in');
  eq(picked, ['vaswani2017'], 'and its entry into the .bib');
  eq(await pick('\\cite{a,atte|}', 'vaswani2017a'), ['\\cite{a,vaswani2017|}', '\\cite{a,vaswani2017a|}'], 'the key the .bib gave instead');
  eq(await pick('\\cite{atte|}', null), ['\\cite{vaswani2017|}', '\\cite{vaswani2017|}'], 'an add that failed leaves the key');

  // the picker's citation, with its keys changed to the .bib's
  eq(citeKeys('\\parencite[p.~4]{vaswani2017, devlin2019}'), ['vaswani2017', 'devlin2019'], 'the keys of a citation');
  eq(renameCiteKeys('\\parencite[p.~{4}]{vaswani2017, devlin2019}', { devlin2019: 'devlin2019a' }), '\\parencite[p.~{4}]{vaswani2017, devlin2019a}', 'renamed in place');
  eq(renameCiteKeys('\\citep[see][]{x}', { see: 'no' }), '\\citep[see][]{x}', 'options are never keys');

  console.log('zotero.check: ok');
})();
