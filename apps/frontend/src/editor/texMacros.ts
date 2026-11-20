import { matchBrace } from '../../../backend/src/latex/text.js';

// A document's own maths commands, for KaTeX's macros: what \newcommand, \renewcommand, \providecommand,
// \DeclareRobustCommand, \def, \DeclareMathOperator and mathtools' \DeclarePairedDelimiter define, by name.

const NAME = String.raw`(?:\{\s*(\\[A-Za-z]+)\s*\}|(\\[A-Za-z]+)(?![@A-Za-z]))`;
// [n] and an [optional] first argument's default, which KaTeX's macros can't take
const DEFINERS = new RegExp(
  String.raw`\\(?:(?:(?:re)?newcommand|providecommand|DeclareRobustCommand)\*?\s*${NAME}\s*(?:\[(\d)\]\s*)?(\[)?|[gex]?def\s*(\\[A-Za-z]+)((?:#\d)*)|DeclareMathOperator(\*?)\s*${NAME}|DeclarePairedDelimiter\s*${NAME})\s*\{`,
  'g'
);

/** The braced group that starts at `open` (a {), or null when it doesn't close. */
function group(src: string, open: number) {
  const end = matchBrace(src, open);
  return end < 0 ? null : { text: src.slice(open + 1, end), end };
}

/**
 * The commands src defines (comments already out), as KaTeX macros: \name → its body, with #1… for its arguments.
 * One whose first argument is optional ([n][default]) is left out, so a use of it shows no preview rather than a
 * wrong one; an operator becomes \operatorname, a paired delimiter \mathopen…#1\mathclose…. Later ones win.
 */
export function texMacros(src: string): Record<string, string> {
  const macros: Record<string, string> = {};
  for (const m of src.matchAll(DEFINERS)) {
    const open = (m.index ?? 0) + m[0].length - 1;
    const body = group(src, open);
    if (!body) continue;
    if (m[1] || m[2]) {
      if (!m[4]) macros[m[1] ?? m[2]] = body.text;
    } else if (m[5]) macros[m[5]] = body.text;
    else if (m[8] || m[9]) macros[m[8] ?? m[9]] = `\\operatorname${m[7]}{${body.text}}`;
    else if (m[10] || m[11]) {
      // \DeclarePairedDelimiter\abs{\lvert}{\rvert}: the second group follows the first
      const close = /^\s*\{/.exec(src.slice(body.end + 1));
      const right = close && group(src, body.end + close[0].length);
      if (right) macros[m[10] ?? m[11]] = `\\mathopen{${body.text}}#1\\mathclose{${right.text}}`;
    }
  }
  return macros;
}
