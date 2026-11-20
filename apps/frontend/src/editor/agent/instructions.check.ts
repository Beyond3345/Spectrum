// Self-check for AGENTS.md's starter. Run:
// npx esbuild apps/frontend/src/editor/agent/instructions.check.ts --bundle --platform=node --log-level=warning | node
import { starterInstructions } from './instructions';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const starter = starterInstructions({ mainFile: 'paper/main.typ', language: 'Typst' });
eq(/^# Instructions for agents\n/.test(starter) && starter.includes('- Main file: paper/main.typ (Typst)\n'), true, 'the starter names the main file and its language');
eq(starterInstructions({ mainFile: '', language: 'LaTeX' }).includes('- Language: LaTeX\n'), true, 'or the language alone');
eq(starter.length < 700, true, 'and is short');

console.log('instructions: all checks passed');
