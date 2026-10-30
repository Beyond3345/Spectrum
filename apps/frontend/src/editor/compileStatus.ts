// What a running compile is doing, from its output so far, for the line over its live output. Neither Tectonic nor
// MiKTeX knows how many files it will download, so the line counts the ones so far rather than showing a percentage.

const TOOLS: Record<string, string> = {
  biber: 'Biber',
  bibtex: 'BibTeX',
  makeindex: 'MakeIndex',
  makeglossaries: 'makeglossaries',
  xdvipdfmx: 'xdvipdfmx',
  pdflatex: 'pdfLaTeX',
  xelatex: 'XeLaTeX',
  lualatex: 'LuaLaTeX'
};
const tool = (name: string) => TOOLS[name.toLowerCase()] ?? name;
const files = (count: number) => `${count} ${count === 1 ? 'file' : 'files'}`;

/** The status line: “Downloading latex.ltx… (37 files so far)”, “Running pdfLaTeX, pass 2: reading article.cls”. */
export function compileStatus(engine: string, output: string) {
  return engine === 'tectonic' ? tectonicStatus(output) : texStatus(output);
}

/** Tectonic's, from its latest note: “Running TeX”, “Running Biber”. */
function tectonicStatus(output: string) {
  const notes = (output.match(/^note: .*$/gm) ?? []).map((note) => note.slice(6).trim().replace(/\s*\.\.\.$/, ''));
  const last = notes[notes.length - 1];
  if (!last) return 'Starting…';
  const downloading = /^downloading (.+)$/.exec(last);
  if (downloading) return `Downloading ${downloading[1]}… (${files(notes.filter((note) => note.startsWith('downloading ')).length)} so far)`;
  if (/^Rerunning TeX\b/.test(last)) return 'Running TeX again';
  if (/^Running TeX\b/.test(last)) return 'Running TeX';
  const ran = /^Running (?:external tool )?(\S+)/.exec(last)?.[1];
  if (ran) return `Running ${tool(ran)}`;
  if (/^Writing\b/.test(last)) return 'Writing the PDF';
  return last.charAt(0).toUpperCase() + last.slice(1);
}

// Each program's first line, and latexmk's before each rule it runs
const TEX_BANNER = /^This is (pdfTeX|XeTeX|LuaHBTeX|LuaTeX|e-TeX|TeX), Version/;
const MARKS: [RegExp, (m: RegExpExecArray) => string][] = [
  [TEX_BANNER, () => ''],
  [/^This is BibTeX\b/, () => 'Running BibTeX'],
  [/^INFO - This is Biber\b/, () => 'Running Biber'],
  [/^This is makeindex\b/, () => 'Running MakeIndex'],
  [/^makeglossaries(?:\.lua)? version\b/, () => 'Running makeglossaries'],
  [/^Run number (\d+) of rule '(\S+?)[\s']/, (m) => `Running ${tool(m[2])} (run ${m[1]})`],
  // MiKTeX installing a missing package as TeX asks for it
  [/^starting package maintenance\b/, () => 'MiKTeX is installing packages…'],
  [/^downloading \S*\/miktex-zzdb\S*/, () => 'MiKTeX is reading its package list…'],
  [/^(?:downloading \S*\/|extracting files from )([^/\s]+)\.tar\.lzma/, (m) => `MiKTeX is installing ${m[1]}…`],
  // the rule under its messages, after which TeX carries on
  [/^={40,}$/, () => '']
];
const TEX_NAMES: Record<string, string> = { pdfTeX: 'pdfLaTeX', XeTeX: 'XeLaTeX', LuaHBTeX: 'LuaLaTeX', LuaTeX: 'LuaLaTeX' };
// TeX opens a file with “(path” (MiKTeX may quote it); only names with a TeX file's extension count
const OPENED = /\("?((?:[A-Za-z]:)?[^()"\n]*?\.(?:tex|sty|cls|clo|cfg|def|fd|ltx|bbl|aux|toc|lof|lot|ind|gls|nav|out|lbx|bbx|cbx|dbx))"?(?=[\s()"]|$)/g;
// a page shipped out: “[1]”, “[2{…pdftex.map}]”, “[3 <./figure.pdf>]”
const PAGE = /(?:^|[\s)\]])\[\d+(?=[\s{<\]]|$)/gm;

/** pdfLaTeX's, XeLaTeX's, LuaLaTeX's and latexmk's, from the latest program to start and, in a TeX pass, what it's reading. */
function texStatus(output: string) {
  // TeX breaks its lines at 79 characters, paths too
  const lines = output.replace(/^(.{79})\r?\n/gm, '$1').split(/\r?\n/);
  let last = -1;
  let status = 'Starting…';
  let passes = 0;
  let engine = 'TeX';
  lines.forEach((line, at) => {
    for (const [mark, say] of MARKS) {
      const m = mark.exec(line);
      if (!m) continue;
      const banner = TEX_BANNER.exec(line);
      if (banner) {
        passes++;
        engine = TEX_NAMES[banner[1]] ?? 'TeX';
      }
      last = at;
      status = say(m);
      break;
    }
  });
  if (status) return status;
  // in a TeX pass: the file it opened last, and the pages it has written
  const pass = lines.slice(last).join('\n');
  const opened = [...pass.matchAll(OPENED)];
  const pages = [...pass.matchAll(PAGE)];
  const file = opened[opened.length - 1];
  const page = pages[pages.length - 1];
  const written = `${pages.length} ${pages.length === 1 ? 'page' : 'pages'} so far`;
  const doing = file && (!page || file.index! > page.index!)
    ? `reading ${file[1].split(/[\\/]/).pop()}${pages.length ? `, ${written}` : ''}`
    : page ? written : 'starting';
  return `Running ${engine}, pass ${passes}: ${doing}`;
}
