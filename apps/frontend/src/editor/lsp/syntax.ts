import type { TexlabDiagnostic } from '../../api/client';
import { VERBATIM_ENVS, texContext } from '../latexContext';

// the TexLab findings the syntax check before compiling stops for; an undefined reference or citation never does
const SYNTAX_ERRORS = new Set(['unexpected-brace', 'missing-brace', 'mismatched-environment']);
// TexLab 5.26 knows only \verb|…| as inline code, so a brace in \verb+…+, \verb*|…|, \lstinline or \mintinline reads to
// it as one left open, which it marks at the end of the file rather than where the brace is
const INLINE_CODE = /\\(?:verb(?:\*|[^|a-zA-Z*])|lstinline|mintinline)/;

/**
 * TexLab's brace and environment errors in the document's files (texts: their text), less the ones code makes: a
 * missing brace in a file with inline code TexLab doesn't know, and a lone } in a verbatim, lstlisting or minted
 * environment, which TexLab 5.26 takes for one too many.
 */
export function syntaxErrors(files: string[], found: Record<string, TexlabDiagnostic[]>, texts: ReadonlyMap<string, string>) {
  return files.flatMap((file) => {
    const text = texts.get(file) ?? '';
    const starts = [0];
    for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
    const inCode = (d: TexlabDiagnostic) => texContext(text, (starts[d.line - 1] ?? text.length) + d.col - 1).openEnvs.some((env) => VERBATIM_ENVS.has(env));
    return (found[file] ?? [])
      .filter((d) => d.severity === 'error' && SYNTAX_ERRORS.has(d.code ?? ''))
      .filter((d) => (d.code === 'missing-brace' ? !INLINE_CODE.test(text) : d.code !== 'unexpected-brace' || !inCode(d)))
      .map((d) => ({ ...d, file }));
  });
}
