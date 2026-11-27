import type { ProjectMeta } from '../api/client';
import { docKind } from '../editor/shared';
import type { DocKind } from '../editor/shared';
import { childFolders, folderPath } from './folders';
import type { ProjectFolders } from './folders';
import { FolderShape, HOME_VIEW, PREFS_KEY, homeOrder, newestIn } from './Home';
import type { HomeSort } from './Home';
import Icon from './Icon';
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
    here && { heading: true, label: <span className="switcher-heading">{here.name}</span> },
    ...items.map(({ folder, project }) => {
      if (folder) return { label: folder.name, icon: <FolderGlyph colour={folder.colour} />, ariaLabel: `${folder.name}, folder`, keepOpen: true, onSelect: () => go(folder.id) };
      const p = project!;
      const kind = projectKind(p);
      // the open one marked as macOS marks the current item of a list: its row filled, a tick at the end
      const here = p.id === projectId;
      const label = here ? (
        <span className="switcher-current">
          {p.name}
          <Icon name="checkmark" />
        </span>
      ) : (
        p.name
      );
      return { label, icon: <KindMark kind={kind} />, ariaLabel: `${p.name}, ${KIND_NAMES[kind]} project${here ? ', open now' : ''}`, onSelect: () => !here && open(p.id) };
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
 * A project's kind as a short mark, TeX, Typ or MD, in the Spectrum style in a colour of the app's own (editor.css):
 * TeX the Editor's orange, Typst teal, Markdown Flow's blue.
 */
export function KindMark({ kind }: { kind: DocKind }) {
  const [text, colour] = ({ latex: ['TeX', 'area-writing'], typst: ['Typ', 'hue-teal'], markdown: ['MD', 'area-flow'] } as const)[kind];
  return (
    <span className={`kind-mark ${kind} ${colour}`} aria-hidden="true">
      {text}
    </span>
  );
}
