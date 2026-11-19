// Self-check for AGENTS.md's starter and the lines added to it. Run:
// npx esbuild apps/frontend/src/editor/agent/instructions.check.ts --bundle --platform=node --log-level=warning | node
import { MAX_INSTRUCTIONS, hasInstruction, starterInstructions, withInstruction } from './instructions';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const throws = (fn: () => unknown, pattern: RegExp, what: string) => {
  try {
    fn();
  } catch (err) {
    if (pattern.test((err as Error).message)) return;
    throw new Error(`${what}: threw ${(err as Error).message}`);
  }
  throw new Error(`${what}: did not throw`);
};

// a remembered line goes under its own heading, made once at the end, so the user's own rules are not mixed with it
const mine = '# Instructions for agents\n\n## Rules\n\n- Spelling: Australian English.\n';
const one = withInstruction(mine, 'Use \\qty for units.');
eq(one, `${mine}\n## Remembered\n\n- Use \\qty for units.\n`, 'the first line makes the section');
const two = withInstruction(one, '  Never touch figures/.  ');
eq(two, `${mine}\n## Remembered\n\n- Use \\qty for units.\n- Never touch figures/.\n`, 'the next goes after it');
// the section in the middle of the file: the line goes at its end, before the next heading
eq(withInstruction('## Remembered\n\n- a\n\n## Later\n\n- z\n', 'b'), '## Remembered\n\n- a\n- b\n\n## Later\n\n- z\n', 'inside the section');
eq(withInstruction('## Remembered\n## Later\n', 'b'), '## Remembered\n\n- b\n## Later\n', 'an empty section');
eq(withInstruction('', 'b'), '## Remembered\n\n- b\n', 'an empty file');
eq(withInstruction('rule\r\n', 'b'), 'rule\r\n\r\n## Remembered\r\n\r\n- b\r\n', 'Windows line endings are kept');
// a line is one line, whatever was suggested
eq(withInstruction('', 'two\nlines'), '## Remembered\n\n- two lines\n', 'one line');
// every remembered line can be found again, and is not added twice
eq([hasInstruction(two, 'Use \\qty for units.'), hasInstruction(two, 'Spelling: Australian English.'), hasInstruction(two, 'Use \\qty')], [true, true, false], 'found as an item');
eq(hasInstruction('Plain rule\n', 'Plain rule'), true, 'or as a line of its own');
// the file never grows past what an agent is given
throws(() => withInstruction('x'.repeat(MAX_INSTRUCTIONS - 20), 'one more rule'), /at its limit of 20,000 characters/, 'the limit');

const starter = starterInstructions({ mainFile: 'paper/main.typ', language: 'Typst' });
eq(/^# Instructions for agents\n/.test(starter) && starter.includes('- Main file: paper/main.typ (Typst)\n'), true, 'the starter names the main file and its language');
eq(starterInstructions({ mainFile: '', language: 'LaTeX' }).includes('- Language: LaTeX\n'), true, 'or the language alone');
eq(starter.length < 700, true, 'and is short');

console.log('instructions: all checks passed');
