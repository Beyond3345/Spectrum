// The handbook keeps its own copy of the app's palette (docs/handbook/palette.json), so it compiles as a project on
// its own: the two must stay the same. Run from the repository root.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const app = JSON.parse(readFileSync('apps/frontend/src/app/palette.json', 'utf8'));
const book = JSON.parse(readFileSync('docs/handbook/palette.json', 'utf8'));
assert.deepEqual(book, app, 'docs/handbook/palette.json differs from apps/frontend/src/app/palette.json: copy the app’s over it');
console.log('palette: the handbook’s copy matches the app’s');
