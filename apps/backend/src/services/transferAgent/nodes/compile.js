import { runCompile } from '../../compileService.js';

/** A PDF alone isn't enough: LaTeX also makes one when figures are missing or commands fail. */
export const compiledCleanly = (result) => Boolean(result?.ok && result.status === 0);

/**
 * compile node — runs LaTeX compilation on the target project
 * and increments the compile attempt counter.
 */
export async function compile(state) {
  const result = await runCompile({
    projectId: state.targetProjectId,
    mainFile: state.targetMainFile,
    engine: state.engine,
  });

  const attempt = (state.compileAttempt || 0) + 1;

  return {
    compileResult: result,
    compileAttempt: attempt,
    progressLog: `Compile attempt ${attempt}: ${compiledCleanly(result) ? 'succeeded' : 'failed'}.`,
  };
}
