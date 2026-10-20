import { promises as fs } from 'fs';
import { createLLM } from '../../llmService.js';
import { safeJoin } from '../../../utils/pathUtils.js';
import { writeFileWithSnapshot, stripCodeFences } from '../utils.js';
import { preserveDocumentMetadata } from '../../../utils/texUtils.js';

/**
 * Build the LLM prompt for content migration.
 */
function buildTransferPrompt(state) {
  const planJson = JSON.stringify(state.transferPlan, null, 2);
  return `You are a LaTeX template migration expert.

TASK: Migrate the source paper content into the target template structure.

MIGRATION PLAN:
${planJson}

TARGET TEMPLATE (full):
${state.targetTemplateContent}

SOURCE CONTENT (full):
${state.sourceFullContent}

RULES:
1. Keep the target class, packages and layout. Replace template placeholder title, author and date with the SOURCE document's details, preserving their spelling. Never put those declarations after \\begin{document}.
2. Migrate the document body; preserve its actual title and author names, not the template's sample names. Match PDF title/author properties to the source.
3. Follow the section mapping in the migration plan
4. Preserve ALL \\cite{}, \\ref{}, \\label{} commands from the source
5. Preserve ALL figure, table, algorithm environments from the source
6. Adapt section/subsection commands to match the target template style
7. Do NOT add any content that doesn't exist in the source
8. Do NOT remove any substantive content from the source
9. Keep every source citation key. Bibliography files are copied and connected automatically after this step. For biblatex, use \\printbibliography in the body; \\addbibresource belongs in the preamble. Never replace source references with template samples.
10. Output the COMPLETE .tex file content, not just the body

Output ONLY the complete LaTeX file content. No explanations, no markdown fences.`;
}

/**
 * Build the LLM prompt for a PDF transfer (the parser's Markdown → LaTeX).
 */
function buildPdfTransferPrompt(state) {
  const imageList = (state.sourceImages || [])
    .map(img => img.name)
    .join(', ');

  return `You are a LaTeX template filling expert.

TASK: Fill the following Markdown content (extracted from a PDF) into the target LaTeX template.

## MARKDOWN CONTENT (from PDF parsing):
${state.sourceMarkdown}

## TARGET TEMPLATE (complete .tex file):
${state.targetTemplateContent}

## IMAGE FILES AVAILABLE:
${imageList || '(none)'}

## RULES:
1. Keep the target class, packages and layout. Replace placeholder title, author and date with details from the source PDF. Never invent missing names or dates, and keep these declarations before \\begin{document}.
2. Fill the document body and match the PDF title/author properties to the actual source, not the template's sample names.
3. Map Markdown headings to the corresponding \\section{}, \\subsection{} etc. in the template
4. Formulas in the Markdown are already in LaTeX format ($...$ or $$...$$) — preserve them as-is
5. Convert HTML tables in the Markdown to LaTeX \\begin{tabular} environments
6. For images referenced in the Markdown, use \\includegraphics{images/<filename>} wrapped in \\begin{figure}...\\end{figure}
7. Preserve ALL text content — do not omit any paragraphs or sections
8. Do NOT add content that doesn't exist in the Markdown
9. Output the COMPLETE .tex file content, not just the body

Output ONLY the complete LaTeX file content. No explanations, no markdown fences.`;
}

/**
 * Legacy mode: LLM migrates LaTeX source into target template.
 */
async function applyTransferLegacy(state) {

  const llm = createLLM(state.llmConfig);

  const prompt = buildTransferPrompt(state);
  const response = await llm.invoke([{ role: 'user', content: prompt }]);
  const newContent = preserveDocumentMetadata(stripCodeFences(response.content), state.sourceFullContent);

  await writeFileWithSnapshot(
    state.targetProjectRoot,
    state.targetMainFile,
    newContent,
    state.jobId
  );

  return {
    progressLog: `Wrote the converted paper into ${state.targetMainFile}.`,
  };
}

/**
 * PDF mode: LLM fills the parser's Markdown into the target template.
 */
async function applyTransferPdf(state) {

  const llm = createLLM(state.llmConfig);

  const prompt = buildPdfTransferPrompt(state);
  const response = await llm.invoke([{ role: 'user', content: prompt }]);
  const newContent = preserveDocumentMetadata(stripCodeFences(response.content), state.sourceFullContent);

  await writeFileWithSnapshot(
    state.targetProjectRoot,
    state.targetMainFile,
    newContent,
    state.jobId
  );

  return {
    progressLog: `Wrote the converted paper into ${state.targetMainFile}.`,
  };
}

/**
 * applyTransfer node — dispatches to legacy or PDF mode.
 */
export async function applyTransfer(state) {
  if (state.transferMode === 'pdf') {
    return applyTransferPdf(state);
  }
  return applyTransferLegacy(state);
}
