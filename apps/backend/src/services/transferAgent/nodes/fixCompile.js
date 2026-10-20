import { promises as fs } from 'fs';
import { createLLM } from '../../llmService.js';
import { safeJoin } from '../../../utils/pathUtils.js';
import { writeFileWithSnapshot, stripCodeFences } from '../utils.js';
import { bibliographyFiles, preserveDocumentMetadata, withBiblatexResources } from '../../../utils/texUtils.js';

const MAX_LOG_TAIL = 8000;

/**
 * fixCompile node — LLM reads current main.tex + compile log,
 * fixes compilation errors, writes back the corrected file.
 */
export async function fixCompile(state) {
  const absMain = safeJoin(state.targetProjectRoot, state.targetMainFile);
  const currentTex = await fs.readFile(absMain, 'utf8');

  const log = (state.compileResult?.log || '').slice(-MAX_LOG_TAIL);

  const llm = createLLM(state.llmConfig);

  const prompt = `You are a LaTeX compilation error fixer.

The following LaTeX file failed to compile. Fix the errors and return the corrected COMPLETE file.

COMPILE LOG (last ${MAX_LOG_TAIL} chars):
${log}

CURRENT FILE (${state.targetMainFile}):
${currentTex}

Common fixes:
- Missing packages: add \\usepackage{...} in preamble
- Undefined commands: replace with standard alternatives or define them
- Mismatched braces: fix bracket/brace pairing
- Missing files: correct file paths; never remove citations or bibliography resources to hide an error
- Encoding issues: ensure UTF-8 compatibility

Output ONLY the complete corrected LaTeX file. No explanations, no markdown fences.`;

  const response = await llm.invoke([{ role: 'user', content: prompt }]);
  const fixed = preserveDocumentMetadata(withBiblatexResources(stripCodeFences(response.content), bibliographyFiles(currentTex)), currentTex);

  await writeFileWithSnapshot(
    state.targetProjectRoot,
    state.targetMainFile,
    fixed,
    state.jobId
  );

  return {
    progressLog: 'Asked the model to fix the compile errors.',
  };
}
