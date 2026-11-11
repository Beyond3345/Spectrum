import { withoutComments } from '../../../backend/src/latex/text.js';
import type { JyutpingOptions } from '../api/client';

/** The package's defaults (xjyutping-tex README, Options), which aren't stored. */
export const JYUTPING_DEFAULTS: Required<JyutpingOptions> = {
  ratio: '0.45',
  vsep: '1.05em',
  hsep: '0.15em plus 0.4em',
  width: 'auto',
  font: '\\normalfont',
  format: '',
  multiple: '',
  fancy: false,
  lazy: false,
  script: 'auto',
  linebreak: false,
  align: 'justify',
  debug: false
};

/** Only the options that differ from the defaults, text trimmed and an empty one dropped. */
export function cleanOptions(options: JyutpingOptions): JyutpingOptions {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(options)) {
    const v = typeof value === 'string' ? value.trim() : value;
    if (v === '' || v === undefined || v === JYUTPING_DEFAULTS[key as keyof JyutpingOptions]) continue;
    out[key] = v;
  }
  return out as JyutpingOptions;
}

/** The document loads xjyutping, outside a comment. */
export const loadsXjyutping = (text: string) => /\\usepackage\s*(\[[^\]]*\])?\s*\{[^}]*\bxjyutping\b[^}]*\}/.test(withoutComments(text));

/**
 * The selection from..to in a jyutpingscope, \begin and \end on lines of their own (the selection's own line breaks
 * at either end kept outside), or in \xjyutping*{…}. cursor: where the cursor goes after, inside when it was empty.
 */
export function jyutpingWrap(doc: string, from: number, to: number, kind: 'scope' | 'star') {
  const text = doc.slice(from, to);
  if (kind === 'star') return { from, to, insert: `\\xjyutping*{${text}}`, cursor: from + (text ? text.length + 13 : 12) };
  const body = text.replace(/^\n+|\n+$/g, '');
  const start = from + text.length - text.replace(/^\n+/, '').length;
  const end = to - (text.length - text.replace(/\n+$/, '').length);
  const before = start > 0 && doc[start - 1] !== '\n' ? '\n' : '';
  const after = end < doc.length && doc[end] !== '\n' ? '\n' : '';
  const insert = `${before}\\begin{jyutpingscope}\n${body}\n\\end{jyutpingscope}${after}`;
  const cursor = start + (body ? insert.length - after.length : before.length + '\\begin{jyutpingscope}\n'.length);
  return { from: start, to: end, insert, cursor };
}
