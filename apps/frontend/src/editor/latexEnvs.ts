import { withoutComments } from '../../../backend/src/latex/text.js';

// \begin{…} completion: the environments LaTeX, packages and classes provide, what to insert for them,
// and a scan of what a project loads and defines (its labels, commands and bibliography too, for the other
// completions). Names checked against the TeX Live 2026 sources.

/** Always offered and ranked first: the standard classes' essentials and amsmath's displays (nearly every paper loads it). */
export const COMMON_ENVS = [
  'itemize', 'enumerate', 'description', 'equation', 'equation*', 'align', 'align*', 'gather', 'gather*',
  'multline', 'multline*', 'flalign', 'flalign*', 'alignat', 'alignat*', 'split', 'aligned', 'gathered', 'cases',
  'matrix', 'pmatrix', 'bmatrix', 'Bmatrix', 'vmatrix', 'Vmatrix', 'smallmatrix', 'subequations',
  'figure', 'figure*', 'table', 'table*', 'tabular', 'tabular*', 'array', 'center', 'flushleft', 'flushright',
  'minipage', 'abstract', 'quote', 'quotation', 'verse', 'verbatim', 'verbatim*', 'thebibliography', 'displaymath', 'titlepage'
];

/** Only valid inside maths: what \begin{ offers there (with tikzcd, which works in both), and never in text. */
export const MATHS_ONLY_ENVS = new Set([
  'split', 'aligned', 'alignedat', 'gathered', 'lgathered', 'rgathered', 'multlined', 'array', 'subarray', 'crampedsubarray', 'darray',
  'cases', 'cases*', 'dcases', 'dcases*', 'rcases', 'rcases*', 'drcases', 'drcases*',
  'matrix', 'pmatrix', 'bmatrix', 'Bmatrix', 'vmatrix', 'Vmatrix', 'smallmatrix', 'matrix*', 'pmatrix*', 'bmatrix*', 'Bmatrix*',
  'vmatrix*', 'Vmatrix*', 'smallmatrix*', 'psmallmatrix', 'psmallmatrix*', 'bsmallmatrix', 'bsmallmatrix*', 'Bsmallmatrix',
  'Bsmallmatrix*', 'vsmallmatrix', 'vsmallmatrix*', 'Vsmallmatrix', 'Vsmallmatrix*',
  'NiceArray', 'NiceMatrix', 'pNiceMatrix', 'bNiceMatrix', 'BNiceMatrix', 'vNiceMatrix', 'VNiceMatrix', 'pNiceArray', 'bNiceArray',
  'BNiceArray', 'vNiceArray', 'VNiceArray'
]);

/** Always valid but rarely typed: offered without the boost. */
export const KERNEL_ENVS = [
  'document', 'list', 'trivlist', 'math', 'eqnarray', 'eqnarray*', 'tabbing', 'picture', 'lrbox', 'sloppypar',
  'filecontents', 'filecontents*', 'theindex'
];

/** Offered only when the package or class is loaded (\usepackage, \RequirePackage, \documentclass, \LoadClass). */
export const PACKAGE_ENVS: Record<string, string[]> = {
  // maths
  amsmath: ['equation*', 'align', 'align*', 'gather', 'gather*', 'multline', 'multline*', 'flalign', 'flalign*', 'alignat', 'alignat*', 'xalignat', 'xalignat*', 'split', 'aligned', 'alignedat', 'gathered', 'cases', 'matrix', 'pmatrix', 'bmatrix', 'Bmatrix', 'vmatrix', 'Vmatrix', 'smallmatrix', 'subarray', 'subequations'],
  mathtools: ['dcases', 'dcases*', 'rcases', 'rcases*', 'drcases', 'drcases*', 'cases*', 'multlined', 'lgathered', 'rgathered', 'spreadlines', 'matrix*', 'pmatrix*', 'bmatrix*', 'Bmatrix*', 'vmatrix*', 'Vmatrix*', 'smallmatrix*', 'psmallmatrix', 'psmallmatrix*', 'bsmallmatrix', 'bsmallmatrix*', 'Bsmallmatrix', 'Bsmallmatrix*', 'vsmallmatrix', 'vsmallmatrix*', 'Vsmallmatrix', 'Vsmallmatrix*', 'crampedsubarray'],
  empheq: ['empheq'],
  breqn: ['dmath', 'dmath*', 'dgroup', 'dgroup*', 'darray', 'dseries', 'dseries*', 'dsuspend'],
  cases: ['numcases', 'subnumcases'],
  nicematrix: ['NiceTabular', 'NiceTabular*', 'NiceTabularX', 'NiceArray', 'NiceMatrix', 'pNiceMatrix', 'bNiceMatrix', 'BNiceMatrix', 'vNiceMatrix', 'VNiceMatrix', 'pNiceArray', 'bNiceArray', 'BNiceArray', 'vNiceArray', 'VNiceArray', 'NiceMatrixBlock'],
  mathpartir: ['mathpar'],
  bussproofs: ['prooftree'],
  xy: ['xy'],
  // theorems (the theorems themselves come from \newtheorem and friends, see scanTex)
  amsthm: ['proof'],
  thmtools: ['restatable', 'restatable*'],
  // floats, captions, layout
  subcaption: ['subfigure', 'subtable', 'subcaptionblock', 'subcaptiongroup', 'subcaptiongroup*'],
  floatrow: ['floatrow', 'subfloatrow'],
  sidecap: ['SCfigure', 'SCfigure*', 'SCtable', 'SCtable*'],
  wrapfig: ['wrapfigure', 'wraptable'],
  rotating: ['sidewaysfigure', 'sidewaysfigure*', 'sidewaystable', 'sidewaystable*', 'sideways', 'turn', 'rotate'],
  lscape: ['landscape'],
  pdflscape: ['landscape'],
  adjustbox: ['adjustbox'],
  multicol: ['multicols', 'multicols*'],
  changepage: ['adjustwidth', 'adjustwidth*'],
  appendix: ['appendices', 'subappendices'],
  // tables
  longtable: ['longtable'],
  tabularx: ['tabularx'],
  tabulary: ['tabulary'],
  xltabular: ['xltabular'],
  supertabular: ['supertabular', 'supertabular*', 'mpsupertabular', 'mpsupertabular*'],
  threeparttable: ['threeparttable', 'tablenotes', 'measuredfigure'],
  threeparttablex: ['ThreePartTable', 'TableNotes'],
  tabularray: ['tblr', 'longtblr', 'talltblr'],
  // lists (enumitem's inline lists need its [inline] option, and \newlist adds more)
  paralist: ['compactitem', 'compactenum', 'compactdesc', 'asparaitem', 'asparaenum', 'asparadesc', 'inparaitem', 'inparaenum', 'inparadesc'],
  tasks: ['tasks'],
  acronym: ['acronym'],
  // code, verbatim, comments
  listings: ['lstlisting'],
  minted: ['minted'],
  fancyvrb: ['Verbatim', 'Verbatim*', 'BVerbatim', 'BVerbatim*', 'LVerbatim', 'LVerbatim*', 'SaveVerbatim', 'VerbatimOut'],
  verbatim: ['verbatim', 'verbatim*', 'comment'],
  comment: ['comment'],
  spverbatim: ['spverbatim'],
  pythontex: ['pycode', 'pyblock', 'pyverbatim', 'pyconsole', 'pysub'],
  algorithm: ['algorithm', 'algorithm*'],
  algorithmic: ['algorithmic'],
  algorithmicx: ['algorithmic'],
  algorithm2e: ['algorithm', 'algorithm*', 'procedure', 'procedure*', 'function', 'function*'],
  // boxes, quotes
  tcolorbox: ['tcolorbox'],
  framed: ['framed', 'oframed', 'shaded', 'shaded*', 'snugshade', 'snugshade*', 'leftbar'],
  mdframed: ['mdframed'],
  csquotes: ['displayquote', 'displaycquote', 'foreigndisplayquote', 'foreigndisplaycquote', 'hyphendisplayquote', 'hyphendisplaycquote'],
  biblatex: ['refsection', 'refsegment', 'refcontext'],
  hyperref: ['Form'],
  // graphics
  tikz: ['tikzpicture', 'scope'],
  pgf: ['pgfpicture', 'pgfscope'],
  'tikz-cd': ['tikzcd'],
  pgfplots: ['axis', 'semilogxaxis', 'semilogyaxis', 'loglogaxis'],
  forest: ['forest'],
  circuitikz: ['circuitikz'],
  quantikz: ['quantikz'],

  // classes
  amsart: ['proof', 'abstract'],
  amsproc: ['proof', 'abstract'],
  amsbook: ['proof', 'abstract'],
  beamer: ['frame', 'block', 'alertblock', 'exampleblock', 'columns', 'column', 'onlyenv', 'altenv', 'overprint', 'overlayarea', 'actionenv', 'uncoverenv', 'visibleenv', 'invisibleenv', 'alertenv', 'structureenv', 'semiverbatim', 'beamercolorbox', 'beamerboxesrounded', 'theorem', 'corollary', 'fact', 'lemma', 'problem', 'solution', 'definition', 'definitions', 'example', 'examples'],
  llncs: ['theorem', 'case', 'claim', 'conjecture', 'corollary', 'definition', 'example', 'exercise', 'lemma', 'note', 'problem', 'property', 'proposition', 'question', 'solution', 'remark', 'proof', 'credits'],
  svjour3: ['theorem', 'case', 'claim', 'conjecture', 'corollary', 'definition', 'example', 'exercise', 'lemma', 'note', 'problem', 'property', 'proposition', 'question', 'solution', 'remark', 'proof', 'acknowledgements'],
  IEEEtran: ['IEEEeqnarray', 'IEEEeqnarray*', 'IEEEeqnarraybox', 'IEEEeqnarraybox*', 'IEEEeqnarrayboxm', 'IEEEeqnarrayboxt', 'IEEEbiography', 'IEEEbiographynophoto', 'IEEEkeywords', 'IEEEproof', 'IEEEitemize', 'IEEEenumerate', 'IEEEdescription'],
  acmart: ['CCSXML', 'acks', 'teaserfigure', 'marginfigure', 'margintable', 'sidebar', 'printonly', 'screenonly', 'anonsuppress', 'translatedabstract', 'theorem', 'conjecture', 'proposition', 'lemma', 'corollary', 'example', 'definition'],
  elsarticle: ['frontmatter', 'keyword', 'highlights', 'graphicalabstract'],
  'revtex4-1': ['acknowledgments', 'acknowledgements', 'widetext', 'ruledtabular', 'turnpage', 'quasitable', 'mathletters', 'references', 'video', 'video*', 'longtable*'],
  'revtex4-2': ['acknowledgments', 'acknowledgements', 'widetext', 'ruledtabular', 'turnpage', 'quasitable', 'mathletters', 'references', 'video', 'video*', 'longtable*'],
  memoir: ['adjustwidth', 'adjustwidth*', 'appendices', 'subappendices', 'epigraphs', 'framed', 'shaded', 'snugshade', 'leftbar', 'vminipage', 'titlingpage', 'titlingpage*', 'onecolabstract', 'sidecaption', 'symbols', 'vplace', 'Spacing', 'SingleSpace', 'OnehalfSpace', 'DoubleSpace', 'boxedverbatim', 'marginfigure', 'margintable'],
  scrartcl: ['addmargin', 'addmargin*', 'labeling', 'captionbeside'],
  scrreprt: ['addmargin', 'addmargin*', 'labeling', 'captionbeside'],
  scrbook: ['addmargin', 'addmargin*', 'labeling', 'captionbeside'],
  exam: ['questions', 'parts', 'subparts', 'subsubparts', 'choices', 'oneparchoices', 'checkboxes', 'oneparcheckboxes', 'solution', 'solutionorbox', 'solutionorlines', 'solutionordottedlines', 'solutionorgrid', 'coverpages', 'EnvFullwidth', 'EnvUplevel'],
  letter: ['letter'],
  moderncv: ['cvcolumns'],
  tikzposter: ['columns', 'subcolumns', 'tikzfigure']
};

/** Loading the key loads these too. */
export const PACKAGE_IMPLIES: Record<string, string[]> = {
  mathtools: ['amsmath'], empheq: ['mathtools'], breqn: ['amsmath'], algpseudocode: ['algorithmicx'],
  'tikz-cd': ['tikz'], pgfplots: ['tikz'], circuitikz: ['tikz'], forest: ['tikz'], quantikz: ['tikz'], tikz: ['pgf'], pgf: ['graphicx', 'xcolor'],
  xltabular: ['tabularx', 'longtable'], ltablex: ['tabularx', 'longtable'], threeparttablex: ['threeparttable'], tabularx: ['array'],
  pdflscape: ['lscape'], minted: ['fancyvrb'], pythontex: ['fancyvrb'], fvextra: ['fancyvrb'], hyperref: ['url'], xurl: ['url'],
  subcaption: ['caption'], 'glossaries-extra': ['glossaries'], imakeidx: ['makeidx'],
  amsart: ['amsmath', 'amsthm'], amsproc: ['amsart'], amsbook: ['amsart'],
  beamer: ['amsmath', 'amsthm', 'hyperref', 'pgf'], acmart: ['amsart', 'framed', 'comment', 'hyperref', 'natbib', 'graphicx', 'xcolor'],
  elsarticle: ['natbib', 'graphicx'], aastex701: ['natbib', 'graphicx'], 'revtex4-1': ['natbib'], 'revtex4-2': ['natbib'], achemso: ['natbib'],
  quantumarticle: ['xcolor'], scrreprt: ['scrartcl'], scrbook: ['scrartcl'],
  llncs: ['multicol'], tikzposter: ['tikz'], moderncv: ['hyperref']
};

/** Environments that \usetikzlibrary, \usepgfplotslibrary and \tcbuselibrary add, by the package they extend. */
const TCB_RASTER = ['tcbraster', 'tcbitemize', 'tcboxedraster', 'tcboxeditemize'];
const LIBRARY_ENVS: Record<string, Record<string, string[]>> = {
  tikz: { cd: ['tikzcd'], quantikz: ['quantikz'], quantikz2: ['quantikz'] },
  pgfplots: { groupplots: ['groupplot'], polar: ['polaraxis'], ternary: ['ternaryaxis'], smithchart: ['smithchart'] },
  tcolorbox: { listings: ['tcblisting'], listingsutf8: ['tcblisting'], minted: ['tcblisting'], raster: TCB_RASTER, poster: ['tcbposter'], most: ['tcblisting', ...TCB_RASTER], all: ['tcblisting', 'tcbposter', ...TCB_RASTER] }
};
const LIBRARY_OF: Record<string, string> = { usetikzlibrary: 'tikz', usepgfplotslibrary: 'pgfplots', tcbuselibrary: 'tcolorbox' };

// ─── What to insert: name → [text after \begin{name}, body lines, cursorLine] ───
// cursorLine indexes [\begin line, ...body] as env() in latexEditor.ts does. Missing: ['', [''], 1].

export type Snip = [args: string, body?: string[], cursorLine?: number];
export const ENV_SNIPPETS: Record<string, Snip> = {};
const set = (names: string, s: Snip) => names.split(' ').forEach((n) => (ENV_SNIPPETS[n] = s));
const FIG: Snip = ['', ['\\centering', '\\includegraphics[width=0.9\\linewidth]{}', '\\caption{}', '\\label{fig:}'], 2];
const TAB: Snip = ['', ['\\centering', '\\begin{tabular}{lcc}', '\\toprule', '\\midrule', '\\bottomrule', '\\end{tabular}', '\\caption{}', '\\label{tab:}'], 7];
set('itemize enumerate description compactitem compactenum compactdesc asparaitem asparaenum asparadesc inparaitem inparaenum inparadesc IEEEitemize IEEEenumerate IEEEdescription highlights tablenotes TableNotes', ['', ['\\item ']]);
set('alignat alignat* alignedat xalignat xalignat*', ['{2}']);
set('numcases subnumcases', ['{}', [''], 0]);
set('subequations', ['', ['\\begin{align}', '', '\\end{align}'], 2]);
set('empheq', ['[box=\\fbox]{align}']);
set('spreadlines', ['{1em}']);
set('figure figure* sidewaysfigure sidewaysfigure* SCfigure teaserfigure', FIG);
set('table table* sidewaystable sidewaystable* SCtable', TAB);
set('subfigure', ['[b]{0.48\\linewidth}', ['\\centering', '\\includegraphics[width=\\linewidth]{}', '\\caption{}', '\\label{fig:}'], 2]);
set('subtable', ['[b]{0.48\\linewidth}', ['\\centering', '\\begin{tabular}{lc}', '', '\\end{tabular}', '\\caption{}', '\\label{tab:}'], 3]);
set('wrapfigure', ['{r}{0.4\\linewidth}', ['\\centering', '\\includegraphics[width=\\linewidth]{}', '\\caption{}'], 2]);
set('wraptable', ['{r}{0.4\\linewidth}']);
set('tabular longtable supertabular NiceTabular', ['{lcc}']);
set('tabular*', ['{\\linewidth}{@{\\extracolsep{\\fill}}lcc}']);
set('tabularx xltabular', ['{\\linewidth}{lX}']);
set('tabulary', ['{\\linewidth}{LC}']);
set('tblr longtblr talltblr', ['{colspec={lcc}}']);
set('array', ['{cc}']);
set('threeparttable', ['', ['\\caption{}', '\\begin{tabular}{lcc}', '', '\\end{tabular}', '\\begin{tablenotes}', '\\item ', '\\end{tablenotes}'], 1]);
set('minipage', ['{0.48\\linewidth}']);
set('multicols multicols*', ['{2}']);
set('adjustbox', ['{max width=\\linewidth}']);
set('adjustwidth adjustwidth*', ['{1em}{1em}']);
set('addmargin addmargin*', ['{1em}']);
set('thebibliography', ['{99}', ['\\bibitem{}']]);
set('list', ['{}{}', ['\\item ']]);
set('picture', ['(100,100)']);
set('filecontents filecontents*', ['[overwrite]{}', [''], 0]);
set('letter', ['{}', ['\\opening{}', '', '\\closing{}'], 0]);
set('labeling', ['{}', ['\\item '], 0]);
// code
set('lstlisting', ['[language=Python]']);
set('minted', ['{python}']);
set('algorithm algorithm*', ['', ['\\caption{}', '\\label{alg:}', '\\begin{algorithmic}[1]', '\\State ', '\\end{algorithmic}'], 4]);
set('algorithmic', ['[1]', ['\\State ']]);
// boxes, theorems
set('restatable restatable*', ['{theorem}{}', [''], 0]);
set('prooftree', ['', ['\\AxiomC{}', '\\UnaryInfC{}']]);
// beamer
set('frame', ['', ['\\frametitle{}', '']]);
set('block alertblock exampleblock', ['{}', [''], 0]);
set('columns', ['', ['\\begin{column}{0.48\\textwidth}', '', '\\end{column}', '\\begin{column}{0.48\\textwidth}', '', '\\end{column}'], 2]);
set('column', ['{0.48\\textwidth}']);
// classes
set('IEEEeqnarray IEEEeqnarray*', ['{rCl}']);
set('IEEEbiography', ['{}', [''], 0]);
set('frontmatter', ['', ['\\title{}', '\\author{}', '\\affiliation{}', '\\begin{abstract}', '', '\\end{abstract}', '\\begin{keyword}', '', '\\end{keyword}']]);
set('questions', ['', ['\\question ']]);
set('parts', ['', ['\\part ']]);
set('subparts', ['', ['\\subpart ']]);
set('choices oneparchoices checkboxes oneparcheckboxes', ['', ['\\choice ']]);
set('tasks', ['(2)', ['\\task ']]);

/** algorithm2e's `algorithm` takes a different body; used when algorithm2e is what provides it. */
export const ALGORITHM2E_SNIPPET: Snip = ['', ['\\caption{}', '\\KwIn{}', '\\KwOut{}', ''], 4];

// ─── What a file loads and defines ───

// one \s* each side of an optional [...] (here and in def), so a long run of spaces can't make a match quadratic
const LOAD_RE = /\\(usepackage|RequirePackage|documentclass|LoadClass)(?:WithOptions)?\s*(?:\[[^\]]*\]\s*)?\{([^}]+)\}/g;
const LIB_RE = /\\(usetikzlibrary|usepgfplotslibrary|tcbuselibrary)\s*\{([^}]+)\}/g;
export const INPUT_RE = /\\(?:input|include|subfile)\s*\{([^}]+)\}|\\import\s*\{([^}]*)\}\s*\{([^}]+)\}/g;
/** The name an INPUT_RE match pulls in; \import's folder and file joined. */
export const inputName = (m: RegExpMatchArray) => m[1]?.trim() ?? `${m[2].trim().replace(/\/?$/, '/')}${m[3].trim()}`;

const def = (cmds: string, star = false, prefix = '') => ({ re: new RegExp(String.raw`\\(?:${cmds})\*?\s*(?:\[[^\]]*\]\s*)?\{([^{}]+)\}`, 'g'), star, prefix });
/** The commands that define environments; the name (or a comma list) is the first argument. star: name* too. */
const ENV_DEFINERS = [
  def('(?:re)?newenvironmentx?|(?:New|Renew|Provide|Declare)DocumentEnvironment|(?:Re)?NewEnviron'),
  // amsthm, ntheorem, beamer, thmtools (comma lists), llncs/svjour, elsarticle, SIAM, mdframed
  def('newtheorem|spnewtheorem|declaretheorem|newframedtheorem|newshadedtheorem|newmdtheoremenv|newsiamthm|newsiamremark|newdefinition|newproof'),
  def('(?:re)?newtcolorbox|(?:New|Renew|Provide|Declare)TColorBox|(?:re)?newtcblisting|(?:New|Renew|Provide|Declare)TCBListing'),
  def('(?:re)?newtcbtheorem|(?:New|Renew|Provide|Declare)TcbTheorem|newfloat|DeclareFloatingEnvironment', true),
  // listings, fancyvrb, mdframed, enumitem, tasks, tabularray, mathtools, the comment package
  def('lstnewenvironment|(?:Define|Recustom)VerbatimEnvironment|newmdenv|(?:re)?newlist|NewTasksEnvironment|NewTblrEnviron|newcases|newgathered|(?:include|exclude|special|process)comment'),
  def('DeclareCaptionSubType', false, 'sub')
];
const VALID = /^[A-Za-z][\w*-]*$/; // drops #1, \macro and @internal

const LABEL_RE = /\\label\s*\{([^{}#\\]+)\}/g;
// xr and xr-hyper's \externaldocument[prefix]{name}, zref-xr's \zexternaldocument*: the prefix, then any further [options]
const EXTERNAL_RE = /\\z?externaldocument\*?\s*(?:\[([^\]]*)\]\s*)?(?:\[[^\]]*\]\s*)*\{([^}]+)\}/g;
const BIB_RE = /\\(?:bibliography|addbibresource)\s*(?:\[[^\]]*\]\s*)?\{([^}]+)\}/g;
// the name in braces or not, then [n] arguments and an [optional] first one; not an internal \name@part
const NAME = String.raw`(?:\{\s*\\([A-Za-z]+)\s*\}|\\([A-Za-z]+)(?![@A-Za-z]))`;
const NEWCOMMAND_RE = new RegExp(String.raw`\\(?:(?:re)?newcommand|providecommand|DeclareRobustCommand)\*?\s*${NAME}\s*(?:\[(\d)\]\s*(\[)?)?`, 'g');
// the argument spec, with one level of braces for O{default} and the like
const DOCUMENTCOMMAND_RE = new RegExp(String.raw`\\(?:New|Renew|Provide|Declare)DocumentCommand\s*${NAME}\s*\{((?:[^{}]|\{[^{}]*\})*)\}`, 'g');
const MATHOP_RE = new RegExp(String.raw`\\DeclareMathOperator\*?\s*${NAME}`, 'g');
// mathtools' \abs and \norm: one argument, in maths
const PAIRED_RE = new RegExp(String.raw`\\DeclarePairedDelimiter(?:X|XPP)?\s*${NAME}`, 'g');
// \def\name and \let\name, taken to have no arguments (and not \def\csname…, which names something else)
const DEF_RE = /\\(?:[egx]?def|let)\s*\\(?!csname\b)([A-Za-z]+)(?![@A-Za-z])/g;

export type TexScan = {
  packages: string[];
  classes: string[];
  libraries: [pkg: string, library: string][];
  defined: string[];
  inputs: string[];
  labels: string[];
  /** the file's own commands: their mandatory argument count, and whether they only work in maths */
  commands: [name: string, args: number, math: boolean][];
  /** the names \bibliography and \addbibresource give */
  bibs: string[];
  /** the other documents whose labels \externaldocument brings in, and the prefix they get */
  externals: [prefix: string, name: string][];
  /** the project file it came from (scanProject sets it) */
  file?: string;
};

export function scanTex(src: string): TexScan {
  src = withoutComments(src);
  const scan: TexScan = { packages: [], classes: [], libraries: [], defined: [], inputs: [], labels: [], commands: [], bibs: [], externals: [] };
  const names = (list: string) => list.split(',').map((n) => n.trim()).filter(Boolean);
  for (const m of src.matchAll(LOAD_RE)) (/class/i.test(m[1]) ? scan.classes : scan.packages).push(...names(m[2]));
  for (const m of src.matchAll(LIB_RE)) for (const lib of names(m[2])) scan.libraries.push([LIBRARY_OF[m[1]], lib]);
  for (const m of src.matchAll(INPUT_RE)) scan.inputs.push(inputName(m));
  for (const m of src.matchAll(LABEL_RE)) scan.labels.push(m[1].trim());
  for (const m of src.matchAll(BIB_RE)) scan.bibs.push(...names(m[1]));
  for (const m of src.matchAll(EXTERNAL_RE)) scan.externals.push([m[1]?.trim() ?? '', m[2].trim()]);
  // with a default, the first of the [n] arguments is optional
  for (const m of src.matchAll(NEWCOMMAND_RE)) scan.commands.push([m[1] ?? m[2], Math.max(0, Number(m[3] ?? 0) - (m[4] ? 1 : 0)), false]);
  // xparse: count the m's once any {defaults} are gone
  for (const m of src.matchAll(DOCUMENTCOMMAND_RE)) scan.commands.push([m[1] ?? m[2], m[3].replace(/\{[^{}]*\}/g, '').split('m').length - 1, false]);
  for (const m of src.matchAll(MATHOP_RE)) scan.commands.push([m[1] ?? m[2], 0, true]);
  for (const m of src.matchAll(PAIRED_RE)) scan.commands.push([m[1] ?? m[2], 1, true]);
  for (const m of src.matchAll(DEF_RE)) scan.commands.push([m[1], 0, false]);
  const add = (n: string) => VALID.test(n) && scan.defined.push(n);
  for (const { re, star, prefix } of ENV_DEFINERS)
    for (const m of src.matchAll(re))
      for (const name of names(m[1])) {
        add(prefix + name);
        if (star) add(`${prefix + name}*`);
      }
  // minted: \newminted[envname]{lang}{opts} defines envname or <lang>code, and its starred form
  for (const m of src.matchAll(/\\newminted\s*(?:\[([^\]]*)\]\s*)?\{([^}]+)\}/g)) {
    const n = m[1]?.trim() || `${m[2].trim()}code`;
    add(n);
    add(`${n}*`);
  }
  // tocbasic: \DeclareNewTOC[type=x,float]{ext} defines x and x*, [nonfloat] defines x-
  for (const m of src.matchAll(/\\DeclareNewTOC\s*\[([^\]]*)\]\s*\{([^}]+)\}/g)) {
    const type = /\btype\s*=\s*(\w+)/.exec(m[1])?.[1] ?? m[2].trim();
    if (/\bnonfloat\b/.test(m[1])) add(`${type}-`);
    else if (/\bfloat\b/.test(m[1])) {
      add(type);
      add(`${type}*`);
    }
  }
  return scan;
}

/** The packages and classes these files load, and what those load in turn. */
export function loadedPackages(scans: TexScan[]) {
  const loaded = new Set<string>();
  const load = (pkg: string) => {
    if (loaded.has(pkg)) return;
    loaded.add(pkg);
    PACKAGE_IMPLIES[pkg]?.forEach(load);
  };
  for (const scan of scans) [...scan.classes, ...scan.packages].forEach(load);
  return loaded;
}

/**
 * What \begin{ offers for these files: name → where it comes from (a package or class, "this project",
 * or '' for the kernel). The common ones come first, then the project's own, then what packages add.
 */
export function availableEnvs(scans: TexScan[]) {
  const envs = new Map<string, string>();
  const add = (name: string, from: string) => envs.has(name) || envs.set(name, from);
  const amsmath = new Set(PACKAGE_ENVS.amsmath);
  for (const name of COMMON_ENVS) add(name, amsmath.has(name) ? 'amsmath' : '');
  for (const scan of scans) for (const name of scan.defined) add(name, 'this project');
  for (const pkg of loadedPackages(scans)) PACKAGE_ENVS[pkg]?.forEach((name) => add(name, pkg));
  for (const scan of scans) for (const [pkg, lib] of scan.libraries) LIBRARY_ENVS[pkg][lib]?.forEach((name) => add(name, pkg));
  for (const name of KERNEL_ENVS) add(name, '');
  return envs;
}

/** A path as the file tree names it: no "./" or "//", and "../" resolved. */
const normalise = (path: string) =>
  path
    .split('/')
    .reduce<string[]>((out, part) => (part === '..' ? out.slice(0, -1) : part && part !== '.' ? [...out, part] : out), [])
    .join('/');

const folderOf = (path: string) => path.slice(0, path.lastIndexOf('/') + 1);

/** The document a `% !TEX root = …` comment near the top of a file names, as a project path; '' without one. */
export function texRoot(path: string, src: string) {
  const name = /^[ \t]*%[ \t]*!TEX[ \t]+root[ \t]*=[ \t]*(.+?)[ \t]*$/im.exec(src.slice(0, 4096))?.[1];
  return name ? normalise(folderOf(path) + name) : '';
}

/** The documents a document's \externaldocument names, as project paths (xr reads them from its folder). */
export const externalDocuments = (doc: string, src: string) =>
  scanTex(src).externals.map(([, name]) => normalise(folderOf(doc) + (/\.tex$/i.test(name) ? name : `${name}.tex`)));

/**
 * The project file a name that `mainFile`'s document pulls in means. Like the compile's TEXINPUTS, it is looked up
 * from the main file's folder first, then the project root. TeX tries name.tex before the name as given; only a
 * name with the extension is followed as given, so a big \input'd .pgf or .tikz figure is never read.
 */
export function includedFile(files: Set<string>, mainFile: string, name: string, ext: string) {
  const dir = folderOf(mainFile);
  return [dir + name + ext, name + ext, ...(name.toLowerCase().endsWith(ext) ? [dir + name, name] : [])].map(normalise).find((p) => files.has(p));
}

export type BibEntry = { key: string; author: string; year: string; title: string };

// a field's value starts after "name =": in braces, in quotes, or bare (a number or a @string name)
const FIELD = Object.fromEntries(['author', 'editor', 'year', 'date', 'title'].map((n) => [n, new RegExp(String.raw`(?:^|[\s,])${n}\s*=\s*`, 'i')]));
const BARE = /[^,}\s]*/y;
function field(body: string, name: string) {
  const m = FIELD[name].exec(body);
  if (!m) return '';
  let i = m.index + m[0].length;
  const close = body[i] === '{' ? '}' : body[i] === '"' ? '"' : '';
  const start = close ? (i += 1) : i;
  if (close) for (let depth = 0; i < body.length && !(depth === 0 && body[i] === close); i += 1) depth += body[i] === '{' ? 1 : body[i] === '}' ? -1 : 0;
  else {
    BARE.lastIndex = i;
    i += BARE.exec(body)![0].length;
  }
  return body.slice(start, i).replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
}

/** A .bib file's entries: the key, the first author's surname, the year and the title. */
export function parseBib(src: string): BibEntry[] {
  const starts = [...src.matchAll(/@\s*([A-Za-z]+)\s*[{(]\s*([^\s,{}()]+)\s*,/g)];
  return starts.flatMap((m, i) => {
    if (/^(?:string|comment|preamble)$/i.test(m[1])) return [];
    // the entry runs to the next one
    const body = src.slice(m.index! + m[0].length, starts[i + 1]?.index ?? src.length);
    const first = (field(body, 'author') || field(body, 'editor')).split(/\s+and\s+/)[0];
    const author = (first.includes(',') ? first.split(',')[0] : first.split(' ').pop() ?? '').trim();
    return [{ key: m[2], author, year: (field(body, 'year') || field(body, 'date')).slice(0, 4), title: field(body, 'title') }];
  });
}

export type Project = { mainFile: string; files: string[]; scans: TexScan[]; bib: BibEntry[] };
export const NO_PROJECT: Project = { mainFile: '', files: [], scans: [], bib: [] };

// each file's last text and what was made of it, so a rescan only scans what changed
const scanned = new Map<string, [src: string, scan: TexScan]>();
const bibScanned = new Map<string, [src: string, entries: BibEntry[]]>();

/**
 * Scans the main file and what it pulls in: \input, \include, \subfile and \import, and the project's own
 * .sty and .cls files, found as includedFile finds them. Then reads the .bib files it names (or, naming none that
 * exist, every .bib).
 * With follow, the labels of the documents \externaldocument names come too, with their prefix.
 */
export async function scanProject(mainFile: string, files: Set<string>, read: (path: string) => Promise<string>, follow = true): Promise<Project> {
  const dir = mainFile.slice(0, mainFile.lastIndexOf('/') + 1);
  const find = (name: string, ext: string) => includedFile(files, mainFile, name, ext);
  const scans: TexScan[] = [];
  const queue = [mainFile];
  const seen = new Set(queue);
  // the loop picks up what each file adds to the queue
  for (const path of queue) {
    if (!files.has(path)) continue;
    const src = await read(path).catch(() => '');
    const hit = scanned.get(path);
    const scan = hit?.[0] === src ? hit[1] : { ...scanTex(src), file: path };
    scanned.set(path, [src, scan]);
    scans.push(scan);
    for (const p of [...scan.inputs.map((n) => find(n, '.tex')), ...scan.packages.map((n) => find(n, '.sty')), ...scan.classes.map((n) => find(n, '.cls'))]) {
      if (p && !seen.has(p)) {
        seen.add(p);
        queue.push(p);
      }
    }
  }
  // xr reads name.aux from the document's folder. The other document's externals aren't followed, so two
  // documents that link each other can't loop; its packages and commands stay its own, only its labels come
  if (follow)
    for (const [prefix, name] of scans.flatMap((s) => s.externals)) {
      const target = normalise(dir + (/\.tex$/i.test(name) ? name : `${name}.tex`));
      if (target === mainFile || !files.has(target)) continue;
      const other = (await scanProject(target, files, read, false)).scans;
      for (const scan of other) seen.add(scan.file!);
      scans.push({ ...scanTex(''), labels: other.flatMap((s) => s.labels.map((label) => prefix + label)), file: target });
    }
  if (!follow) return { mainFile, files: [...files], scans, bib: [] };
  const named = scans.flatMap((s) => s.bibs.map((n) => find(n, '.bib'))).filter((p): p is string => !!p);
  const bibFiles = new Set(named.length ? named : [...files].filter((p) => /\.bib$/i.test(p)));
  const bib: BibEntry[] = [];
  for (const path of bibFiles) {
    const src = await read(path).catch(() => '');
    const hit = bibScanned.get(path);
    const entries = hit?.[0] === src ? hit[1] : parseBib(src);
    bibScanned.set(path, [src, entries]);
    bib.push(...entries);
  }
  // forget files the walk no longer reaches (another project's, a renamed one)
  for (const path of scanned.keys()) if (!seen.has(path)) scanned.delete(path);
  for (const path of bibScanned.keys()) if (!bibFiles.has(path)) bibScanned.delete(path);
  return { mainFile, files: [...files], scans, bib };
}
