import path from 'path';
import { parsePdf as readPdf, transferDir } from '../../parsers/index.js';
import { getProjectRoot } from '../../projectService.js';

/**
 * parsePdf node — the parser chosen in Settings turns the source PDF
 * into Markdown + images.
 */
export async function parsePdf(state) {
  const targetProjectRoot = state.targetProjectRoot || await getProjectRoot(state.targetProjectId);
  const outputDir = path.join(transferDir(targetProjectRoot), 'output');
  const { markdownContent, images } = await readPdf(state.sourcePdfPath, state.parserConfig, outputDir);

  return {
    sourceMarkdown: markdownContent,
    sourceImages: images,
    targetProjectRoot,
    progressLog: `${state.parserConfig.name} read the PDF and found ${images.length} ${images.length === 1 ? 'image' : 'images'}.`,
  };
}
