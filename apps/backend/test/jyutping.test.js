// Jyutping (xjyutping) without TeX: the preamble the editor writes, auto mode's copy of a document, the checks on the
// project setting and options (which are written into TeX), the log's paths and the routes. Run: npm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-jyut-unit-')));
process.env.SPECTRUM_DATA_DIR = path.join(tmp, 'data');
process.env.SPECTRUM_PROJECTS_DIR = path.join(tmp, 'projects');
const J = await import('../src/latex/jyutping.js');
const { projectPaths, previewDocument, jyutpingInfo } = await import('../src/services/jyutpingService.js');
after(() => rmSync(tmp, { recursive: true, force: true }));

const DOC = [
  '\\documentclass{article}',
  '% \\usepackage{xeCJK}',
  '\\usepackage{amsmath}',
  '\\begin{document}',
  '銀行',
  '\\setCJKmainfont{Body Font}',
  '\\end{document}',
  ''
].join('\n');
const count = (text, pattern) => (text.match(pattern) || []).length;
const preamble = (text) => text.split('\\begin{document}')[0];

test('the preamble gets xeCJK, one font line and xjyutping, before \\begin{document}, once', () => {
  const { ok, text } = J.jyutpingPreamble(DOC, { options: { fancy: true }, cjkFont: 'bundled:noto-serif-tc', engine: 'auto' });
  assert.ok(ok);
  assert.equal(preamble(text), [
    '\\documentclass{article}',
    '% \\usepackage{xeCJK}',
    '\\usepackage{amsmath}',
    '\\usepackage{xeCJK}',
    '\\setCJKmainfont{NotoSerifTC-Regular.otf}[BoldFont=NotoSerifTC-Bold.otf]',
    '\\usepackage[fancy]{xjyutping}',
    ''
  ].join('\n'));
  // the body is as it was, its own \setCJKmainfont too
  assert.equal(text.split('\\begin{document}')[1], DOC.split('\\begin{document}')[1]);
  // twice is once
  assert.equal(J.jyutpingPreamble(text, { options: { fancy: true }, cjkFont: 'bundled:noto-serif-tc', engine: 'auto' }).text, text);
});

test('a new font or new options change their lines where they are', () => {
  const first = J.jyutpingPreamble(DOC, { options: { fancy: true }, cjkFont: 'bundled:noto-serif-tc' }).text;
  const next = J.jyutpingPreamble(first, { options: { lazy: 'all', script: 'simplified' }, cjkFont: 'Songti TC' }).text;
  const lines = next.split('\n');
  assert.equal(lines[4], '\\setCJKmainfont{Songti TC}');
  assert.equal(lines[5], '\\usepackage[lazy=all,script=simplified]{xjyutping}');
  assert.equal(lines.length, first.split('\n').length);
  assert.equal(count(preamble(next), /\\setCJKmainfont/g), 1);
  // all defaults: no brackets
  assert.match(J.jyutpingPreamble(next, { options: { fancy: false, ratio: '0.45' } }).text, /^\\usepackage\{xjyutping\}$/m);
});

test('LuaLaTeX swaps xeCJK for luatexja-fontspec and the font command with it, and back', () => {
  const xe = J.jyutpingPreamble(DOC, { cjkFont: 'bundled:noto-sans-sc', engine: 'xelatex' }).text;
  const lua = J.jyutpingPreamble(xe, { cjkFont: 'bundled:noto-sans-sc', engine: 'lualatex' }).text;
  assert.match(lua, /^\\usepackage\{luatexja-fontspec\}$/m);
  assert.match(lua, /^\\setmainjfont\{NotoSansSC-Regular\.otf\}\[BoldFont=NotoSansSC-Bold\.otf\]$/m);
  assert.doesNotMatch(preamble(lua), /^\\usepackage\{xeCJK\}|setCJKmainfont/m);
  assert.equal(lua.split('\n').length, xe.split('\n').length);
  assert.equal(J.jyutpingPreamble(lua, { cjkFont: 'bundled:noto-sans-sc', engine: 'xelatex' }).text, xe);
  // plain luatexja has no \setmainjfont: it becomes luatexja-fontspec
  const ja = J.jyutpingPreamble('\\documentclass{article}\n\\usepackage{luatexja}\n\\begin{document}\n\\end{document}', { engine: 'lualatex' }).text;
  assert.match(ja, /^\\usepackage\{luatexja-fontspec\}\n\\setmainjfont/m);
});

test('ctex stays whatever the engine, with \\setCJKmainfont, and duplicate font lines are collapsed', () => {
  const doc = ['\\documentclass[fontset=none]{ctexart}', '\\setCJKmainfont{A}', '\\setmainjfont{B}', '\\usepackage[ratio=0.5]{xjyutping}', '\\usepackage{xjyutping}', '\\begin{document}', '\\end{document}'].join('\n');
  for (const engine of ['xelatex', 'lualatex']) {
    const { text } = J.jyutpingPreamble(doc, { cjkFont: 'bundled:lxgw-wenkai-tc', engine });
    assert.equal(preamble(text), '\\documentclass[fontset=none]{ctexart}\n\\setCJKmainfont{LXGWWenKaiTC-Regular.ttf}\n\\usepackage{xjyutping}\n');
  }
  const pkg = J.jyutpingPreamble('\\documentclass{article}\n\\usepackage[UTF8]{ctex}\n\\begin{document}\n\\end{document}', { engine: 'lualatex' }).text;
  assert.match(pkg, /\\usepackage\[UTF8\]\{ctex\}\n\\setCJKmainfont\{NotoSerifTC-Regular\.otf\}/);
});

test('remove takes out xjyutping and \\xjyutpingsetup, and leaves the CJK lines and comments', () => {
  const on = J.jyutpingPreamble(DOC, { options: { fancy: true } }).text.replace('\\begin{document}', '\\xjyutpingsetup{ratio=0.5}\n% \\usepackage{xjyutping}\n\\begin{document}');
  const off = J.jyutpingPreamble(on, { remove: true }).text;
  assert.doesNotMatch(off, /^\\usepackage.*xjyutping|^\\xjyutpingsetup/m);
  assert.match(off, /^% \\usepackage\{xjyutping\}$/m);
  assert.match(off, /^\\usepackage\{xeCJK\}\n\\setCJKmainfont/m);
  // in a list with other packages
  const list = J.jyutpingPreamble('\\documentclass{article}\n\\usepackage{amsmath,xjyutping}\n\\begin{document}\n\\end{document}', { remove: true }).text;
  assert.match(list, /^\\usepackage\{amsmath\}$/m);
});

test('the preamble keeps Windows line ends, and a file without \\begin{document} is refused', () => {
  const crlf = J.jyutpingPreamble(DOC.replace(/\n/g, '\r\n')).text;
  assert.ok(!/[^\r]\n/.test(crlf));
  assert.equal(J.jyutpingPreamble('\\section{x}').ok, false);
});

test('options are written only when not the default, and nothing that could run TeX of its own gets in', () => {
  assert.equal(J.packageOptions({ ratio: '0.45', vsep: '1.2em', hsep: '0.2em plus 0.5em', width: '1.8em', format: '\\color{gray}', multiple: '\\color{red}', lazy: true, align: 'centre', linebreak: true, debug: false }),
    'vsep=1.2em,hsep={0.2em plus 0.5em},width=1.8em,format={\\color{gray}},multiple={\\color{red}},lazy,linebreak,align=centre');
  for (const options of [
    { format: '\\input{secret}' }, { format: '\\immediate\\write18{rm -rf}' }, { format: '}\\input{x}{' }, { format: '\\color{gray' }, { font: '\\directlua{os.exit()}' },
    { font: '\\catcode`\\%=12' }, { format: '50%' }, { format: '#1' }, { format: '\\textcolor{{nested}}' }, { format: '\\csname input\\endcsname' }, { format: '^^5cinput' },
    { ratio: '1;\\relax' }, { vsep: '1em\\relax' }, { hsep: '1em plus \\maxdimen' }, { width: 'wide' }, { lazy: 'some' }, { script: 'latin' }, { align: 'center' }, { fancy: 'yes' }, { other: 1 }
  ]) assert.ok(J.optionsProblem(options), JSON.stringify(options));
  assert.equal(J.optionsProblem({ font: '\\small\\sffamily', format: '\\color[HTML]{888888}', hsep: '0.1em plus 1fil minus 0.05em', ratio: '.5' }), null);
  assert.equal(J.packageOptions({ format: '\\input{x}' }), '');
});

test('the project setting is { mode, options, cjkFont } with a font Spectrum or the system has', () => {
  assert.equal(J.jyutpingProblem({ mode: 'auto', options: { fancy: true }, cjkFont: 'bundled:noto-serif-tc' }), null);
  assert.equal(J.jyutpingProblem({ mode: 'manual', cjkFont: '標楷體' }), null);
  assert.equal(J.jyutpingProblem({ mode: 'off' }), null);
  for (const bad of [null, [], { mode: 'on' }, { mode: 'auto', extra: 1 }, { mode: 'auto', cjkFont: 'bundled:nope' }, { mode: 'auto', cjkFont: 'Font}\\input{x' }, { mode: 'auto', options: { format: '\\write' } }]) {
    assert.ok(J.jyutpingProblem(bad), JSON.stringify(bad));
  }
});

test('auto mode’s copy keeps every line where it was, with the body in scopes, around what a scope can’t hold', () => {
  const doc = [
    '\\documentclass{article}', //   1
    '\\begin{document}', //          2
    '銀行 % 一 comment', //           3
    '\\begin{itemize}', //            4
    '\\item \\verb|50%| 行路', //      5
    '\\end{itemize}', //              6
    '', //                            7
    '\\begin{verbatim}', //           8
    '\\end{document} { 行', //       9
    '\\end{verbatim} after', //      10
    'Text', //                       11
    '', //                           12
    '\\input{chapters/one}', //      13
    'See \\url{a%20b} here', //      14
    '\\end{document}', //            15
    ''
  ].join('\n');
  const out = J.jyutpingTransform(doc, { role: 'main', additions: J.autoAdditions(doc, { options: {}, cjkFont: '', engine: 'xelatex', fontDir: '/fonts' }) });
  const lines = out.split('\n');
  assert.equal(lines.length, doc.split('\n').length);
  assert.equal(lines[1], '\\usepackage{xeCJK}\\setCJKmainfont{NotoSerifTC-Regular.otf}[Path={/fonts/},BoldFont=NotoSerifTC-Bold.otf]\\usepackage{xjyutping}\\begin{document}\\begin{jyutpingscope}');
  assert.equal(lines[2], '銀行 % 一 comment');
  // the \verb in the list closes the scope before the list, and the verbatim after it (nothing between them opens one)
  assert.equal(lines[3], '\\end{jyutpingscope}\\begin{itemize}');
  assert.equal(lines[4], '\\item \\verb|50%| 行路');
  assert.equal(lines[8], '\\end{document} { 行');
  assert.equal(lines[9], '\\end{verbatim} after');
  assert.equal(lines[10], '\\begin{jyutpingscope}Text');
  // the blank line before \input is left: the scope closes on the next one
  assert.equal(lines[11], '');
  assert.equal(lines[12], '\\end{jyutpingscope}\\input{chapters/one}');
  assert.equal(lines[13], 'See \\url{a%20b} here');
  assert.equal(lines[14], '\\begin{jyutpingscope}\\end{jyutpingscope}\\end{document}');
  // every scope opened is closed, never two open
  let open = 0;
  for (const [token] of out.matchAll(/\\(?:begin|end)\{jyutpingscope\}/g)) {
    open += token.startsWith('\\begin') ? 1 : -1;
    assert.ok(open === 0 || open === 1);
  }
  assert.equal(open, 0);
});

test('an included file is wrapped whole, a subfile between its \\begin{document} and \\end{document}', () => {
  assert.equal(J.jyutpingTransform('\\section{行}\n行路 % c\n\n', { role: 'body' }), '\\begin{jyutpingscope}\\section{行}\n行路 \\end{jyutpingscope}% c\n\n');
  // a paragraph's own scope ends on the blank line after it
  assert.equal(J.jyutpingTransform('行\n\n路\n', { role: 'body' }), '\\begin{jyutpingscope}行\n\\end{jyutpingscope}\\begin{jyutpingscope}\n路\\end{jyutpingscope}\n');
  assert.equal(J.jyutpingTransform('\\section{行}\n\\verb|x|\n', { role: 'body' }), '\\begin{jyutpingscope}\\section{行}\n\\end{jyutpingscope}\\verb|x|\n');
  assert.equal(J.jyutpingTransform('行\n\\endinput\nafter', { role: 'body' }), '\\begin{jyutpingscope}行\n\\end{jyutpingscope}\\endinput\nafter');
  const sub = '\\documentclass[../main]{subfiles}\n\\begin{document}\n行\n\\end{document}';
  assert.equal(J.jyutpingTransform(sub, { role: 'body' }), '\\documentclass[../main]{subfiles}\n\\begin{document}\\begin{jyutpingscope}\n行\n\\end{jyutpingscope}\\end{document}');
  // a main file without \begin{document} is left alone
  assert.equal(J.jyutpingTransform('行', { role: 'main' }), '行');
});

test('what auto mode looks at: Chinese outside comments, xjyutping in the preamble, the body’s files', () => {
  assert.equal(J.hasChinese('Hello % 中文\n'), false);
  assert.equal(J.hasChinese('Hello 中文'), true);
  assert.equal(J.loadsXjyutping('\\usepackage[fancy]{xjyutping}\n\\begin{document}'), true);
  assert.equal(J.loadsXjyutping('% \\usepackage{xjyutping}\n\\begin{document}'), false);
  assert.deepEqual(J.bodyInputs('\\input{preamble}\n\\begin{document}\n\\include{a}\n% \\input{b}\n\\import{dir}{c}\n\\subfile{d.tex}\n'),
    [{ command: 'include', file: 'a' }, { command: 'import', file: 'dir/c' }, { command: 'subfile', file: 'd.tex' }]);
  assert.equal(J.cjkKind('\\documentclass{ctexbook}\n\\begin{document}'), 'ctex');
  assert.equal(J.cjkKind('\\usepackage{luatexja-fontspec}\n\\begin{document}'), 'luatexja-fontspec');
});

test('the log names the project’s files in place of the copy’s, across TeX’s 79-character lines', () => {
  const copy = '/tmp/cache/jyutping-abc123';
  const line = `(${copy}/chapters/one.tex ${'x'.repeat(60)})`;
  const wrapped = [line.slice(0, 79), line.slice(79), 'Short line', `[spectrum] ${'note '.repeat(20)}`].join('\n');
  const mapped = projectPaths(wrapped, copy, '/Users/me/My Project');
  const lines = mapped.split('\n');
  assert.equal(lines[0].length, 79);
  assert.equal(lines.slice(0, 2).join(''), `(/Users/me/My Project/chapters/one.tex ${'x'.repeat(60)})`);
  assert.deepEqual(lines.slice(2), wrapped.split('\n').slice(2));
  assert.equal(projectPaths(wrapped.replace(/\n/g, '\r\n'), copy, '/p').split('\r\n')[0].slice(0, 3), '(/p');
  // TeX's context line, its start cut off
  assert.equal(projectPaths('<*> ...che/jyutping-abc123/main.tex', copy, '/p'), '<*> /p/main.tex');
});

test('the preview document escapes the text and gets the preamble', () => {
  const doc = previewDocument({ text: '銀行 50% {x} \\input', options: { fancy: true }, cjkFont: 'Songti TC', engine: 'lualatex' });
  assert.match(doc, /^銀行 50\\% \\\{x\\\} \\textbackslash\{\}input$/m);
  assert.match(doc, /\\usepackage\{luatexja-fontspec\}\n\\setmainjfont\{Songti TC\}\n\\usepackage\[fancy\]\{xjyutping\}/);
});

test('info names Spectrum’s package and, for a folder without it, why it isn’t used', async () => {
  const info = await jyutpingInfo(tmp);
  assert.equal(info.source, 'bundled');
  assert.match(info.version, /^\d+\.\d+\.\d+$/);
  assert.match(info.folderProblem, /doesn’t have xjyutping\.sty, xjyutping\.lua/);
  assert.deepEqual(info.defaultFont, { tc: 'bundled:noto-serif-tc', sc: 'bundled:noto-serif-sc' });
  assert.ok(Array.isArray(info.fonts));
});

test('the routes: settings take a jyutping object or null, the preamble and preview refuse unsafe options, the preview is a PDF', { timeout: 300000 }, async () => {
  const { default: Fastify } = await import('fastify');
  const { registerJyutpingRoutes } = await import('../src/routes/jyutping.js');
  const { registerProjectRoutes } = await import('../src/routes/projects.js');
  const { createProject } = await import('../src/services/projectService.js');
  const { findExecutable } = await import('../src/services/compileService.js');
  const app = Fastify();
  registerJyutpingRoutes(app);
  registerProjectRoutes(app);
  after(() => app.close());
  const project = await createProject({ name: 'routes', parentDir: path.join(tmp, 'projects') });
  const patch = (body) => app.inject({ method: 'PATCH', url: `/api/projects/${project.id}/settings`, payload: body });

  const setting = { mode: 'auto', options: { fancy: true }, cjkFont: 'bundled:noto-sans-tc' };
  assert.deepEqual((await patch({ jyutping: setting })).json().settings.jyutping, setting);
  // other settings leave it as it is
  assert.deepEqual((await patch({ compile: { draft: true } })).json().settings.jyutping, setting);
  assert.equal((await patch({ jyutping: { mode: 'auto', options: { format: '\\input{x}' } } })).statusCode, 400);
  assert.equal((await patch({ jyutping: { mode: 'auto', cjkFont: 'x}' } })).statusCode, 400);
  assert.equal((await patch({ jyutping: null })).json().settings.jyutping, undefined);

  const preamble = await app.inject({ method: 'POST', url: '/api/jyutping/preamble', payload: { text: DOC, options: { fancy: true }, engine: 'lualatex' } });
  assert.match(preamble.json().text, /\\setmainjfont/);
  assert.equal((await app.inject({ method: 'POST', url: '/api/jyutping/preamble', payload: { text: DOC, options: { font: '\\write18{x}' } } })).statusCode, 400);
  assert.equal((await app.inject({ method: 'POST', url: '/api/jyutping/preamble', payload: { text: DOC, engine: 'pdflatex' } })).statusCode, 400);
  assert.equal((await app.inject({ method: 'GET', url: '/api/jyutping/info' })).json().source, 'bundled');
  const long = await app.inject({ method: 'POST', url: '/api/jyutping/preview', payload: { text: '行'.repeat(501) } });
  assert.equal(long.json().ok, false);

  const kpsewhich = await findExecutable('kpsewhich');
  const ready = (await findExecutable('xelatex')) && kpsewhich && (await import('node:child_process')).spawnSync(kpsewhich, ['xeCJK.sty', 'standalone.cls', 'varwidth.sty']).stdout.toString().trim().split('\n').length === 3;
  if (!ready || !(await jyutpingInfo()).fonts.length) return;
  const pdf = await app.inject({ method: 'POST', url: '/api/jyutping/preview', payload: { text: '我哋去銀行，行路返屋企。', options: { fancy: true }, cjkFont: 'bundled:noto-serif-tc' } });
  assert.equal(pdf.headers['content-type'], 'application/pdf', pdf.body.slice(0, 2000));
  assert.equal(pdf.rawPayload.subarray(0, 5).toString(), '%PDF-');
});
