// Self-check for the folders on the Projects page. Run:
// npx esbuild apps/frontend/src/app/folders.check.ts --bundle --platform=node --log-level=warning | node
import { NO_FOLDERS, addFolder, childFolders, cleanFolders, deleteFolder, placeProject, renameFolder } from './folders';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const names = (tree: typeof NO_FOLDERS, parent: string | null) => childFolders(tree, parent).map((f) => f.name);

// Thesis › Chapters, and Papers, with projects in each
let t = addFolder(NO_FOLDERS, { id: 't', name: 'Thesis', parent: null });
t = addFolder(t, { id: 'c', name: 'Chapters', parent: 't' });
t = addFolder(t, { id: 'p', name: 'papers', parent: null });
t = placeProject(placeProject(placeProject(t, 'intro', 'c'), 'draft', 't'), 'review', 'p');
eq(names(t, null), ['papers', 'Thesis'], 'the top, by name whatever the case');
eq(names(t, 't'), ['Chapters'], 'inside Thesis');
eq(renameFolder(t, 'p', 'Papers').folders.find((f) => f.id === 'p')?.name, 'Papers', 'renamed');

// one folder per project: moving it takes it out of the other, and null takes it out of any
eq(placeProject(t, 'intro', 'p').placement.intro, 'p', 'moved');
eq('draft' in placeProject(t, 'draft', null).placement, false, 'out of every folder');

// deleting a folder moves what was in it up a level; nothing else changes
const noThesis = deleteFolder(t, 't');
eq(noThesis.folders.find((f) => f.id === 'c')?.parent, null, 'Chapters moves to the top');
eq(noThesis.placement, { intro: 'c', review: 'p' }, 'Thesis’s project is out of any folder, the others stay');
const noChapters = deleteFolder(t, 'c');
eq(noChapters.placement.intro, 't', 'Chapters’s project moves into Thesis');
eq(deleteFolder(t, 'gone'), t, 'a folder that isn’t there');

// what comes in from storage or another computer is checked
const stored = cleanFolders({
  folders: [
    { id: 't', name: ' Thesis ', parent: null },
    { id: 'a', name: 'A', parent: 'b' },
    { id: 'b', name: 'B', parent: 'a' },
    { id: 'x', name: 'Under a lost one', parent: 'lost' },
    { id: 't', name: 'Same id again', parent: null },
    { id: '', name: 'No id' },
    { id: 'n', name: '  ' },
    'junk',
    null
  ],
  // a project this computer doesn't list stays where it is, for the computer that has it
  placement: { here: 't', elsewhere: 'b', inLost: 'lost', bad: 42 }
});
eq(stored.folders.map((f) => [f.id, f.name, f.parent]), [['t', 'Thesis', null], ['a', 'A', null], ['b', 'B', 'a'], ['x', 'Under a lost one', null]], 'folders checked');
eq(stored.placement, { here: 't', elsewhere: 'b' }, 'placements in folders that are there kept, by any project id');
eq(cleanFolders('nonsense'), NO_FOLDERS, 'not a tree');
eq(cleanFolders({ folders: {}, placement: [] }), NO_FOLDERS, 'the wrong shapes');

console.log('folders.check: ok');
