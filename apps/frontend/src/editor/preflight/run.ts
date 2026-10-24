import { matchBrace, withoutComments } from '../../../../backend/src/latex/text.js';
import { lastPass, parseCompileLog, projectFile } from '../compileLog';
import { figureKind } from '../floats';
import { plainText, scanInsights } from '../insights';
import { CITE_COMMANDS, REF_COMMANDS, VERBATIM_ENVS } from '../latexContext';
import { INPUT_RE, externalDocuments, includedFile, inputName, scanTex } from '../latexEnvs';
import { scanTodos } from '../todos';

// Preflight: the checks Tools › Review runs over a document before it goes anywhere, from its last compile's log, the
// PDF that compile made, its source and the project's .bib entries. Pure (no DOM), so preflight.check.ts runs it in Node.

export type PreflightGroup = 'compile' | 'references' | 'privacy' | 'accessibility' | 'submission';
export type Severity = 'error' | 'warning' | 'info';
/** fixable: Fix with AI can do something about it in the source. */
export type Finding = { group: PreflightGroup; severity: Severity; message: string; file?: string; line?: number; page?: number; fixable?: boolean };

export const GROUPS: [PreflightGroup, string][] = [
  ['compile', 'Compile and layout'],
  ['references', 'References and assets'],
  ['privacy', 'Privacy and blind review'],
  ['accessibility', 'Accessibility'],
  ['submission', 'Submission readiness']
];

/** A page as pdfFacts.ts reads it, in points: its characters, those set under 6pt and whether text runs past its edge. */
export type PdfPage = { width: number; height: number; chars: number; smallChars: number; outside: boolean; text: string };
export type PdfFacts = {
  version: string;
  encrypted: boolean;
  title: string;
  author: string;
  lang: string;
  outline: boolean;
  tagged: boolean;
  /** Figure elements in a tagged PDF's structure without alternative text */
  figuresWithoutAlt: number;
  /** null: they couldn't be inspected */
  fonts: { name: string; embedded: boolean; type3: boolean }[] | null;
  pages: PdfPage[];
};

/** A .bib entry as GET /api/projects/:id/review/state?bib=1 gives it; fields: the names of those it has. */
export type BibRecord = { file: string; line: number; key: string; type: string; fields: string[]; doi?: string; title?: string; duplicateOf?: { key: string; file: string; by: string } };
/** One of TexLab's diagnostics as GET /api/projects/:id/diagnostics gives it, its lines counted from 1. */
export type Diagnostic = { line: number; col: number; endLine: number; endCol: number; severity: Severity; message: string; code?: string | number; source: string };

export type PreflightInput = {
  /** the document reviewed, and the project folder as its log names it */
  doc: string;
  root: string;
  /** every project file, with the text of those read (the document's own files, the .bib files and other text files) */
  files: { path: string; text?: string }[];
  /** the document's last compile log ('' for none), and whether that compile made no PDF */
  log: string;
  failed: boolean;
  /** null: the entries couldn't be read */
  bib: BibRecord[] | null;
  pdfFacts: PdfFacts | null;
  /** TexLab's, by project file, when it runs */
  diagnostics?: Record<string, Diagnostic[]>;
  /** Anonymous review: what names the authors counts too */
  anonymous: boolean;
};

const RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const quoted = (text: string, max = 80) => `“${text.length > max ? `${text.slice(0, max - 1)}…` : text}”`;
/** "a, b and 3 more" */
const listed = (items: string[], max = 5, and = 'and') =>
  items.length <= max ? items.slice(0, -1).join(', ') + (items.length > 1 ? ` ${and} ` : '') + items.slice(-1) : `${items.slice(0, max).join(', ')} and ${items.length - max} more`;

/** "1–3, 7 and 9" */
export function pageList(pages: number[]) {
  const runs: string[] = [];
  for (let i = 0; i < pages.length; i += 1) {
    let j = i;
    while (j + 1 < pages.length && pages[j + 1] === pages[j] + 1) j += 1;
    runs.push(j > i ? `${pages[i]}–${pages[j]}` : `${pages[i]}`);
    i = j;
  }
  return listed(runs, Infinity);
}

/** A path as the file tree names it: no "./" or "//", and "../" resolved. */
const normalise = (path: string) =>
  path
    .split('/')
    .reduce<string[]>((out, part) => (part === '..' ? out.slice(0, -1) : part && part !== '.' ? [...out, part] : out), [])
    .join('/');
const folderOf = (path: string) => path.slice(0, path.lastIndexOf('/') + 1);

/** The line of each offset in `text`, from 1. */
function lineFinder(text: string) {
  const breaks: number[] = [];
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) breaks.push(i);
  return (at: number) => {
    let lo = 0;
    let hi = breaks.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (breaks[mid] < at) lo = mid + 1;
      else hi = mid;
    }
    return lo + 1;
  };
}

// the code verbatim environments and \verb|…| show, which isn't LaTeX
const VERBATIM = new RegExp(
  String.raw`\\begin\s*\{(${[...VERBATIM_ENVS].map((env) => env.replace('*', '\\*')).join('|')})\}[\s\S]*?\\end\s*\{\1\}|\\verb\*?([^A-Za-z\s])[^\n]*?\2`,
  'g'
);
/** A source's code: its comments gone and what verbatim environments and \verb show blanked, its line breaks kept. */
const codeOf = (text: string) => withoutComments(text).replace(VERBATIM, (code) => code.replace(/[^\n]/g, ' '));

type Place = { file: string; line: number };
const LABEL = /\\label\s*\{([^{}]+)\}/g;
// a listing's or box's label in its options, such as \begin{lstlisting}[label={lst:a}]
const OPTION_LABEL = /\\(?:begin\s*\{(?:lstlisting|minted|tcolorbox)\}|lstinputlisting|inputminted)[^\n]*?\blabel\s*=\s*\{?([^,{}\]\s]+)/g;
// a command with up to two [optional] arguments before its first {argument}: \ref, \cite and their kin
const COMMAND_ARG = /\\([A-Za-z]+)\*?\s*(?:\[[^\]]*\]\s*){0,2}\{([^{}]*)\}/g;
const BIBITEM = /\\bibitem\s*(?:\[[^\]]*\]\s*)?\{([^{}]+)\}/g;
const GRAPHICS = /\\includegraphics\*?\s*(?:\[([^\]]*)\]\s*){0,2}\{([^{}]+)\}/g;
const GRAPHICSPATH = /\\graphicspath\s*\{((?:\s*\{[^{}]*\})+)\s*\}/g;
const HREF = /\\href\s*\{[^{}]*\}\s*\{([^{}]*)\}/g;
const VAGUE_LINK = /^(?:here|click here|this|this link|link|more|read more|see here)$/i;
const ABSOLUTE = /^(?:\/|[A-Za-z]:|~)/;
// the image types graphicx tries for a name without one, and those it reads as they are
const IMAGE_EXTS = ['.pdf', '.png', '.jpg', '.jpeg', '.mps', '.eps', '.jbig2', '.jb2'];
const IMAGE_FILE = /\.(?:pdf|png|jpe?g|mps|eps|ps|jbig2|jb2|svg|gif|tiff?|bmp|webp|heic|heif)$/i;

// what a project shouldn't carry to GitHub or an arXiv upload. Not .key: that's a Keynote deck.
const SECRET_FILE = /(?:^|\/)(?:\.env(?:\.[\w-]+)?|id_(?:rsa|dsa|ecdsa|ed25519)|[^/]+\.(?:pem|p12|pfx|jks|keystore)|\.netrc|\.npmrc|\.pypirc|credentials(?:\.json)?|service[-_]account[^/]*\.json)$/i;
const SECRETS: [RegExp, string][] = [
  [/-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/, 'a private key'],
  // a long-term (AKIA) or temporary (ASIA) key id
  [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/, 'an AWS access key'],
  [/\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/, 'a GitHub token'],
  [/\bglpat-[A-Za-z0-9_-]{20,}\b/, 'a GitLab token'],
  [/\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{32,}\b/, 'an API key'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}\b/, 'a Slack token'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, 'a Google API key']
];
// what names the authors besides \author
const AUTHOR_DETAILS = /\\(thanks|affiliation|email|orcid|institute|IEEEauthorblock[NA]|address)\b/g;
const ACKNOWLEDGEMENTS = /\\(?:section|subsection|chapter|paragraph)\*?\s*\{\s*Acknowledge?ments?\s*\}|\\begin\s*\{(?:acks|acknowledge?ments?)\}|\\acknowledge?ments?\b/gi;
const LEVELS = ['chapter', 'section', 'subsection', 'subsubsection'];
// the fields each type needs, in one of their forms
const REQUIRED: Record<string, string[][]> = {
  article: [['author'], ['title'], ['journal', 'journaltitle'], ['year', 'date']],
  inproceedings: [['author'], ['title'], ['booktitle'], ['year', 'date']],
  conference: [['author'], ['title'], ['booktitle'], ['year', 'date']],
  incollection: [['author'], ['title'], ['booktitle'], ['publisher'], ['year', 'date']],
  book: [['author', 'editor'], ['title'], ['publisher'], ['year', 'date']],
  phdthesis: [['author'], ['title'], ['school', 'institution'], ['year', 'date']],
  mastersthesis: [['author'], ['title'], ['school', 'institution'], ['year', 'date']],
  thesis: [['author'], ['title'], ['school', 'institution'], ['year', 'date']],
  techreport: [['author'], ['title'], ['institution'], ['year', 'date']],
  report: [['author'], ['title'], ['institution'], ['year', 'date']]
};
// documents that have no abstract
const NO_ABSTRACT = new Set(['beamer', 'letter', 'standalone', 'moderncv', 'tikzposter', 'a0poster', 'exam']);
const PAPER: [string, number, number][] = [
  ['A4', 595, 842],
  ['US Letter', 612, 792],
  ['A5', 420, 595],
  ['US Legal', 612, 1008],
  ['A3', 842, 1191]
];

/** A PDF pdf.js couldn't open for its password: nothing but that it's encrypted was read from it. */
const unreadable = (pdf: PdfFacts) => pdf.encrypted && !pdf.pages.length;

/** What a group can't check without the PDF or the log: "Compile first", and why. */
export function preflightGaps(input: Pick<PreflightInput, 'log' | 'failed' | 'pdfFacts' | 'anonymous'>): Partial<Record<PreflightGroup, string>> {
  const gaps: Partial<Record<PreflightGroup, string>> = {};
  // a failed compile's PDF, if there is one, is an older one's
  const first = input.failed ? 'The last compile made no PDF' : 'Compile first';
  if (!input.log) gaps.compile = 'Compile first.';
  else if (!input.pdfFacts) gaps.compile = `${first}: the page checks need a PDF.`;
  if (!input.pdfFacts) {
    gaps.accessibility = `${first}: most of these checks read the PDF.`;
    gaps.submission = `${first}: the PDF’s version, fonts and encryption need a PDF.`;
    if (input.anonymous) gaps.privacy = `${first}: the PDF’s Author field needs a PDF.`;
  } else if (unreadable(input.pdfFacts)) gaps.accessibility = 'The PDF is password-protected, so its accessibility couldn’t be read.';
  return gaps;
}

/** Every check of every group, errors first within each group. */
export function runPreflight(input: PreflightInput): Finding[] {
  const { doc, pdfFacts: pdf } = input;
  const found: Finding[] = [];
  // a second of the same finding (two \hl on one line, a token twice on one) says nothing more, and would share its
  // row's id in Review, so Dismiss would hide both
  const seenFindings = new Set<string>();
  const add = (finding: Finding) => {
    const id = JSON.stringify([finding.group, finding.severity, finding.message, finding.file, finding.line, finding.page]);
    if (!seenFindings.has(id)) found.push(finding);
    seenFindings.add(id);
  };
  const paths = input.files.map((f) => f.path);
  const pathSet = new Set(paths);
  const folded = new Map(paths.map((p) => [p.toLowerCase(), p]));
  const texts = new Map(input.files.flatMap((f) => (f.text === undefined ? [] : [[f.path, f.text] as [string, string]])));
  // the project file a name means, as the compile looks for it; folded: one that differs only in letter case, which
  // compiles here but not on a case-sensitive system
  const lookup = (candidates: string[]) => {
    for (const c of candidates) if (pathSet.has(c)) return { path: c };
    for (const c of candidates) if (folded.has(c.toLowerCase())) return { folded: folded.get(c.toLowerCase())! };
    return {};
  };
  const texFile = (from: string, name: string) => lookup([folderOf(from) + name, name].map(normalise).flatMap((base) => (/\.tex$/i.test(base) ? [base] : [`${base}.tex`, base])));
  /** The files a document reads, \input by \input from it, each once. */
  const documentFiles = (from: string) => {
    const out: string[] = [];
    const visit = (path: string) => {
      if (out.includes(path) || !texts.has(path)) return;
      out.push(path);
      for (const name of scanTex(texts.get(path)!).inputs) {
        const hit = texFile(from, name);
        if (hit.path ?? hit.folded) visit((hit.path ?? hit.folded)!);
      }
    };
    visit(from);
    return out;
  };
  const docFiles = documentFiles(doc);
  const sources = docFiles.map((path) => ({ path, text: texts.get(path)! }));
  const scans = sources.map((s) => scanTex(s.text));
  const classes = new Set(scans.flatMap((s) => s.classes));

  // ─── what the source holds ───
  const labels = new Map<string, Place[]>();
  const refs: (Place & { key: string })[] = [];
  const cites: (Place & { key: string })[] = [];
  const images: (Place & { name: string; options: string })[] = [];
  const included: (Place & { name: string; command: string })[] = [];
  const bibitems = new Set<string>();
  const graphicsDirs = [''];
  let citesAll = false;
  for (const { path, text } of sources) {
    const code = codeOf(text);
    const lineOf = lineFinder(code);
    // a key with a # in it is a \newcommand's argument, not a label, citation or image of the document's
    const label = (key: string, at: number) => {
      if (!key.includes('#')) labels.set(key, [...(labels.get(key) ?? []), { file: path, line: lineOf(at) }]);
    };
    for (const m of code.matchAll(LABEL)) label(m[1].trim(), m.index!);
    // the options are blanked in code with the listing they open, and have the same length in withoutComments' text
    for (const m of withoutComments(text).matchAll(OPTION_LABEL)) label(m[1].trim(), m.index!);
    for (const m of code.matchAll(COMMAND_ARG)) {
      const list = REF_COMMANDS.test(m[1]) ? refs : CITE_COMMANDS.test(m[1]) ? cites : null;
      if (!list) continue;
      for (const key of m[2].split(',').map((k) => k.trim())) {
        if (key === '*' && list === cites) citesAll = true;
        else if (key && !key.includes('#')) list.push({ key, file: path, line: lineOf(m.index!) });
      }
    }
    for (const m of code.matchAll(BIBITEM)) bibitems.add(m[1].trim());
    for (const m of code.matchAll(GRAPHICSPATH)) graphicsDirs.push(...[...m[1].matchAll(/\{([^{}]*)\}/g)].map((d) => d[1].trim()));
    for (const m of code.matchAll(GRAPHICS)) if (!m[2].includes('#')) images.push({ name: m[2].trim(), options: m[1] ?? '', file: path, line: lineOf(m.index!) });
    for (const m of code.matchAll(INPUT_RE)) included.push({ name: inputName(m), command: m[0].match(/\\(\w+)/)![1], file: path, line: lineOf(m.index!) });
  }
  // the labels of the documents \externaldocument links, with their prefix
  for (const { text } of sources) {
    const prefixes = scanTex(text).externals.map(([prefix]) => prefix);
    externalDocuments(doc, text).forEach((other, i) => {
      for (const file of documentFiles(other))
        for (const key of scanTex(texts.get(file)!).labels) if (!labels.has(prefixes[i] + key)) labels.set(prefixes[i] + key, [{ file, line: 0 }]);
    });
  }
  const insights = scanInsights(sources, doc);

  const imageFile = (name: string) =>
    lookup(
      graphicsDirs.flatMap((dir) =>
        [folderOf(doc) + dir + name, dir + name].map(normalise).flatMap((base) => (/\.[A-Za-z0-9]+$/.test(base) && IMAGE_FILE.test(base) ? [base] : IMAGE_EXTS.map((ext) => base + ext)))
      )
    );

  // A compile that made its PDF says in its log what TeX found, in the project or in the TeX tree (a TEXMFHOME image, a
  // central .bib through BIBINPUTS): an image it used, and citations it resolved
  const clean = input.log && !input.failed ? lastPass(input.log).join('\n') : '';
  const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const texFound = (image: string) =>
    !!clean &&
    !new RegExp(`File \`${escaped(image)}' not found`).test(clean) &&
    new RegExp(`^File: (?:\\S*/)?${escaped(image.split('/').pop()!)}(?:\\.[A-Za-z0-9]+)? Graphic file`, 'm').test(clean);
  const unresolved = { citations: new Set<string>(), references: new Set<string>() };
  const noDatabase = /I couldn't open database file|ERROR - Cannot find '[^']*'/.test(clean);

  // ─── Compile and layout ───
  if (input.log) {
    const group = 'compile';
    if (input.failed) add({ group, severity: 'error', message: 'The last compile failed and made no PDF.', fixable: true });
    const parsed = parseCompileLog(input.log, input.root).map((e) => (e.file ? { ...e, file: projectFile(e.file, doc, paths) } : e));
    let rerun = false;
    for (const e of parsed) {
      const where = { ...(e.file && { file: e.file }), ...(e.line && { line: e.line }) };
      if (e.severity === 'error') {
        add({ group, severity: 'error', message: e.message, ...where, fixable: true });
        continue;
      }
      const box = /^Overfull \\([hv])box \((\d+(?:\.\d+)?)pt too (?:wide|high)\)/.exec(e.message);
      const missing = /^(Citation|Reference) [`'‘]([^'’]+)['’] on page \S+ undefined/.exec(e.message);
      if (box) {
        const pt = Math.round(Number(box[2]) * 10) / 10;
        add({ group, severity: pt >= 1 ? 'warning' : 'info', message: box[1] === 'h' ? `A line runs ${pt}pt past the margin` : `A page’s content is ${pt}pt too tall`, ...where, fixable: true });
      } else if (missing) {
        unresolved[missing[1] === 'Citation' ? 'citations' : 'references'].add(missing[2]);
      } else if (/Rerun to get|rerun LaTeX|Please rerun|Label\(s\) may have changed/i.test(e.message)) rerun = true;
    }
    const keys = [...unresolved.citations, ...unresolved.references];
    if (keys.length) {
      const what = [unresolved.citations.size && plural(unresolved.citations.size, 'citation'), unresolved.references.size && plural(unresolved.references.size, 'reference')].filter(Boolean).join(' and ');
      // the page in the PDF that shows them: the log's "on page N" is the printed number, which a title page or roman
      // front matter puts out of step with the PDF's own
      const shown = pdf ? pdf.pages.findIndex((p) => p.text.includes('??')) : -1;
      add({ group, severity: 'warning', message: `The PDF shows ?? for ${what} the last compile couldn’t resolve: ${listed(keys)}`, ...(shown >= 0 && { page: shown + 1 }) });
    }
    if (rerun) add({ group, severity: 'warning', message: 'The last compile still needed another pass, so references or the contents may be out of date. Compile again.' });
    const glyphs = new Map<string, { char: string; font: string; n: number }>();
    const destinations = new Set<string>();
    for (const line of lastPass(input.log)) {
      const glyph = /^Missing character: There is no (.+?) in font (.+?)!/.exec(line);
      const known = glyph && glyphs.get(glyph[0]);
      if (known) known.n += 1;
      else if (glyph) glyphs.set(glyph[0], { char: glyph[1], font: glyph[2], n: 1 });
      const dest = /destination with the same identifier \((?:name\{)?([^)}]*)\}?\)/.exec(line);
      if (dest) destinations.add(dest[1]);
    }
    for (const { char, font, n } of glyphs.values()) {
      add({ group, severity: 'warning', message: `The font ${font.replace(/^\[|\].*$/g, '')} has no ${char}, so it’s missing from the PDF${n > 1 ? ` (${n} times)` : ''}`, fixable: true });
    }
    for (const id of destinations) add({ group, severity: 'warning', message: `Two places in the PDF share the link target ${id}, so a link may go to the wrong one`, fixable: true });
  }
  if (pdf) {
    const sizes = new Map<string, number[]>();
    pdf.pages.forEach((p, i) => {
      const [short, long] = [p.width, p.height].map(Math.round).sort((a, b) => a - b);
      sizes.set(`${short} × ${long}`, [...(sizes.get(`${short} × ${long}`) ?? []), i + 1]);
    });
    if (sizes.size > 1) {
      const named = (size: string) => {
        const [short, long] = size.split(' × ').map(Number);
        const paper = PAPER.find(([, w, h]) => Math.abs(w - short) <= 2 && Math.abs(h - long) <= 2);
        return paper ? `${paper[0]} (${size} pt)` : `${size} pt`;
      };
      const [common, ...odd] = [...sizes].sort((a, b) => b[1].length - a[1].length);
      for (const [size, pages] of odd)
        add({ group: 'compile', severity: 'warning', message: `${pages.length === 1 ? 'Page' : 'Pages'} ${pageList(pages)} ${pages.length === 1 ? 'is' : 'are'} ${named(size)}, unlike the rest, which are ${named(common[0])}`, page: pages[0] });
    }
    const outside = pdf.pages.flatMap((p, i) => (p.outside ? [i + 1] : []));
    for (const page of outside.slice(0, 20)) add({ group: 'compile', severity: 'warning', message: `Text runs past the edge of page ${page}`, page, fixable: true });
  }

  // ─── References and assets ───
  {
    const group = 'references';
    // the .bib files the document names, or every one when it names none that exist
    const named = new Set(scans.flatMap((s) => s.bibs.map((n) => includedFile(pathSet, doc, n, '.bib'))).filter(Boolean) as string[]);
    const entries = input.bib?.filter((e) => !named.size || named.has(e.file)) ?? [];
    const keys = new Set([...entries.map((e) => e.key), ...bibitems]);
    // after a compile that made its PDF, a key the project lacks is missing only if the log says so too
    const unfound = (key?: string) => !clean || noDatabase || (key === undefined ? unresolved.citations.size > 0 : unresolved.citations.has(key));
    if (input.bib && cites.length && !keys.size) {
      if (unfound()) add({ group, severity: 'error', message: 'The document cites sources but has no bibliography: no .bib file and no thebibliography', ...cites[0] });
    } else if (input.bib) {
      const seen = new Set<string>();
      for (const c of cites)
        if (!keys.has(c.key) && !seen.has(c.key) && unfound(c.key)) {
          seen.add(c.key);
          add({ group, severity: 'warning', message: `No bibliography entry has the key ${quoted(c.key)}`, file: c.file, line: c.line, fixable: true });
        }
    }
    const seenRefs = new Set<string>();
    for (const r of refs)
      if (!labels.has(r.key) && !seenRefs.has(r.key)) {
        seenRefs.add(r.key);
        add({ group, severity: 'warning', message: `Nothing has the label ${quoted(r.key)}`, file: r.file, line: r.line, fixable: true });
      }
    for (const [key, places] of labels)
      if (places.length > 1) add({ group, severity: 'warning', message: `The label ${quoted(key)} is used ${places.length} times (first at ${places[0].file}:${places[0].line}), so references go to the last one`, ...places[1], fixable: true });
    const byKey = new Map<string, BibRecord>();
    for (const e of entries) {
      const first = byKey.get(e.key);
      if (first) add({ group, severity: 'warning', message: `The key ${quoted(e.key)} is in the bibliography twice (first at ${first.file}:${first.line})`, file: e.file, line: e.line, fixable: true });
      else byKey.set(e.key, e);
      if (e.duplicateOf) add({ group, severity: 'warning', message: `${quoted(e.key)} looks like the same work as ${quoted(e.duplicateOf.key)} (same ${e.duplicateOf.by})`, file: e.file, line: e.line, fixable: true });
      const lacking = (REQUIRED[e.type] ?? []).filter((forms) => !forms.some((f) => e.fields.includes(f))).map((forms) => forms[0]);
      if (lacking.length) add({ group, severity: 'warning', message: `The ${e.type} entry ${quoted(e.key)} has no ${listed(lacking, Infinity, 'or')}`, file: e.file, line: e.line });
      if (e.doi && !/^10\.\d{4,9}\/\S+$/.test(e.doi.trim().replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i, ''))) add({ group, severity: 'warning', message: `The DOI of ${quoted(e.key)} doesn’t look like one (10.xxxx/…)`, file: e.file, line: e.line });
    }
    if (cites.length && !citesAll) {
      const cited = new Set(cites.map((c) => c.key));
      const unused = new Map<string, BibRecord[]>();
      for (const e of byKey.values()) if (!cited.has(e.key)) unused.set(e.file, [...(unused.get(e.file) ?? []), e]);
      for (const [file, list] of unused)
        add({ group, severity: 'info', message: `${plural(list.length, 'entry', 'entries')} in ${file} ${list.length === 1 ? 'is' : 'are'} never cited: ${listed(list.map((e) => e.key))}`, file, line: list[0].line });
    }
    for (const image of images)
      if (!Object.keys(imageFile(image.name)).length && !texFound(image.name)) add({ group, severity: 'error', message: `Can’t find the image ${quoted(image.name)}`, file: image.file, line: image.line });
    const referenced = new Set(refs.map((r) => r.key));
    for (const [kind, rows] of [['Figure', insights.figures], ['Table', insights.tables]] as const)
      for (const row of rows) {
        // one in a \newcommand's body, labelled by its argument
        if (row.label?.includes('#')) continue;
        const name = row.text ? `${kind} ${quoted(row.text, 50)}` : `A ${kind.toLowerCase()} without a caption`;
        if (!row.label) add({ group, severity: 'info', message: `${name} has no \\label, so the text can’t refer to it`, file: row.file, line: row.line, fixable: true });
        else if (!referenced.has(row.label)) add({ group, severity: 'info', message: `${name} is never referred to in the text`, file: row.file, line: row.line, fixable: true });
      }
    // TexLab's undefined and duplicate labels and citations and its .bib syntax errors, those the scan above missed
    for (const file of new Set([...docFiles, ...entries.map((e) => e.file)]))
      for (const d of input.diagnostics?.[file] ?? []) {
        const kind = String(d.code ?? '');
        if (kind ? !/^(?:undefined|duplicate)-|^bib-syntax$/.test(kind) : !/undefined|duplicate/i.test(d.message)) continue;
        // what the diagnostic is about, such as the key
        const token = d.endLine === d.line ? texts.get(file)?.split('\n')[d.line - 1]?.slice(d.col - 1, d.endCol - 1).trim() : '';
        if (found.some((f) => f.group === group && ((f.file === file && f.line === d.line) || (token && f.message.includes(quoted(token)))))) continue;
        const syntax = kind === 'bib-syntax';
        add({ group, severity: syntax ? 'error' : 'warning', message: `${d.message}${token && !syntax ? `: ${quoted(token)}` : ''} (TexLab)`, file, line: d.line, fixable: true });
      }
  }

  // ─── Privacy and blind review ───
  {
    const group = 'privacy';
    for (const path of paths) if (SECRET_FILE.test(path)) add({ group, severity: 'warning', message: `${path} looks like it holds a key or password, and goes wherever the project goes (GitHub, an arXiv upload)` });
    for (const { path, text } of input.files) {
      if (text === undefined) continue;
      const lineOf = lineFinder(text);
      for (const [pattern, what] of SECRETS) {
        const all = new RegExp(pattern.source, 'g');
        for (const m of text.matchAll(all)) add({ group, severity: 'error', message: `This line holds what looks like ${what}`, file: path, line: lineOf(m.index!), fixable: true });
      }
    }
    for (const todo of scanTodos(sources)) {
      const comment = /^(?:TODO|FIXME|XXX)$/.test(todo.kind);
      add({ group, severity: comment ? 'info' : 'warning', message: comment ? `${todo.kind} comment: ${quoted(todo.text)}` : `A \\${todo.kind} note is left in: ${quoted(todo.text)}`, file: todo.file, line: todo.line });
    }
    for (const { path, text } of sources) {
      const code = codeOf(text);
      const lineOf = lineFinder(code);
      for (const m of code.matchAll(/\\hl\s*\{/g)) add({ group, severity: 'warning', message: 'Highlighted text (\\hl) is left in', file: path, line: lineOf(m.index!), fixable: true });
    }
    if (input.anonymous) {
      // a class's anonymous option leaves the authors out itself, and so does a venue style's review option
      const hidden = sources.some(({ text }) =>
        /\\documentclass\s*\[[^\]]*\banonymous\b|\\usepackage\s*\[[^\]]*\breview\b[^\]]*\]\s*\{(?:cvpr|iccv|eccv|acl)\}/.test(withoutComments(text))
      );
      for (const { path, text } of hidden ? [] : sources) {
        const code = codeOf(text);
        const lineOf = lineFinder(code);
        for (const m of code.matchAll(/\\author\s*(?:\[[^\]]*\]\s*)?\{/g)) {
          const open = m.index! + m[0].length - 1;
          const names = plainText(code.slice(open + 1, Math.max(open + 1, matchBrace(code, open))));
          if (names && !/^anonymous/i.test(names)) add({ group, severity: 'warning', message: `\\author names the authors: ${quoted(names, 60)}`, file: path, line: lineOf(m.index!), fixable: true });
        }
        const details = new Set<string>();
        for (const m of code.matchAll(AUTHOR_DETAILS)) {
          if (details.has(m[1])) continue;
          details.add(m[1]);
          add({ group, severity: 'warning', message: `\\${m[1]} can identify the authors`, file: path, line: lineOf(m.index!), fixable: true });
        }
        for (const m of code.matchAll(ACKNOWLEDGEMENTS)) add({ group, severity: 'warning', message: 'The acknowledgements can identify the authors', file: path, line: lineOf(m.index!), fixable: true });
      }
      const author = pdf?.author.trim();
      if (author && !/^anonymous/i.test(author)) add({ group, severity: 'warning', message: `The PDF’s Author field says ${quoted(author, 60)}`, fixable: true });
    }
  }

  // ─── Accessibility ───
  {
    const group = 'accessibility';
    // a password-protected PDF pdf.js couldn't open has nothing read from it to go on (preflightGaps says so)
    if (pdf && !unreadable(pdf)) {
      if (!pdf.title.trim()) add({ group, severity: 'warning', message: 'The PDF has no title in its properties, so readers and screen readers show its file name', fixable: true });
      if (!pdf.lang.trim()) add({ group, severity: 'warning', message: 'The PDF doesn’t say what language it’s in, so a screen reader may read it in the wrong one', fixable: true });
      if (!pdf.tagged) add({ group, severity: 'warning', message: 'The PDF isn’t tagged, so screen readers can’t follow its headings, lists and figures', fixable: true });
      else if (pdf.figuresWithoutAlt) add({ group, severity: 'warning', message: `${plural(pdf.figuresWithoutAlt, 'figure')} in the PDF’s tags ${pdf.figuresWithoutAlt === 1 ? 'has' : 'have'} no alternative text`, fixable: true });
      const chars = pdf.pages.reduce((n, p) => n + p.chars, 0);
      const small = pdf.pages.reduce((n, p) => n + p.smallChars, 0);
      if (chars && small / chars > 0.02) {
        const pages = pdf.pages.flatMap((p, i) => (p.smallChars ? [i + 1] : []));
        add({ group, severity: 'warning', message: `${Math.round((small / chars) * 100)}% of the text is smaller than 6pt (${pages.length === 1 ? 'page' : 'pages'} ${pageList(pages.slice(0, 12))}${pages.length > 12 ? ' and more' : ''})`, page: pages[0] });
      }
      if (!pdf.outline && insights.headings.length >= 2) add({ group, severity: 'warning', message: 'The PDF has no bookmarks, so readers can’t jump between its sections', fixable: true });
      const blank = pdf.pages.flatMap((p, i) => (p.chars ? [] : [i + 1]));
      if (blank.length)
        add({ group, severity: 'warning', message: `${blank.length === 1 ? 'Page' : 'Pages'} ${pageList(blank)} ${blank.length === 1 ? 'has' : 'have'} no text a screen reader can read`, page: blank[0] });
    }
    for (const image of images)
      if (!/(?:^|,)\s*alt\s*=/.test(image.options)) add({ group, severity: 'info', message: `The image ${quoted(image.name, 50)} has no alt text`, file: image.file, line: image.line, fixable: true });
    const headings = insights.headings.filter((h) => h.level !== undefined);
    for (let i = 1; i < headings.length; i += 1) {
      const [before, now] = [headings[i - 1].level!, headings[i].level!];
      if (now > before + 1)
        add({ group, severity: 'warning', message: `${quoted(headings[i].text, 50)} jumps from a ${LEVELS[before]} to a ${LEVELS[now]}`, file: headings[i].file, line: headings[i].line, fixable: true });
    }
    for (const { path, text } of sources) {
      const code = codeOf(text);
      const lineOf = lineFinder(code);
      for (const m of code.matchAll(HREF)) if (VAGUE_LINK.test(plainText(m[1]))) add({ group, severity: 'info', message: `The link text ${quoted(plainText(m[1]))} doesn’t say where it goes`, file: path, line: lineOf(m.index!), fixable: true });
    }
  }

  // ─── Submission readiness ───
  {
    const group = 'submission';
    if (pdf) {
      if (Number(pdf.version) > 1.7) add({ group, severity: 'info', message: `The PDF is version ${pdf.version}. Some submission systems only take PDF 1.4 to 1.7.` });
      if (pdf.encrypted) add({ group, severity: 'error', message: 'The PDF is encrypted, and submission systems refuse encrypted PDFs.' });
      if (!pdf.fonts) add({ group, severity: 'info', message: 'Couldn’t check whether the PDF’s fonts are embedded.' });
      const font = (name: string) => name.replace(/^[A-Z]{6}\+/, '') || 'without a name';
      for (const name of new Set(pdf.fonts?.filter((f) => !f.embedded).map((f) => font(f.name)))) add({ group, severity: 'error', message: `The font ${name} isn’t embedded in the PDF` });
      for (const name of new Set(pdf.fonts?.filter((f) => f.type3).map((f) => font(f.name))))
        add({ group, severity: 'warning', message: `The font ${name} is a Type 3 font, often a bitmap, which some venues (such as IEEE) refuse` });
    }
    const used = new Set<string>();
    for (const inc of included) {
      if (ABSOLUTE.test(inc.name)) add({ group, severity: 'error', message: `\\${inc.command}{${inc.name}} uses an absolute path, which only works on this computer`, file: inc.file, line: inc.line, fixable: true });
      const hit = texFile(doc, inc.name);
      if (hit.folded) add({ group, severity: 'error', message: `${quoted(inc.name)} only matches ${hit.folded} when letter case is ignored, so case-sensitive systems such as arXiv won’t find it`, file: inc.file, line: inc.line, fixable: true });
      if (hit.path) used.add(hit.path);
    }
    for (const image of images) {
      if (ABSOLUTE.test(image.name)) add({ group, severity: 'error', message: `The image ${quoted(image.name, 60)} has an absolute path, which only works on this computer`, file: image.file, line: image.line, fixable: true });
      const hit = imageFile(image.name);
      if (hit.folded) add({ group, severity: 'error', message: `${quoted(image.name)} only matches ${hit.folded} when letter case is ignored, so case-sensitive systems such as arXiv won’t find it`, file: image.file, line: image.line, fixable: true });
      const path = hit.path ?? hit.folded;
      if (!path) continue;
      used.add(path);
      if (figureKind(path, '') === 'convert') add({ group, severity: 'warning', message: `${path} is a .${path.split('.').pop()!.toLowerCase()} image, which pdfLaTeX can’t include. Convert it to PNG or PDF.`, file: image.file, line: image.line });
    }
    for (const path of new Set([...docFiles, ...used].filter((p) => /[^A-Za-z0-9._/-]/.test(p))))
      add({ group, severity: 'warning', message: `The file name ${path} has spaces or other characters some systems handle badly` });
    // a paper's: one with a title (a CV or a letter has none), and as notes, reports and theses go without, a note
    const titled = sources.some(({ text }) => /\\maketitle\b|\\begin\s*\{titlepage\}/.test(codeOf(text)));
    if (titled && ![...classes].some((c) => NO_ABSTRACT.has(c))) {
      const abstract = insights.metadata.abstract || sources.some(({ text }) => /\\(?:chapter|section)\*?\s*\{\s*Abstract\s*\}/i.test(codeOf(text)));
      if (!abstract) add({ group, severity: 'info', message: 'The document has no abstract' });
      if (!insights.metadata.keywords.length) add({ group, severity: 'info', message: 'The document has no keywords' });
    }
  }

  return GROUPS.flatMap(([group]) => found.filter((f) => f.group === group).sort((a, b) => RANK[a.severity] - RANK[b.severity]));
}
