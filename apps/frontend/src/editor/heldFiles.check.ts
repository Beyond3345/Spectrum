// Self-check for files changed or deleted on disk while open, and the conflict copies a held file's text goes in.
// Run: npx esbuild apps/frontend/src/editor/heldFiles.check.ts --bundle --platform=node --log-level=warning | node
import { conflictCopyPath, onDiskChange } from './heldFiles';
// @ts-expect-error: the backend is plain JS, without types
import { conflictCopies } from '../../../backend/src/utils/conflictCopies.js';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

const change = (o: Partial<Parameters<typeof onDiskChange>[0]>) =>
  onDiskChange({ queued: false, changed: false, unsaved: false, mine: 'mine', disk: 'theirs', ...o });

// an autosave queued behind the recheck goes from the text before, and its refusal asks; taking theirs here
// would let it write over them (the editor showing theirs, the disk mine)
eq(change({ queued: true }), 'wait', 'a queued save waits for its answer');
eq(change({ queued: true, disk: null }), 'wait', 'a queued save hears of a deletion itself');
eq(change({ disk: null }), 'gone', 'deleted');

eq(change({}), 'take', 'nothing of its own here: the disk’s text');
eq(change({ unsaved: true }), 'ask', 'unsaved text here');
eq(change({ unsaved: true, disk: 'mine' }), 'take', 'unsaved text the disk has now');
eq(change({ changed: true }), 'ask', 'held for an earlier change');
eq(change({ changed: true, disk: 'mine' }), 'take', 'held, and the disk has the same text now');
// a deleted tab (held, but not for a change) whose file is back, with text typed while it was gone, or before
eq(change({ unsaved: true, disk: 'as before' }), 'ask', 'a deleted file back with other text keeps what was typed');
eq(change({ unsaved: false, disk: 'as before' }), 'take', 'a deleted file back, nothing typed: its text');

// each copy is a conflict copy of its file, as the backend's banner sees it
const at = new Date(2026, 9, 7, 9, 5, 3);
for (const [path, machine, copy] of [
  ['main.tex', 'Daniel’s MacBook Air', 'main (Daniel’s MacBook Air’s conflicted copy 2026-10-07 090503).tex'],
  ['chapters/intro.tex', 'DESKTOP-AB12CD', 'chapters/intro (DESKTOP-AB12CD’s conflicted copy 2026-10-07 090503).tex'],
  ['refs.bib', 'Dan’s Mac (2)', 'refs (Dan’s Mac 2’s conflicted copy 2026-10-07 090503).bib'],
  ['.latexmkrc', 'mac.local', '.latexmkrc (maclocal’s conflicted copy 2026-10-07 090503)'],
  ['notes.v2.md', '', 'notes.v2 (conflicted copy 2026-10-07 090503).md']
]) {
  eq(conflictCopyPath(path, machine, at), copy, `the copy of ${path}`);
  eq(conflictCopies([path, copy]), { [copy]: path }, `${copy} is a conflict copy of ${path}`);
  eq(conflictCopies([copy]), { [copy]: path }, `${copy} is a conflict copy of ${path}, deleted`);
}
eq(conflictCopyPath('main.tex', 'Mac', new Date(at.getTime() + 1000)) !== conflictCopyPath('main.tex', 'Mac', at), true, 'a second later, another copy');

console.log('heldFiles: all checks passed');
