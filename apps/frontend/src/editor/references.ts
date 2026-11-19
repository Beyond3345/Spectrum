import { includedPath } from './outlines';

/**
 * After a file or folder is renamed or moved in the file tree: the references in the project's LaTeX, Typst and
 * Markdown that named it, rewritten to its new path. Only exact matches: a path that resolves to the old one as the
 * compiler reads it (LaTeX from the project folder, Typst and Markdown from the file that writes it, Typst's "/…" from
 * the project folder), never a guess through \graphicspath or a search path. A moved Typst or Markdown file's own
 * relative paths are rewritten too, so they still reach what they named.
 */
export interface ReferenceEdit {
  /** the file's path after the move */
  path: string;
  before: string;
  after: string;
  /** each change, as "old → new" */
  changes: string[];
}

const LATEX = /\\(input|include|subfile|includegraphics|includesvg|includepdf|addbibresource|bibliography|lstinputlisting|verbatiminput)\*?\s*(?:\[[^\]\n]*\]\s*)?\{([^{}\n]+)\}/g;
// #include "x", #import "x": …, and the functions that read a file: image("x"), read("x"), bibliography("x") …
const TYPST = /(#?\b(?:include|import)\s+|\b(?:image|read|bibliography|csv|json|yaml|toml|xml|cbor)\s*\(\s*)"([^"\n]+)"/g;
// ![alt](path) and [text](path), or (<path>)
const MARKDOWN = /(!?\[[^\]\n]*\]\()(<[^>\n]+>|[^)\s]+)/g;

/** the extensions LaTeX tries for a name written without one, in its order */
const LATEX_EXTS: Record<string, string[]> = {
  input: ['.tex'],
  include: ['.tex'],
  subfile: ['.tex'],
  bibliography: ['.bib'],
  includegraphics: ['.pdf', '.png', '.jpg', '.jpeg', '.eps', '.svg'],
  includesvg: ['.svg']
};

const extOf = (path: string) => path.match(/\.[^./]+$/)?.[0] ?? '';
const dirOf = (path: string) => path.split('/').slice(0, -1).join('/');

/** target, written relative to the folder dir */
export function relativePath(dir: string, target: string) {
  const from = dir ? dir.split('/') : [];
  const to = target.split('/');
  let same = 0;
  while (same < from.length && same < to.length - 1 && from[same] === to[same]) same++;
  return [...from.slice(same).map(() => '..'), ...to.slice(same)].join('/');
}

/**
 * The edits for moving `from` (a file, or a folder and all inside it) to `to`. files: each LaTeX, Typst and Markdown
 * file's text by its path after the move; all: every file's path after the move, to tell when a name written without
 * its extension could be more than one file.
 */
export function referenceEdits(files: ReadonlyMap<string, string>, from: string, to: string, all: ReadonlySet<string>): ReferenceEdit[] {
  const moved = (p: string) => (p === from ? to : p.startsWith(`${from}/`) ? to + p.slice(from.length) : null);
  const back = (p: string) => (p === to ? from : p.startsWith(`${to}/`) ? from + p.slice(to.length) : p);
  const edits: ReferenceEdit[] = [];
  for (const [path, before] of files) {
    const was = back(path);
    const changes: string[] = [];
    const swap = (written: string, next: string) => {
      if (next !== written) changes.push(`${written} → ${next}`);
      return next;
    };
    let after = before;
    if (/\.(tex|ltx)$/i.test(path)) {
      after = before.replace(LATEX, (match, command: string, arg: string) => {
        const names = command === 'bibliography' ? arg.split(',') : [arg];
        const rewritten = names.map((raw) => {
          const name = raw.trim();
          if (!name || /^[a-z]+:|^\/|[\\#]/i.test(name)) return raw;
          let spelt = moved(name) !== null ? name : null;
          if (spelt === null && !extOf(name)) {
            // written without its extension: exact only when the moved file is the one name it could be
            const exts = LATEX_EXTS[command] ?? [];
            const hits = exts.filter((ext) => moved(name + ext) !== null);
            if (hits.length === 1 && !exts.some((ext) => ext !== hits[0] && all.has(name + ext))) spelt = name + hits[0];
          }
          if (spelt === null) return raw;
          const target = moved(spelt)!;
          const bare = spelt !== name && extOf(target) === extOf(spelt);
          return raw.replace(name, swap(name, bare ? target.slice(0, -extOf(target).length) : target));
        });
        return `${match.slice(0, match.lastIndexOf('{'))}{${rewritten.join(',')}}`;
      });
    } else if (/\.(typ|md|markdown)$/i.test(path)) {
      const typst = /\.typ$/i.test(path);
      after = before.replace(typst ? TYPST : MARKDOWN, (match, lead: string, written: string) => {
        const angled = !typst && written.startsWith('<');
        const name = angled ? written.slice(1, -1) : written;
        // a Markdown link's #part or ?query stays as it is
        const [, bare, suffix] = typst ? [name, name, ''] : name.match(/^([^#?]*)(.*)$/)!;
        if (!bare || bare.startsWith('@') || /^[a-z][a-z0-9+.-]*:|^\/\//i.test(bare) || (!typst && bare.startsWith('/'))) return match;
        const absolute = bare.startsWith('/');
        const old = absolute ? includedPath('', bare) : includedPath(was, bare);
        const target = moved(old) ?? old;
        // the path written still reaches the file from where the writer now is
        if ((absolute ? includedPath('', bare) : includedPath(path, bare)) === target) return match;
        const out = swap(bare, absolute ? `/${target}` : relativePath(dirOf(path), target)) + suffix;
        return typst ? `${lead}"${out}"` : lead + (angled ? `<${out}>` : out);
      });
    }
    if (after !== before) edits.push({ path, before, after, changes });
  }
  return edits;
}
