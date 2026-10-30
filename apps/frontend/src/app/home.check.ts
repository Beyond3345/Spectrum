// Self-check for what Home does with the folders. Run:
// npx esbuild apps/frontend/src/app/home.check.ts --bundle --platform=node --log-level=warning | node
import { FOLDER_COLOURS, FOLDER_SYMBOLS, NO_FOLDERS, addFolder, cameFrom, cleanFolders, colourFolder, deleteFolder, folderPath, isFolderEmoji, isWithin, markFolder, moveItems, placeProject, projectCounts, sharedPlace } from './folders';
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

// going up, the focus goes to the folder come from, or the one holding it
eq([cameFrom(t, 'engg', 'uni'), cameFrom(t, 'engg', null), cameFrom(t, 'uni', 'engg'), cameFrom(t, null, null)], ['engg', 'uni', null, null], 'came from');

// Move to folder… starts on the folder the items share
eq([sharedPlace(t, ['p:lab']), sharedPlace(t, ['f:engg', 'p:essay']), sharedPlace(t, ['p:loose', 'f:work']), sharedPlace(t, ['p:lab', 'p:essay'])], ['engg', 'uni', null, undefined], 'where they are');

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

// colours: Finder's seven, in its order; none is the light blue folder; cleanFolders keeps a known colour and drops the rest
eq(FOLDER_COLOURS, ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'grey'], 'Finder’s colours');
const red = colourFolder(t, 'uni', 'red');
eq(red.folders.find((f) => f.id === 'uni')?.colour, 'red', 'coloured');
eq('colour' in colourFolder(red, 'uni', null).folders.find((f) => f.id === 'uni')!, false, 'no colour takes it away');
eq(colourFolder(red, 'uni', 'blue').folders.find((f) => f.id === 'uni')?.colour, 'blue', 'blue is a colour now');
eq(red.folders.filter((f) => f.colour).length, 1, 'only that folder');
const stored = cleanFolders({
  folders: [
    { id: 'a', name: 'A', parent: null, colour: 'green' },
    { id: 'b', name: 'B', parent: null, colour: 'magenta' },
    { id: 'c', name: 'C', parent: null, colour: 'blue' },
    { id: 'd', name: 'D', parent: null, colour: 'yellow' }
  ]
});
eq(stored.folders.map((f) => f.colour ?? null), ['green', null, 'blue', 'yellow'], 'colours checked');
// every colour older builds wrote still reads
const old = ['blue', 'purple', 'red', 'orange', 'green', 'grey'];
eq(cleanFolders({ folders: old.map((colour, i) => ({ id: `${i}`, name: 'F', parent: null, colour })) }).folders.map((f) => f.colour), old, 'old colours');

// a symbol or an emoji on the front: one or the other, checked
const symbols = FOLDER_SYMBOLS.flatMap(([, names]) => names);
eq(symbols.length >= 120 && symbols.length <= 200 && new Set(symbols).size === symbols.length, true, 'a set of symbols, each once');
const book = markFolder(red, 'uni', { symbol: 'book' });
eq(book.folders.find((f) => f.id === 'uni'), { id: 'uni', name: 'Uni', parent: null, colour: 'red', symbol: 'book' }, 'a symbol');
const cat = markFolder(book, 'uni', { emoji: '🐈' });
eq([cat.folders.find((f) => f.id === 'uni')?.symbol ?? null, cat.folders.find((f) => f.id === 'uni')?.emoji], [null, '🐈'], 'an emoji takes the symbol’s place');
eq(markFolder(cat, 'uni', {}).folders.find((f) => f.id === 'uni'), { id: 'uni', name: 'Uni', parent: null, colour: 'red' }, 'Clear');
const emoji = ['📚', '❤️', '👍🏽', '👩‍🔬', '👨‍👩‍👧‍👦', '🇦🇺', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', '#️⃣'];
eq(emoji.map(isFolderEmoji), emoji.map(() => true), 'emoji');
const notEmoji = ['', 'a', '1', '📚📚', 'ab📚', '🇦', '📚 ', 7, null];
eq(notEmoji.map(isFolderEmoji), notEmoji.map(() => false), 'not emoji');
const marked = cleanFolders({
  folders: [
    { id: 'a', name: 'A', parent: null, symbol: 'book' },
    { id: 'b', name: 'B', parent: null, symbol: 'not.a.symbol' },
    { id: 'c', name: 'C', parent: null, emoji: '🐈' },
    { id: 'd', name: 'D', parent: null, emoji: 'cat' },
    { id: 'e', name: 'E', parent: null, symbol: 'book', emoji: '🐈' }
  ]
});
eq(marked.folders.map((f) => [f.symbol ?? null, f.emoji ?? null]), [['book', null], [null, null], [null, '🐈'], [null, null], ['book', null]], 'symbols and emoji checked');

// and the colour goes between computers
const at = (folders: typeof t) => ({ ...DEFAULT_SETTINGS, projectFolders: folders });
eq(takeInShared(at(NO_FOLDERS), sharedPart(at(red)), '').projectFolders, red, 'a computer just joined takes the colour in');
const sent = JSON.stringify({ ...sharedPart(at(NO_FOLDERS)), projectFolders: undefined });
const mine = colourFolder(addFolder(NO_FOLDERS, { id: 'mine', name: 'Mine', parent: null }), 'mine', 'purple');
const joined = takeInShared(at(mine), sharedPart(at(red)), sent).projectFolders;
eq([joined.folders.find((f) => f.id === 'uni')?.colour, joined.folders.find((f) => f.id === 'mine')?.colour], ['red', 'purple'], 'joined trees keep both colours');
// and the symbols and emoji, with yellow
const theirs = markFolder(colourFolder(red, 'engg', 'yellow'), 'engg', { emoji: '🔬' });
const ours = markFolder(mine, 'mine', { symbol: 'atom' });
const both = takeInShared(at(ours), sharedPart(at(theirs)), sent).projectFolders;
eq(both.folders.find((f) => f.id === 'engg'), { id: 'engg', name: 'ENGG1001', parent: 'uni', colour: 'yellow', emoji: '🔬' }, 'theirs keeps its emoji and yellow');
eq(both.folders.find((f) => f.id === 'mine')?.symbol, 'atom', 'mine keeps its symbol');
eq(takeInShared(at(NO_FOLDERS), sharedPart(at(theirs)), '').projectFolders, theirs, 'a computer just joined takes them in');

console.log('home.check: ok');
