// The folders on the Projects page. They're for looking only: nothing moves on disk. They live in the settings
// (projectFolders), so they follow the user to their other computers with the rest. A project is in one folder at
// most, by its id, which stays the same wherever its folder on disk goes. ponytail: the tree goes between computers
// as one value, newest wins, so folders made on two computers between syncs keep only the newer computer's.

/** A folder's colour on Home; none is blue. Older builds of 2.0 drop it. */
export const FOLDER_COLOURS = ['blue', 'purple', 'red', 'orange', 'green', 'grey'] as const;
export type FolderColour = (typeof FOLDER_COLOURS)[number];

export type ProjectFolder = { id: string; name: string; parent: string | null; colour?: FolderColour };
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
    const { id, name, parent, colour } = (typeof f === 'object' && f ? f : {}) as Record<string, unknown>;
    if (typeof id !== 'string' || !id || typeof name !== 'string' || !name.trim() || folders.some((g) => g.id === id)) continue;
    folders.push({
      id,
      name: name.trim(),
      parent: typeof parent === 'string' ? parent : null,
      ...(FOLDER_COLOURS.includes(colour as FolderColour) && colour !== 'blue' && { colour: colour as FolderColour })
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

/** Blue, the colour of a folder with none, takes the colour away. */
export const colourFolder = (tree: ProjectFolders, id: string, colour: FolderColour): ProjectFolders => ({
  ...tree,
  folders: tree.folders.map((f) => {
    if (f.id !== id) return f;
    const { colour: _old, ...rest } = f;
    return colour === 'blue' ? rest : { ...rest, colour };
  })
});

/** The folders from the top down to id, id's own last; [] for the top (null) or a folder that has gone. */
export function folderPath(tree: ProjectFolders, id: string | null): ProjectFolder[] {
  const path: ProjectFolder[] = [];
  for (let f = tree.folders.find((g) => g.id === id); f && !path.includes(f); f = tree.folders.find((g) => g.id === f!.parent)) path.unshift(f);
  return path;
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
