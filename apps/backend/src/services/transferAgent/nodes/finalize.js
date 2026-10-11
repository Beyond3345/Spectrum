import { compiledCleanly } from './compile.js';

/**
 * finalize node — sets final status and collects results.
 */
export async function finalize(state) {
  const hasPdf = !!state.compileResult?.pdf;

  const finalStatus = compiledCleanly(state.compileResult) && hasPdf ? 'success' : 'failed';
  const error = finalStatus === 'success'
    ? undefined
    : !hasPdf
      ? (state.compileResult?.error || 'No PDF was produced after all attempts.')
      : 'The converted paper still has LaTeX errors. Open it and check Logs.';
  const attempts = state.compileAttempt || 0;

  return {
    status: finalStatus,
    finalPdf: state.compileResult?.pdf || '',
    error,
    progressLog: finalStatus === 'success'
      ? `Done after ${attempts} compile ${attempts === 1 ? 'attempt' : 'attempts'}.`
      : `No clean compile after ${attempts} ${attempts === 1 ? 'attempt' : 'attempts'}.`,
  };
}
