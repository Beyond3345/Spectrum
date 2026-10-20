import { promises as fs } from 'fs';
import path from 'path';
import { runCompile } from '../../compileService.js';
import { getProjectRoot } from '../../projectService.js';
import { transferDir } from '../../parsers/index.js';
import { ensureDir } from '../../../utils/fsUtils.js';
import { inlineInputs } from '../../../utils/texUtils.js';

/**
 * compileSource node — compiles the source project to PDF
 * for the parser to read. Skips if sourcePdfPath is already set
 * (e.g. user uploaded a PDF directly).
 */
export async function compileSource(state) {
  const sourceProjectRoot = state.sourceProjectId ? await getProjectRoot(state.sourceProjectId) : undefined;
  const sourceFullContent = sourceProjectRoot && state.sourceMainFile ? await inlineInputs(sourceProjectRoot, state.sourceMainFile) : undefined;

  // If user uploaded a PDF directly, skip compilation
  if (state.sourcePdfPath) {
    return {
      sourceProjectRoot,
      sourceFullContent,
      progressLog: 'Using the uploaded PDF.',
    };
  }
  if (!state.sourceProjectId || !state.sourceMainFile) {
    throw new Error('No source PDF available. Upload a PDF first or provide sourceProjectId + sourceMainFile.');
  }

  const result = await runCompile({
    projectId: state.sourceProjectId,
    mainFile: state.sourceMainFile,
    engine: state.engine,
  });

  if (!result.ok || result.status !== 0 || !result.pdf) {
    throw new Error(
      `Source compilation failed: ${result.error || result.log || 'unknown error'}`
    );
  }

  // runCompile returns the PDF as base64; the parser reads it from a file
  const tmpDir = transferDir(await getProjectRoot(state.targetProjectId));
  await ensureDir(tmpDir);
  const pdfPath = path.join(tmpDir, 'source.pdf');
  await fs.writeFile(pdfPath, Buffer.from(result.pdf, 'base64'));

  return {
    sourcePdfPath: pdfPath,
    sourceProjectRoot,
    sourceFullContent,
    progressLog: 'Compiled the source project to PDF.',
  };
}
