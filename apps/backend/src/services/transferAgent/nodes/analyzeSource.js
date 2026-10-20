import path from 'path';
import { getProjectRoot } from '../../projectService.js';
import { listFilesRecursive } from '../../../utils/fsUtils.js';
import { inlineInputs, parseSectionOutline } from '../../../utils/texUtils.js';

/**
 * Collect asset references from LaTeX content.
 */
function collectAssets(content, allFiles) {
  const assets = { bib: [], images: [], styles: [], other: [] };

  // Collect \bibliography{} and \addbibresource{}
  const bibPattern = /\\(?:bibliography|addbibresource)\{([^}]+)\}/g;
  let match;
  while ((match = bibPattern.exec(content)) !== null) {
    const refs = match[1].split(',').map(r => r.trim());
    for (let ref of refs) {
      if (!path.extname(ref)) ref += '.bib';
      assets.bib.push(ref);
    }
  }

  // \graphicspath{{figs/}{img/}}: more folders \includegraphics looks in
  const graphicsPath = content.match(/\\graphicspath\s*\{((?:\s*\{[^}]*\})+)\s*\}/);
  assets.graphicsPaths = graphicsPath ? [...graphicsPath[1].matchAll(/\{([^}]*)\}/g)].map((m) => m[1].trim()).filter(Boolean) : [];

  // Collect \includegraphics paths
  const imgPattern = /\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g;
  while ((match = imgPattern.exec(content)) !== null) {
    assets.images.push(match[1].trim());
  }

  // Collect .sty/.cls/.bst from file listing
  for (const f of allFiles) {
    const ext = path.extname(f.path).toLowerCase();
    if (['.sty', '.cls', '.bst'].includes(ext)) {
      assets.styles.push(f.path);
    }
  }

  return assets;
}

/**
 * analyzeSource node — reads source project, resolves inputs,
 * parses outline, collects assets.
 */
export async function analyzeSource(state) {
  const projectRoot = await getProjectRoot(state.sourceProjectId);
  const allFiles = await listFilesRecursive(projectRoot);

  // Resolve all \input/\include and get full content
  const fullContent = await inlineInputs(projectRoot, state.sourceMainFile);
  const outline = parseSectionOutline(fullContent);
  const assets = collectAssets(fullContent, allFiles);

  return {
    sourceProjectRoot: projectRoot,
    sourceOutline: outline,
    sourceFullContent: fullContent,
    sourceAssets: assets,
    progressLog: `Read the source: ${outline.length} sections, ${assets.bib.length} .bib files, ${assets.images.length} images.`,
  };
}
