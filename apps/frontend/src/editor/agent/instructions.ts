// AGENTS.md, the user's own file of standing instructions for agents in one project: the starter Spectrum offers, and
// a line the Spectrum agent suggested added to it when the user says so. The backend (agentInstructions.js) decides
// whether the file reaches a prompt; nothing here writes it but on the user's click.

export const INSTRUCTIONS_FILE = 'AGENTS.md';
/** What a prompt takes of the file (the backend's MAX_INSTRUCTIONS): a line that would take it past this is not added */
export const MAX_INSTRUCTIONS = 20000;
const REMEMBERED = '## Remembered';

const rule = (line: string) => line.replace(/^\s*[-*]\s+/, '').trim();

/** Whether the file already holds the line, as a list item or as it is. */
export const hasInstruction = (text: string, line: string) => text.split(/\r?\n/).some((l) => rule(l) === line.trim());

/**
 * The file's text with the line added as an item under “## Remembered”, a section made at the end when there is
 * none, so what an agent suggested is told apart from what the user wrote. Throws when the file would grow past what
 * an agent is given.
 */
export function withInstruction(text: string, line: string) {
  const item = `- ${line.trim().replace(/\s*[\r\n]+\s*/g, ' ')}`;
  if (text.length + item.length + REMEMBERED.length + 4 > MAX_INSTRUCTIONS) throw new Error(`${INSTRUCTIONS_FILE} is at its limit of ${MAX_INSTRUCTIONS.toLocaleString('en-AU')} characters. Shorten it first.`);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const head = lines.findIndex((l) => l.trim() === REMEMBERED);
  if (head < 0) return [text.replace(/\s+$/, ''), ...(text.trim() ? [''] : []), REMEMBERED, '', item, ''].join(eol).replace(/^(\r?\n)+/, '');
  // after the section's last line that says something, before the next heading
  let end = lines.findIndex((l, i) => i > head && /^#{1,6}\s/.test(l));
  if (end < 0) end = lines.length;
  let at = end;
  while (at > head + 1 && !lines[at - 1].trim()) at -= 1;
  lines.splice(at, 0, ...(at === head + 1 ? ['', item] : [item]), ...(at === lines.length ? [''] : []));
  return lines.join(eol);
}

/** The file Spectrum offers to start from: what the project is, and a few rules for the user to make their own. */
export const starterInstructions = ({ mainFile, language }: { mainFile: string; language: string }) => `# Instructions for agents

Agents that work on this project read this file as your standing instructions. Keep it short, one rule a line, and change the examples to your own.

## Project

- ${mainFile ? `Main file: ${mainFile} (${language})` : `Language: ${language}`}

## Rules

- Spelling: Australian English.
- Change only what a task asks for, and keep the document’s own commands, packages and style.
- Do not change the files in figures/ or diagrams/.
`;
