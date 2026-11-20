// A Markdown document's ```mermaid blocks, drawn with the composer's Mermaid before a compile, so pandoc puts each in
// as a picture (crossref.lua finds it by the same key). Nothing is fetched: Mermaid is the one Spectrum ships, with
// the composer's settings (no HTML labels, no diagram CSS).
import { saveMermaid } from '../api/client';
import type { CompileDiagnostic } from '../api/client';
import { errorText } from './shared';

/** Each fenced block whose info is mermaid (```mermaid or ```{.mermaid …}): its code and the line of its fence. */
export function mermaidBlocks(text: string) {
  const lines = text.split(/\r?\n/);
  const blocks: { code: string; line: number }[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const open = /^\s*(`{3,}|~{3,})(.*)$/.exec(lines[i]);
    if (!open) continue;
    const [, fence, info] = open;
    let end = i + 1;
    while (end < lines.length && !new RegExp(`^\\s*${fence[0] === '`' ? '`' : '~'}{${fence.length},}\\s*$`).test(lines[end])) end += 1;
    if (/^\s*(?:mermaid\b|\{[^}]*\.mermaid\b[^}]*\})/.test(info)) blocks.push({ code: lines.slice(i + 1, end).join('\n'), line: i + 1 });
    i = end;
  }
  return blocks;
}

/** A block's key: its code with each run of whitespace one space, as pandoc's tabs and indents may differ. */
export const mermaidKey = (code: string) => code.replace(/[ \t\n\v\f\r]+/g, ' ').replace(/^ | $/g, '');

async function sha1(text: string) {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const base64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^[^,]*,/, ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/**
 * Draws the blocks of `file`'s text that have no picture in the project yet, one request each, and returns a warning
 * at the block for each that Mermaid could not draw.
 */
export async function drawMermaid(projectId: string, file: string, text: string): Promise<CompileDiagnostic[]> {
  const blocks = mermaidBlocks(text);
  if (!blocks.length) return [];
  const keyed = await Promise.all(blocks.map(async (block) => ({ ...block, hash: await sha1(mermaidKey(block.code)) })));
  const { missing } = await saveMermaid(projectId, [...new Set(keyed.map((block) => block.hash))]);
  if (!missing.length) return [];
  // Mermaid itself loads only when there is something to draw
  const { renderMermaid, svgToPng } = await import('../diagram/modes/mermaid/render');
  const problems: CompileDiagnostic[] = [];
  for (const hash of missing) {
    const block = keyed.find((b) => b.hash === hash)!;
    try {
      const png = await svgToPng(await renderMermaid(block.code));
      await saveMermaid(projectId, [], { [hash]: await base64(png) });
    } catch (err) {
      problems.push({ severity: 'warning', message: `Mermaid couldn’t draw this diagram: ${errorText(err)}`, file, line: block.line, column: 1 });
    }
  }
  return problems;
}
