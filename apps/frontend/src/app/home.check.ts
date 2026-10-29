// Self-check for what Home does with the folders. Run:
// npx esbuild apps/frontend/src/app/home.check.ts --bundle --platform=node --log-level=warning | node
import { NO_FOLDERS, addFolder, cleanFolders, colourFolder, deleteFolder, folderPath, isWithin, moveItems, placeProject, projectCounts } from './folders';
import { DEFAULT_SETTINGS, sharedPart, takeInShared } from './settings';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

// Home › Uni › ENGG1001, and Work; a project in each and one in none
let t = addFolder(NO_FOLDERS, { id: 'uni', name: 'Uni', parent: null });
t = addFolder(t, { id: 'engg', name: 'ENGG1001', parent: 'uni' });
t = addFolder(t, { id: 'work', name: 'Work', parent: null });
t = placeProject(placeProject(t, 'lab', 'engg'), 'essay', 'uni');

eq(folderPath(t, 'engg').map((f) => f.name), ['Uni', 'ENGG1001'], 'the path, from the top');
eq(folderPath(t, null), [], 'the top has no path');
eq(folderPath(t, 'gone'), [], 'nor a folder that has gone');
eq([isWithin(t, 'engg', 'uni'), isWithin(t, 'uni', 'uni'), isWithin(t, 'uni', 'engg')], [true, true, false], 'inside');
eq(Object.fromEntries(projectCounts(t, ['lab', 'essay', 'loose'])), { uni: 2, engg: 1 }, 'a folder counts the projects in the folders inside it');

// moving: projects and folders together, into a folder or to the top
const moved = moveItems(t, ['p:loose', 'f:work'], 'engg');
eq(moved.placement.loose, 'engg', 'the project went in');
eq(moved.folders.find((f) => f.id === 'work')?.parent, 'engg', 'and the folder');
eq(moveItems(moved, ['f:work', 'p:lab'], null).folders.find((f) => f.id === 'work')?.parent, null, 'a folder to the top');
eq('lab' in moveItems(moved, ['p:lab'], null).placement, false, 'a project out of every folder');

// a folder never goes into itself or a folder inside it; the rest of the move still happens
const loop = moveItems(t, ['f:uni', 'p:loose'], 'engg');
eq(loop.folders, t.folders, 'Uni stays put');
eq(loop.placement.loose, 'engg', 'the project still moves');
eq(moveItems(t, ['f:uni'], 'uni').folders, t.folders, 'not into itself either');

// deleting a folder moves its projects and folders up a level
const noUni = deleteFolder(t, 'uni');
eq([noUni.folders.find((f) => f.id === 'engg')?.parent, 'essay' in noUni.placement, noUni.placement.lab], [null, false, 'engg'], 'up a level');

// colours: blue is none; cleanFolders keeps a known colour and drops the rest
const red = colourFolder(t, 'uni', 'red');
eq(red.folders.find((f) => f.id === 'uni')?.colour, 'red', 'coloured');
eq('colour' in colourFolder(red, 'uni', 'blue').folders.find((f) => f.id === 'uni')!, false, 'blue takes it away');
eq(red.folders.filter((f) => f.colour).length, 1, 'only that folder');
const stored = cleanFolders({
  folders: [
    { id: 'a', name: 'A', parent: null, colour: 'green' },
    { id: 'b', name: 'B', parent: null, colour: 'magenta' },
    { id: 'c', name: 'C', parent: null, colour: 'blue' }
  ]
});
eq(stored.folders, [{ id: 'a', name: 'A', parent: null, colour: 'green' }, { id: 'b', name: 'B', parent: null }, { id: 'c', name: 'C', parent: null }], 'colours checked');

// and the colour goes between computers
const at = (folders: typeof t) => ({ ...DEFAULT_SETTINGS, projectFolders: folders });
eq(takeInShared(at(NO_FOLDERS), sharedPart(at(red)), '').projectFolders, red, 'a computer just joined takes the colour in');
const sent = JSON.stringify({ ...sharedPart(at(NO_FOLDERS)), projectFolders: undefined });
const mine = colourFolder(addFolder(NO_FOLDERS, { id: 'mine', name: 'Mine', parent: null }), 'mine', 'purple');
const joined = takeInShared(at(mine), sharedPart(at(red)), sent).projectFolders;
eq([joined.folders.find((f) => f.id === 'uni')?.colour, joined.folders.find((f) => f.id === 'mine')?.colour], ['red', 'purple'], 'joined trees keep both colours');

console.log('home.check: ok');
