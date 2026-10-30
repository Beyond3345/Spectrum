import type { ProjectMeta } from '../api/client';
import { docKind } from '../editor/shared';
import type { DocKind } from '../editor/shared';
import { childFolders, folderPath } from './folders';
import type { ProjectFolders } from './folders';
import { FolderShape, HOME_VIEW, PREFS_KEY, homeOrder, newestIn } from './Home';
import type { HomeSort } from './Home';
import type { MenuItems } from './Menu';

// The editor's project switcher: Home as a list, each folder opened in place in the same menu (EditorPage's MenuButton).

const KIND_NAMES: Record<DocKind, string> = { latex: 'LaTeX', typst: 'Typst', markdown: 'Markdown' };

/** A project's kind, by its main file; a project without one yet is LaTeX, as the editor compiles it. */
export const projectKind = (p: ProjectMeta): DocKind => docKind(p.mainFile ?? '') ?? 'latex';

/** Home's sort for a folder (null: Home itself), as the Projects page keeps it in this browser. */
export function homeSortAt(at: string | null): HomeSort {
  try {
    return JSON.parse(window.localStorage.getItem(PREFS_KEY) || '{}').home?.[at ?? '']?.sort ?? HOME_VIEW.sort;
  } catch {
    return HOME_VIEW.sort;
  }
}

/** Where the switcher opens (Settings › Projects): Home, or the folder the open project is in (Home when it is in none). */
export const switcherStart = (tree: ProjectFolders, projectId: string, opensAt: 'home' | 'folder') => (opensAt === 'folder' ? (tree.placement[projectId] ?? null) : null);

/** The folders and projects in a folder (null: Home) in Home's order; never the archived, missing or template drafts but the open one. */
export function switcherLevel(projects: ProjectMeta[], tree: ProjectFolders, at: string | null, sort: HomeSort, currentId: string) {
  const shown = projects.filter((p) => p.id === currentId || (!p.missing && !p.archived && !p.templateDraft));
  const newest = newestIn(tree, shown, sort === 'createdAt' ? 'createdAt' : 'updatedAt');
  return homeOrder(childFolders(tree, at), shown.filter((p) => (tree.placement[p.id] ?? null) === at), sort, newest);
}

/** The switcher's list at a folder: a back row and the folder's name, then its folders and projects. */
export function switcherList({ projects, tree, at, projectId, go, open }: { projects: ProjectMeta[]; tree: ProjectFolders; at: string | null; projectId: string; go: (folderId: string | null) => void; open: (projectId: string) => void }): MenuItems {
  const path = folderPath(tree, at);
  const here = path[path.length - 1];
  const up = path[path.length - 2]?.name ?? 'Home';
  const items = switcherLevel(projects, tree, here?.id ?? null, homeSortAt(here?.id ?? null), projectId);
  return [
    here && { label: up, icon: 'chevron.left', ariaLabel: `Back to ${up}`, keepOpen: true, onSelect: () => go(here.parent) },
    here && { heading: true, label: here.name },
    ...items.map(({ folder, project }) => {
      if (folder) return { label: folder.name, icon: <FolderGlyph colour={folder.colour} />, ariaLabel: `${folder.name}, folder`, keepOpen: true, onSelect: () => go(folder.id) };
      const p = project!;
      const kind = projectKind(p);
      return { label: p.name, icon: <KindLogo kind={kind} />, ariaLabel: `${p.name}, ${KIND_NAMES[kind]} project`, checked: p.id === projectId, onSelect: () => p.id !== projectId && open(p.id) };
    }),
    !items.length && { label: 'No projects here', disabled: true }
  ];
}

function FolderGlyph({ colour }: { colour?: ProjectFolders['folders'][number]['colour'] }) {
  return (
    <span className="switcher-folder">
      <FolderShape colour={colour} />
    </span>
  );
}

/**
 * A project's kind as a small mark: the TeX wordmark with its lowered E (drawn here), a "t" in Typst's teal (Typst's
 * own logo is its trademark) and the Markdown mark by Dustin Curtis (CC0, THIRD_PARTY_NOTICES).
 */
export function KindLogo({ kind }: { kind: DocKind }) {
  if (kind === 'markdown')
    return (
      <svg className="kind-logo" viewBox="0 0 208 128" aria-hidden="true">
        <rect width="198" height="118" x="5" y="5" ry="10" fill="none" stroke="currentColor" strokeWidth="14" />
        <path fill="currentColor" d="M30 98V30h20l20 25 20-25h20v68H90V59L70 84 50 59v39zm125 0l-30-33h20V30h20v35h20z" />
      </svg>
    );
  if (kind === 'typst')
    return (
      <svg className="kind-logo typst" viewBox="0 0 16 16" aria-hidden="true">
        <path fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d="M6.5 2.5v8.5c0 1.7 1 2.5 2.4 2.5 1 0 1.9-.4 2.6-1M3.5 6h7.5" />
      </svg>
    );
  return (
    <svg className="kind-logo" viewBox="0 0 18 14" aria-hidden="true">
      <path fill="none" stroke="currentColor" strokeWidth="1.6" d="M.5 1.8h6.6M3.8 1.8v8.4M6.6 5.2h3.4M7.4 5.2v7.6M6.6 12.8h3.4M7.4 9h2.2M10.4 1.5l6.6 8.9M17 1.5l-6.6 8.9" />
    </svg>
  );
}
