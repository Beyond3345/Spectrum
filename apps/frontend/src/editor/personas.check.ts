// Self-check for personas: what a chat is told, Reset to defaults, and how they join another computer's. Run (it
// imports React through settings.ts, so bundle it first):
// npx esbuild apps/frontend/src/editor/personas.check.ts --bundle --platform=node --log-level=warning | node
import { DEFAULT_SETTINGS, sharedPart, takeInShared, withShared } from '../app/settings';
import type { AppSettings } from '../app/settings';
import { STARTER_PERSONAS, resetPersonas, resolveInstructions } from './personas';
import type { Persona } from './personas';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const at = (patch: Partial<AppSettings>) => ({ ...DEFAULT_SETTINGS, ...patch });
const ids = (personas: Persona[]) => personas.map((p) => p.id);
const mine: Persona = { id: 'thesis', name: 'Thesis voice', colour: 'teal', prompt: 'Write like my supervisor.' };

// the four starters come with a computer that has none stored, each with its own id
eq(ids(DEFAULT_SETTINGS.personas), ['research-writer', 'document-editor', 'critical-reviewer', 'draw-a-figure'], 'seeded starters');

// a persona replaces the default instructions; none, or one deleted since, falls back to them
const s = at({ personas: [...STARTER_PERSONAS, mine], defaultInstructions: '  Use British spelling.  ' });
eq(resolveInstructions(s, 'thesis'), 'Write like my supervisor.', 'the chosen persona');
eq(resolveInstructions(s), 'Use British spelling.', 'no persona: the default, trimmed');
eq(resolveInstructions(s, 'gone'), 'Use British spelling.', 'a deleted persona: the default');
eq(resolveInstructions(at({}), null), '', 'nothing set');

// Reset to defaults puts the starters back as they were and keeps the user's own
const edited = [{ ...STARTER_PERSONAS[1], prompt: 'Changed' }, mine];
eq(resetPersonas(edited), [...STARTER_PERSONAS, mine], 'reset');

// stored personas are checked: no name, a repeated id or a colour Spectrum doesn't know
const checked = withShared(at({}), {
  personas: [mine, { ...mine, name: 'Again' }, { id: 'x', name: ' ', colour: 'blue', prompt: '' }, { id: 'y', name: 'Y', colour: 'neon', prompt: 'p' }, 'junk']
});
eq(checked.personas, [mine, { id: 'y', name: 'Y', colour: 'blue', prompt: 'p' }], 'checked like stored ones');
eq(withShared(at({}), { personas: 'junk' }).personas, STARTER_PERSONAS, 'junk is the starters');
eq(withShared(at({}), { personas: [] }).personas, [], 'all deleted stays empty');

// personas and the default instructions go to the other computers
eq('personas' in sharedPart(s) && 'defaultInstructions' in sharedPart(s), true, 'shared');

// a computer joining for the first time keeps its own personas beside theirs, but not a starter it never changed, so
// one deleted there stays deleted
const theirs = sharedPart(at({ personas: [STARTER_PERSONAS[0], { ...STARTER_PERSONAS[2], prompt: 'Be brutal.' }] }));
const joined = takeInShared(at({ personas: [...STARTER_PERSONAS, mine] }), theirs, '');
eq(ids(joined.personas), ['research-writer', 'critical-reviewer', 'thesis'], 'joined by id');
eq(joined.personas[1].prompt, 'Be brutal.', 'theirs win for the same id');
// an edited starter here is the user's, so it joins too
const editedHere = takeInShared(at({ personas: [{ ...STARTER_PERSONAS[3], name: 'Figures' }] }), theirs, '');
eq(ids(editedHere.personas), ['research-writer', 'critical-reviewer', 'draw-a-figure'], 'edited starter kept');
// once shared, a deletion on either side goes across as usual
const shared = JSON.stringify(sharedPart(joined));
eq(ids(takeInShared(joined, sharedPart(at({ personas: [mine] })), shared).personas), ['thesis'], 'deleted there: deleted here');
// an older Spectrum's file has no personas: this computer's stay
eq(ids(takeInShared(at({ personas: [mine] }), { theme: 'dark' }, '').personas), ['thesis'], 'none in theirs');

console.log('personas: all checks passed');
