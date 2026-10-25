import type { TexlabDiagnostic } from '../../api/client';
import { VERBATIM_ENVS, texContext } from '../latexContext';

// the TexLab findings the syntax check before compiling stops for; an undefined reference or citation never does
const SYNTAX_ERRORS = new Set(['unexpected-brace', 'missing-brace', 'mismatched-environment']);
// TexLab 5.26 takes a lone } in these for one too many, even those the bridge names to it as verbatim
const CODE_ENVS = [...VERBATIM_ENVS, 'BVerbatim', 'LVerbatim', 'SaveVerbatim', 'VerbatimOut', 'filecontents', 'filecontents*', 'tcblisting'];
// and in the project's own: \lstnewenvironment's, tcolorbox's and fancyvrb's, and minted's <lang>code
const CODE_DEFINER = /\\(?:lstnewenvironment|(?:re)?newtcblisting|(?:New|Renew|Provide|Declare)TCBListing|(?:Define|Recustom)VerbatimEnvironment)\*?\s*(?:\[[^\]]*\]\s*)?\{\s*([^{}\s]+)\s*\}|\\newminted\s*(?:\[\s*([^\]\s]*)\s*\]\s*)?\{\s*([^{}\s]+)\s*\}/g;
// TexLab 5.26 knows only \verb|…| as inline code, so a brace in \verb+…+, \Verb, \lstinline or \mintinline reads to it as
// one too many, or one left open, which it marks at the end of the file. ponytail: comments aren't left out (blanking
// them would cut \verb|%d| short), so such code in a comment can spare a file's missing brace
const INLINE_CODE = /\\(?:[vV]erb\*?|lstinline(?:\[[^\]\n]*\])?|mintinline(?:\[[^\]\n]*\])?\{[^{}\n]*\})([^A-Za-z\s{])[^\n]*?\1|\\(?:lstinline(?:\[[^\]\n]*\])?|mintinline(?:\[[^\]\n]*\])?\{[^{}\n]*\})\{[^}\n]*\}/g;
const braces = (code: string, brace: string) => code.replace(/\\./g, '').split(brace).length - 1;

/**
 * TexLab's brace and environment errors in the document's files (texts: their text), less the ones code makes: a
 * brace in inline code TexLab doesn't know (a missing one only when some inline code opens more than it closes), and a
 * lone } in a verbatim-like environment.
 */
export function syntaxErrors(files: string[], found: Record<string, TexlabDiagnostic[]>, texts: ReadonlyMap<string, string>) {
  const codeEnvs = new Set(CODE_ENVS);
  for (const text of texts.values())
    for (const m of text.matchAll(CODE_DEFINER)) {
      const env = m[1] ?? (m[2] || `${m[3]}code`);
      codeEnvs.add(env).add(`${env}*`);
    }
  return files.flatMap((file) => {
    const text = texts.get(file) ?? '';
    const starts = [0];
    for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
    const spans = [...text.matchAll(INLINE_CODE)].map((m) => ({ from: m.index!, to: m.index! + m[0].length, open: braces(m[0], '{') > braces(m[0], '}') }));
    const offset = (d: TexlabDiagnostic) => (starts[d.line - 1] ?? text.length) + d.col - 1;
    const inCode = (d: TexlabDiagnostic) => {
      const at = offset(d);
      return spans.some((s) => s.from <= at && at < s.to) || texContext(text, at).openEnvs.some((env) => codeEnvs.has(env));
    };
    return (found[file] ?? [])
      .filter((d) => d.severity === 'error' && SYNTAX_ERRORS.has(d.code ?? ''))
      .filter((d) => (d.code === 'missing-brace' ? !spans.some((s) => s.open) : d.code !== 'unexpected-brace' || !inCode(d)))
      .map((d) => ({ ...d, file }));
  });
}
