// The folders on the Projects page. They're for looking only: nothing moves on disk. They live in the settings
// (projectFolders), so they follow the user to their other computers with the rest. A project is in one folder at
// most, by its id, which stays the same wherever its folder on disk goes. ponytail: the tree goes between computers
// as one value, newest wins, so folders made on two computers between syncs keep only the newer computer's.

/** A folder's colour: Finder's tag colours, in its order; none is the light blue folder. Older builds of 2.0 drop yellow. */
export const FOLDER_COLOURS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'grey'] as const;
export type FolderColour = (typeof FOLDER_COLOURS)[number];

/** The SF Symbols a folder can wear, by Finder's categories; each has a Fluent twin for Windows (scripts/fluent-icons.mjs). */
export const FOLDER_SYMBOLS: [string, string[]][] = [
  [
    'People',
    ['person', 'person.2', 'person.3', 'person.crop.circle', 'figure.walk', 'figure.run', 'figure.2.and.child.holdinghands', 'hand.raised', 'hand.wave', 'hand.thumbsup', 'hand.point.up.left', 'hands.and.sparkles', 'face.smiling', 'brain.head.profile', 'eye', 'eyeglasses', 'graduationcap', 'stethoscope', 'tshirt', 'crown']
  ],
  [
    'Animals & Nature',
    ['pawprint', 'dog', 'cat', 'hare', 'tortoise', 'fish', 'ladybug', 'leaf', 'tree', 'camera.macro', 'laurel.leading', 'mountain.2', 'globe.asia.australia', 'sun.max', 'moon', 'cloud', 'cloud.sun', 'cloud.rain', 'cloud.bolt', 'snowflake', 'wind', 'drop', 'flame', 'bolt', 'water.waves', 'sparkles']
  ],
  [
    'Food & Drink',
    ['fork.knife', 'cup.and.saucer', 'wineglass', 'waterbottle', 'birthday.cake', 'carrot', 'takeoutbag.and.cup.and.straw', 'frying.pan', 'cart', 'basket']
  ],
  [
    'Activities',
    ['sportscourt', 'soccerball', 'basketball', 'football', 'baseball', 'cricket.ball', 'figure.pool.swim', 'bicycle', 'dumbbell', 'trophy', 'medal', 'gamecontroller', 'puzzlepiece', 'paintbrush', 'paintpalette', 'theatermasks', 'camera', 'film', 'ticket', 'balloon', 'gift', 'tent', 'beach.umbrella']
  ],
  [
    'Travel & Places',
    ['house', 'building', 'building.2', 'building.columns', 'storefront', 'cross.case', 'car', 'bus', 'tram', 'airplane', 'sailboat', 'fuelpump', 'map', 'mappin.and.ellipse', 'location', 'safari', 'globe', 'suitcase', 'bed.double', 'flag', 'flag.checkered', 'signpost.right']
  ],
  [
    'Objects',
    ['book', 'books.vertical', 'text.book.closed', 'bookmark', 'backpack', 'pencil', 'pencil.and.ruler', 'ruler', 'scissors', 'paperclip', 'doc.text', 'note.text', 'newspaper', 'list.clipboard', 'calendar', 'clock', 'alarm', 'hourglass', 'lightbulb', 'flask', 'testtube.2', 'atom', 'microbe', 'pills', 'syringe', 'heart.text.square', 'function', 'sum', 'x.squareroot', 'plus.forwardslash.minus', 'number', 'compass.drawing', 'chart.bar', 'chart.pie', 'chart.line.uptrend.xyaxis', 'tablecells', 'music.note', 'music.note.list', 'guitars', 'pianokeys', 'headphones', 'mic', 'speaker.wave.2', 'briefcase', 'tray.full', 'archivebox', 'envelope', 'phone', 'iphone', 'laptopcomputer', 'desktopcomputer', 'keyboard', 'printer', 'cpu', 'server.rack', 'externaldrive', 'terminal', 'chevron.left.forwardslash.chevron.right', 'hammer', 'wrench.and.screwdriver', 'key', 'lock', 'creditcard', 'banknote', 'dollarsign.circle', 'signature', 'scalemass', 'shippingbox', 'photo', 'umbrella']
  ],
  [
    'Symbols',
    ['star', 'heart', 'bell', 'tag', 'checkmark.circle', 'xmark.circle', 'exclamationmark.triangle', 'questionmark.circle', 'info.circle', 'shield', 'pin', 'paperplane', 'link', 'at', 'quote.opening', 'bubble.left', 'sparkle', 'scope', 'circle', 'square', 'triangle', 'diamond', 'hexagon', 'infinity']
  ]
];
const SYMBOLS = new Set(FOLDER_SYMBOLS.flatMap(([, names]) => names));

// one emoji: a flag, a keycap, or a pictograph with its variation, skin tone, tags and joined parts
const EMOJI = /^(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}\uFE0F?\p{Emoji_Modifier}?[\u{E0020}-\u{E007F}]*(?:\u200D\p{Extended_Pictographic}\uFE0F?\p{Emoji_Modifier}?)*)$/u;
export const isFolderEmoji = (value: unknown): value is string => typeof value === 'string' && value.length <= 16 && EMOJI.test(value);
export const isFolderSymbol = (value: unknown): value is string => typeof value === 'string' && SYMBOLS.has(value);

/** symbol or emoji: what's drawn on the folder's front, one or the other. Older builds of 2.0 drop them. */
export type ProjectFolder = { id: string; name: string; parent: string | null; colour?: FolderColour; symbol?: string; emoji?: string };
export type ProjectFolders = { folders: ProjectFolder[]; placement: Record<string, string> };

export const NO_FOLDERS: ProjectFolders = { folders: [], placement: {} };

/**
 * A stored or shared tree, checked: folders without an id or a name go, a folder whose parent has gone (or that sits
 * inside itself) moves to the top, and a placement in a folder that has gone is dropped. Placements of projects this
 * computer doesn't list stay: another computer may have them.
 */
export function cleanFolders(value: unknown): ProjectFolders {
  const raw = (typeof value === 'object' && value ? value : {}) as { folders?: unknown; placement?: unknown };
  const folders: ProjectFolder[] = [];
  for (const f of Array.isArray(raw.folders) ? raw.folders : []) {
    const { id, name, parent, colour, symbol, emoji } = (typeof f === 'object' && f ? f : {}) as Record<string, unknown>;
    if (typeof id !== 'string' || !id || typeof name !== 'string' || !name.trim() || folders.some((g) => g.id === id)) continue;
    folders.push({
      id,
      name: name.trim(),
      parent: typeof parent === 'string' ? parent : null,
      ...(FOLDER_COLOURS.includes(colour as FolderColour) && { colour: colour as FolderColour }),
      ...(isFolderSymbol(symbol) ? { symbol } : isFolderEmoji(emoji) && { emoji })
    });
  }
  const byId = new Map(folders.map((f) => [f.id, f]));
  for (const f of folders) if (f.parent && !byId.has(f.parent)) f.parent = null;
  // a loop is broken at the first of its folders, which goes to the top
  for (const f of folders) {
    const seen = new Set<string>();
    for (let p = f.parent; p && !seen.has(p); p = byId.get(p)!.parent) {
      if (p === f.id) {
        f.parent = null;
        break;
      }
      seen.add(p);
    }
  }
  const placement = typeof raw.placement === 'object' && raw.placement ? (raw.placement as Record<string, unknown>) : {};
  return {
    folders,
    placement: Object.fromEntries(Object.entries(placement).filter((e): e is [string, string] => typeof e[1] === 'string' && byId.has(e[1])))
  };
}

/** The folders directly inside parent (null: the top), by name. */
export const childFolders = (tree: ProjectFolders, parent: string | null) =>
  tree.folders.filter((f) => f.parent === parent).sort((a, b) => a.name.localeCompare(b.name, 'en-AU', { numeric: true, sensitivity: 'base' }));

export const addFolder = (tree: ProjectFolders, folder: ProjectFolder): ProjectFolders => ({ ...tree, folders: [...tree.folders, folder] });

export const renameFolder = (tree: ProjectFolders, id: string, name: string): ProjectFolders => ({
  ...tree,
  folders: tree.folders.map((f) => (f.id === id ? { ...f, name } : f))
});

/** null takes the colour away: the light blue folder. */
export const colourFolder = (tree: ProjectFolders, id: string, colour: FolderColour | null): ProjectFolders => ({
  ...tree,
  folders: tree.folders.map((f) => {
    if (f.id !== id) return f;
    const { colour: _old, ...rest } = f;
    return colour ? { ...rest, colour } : rest;
  })
});

/** A symbol or an emoji on the folder in place of the one there; {} (Clear) leaves it plain. */
export const markFolder = (tree: ProjectFolders, id: string, mark: { symbol?: string } | { emoji?: string }): ProjectFolders => ({
  ...tree,
  folders: tree.folders.map((f) => {
    if (f.id !== id) return f;
    const { symbol: _symbol, emoji: _emoji, ...rest } = f;
    return { ...rest, ...mark };
  })
});

/** The folders from the top down to id, id's own last; [] for the top (null) or a folder that has gone. */
export function folderPath(tree: ProjectFolders, id: string | null): ProjectFolder[] {
  const path: ProjectFolder[] = [];
  for (let f = tree.folders.find((g) => g.id === id); f && !path.includes(f); f = tree.folders.find((g) => g.id === f!.parent)) path.unshift(f);
  return path;
}

/** Going up from folder from to at (null: the top): the folder in at that from is in or is, or null. */
export const cameFrom = (tree: ProjectFolders, from: string | null, at: string | null) => folderPath(tree, from).find((f) => f.parent === at && f.id !== at)?.id ?? null;

/** Where projects ('p:<id>') and folders ('f:<id>') all are (null: the top), or undefined when they differ. */
export function sharedPlace(tree: ProjectFolders, items: string[]): string | null | undefined {
  const places = items.map((item) => (item.startsWith('p:') ? (tree.placement[item.slice(2)] ?? null) : (tree.folders.find((f) => f.id === item.slice(2))?.parent ?? null)));
  return places.every((place) => place === places[0]) ? places[0] : undefined;
}

/** id is the folder ancestor or somewhere inside it. */
export const isWithin = (tree: ProjectFolders, id: string, ancestor: string) => folderPath(tree, id).some((f) => f.id === ancestor);

/**
 * Moves projects ('p:<id>') and folders ('f:<id>') into a folder, or to the top (null). A folder can't go into itself
 * or a folder inside it: that one stays where it is.
 */
export function moveItems(tree: ProjectFolders, items: string[], folderId: string | null): ProjectFolders {
  return items.reduce((t, item) => {
    const id = item.slice(2);
    if (item.startsWith('p:')) return placeProject(t, id, folderId);
    if (!item.startsWith('f:') || (folderId && isWithin(t, folderId, id))) return t;
    return { ...t, folders: t.folders.map((f) => (f.id === id ? { ...f, parent: folderId } : f)) };
  }, tree);
}

/** How many of the projects each folder holds, with those in the folders inside it. */
export function projectCounts(tree: ProjectFolders, projectIds: string[]) {
  const counts = new Map<string, number>();
  for (const p of projectIds) for (const f of folderPath(tree, tree.placement[p] ?? null)) counts.set(f.id, (counts.get(f.id) || 0) + 1);
  return counts;
}

/** The folder goes; its projects and folders move up into its parent (to the top if it had none). */
export function deleteFolder(tree: ProjectFolders, id: string): ProjectFolders {
  const gone = tree.folders.find((f) => f.id === id);
  if (!gone) return tree;
  return {
    folders: tree.folders.filter((f) => f.id !== id).map((f) => (f.parent === id ? { ...f, parent: gone.parent } : f)),
    placement: Object.fromEntries(
      Object.entries(tree.placement).flatMap(([project, folder]): [string, string][] =>
        folder !== id ? [[project, folder]] : gone.parent ? [[project, gone.parent]] : []
      )
    )
  };
}

/** Puts a project in a folder, or in none (null). */
export function placeProject(tree: ProjectFolders, projectId: string, folderId: string | null): ProjectFolders {
  const { [projectId]: _old, ...placement } = tree.placement;
  return { ...tree, placement: folderId ? { ...placement, [projectId]: folderId } : placement };
}
