// Self-check for the Local agents tab's instruction files card. Run:
// npx esbuild apps/frontend/src/editor/agent/instructionCard.check.ts --bundle --platform=node --log-level=warning | node
import { instructionCard } from './instructionCard';
import type { InstructionFile } from '../../api/client';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const names: Record<string, string> = { claude: 'Claude Agent', copilot: 'GitHub Copilot CLI', cursor: 'Cursor', hermes: 'Hermes', gemini: 'Gemini CLI', pi: 'Pi', codex: 'Codex' };
const nameOf = (id: string) => names[id] || id;
const file = (path: string, readBy: string[], state: InstructionFile['state']): InstructionFile => ({ path, hash: path, readBy, state });
// a project with several kinds, as the backend lists them
const files = [
  file('.cursor/rules/style.mdc', ['cursor', 'hermes'], 'ask'),
  file('.github/copilot-instructions.md', ['copilot'], 'left'),
  file('.pi/SYSTEM.md', ['pi'], 'allowed'),
  file('AGENTS.md', ['spectrum', 'codex', 'claude'], 'ask'),
  file('CLAUDE.md', ['claude', 'copilot', 'cursor'], 'ask'),
  file('GEMINI.md', ['gemini', 'copilot'], 'ask')
];

const card = instructionCard(files, 'review', nameOf)!;
eq(card.rows.map((r) => r.path), ['.cursor/rules/style.mdc', '.github/copilot-instructions.md', 'AGENTS.md', 'CLAUDE.md', 'GEMINI.md'], 'every file not allowed is listed, an allowed one is not');
eq(card.asking.map((r) => r.path), ['.cursor/rules/style.mdc', 'AGENTS.md', 'CLAUDE.md', 'GEMINI.md'], 'those left out by choice wait for nothing');
eq(card.summary, '5 instruction files left out of the agent’s copy · 4 new', 'the summary counts them');
eq(card.rows.map((r) => r.by), [
  'Read by Cursor and Hermes',
  'Read by GitHub Copilot CLI',
  'Read by the Spectrum agent, Codex and Claude Agent',
  'Read by Claude Agent, GitHub Copilot CLI and Cursor',
  'Read by Gemini CLI and GitHub Copilot CLI'
], 'each with the agents that read it, no Oxford comma');
eq(instructionCard(files.map((f) => ({ ...f, state: f.state === 'ask' ? 'left' : f.state })), 'review', nameOf)!.summary, '5 instruction files left out of the agent’s copy', 'no “new” once all are chosen');
eq(instructionCard([file('CLAUDE.md', ['claude'], 'ask')], 'review', nameOf)!.summary, '1 instruction file left out of the agent’s copy', 'one file');

// a direct session can't leave them out: it says the agent can read them
const direct = instructionCard(files, 'direct', nameOf)!;
eq(direct.summary, 'The agent can read 5 instruction files you haven’t allowed', 'direct summary');
eq(/works in your project’s folder/.test(direct.note), true, 'direct note');

eq(instructionCard([file('CLAUDE.md', ['claude'], 'allowed')], 'review', nameOf), null, 'no card when all are allowed');
eq(instructionCard([], 'direct', nameOf), null, 'or there are none');

console.log('instructionCard: all checks passed');
