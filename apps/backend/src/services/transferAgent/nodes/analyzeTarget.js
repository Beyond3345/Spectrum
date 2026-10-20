import { getProjectRoot } from '../../projectService.js';
import { inlineInputs, parseSectionOutline } from '../../../utils/texUtils.js';

/**
 * Extract preamble (everything before \begin{document}).
 */
function extractPreamble(content) {
  const marker = '\\begin{document}';
  const idx = content.indexOf(marker);
  if (idx === -1) return content;
  return content.slice(0, idx).trim();
}

/**
 * analyzeTarget node — reads target template project,
 * extracts preamble, outline, and full template content.
 */
export async function analyzeTarget(state) {
  const projectRoot = await getProjectRoot(state.targetProjectId);

  const fullContent = await inlineInputs(projectRoot, state.targetMainFile);
  const preamble = extractPreamble(fullContent);
  const outline = parseSectionOutline(fullContent);

  return {
    targetProjectRoot: projectRoot,
    targetOutline: outline,
    targetPreamble: preamble,
    targetTemplateContent: fullContent,
    progressLog: `Read the new template: ${outline.length} sections.`,
  };
}
