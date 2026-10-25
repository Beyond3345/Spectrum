// Self-check for TexLab's editor side: the transport's framing and order, F2's edit planning, the syntax check's
// errors and the outline from TexLab's symbols. Bundle it first:
// `npx esbuild apps/frontend/src/editor/lsp/lsp.check.ts --bundle --platform=node --log-level=warning | node`
import { documentOutline } from '../latexEditor.ts';
import { outlineDelay, symbolHeadings } from './outline.ts';
import { applyEdits, newName, renameEdits } from './rename.ts';
import { syntaxErrors } from './syntax.ts';
import { EditorState } from '@codemirror/state';
import { diagnosticCount, setDiagnostics } from '@codemirror/lint';
import type { LSPClient } from '@codemirror/lsp-client';
import { ProjectWorkspace, Texlab, clearMarks, texlabSlot } from './texlab.ts';
import { lspTransport } from './transport.ts';
import { IS_MAC, IS_WINDOWS } from '../../app/platform.ts';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const throws = (run: () => unknown, pattern: RegExp, what: string) => {
  try {
    run();
  } catch (err) {
    if (pattern.test(String(err))) return;
    throw new Error(`${what}: threw ${err}`);
  }
  throw new Error(`${what}: didn't throw`);
};
const tick = () => new Promise((resolve) => setTimeout(resolve));

// ─── transport ───

async function transport() {
  const posts: string[] = [];
  const landing: (() => void)[] = [];
  const line = lspTransport((body) => {
    posts.push(body);
    return new Promise<void>((resolve) => landing.push(resolve));
  });
  const msg = (n: number) => JSON.stringify({ jsonrpc: '2.0', method: 'm', params: { n } });

  // sent in one go: one POST, a JSON list in order
  line.transport.send(msg(1));
  line.transport.send(msg(2));
  await tick();
  eq(posts.map((b) => JSON.parse(b).map((m: { params: { n: number } }) => m.params.n)), [[1, 2]], 'one POST for a batch');

  // the next waits until that one has landed, however many come meanwhile
  line.transport.send(msg(3));
  await tick();
  line.transport.send(msg(4));
  await tick();
  eq(posts.length, 1, 'nothing more in flight before the first lands');
  let settled = false;
  line.settled().then(() => (settled = true));
  landing.shift()!();
  await tick();
  eq(posts.length, 2, 'the second after the first');
  eq(JSON.parse(posts[1]).map((m: { params: { n: number } }) => m.params.n), [3], 'in the order sent');
  landing.shift()!();
  await tick();
  eq(settled, false, 'settled waits for the last one sent before it');
  landing.shift()!();
  await tick();
  eq(settled, true, 'settled once all have landed');
  eq(posts.map((b) => JSON.parse(b)[0].params.n), [1, 3, 4], 'every message, once');

  // a send from a promise callback (as the client's notifications are) still counts for settled
  let late = false;
  Promise.resolve().then(() => line.transport.send(msg(5)));
  line.settled().then(() => (late = true));
  await tick();
  await tick();
  eq(posts.length, 4, 'the callback’s message went');
  eq(late, false, 'settled waits for it');
  landing.shift()!();
  await tick();
  eq(late, true, 'and is done once it lands');

  // TexLab's messages reach whoever listens, until the line closes; then sending fails at once
  const heard: string[] = [];
  const listener = (m: string) => heard.push(m);
  line.transport.subscribe(listener);
  line.receive('a');
  line.transport.unsubscribe(listener);
  line.receive('b');
  line.transport.subscribe(listener);
  line.close();
  line.receive('c');
  eq(heard, ['a'], 'subscribers hear TexLab until it closes');
  throws(() => line.transport.send(msg(6)), /isn’t connected/, 'a closed line refuses to send');

  // a refused POST doesn't stop the ones after it
  const sent: string[] = [];
  const flaky = lspTransport(async (body) => {
    sent.push(body);
    if (sent.length === 1) throw new Error('404');
  });
  flaky.transport.send(msg(1));
  await flaky.settled();
  flaky.transport.send(msg(2));
  await flaky.settled();
  eq(sent.length, 2, 'goes on after a refusal');
}

// ─── rename ───

function rename() {
  const root = 'file:///Users/me/My%20Paper';
  const pathOf = (uri: string) => (uri.startsWith(`${root}/`) ? decodeURIComponent(uri.slice(root.length + 1)) : null);
  const range = (line: number, from: number, to: number, endLine = line) => ({ start: { line, character: from }, end: { line: endLine, character: to } });

  const edits = renameEdits(
    {
      changes: { [`${root}/main.tex`]: [{ range: range(2, 23, 32), newText: 'sec:start' }], [`${root}/refs.bib`]: [] },
      documentChanges: [{ textDocument: { uri: `${root}/chapters/one%20two.tex`, version: 1 }, edits: [{ range: range(0, 5, 14), newText: 'sec:start' }] }]
    },
    pathOf
  );
  eq([...edits.keys()], ['main.tex', 'chapters/one two.tex'], 'files by project path, none for an empty list');
  throws(() => renameEdits({ changes: { 'file:///usr/share/texmf/x.sty': [{ range: range(0, 0, 1), newText: 'y' }] } }, pathOf), /outside the project/, 'a file outside');
  throws(() => renameEdits({ documentChanges: [{ kind: 'create', uri: `${root}/new.tex` }] }, pathOf), /make, move or delete/, 'a new file');
  eq(renameEdits(null, pathOf).size, 0, 'no answer, no edits');
  const twice = { range: range(0, 7, 12), newText: 'sec:b' };
  eq(
    renameEdits({ changes: { [`${root}/Chap.tex`]: [twice], [`${root}/chap.tex`]: [twice, { range: range(2, 0, 5), newText: 'sec:b' }] } }, (uri) => pathOf(uri)?.toLowerCase() ?? null).get('chap.tex')?.length,
    2,
    'one file under two spellings: the same edit once'
  );

  const text = '\\section{Intro}\\label{sec:intro}\nSee \\ref{sec:intro} and \\ref{sec:intro}.\n';
  eq(
    applyEdits(
      text,
      [
        { range: range(1, 29, 38), newText: 'sec:start' },
        { range: range(0, 22, 31), newText: 'sec:start' },
        { range: range(1, 9, 18), newText: 'sec:start' }
      ],
      'sec:intro'
    ),
    '\\section{Intro}\\label{sec:start}\nSee \\ref{sec:start} and \\ref{sec:start}.\n',
    'edits in any order, several to a line'
  );
  // columns count UTF-16 code units, as JavaScript does: 😀 is two
  eq(applyEdits('😀 \\cite{knuth}', [{ range: range(0, 9, 14), newText: 'knuth84' }], 'knuth'), '😀 \\cite{knuth84}', 'past a character outside the BMP');
  eq(applyEdits('a\r\n\\ref{x}\r\n', [{ range: range(1, 5, 6), newText: 'y' }], 'x'), 'a\r\n\\ref{y}\r\n', 'Windows line endings');
  eq(applyEdits('ab\ncd', [{ range: range(0, 1, 1, 1), newText: 'X' }], 'b\nc'), 'aXd', 'across lines');
  throws(() => applyEdits('abcdef', [{ range: range(0, 0, 3), newText: 'x' }, { range: range(0, 2, 4), newText: 'y' }], 'abc'), /overlap/, 'overlapping edits');
  // TexLab's copy of a file behind the disk's (a reread still to come, or the file under another spelling of its name):
  // its ranges no longer hold the name, so nothing is written
  const disk = '% notes\n% more\n\\section{A}\\label{sec:intro}\n';
  throws(() => applyEdits(disk, [{ range: range(0, 18, 23), newText: 'sec:b' }], 'sec:intro'), /out of date/, 'a range past the end of its line');
  throws(() => applyEdits(disk, [{ range: range(9, 0, 4), newText: 'sec:b' }], 'sec:intro'), /out of date/, 'a line past the end of the text');
  throws(() => applyEdits(disk, [{ range: range(2, 9, 18), newText: 'sec:b' }], 'sec:intro'), /out of date/, 'a range over other text');
  eq(applyEdits(disk, [{ range: range(2, 18, 27), newText: 'sec:b' }], 'sec:intro'), '% notes\n% more\n\\section{A}\\label{sec:b}\n', 'the file as TexLab has it');

  // the new name
  eq(newName('  fig:b  ', false), 'fig:b', 'trimmed');
  eq(newName('\\bar', true), 'bar', 'a command’s backslash left out');
  eq(newName('', false), '', 'nothing typed');
  throws(() => newName('eq:power} law', false), /can’t hold/, 'a brace or a space');
  throws(() => newName('smith,jones', false), /can’t hold/, 'a comma');
  throws(() => newName('a%b', false), /can’t hold/, 'a percent sign');
  throws(() => newName('my2cmd', true), /only letters/, 'a command with a digit');
}

// ─── outline ───

async function outline() {
  const tree = new Map([
    ['main.tex', '\\part{One}\n\\section{Intro}\\label{sec:intro}\n\\input{chapters/one}\n% \\input{chapters/gone}\n\\section*{End}\n'],
    ['chapters/one.tex', '\\subsection{Methods}\n\\begin{figure}\\caption{A cat}\\label{fig:cat}\\end{figure}\n\\begin{equation}x\\end{equation}\n'],
    ['chapters/gone.tex', '\\section{Never}\n'],
    ['refs.bib', '@book{knuth, title={TeX}}\n']
  ]);
  const symbols = [
    { path: 'main.tex', line: 0, character: 0, name: 'One', kind: 2 },
    { path: 'main.tex', line: 1, character: 0, name: '1 Intro', kind: 2 },
    { path: 'main.tex', line: 4, character: 0, name: 'End', kind: 2 },
    { path: 'chapters/one.tex', line: 0, character: 0, name: '1.1 Methods', kind: 2 },
    { path: 'chapters/one.tex', line: 1, character: 0, name: 'Figure 1: A cat', kind: 6 },
    { path: 'chapters/one.tex', line: 2, character: 0, name: 'Equation', kind: 14 },
    { path: 'chapters/gone.tex', line: 0, character: 0, name: '2 Never', kind: 2 },
    { path: 'refs.bib', line: 0, character: 0, name: 'knuth', kind: 24 }
  ];
  const seen = new Set<string>();
  const items = await documentOutline('main.tex', new Set(tree.keys()), async (p) => tree.get(p) ?? '', symbolHeadings(symbols), seen);
  eq(
    items.map((i) => [i.file, i.line, i.level, i.title, i.pos, !!i.float]),
    [
      ['main.tex', 1, -1, 'One', 0, false],
      ['main.tex', 2, 1, '1 Intro', 11, false],
      ['chapters/one.tex', 1, 2, '1.1 Methods', 0, false],
      ['chapters/one.tex', 2, 3, 'Figure 1: A cat', 21, true],
      ['main.tex', 5, 1, 'End', 89, false]
    ],
    'sections and floats in reading order, across \\input, levels from the command'
  );
  eq([...seen].sort(), ['chapters/one.tex', 'main.tex'], 'the files read, never a commented-out one');
  // the compile's numbers reach TexLab 2.6 s after it ends, even when the new PDF reloads the tree 0.7 s after it
  const now = 100_000;
  eq([outlineDelay(false, 0, now), outlineDelay(true, 0, now), outlineDelay(false, now, now), outlineDelay(false, now - 700, now)], [600, 1500, 2600, 1900], 'the waits');
}

// ─── paths ───

function paths() {
  const files = new Set(['main.tex', 'chapters/intro.tex']);
  const texlab = Object.assign(Object.create(Texlab.prototype), { rootUri: 'file:///Users/me/Paper', host: { files: () => files } }) as Texlab;
  const pathOf = (uri: string) => texlab.pathOf(uri);
  eq(pathOf('file:///Users/me/Paper/chapters/intro.tex'), 'chapters/intro.tex', 'a project file');
  eq(pathOf('file:///Users/me/Paper/new.tex'), 'new.tex', 'one the editor doesn’t list yet');
  eq(pathOf('file:///Users/me/Elsewhere/x.tex'), null, 'outside');
  // a Mac's or Windows disk ignores case, and TexLab keeps \input{Chapters/Intro} as a file of its own
  const alias = 'file:///Users/me/Paper/Chapters/Intro.tex';
  eq(pathOf(alias), IS_MAC || IS_WINDOWS ? 'chapters/intro.tex' : 'Chapters/Intro.tex', 'another spelling of a project file');
  // which F2 refuses, as that copy is TexLab's first read of the file
  eq(texlab.spelling(alias), 'Chapters/Intro.tex', 'its spelling is its own');
  eq(texlab.spelling('file:///Users/me/Paper/chapters/intro.tex'), 'chapters/intro.tex', 'and the file’s is the file’s');

  // the open file's squiggles come from TexLab's copy under its own name only
  const workspace = new ProjectWorkspace({} as LSPClient, texlab);
  const open = { uri: texlab.uriOf('chapters/intro.tex') } as (typeof workspace.files)[number];
  workspace.files = [open];
  eq(workspace.getFile('file:///Users/me/Paper/chapters/intro.tex') === open, true, 'the open file');
  eq(workspace.getFile(alias), null, 'not the stale copy under another spelling');
}

// ─── squiggles once TexLab stops ───

function marks() {
  // the client's squiggles go to @codemirror/lint, which adds its state outside the slot
  let state = EditorState.create({ doc: 'Text {', extensions: [texlabSlot.of([])] });
  eq(clearMarks(state), null, 'nothing to clear');
  state = state.update(setDiagnostics(state, [{ from: 5, to: 6, severity: 'error', message: 'Expecting a curly bracket' }])).state;
  state = state.update({ effects: texlabSlot.reconfigure([]) }).state;
  eq(diagnosticCount(state), 1, 'kept when the slot empties');
  state = state.update(clearMarks(state)!).state;
  eq(diagnosticCount(state), 0, 'cleared');
}

// ─── the syntax check before compiling ───

function syntax() {
  const mark = (line: number, col: number, code: string, severity: 'error' | 'warning' = 'error') => ({ line, col, endLine: line, endCol: col + 1, severity, message: code, code, source: 'texlab' as const });
  const texts = new Map([
    // what TexLab 5.26 marks in these: a lone } in verbatim, lstlisting and minted, and the end of a file whose
    // inline code it doesn't know holds a brace
    ['a.tex', '\\begin{verbatim}\n}\n\\end{verbatim}\n'],
    ['b.tex', '\\begin{lstlisting}\nint f() {\n}\n}\n\\end{lstlisting}\n'],
    ['c.tex', '\\begin{minted}{c}\n}\n\\end{minted}\n'],
    ['d.tex', 'A \\verb+{+ b\n'],
    ['e.tex', '\\lstinline|{| and \\verb*|{|\n'],
    // and real ones
    ['f.tex', 'Text {unbalanced\n'],
    ['g.tex', 'Text }\n\\begin{itemize}\n\\end{enumerate}\n'],
    ['h.tex', '\\verb|x| {open\n']
  ]);
  const found = {
    'a.tex': [mark(2, 1, 'unexpected-brace')],
    'b.tex': [mark(4, 1, 'unexpected-brace')],
    'c.tex': [mark(2, 1, 'unexpected-brace')],
    'd.tex': [mark(2, 1, 'missing-brace')],
    'e.tex': [mark(2, 1, 'missing-brace')],
    'f.tex': [mark(2, 1, 'missing-brace'), mark(1, 1, 'undefined-label'), mark(1, 1, 'missing-brace', 'warning')],
    'g.tex': [mark(1, 6, 'unexpected-brace'), mark(2, 1, 'mismatched-environment')],
    'h.tex': [mark(2, 1, 'missing-brace')],
    'other.tex': [mark(1, 1, 'missing-brace')]
  };
  eq(
    syntaxErrors([...texts.keys()], found, texts).map((e) => `${e.file} ${e.line}:${e.col} ${e.code}`),
    ['f.tex 2:1 missing-brace', 'g.tex 1:6 unexpected-brace', 'g.tex 2:1 mismatched-environment', 'h.tex 2:1 missing-brace'],
    'brace and environment errors in the document’s files, not those code makes'
  );
}

// a failure rejects, which ends Node with an error
transport()
  .then(rename)
  .then(paths)
  .then(marks)
  .then(syntax)
  .then(outline)
  .then(() => console.log('lsp.check: ok'));
