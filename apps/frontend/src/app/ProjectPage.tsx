import { escapeTexText } from '../../../backend/src/latex/text.js';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  archiveProject,
  binProject,
  copyProject,
  createProject,
  createUniverseProject,
  deleteTemplate,
  dismissMigrationNotice,
  editTemplate,
  getMigrationNotice,
  getProjectTree,
  importArxivSSE,
  importZip,
  listProjects,
  listTemplates,
  moveProjectHere,
  openFolder,
  relocateProject,
  removeProject,
  renameProject,
  restoreTemplate,
  revealCloudCopy,
  revealProject,
  saveAsTemplate,
  setProjectMainFile,
  systemCheck,
  thumbnailUrl,
  updateProjectTags,
  uploadTemplate,
  writeFile,
  backUpToGitHub,
  getProjectGitHub,
  gitHubProblems,
  syncPlace,
  syncWithGitHub
} from '../api/client';
import type { GitHubProblem, MigrationNotice, ProjectMeta, TemplateCategory, TemplateMeta, UniverseTemplate } from '../api/client';
import Icon from './Icon';
import Segmented, { radioKeys, radioTab } from './Segmented';
import { ContextMenu, MenuButton } from './Menu';
import type { MenuItems } from './Menu';
import Select from './Select';
import Sheet from './Sheet';
import SettingsSheet from './SettingsSheet';
import type { Section as SettingsSection } from './SettingsSheet';
import GitHubView from './GitHubView';
import { linkInstead, linkWithPreview, offerMove, pullSummary, withDeletionCheck } from './github';
import TransferPanel, { transferStatusLabel } from './TransferPanel';
import type { TransferJob } from './TransferPanel';
import { confirmDialog, promptDialog } from './Dialogs';
import { toast } from './Toast';
import { IS_DESKTOP, pickFolder } from './desktop';
import { FOLDER_COLOURS, addFolder, childFolders, colourFolder, deleteFolder, folderPath, isWithin, moveItems, placeProject, renameFolder, sharedPlace } from './folders';
import type { ProjectFolder, ProjectFolders } from './folders';
import CustomiseFolderSheet from './CustomiseFolderSheet';
import UniverseSheet, { LICENCE_NOTE } from './UniverseSheet';
import Home, { DRAG_TYPE, FOLDER_TINTS, FolderShape, HOME_SORTS, HOME_VIEW, PREFS_KEY, formatFull, timeAgo } from './Home';
import type { HomeItem, HomeView } from './Home';
import { BIN, FILE_MANAGER, IS_WINDOWS, tildify } from './platform';
import { TAG_COLOUR_NAMES, loadSettings, useSettings, type AppSettings, type TagColour } from './settings';
import { TAG_COLOURS } from './appearance';
import { formatShortcut, matchesShortcut, shortcutKey, withShortcut } from './shortcuts';

// ─── helpers ───

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Throws on `{ ok: false }` answers so callers can use one catch. */
function ensureOk<T extends { ok?: boolean; error?: string }>(res: T, fallback: string): T {
  if (res.ok === false) throw new Error(res.error || fallback);
  return res;
}

/** The badge by a project's name, [long, short]: its folder can't be found. */
const badgeOf = (p: ProjectMeta): { text: [string, string]; warning: boolean } | null => (p.missing ? { text: ['Folder missing', 'Folder missing'], warning: true } : null);

/** The colour chosen for the tag, or one picked from its name. */
const tagColour = (tag: string, chosen: AppSettings['tagColours']) =>
  TAG_COLOURS[chosen[tag] ?? TAG_COLOUR_NAMES[[...tag].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % TAG_COLOUR_NAMES.length]][1];

const blankTex = (name: string) => `\\documentclass[11pt]{article}

\\title{${escapeTexText(name)}}
\\author{}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Introduction}


\\end{document}
`;

/** What a new project is written in, and so which templates are offered */
type Engine = 'latex' | 'typst' | 'markdown';
const ENGINES = [['latex', 'LaTeX'], ['typst', 'Typst'], ['markdown', 'Markdown']] as const;
const engineOf = (mainFile: string): Engine => (/\.typ$/i.test(mainFile) ? 'typst' : /\.(md|markdown)$/i.test(mainFile) ? 'markdown' : 'latex');

// a blank project's main file for each engine; JSON's quoting escapes the name for Typst and YAML alike
const BLANK: Record<Engine, { file: string; text: (name: string) => string }> = {
  latex: { file: 'main.tex', text: blankTex },
  typst: {
    file: 'main.typ',
    text: (name) => `#set document(title: ${JSON.stringify(name)})
#set page(paper: "a4", margin: 25mm, numbering: "1")
#set text(size: 11pt, lang: "en", region: "AU")
#set heading(numbering: "1.1")

#title()

= Introduction

`
  },
  markdown: { file: 'main.md', text: (name) => `---\ntitle: ${JSON.stringify(name)}\n---\n\n# Introduction\n\n` }
};

// ─── view preferences (per browser; nothing important) ───

type Prefs = {
  layout: 'list' | 'grid';
  sortKey: 'name' | 'date';
  dateField: 'updatedAt' | 'createdAt';
  sortDir: 'asc' | 'desc';
  sidebarCollapsed: boolean;
  tagsOpen: boolean;
  /** folders in the sidebar showing without the folders inside them */
  closedFolders: string[];
  /** each folder's icons or list and its sort on Home, by its id ('' is Home itself) */
  home: Record<string, Partial<HomeView>>;
  /** how large icons are, 1 being Goodnotes' size */
  iconSize: number;
};
const DEFAULT_PREFS: Prefs = { layout: 'list', sortKey: 'date', dateField: 'updatedAt', sortDir: 'desc', sidebarCollapsed: false, tagsOpen: true, closedFolders: [], home: {}, iconSize: 1 };

function loadPrefs(): Prefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(window.localStorage.getItem(PREFS_KEY) || '{}') };
  } catch {
    return DEFAULT_PREFS;
  }
}

type SheetState =
  // folder: the one a new project goes in
  | { kind: 'new'; template: string; engine?: Engine; universe?: UniverseTemplate; folder?: string | null }
  | { kind: 'gallery'; engine?: Engine; folder?: string | null }
  | { kind: 'universe'; folder?: string | null }
  | { kind: 'arxiv' }
  | { kind: 'tags'; id: string }
  // items: projects ('p:<id>') and folders ('f:<id>')
  | { kind: 'move'; items: string[] }
  | { kind: 'customise'; folder: string }
  | { kind: 'transfer'; id: string }
  | { kind: 'saveTemplate'; id: string }
  | { kind: 'settings'; section?: SettingsSection }
  | null;

type ActiveJob = TransferJob & { sourceName: string };

/** Where the page was, for coming back from a project; Spectrum opens on Settings › Projects › Open Spectrum on. */
let place: { view: string; home: string | null } | null = null;

/** The page opens next on All projects, or on Home at the top (the editor's project switcher). */
export const openProjectsOn = (view: 'all' | 'home') => {
  place = { view, home: null };
};

// ─── page ───

export default function ProjectPage() {
  const navigate = useNavigate();
  const [settings, update] = useSettings();
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  /** what the move to 2.0 did with the projects that synced through a cloud location, until dismissed */
  const [notice, setNotice] = useState<MigrationNotice | null>(null);
  /** the templates with a working copy open, which the gallery offers to go on editing */
  const [drafts, setDrafts] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [categories, setCategories] = useState<TemplateCategory[]>([]);
  const [defaultDir, setDefaultDir] = useState('');
  // 'home' | 'all' | 'github' | 'archived' | 'tag:<name>'; a folder opens on Home
  const [view, setView] = useState(() => place?.view ?? (settings.openOn === 'all' ? 'all' : 'home'));
  /** the folder open on Home (null: Home itself) */
  const [homeAt, setHomeAt] = useState<string | null>(place?.home ?? null);
  /** linked projects whose last backup, pull or sync didn't go through, for “Not backed up since …” */
  const [problems, setProblems] = useState<Record<string, GitHubProblem>>({});
  // Settings closed: a sign-in or sign-out there shows in the GitHub view and the badges
  const [settingsClosed, setSettingsClosed] = useState(0);
  const [query, setQuery] = useState('');
  const [prefs, setPrefs] = useState(loadPrefs);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number; items: MenuItems } | null>(null);
  /** where a dragged project would drop: a sidebar folder's id, '' for All projects, 'home', or Home's 'tile:<id>' and 'path:<id>' */
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [job, setJob] = useState<ActiveJob | null>(null);
  const [busy, setBusy] = useState(false);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const updatePrefs = (patch: Partial<Prefs> | ((prev: Prefs) => Partial<Prefs>)) =>
    setPrefs((prev) => {
      const next = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) };
      try {
        window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        // per-browser convenience only
      }
      return next;
    });

  const reload = useCallback(async () => {
    try {
      const res = await listProjects();
      const all = (res.projects || []).map((p) => ({ ...p, tags: p.tags || [] }));
      // working copies of templates open from the template gallery, not the list
      setProjects(all.filter((p) => !p.templateDraft));
      setDrafts(all.flatMap((p) => p.templateDraft || []));
      setLoadError('');
      gitHubProblems().then((r) => setProblems(r.problems), () => undefined);
    } catch (err) {
      setLoadError(errorText(err));
    } finally {
      setLoaded(true);
    }
  }, []);

  const reloadTemplates = useCallback(async () => {
    const res = await listTemplates();
    setTemplates(res.templates || []);
    setCategories(res.categories || []);
  }, []);

  useEffect(() => {
    reload();
    reloadTemplates().catch((err) => toast(`Couldn’t load templates: ${errorText(err)}`, { tone: 'error' }));
    systemCheck().then((res) => setDefaultDir(res.projectsDir || '')).catch(() => undefined);
    getMigrationNotice().then((res) => setNotice(res.notice)).catch(() => undefined);
  }, [reload, reloadTemplates]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (matchesShortcut(shortcutKey(settings.shortcuts, 'sidebar'), e)) {
        e.preventDefault();
        updatePrefs((prev) => ({ sidebarCollapsed: !prev.sidebarCollapsed }));
      } else if (matchesShortcut('Mod-,', e)) {
        e.preventDefault();
        setSheet({ kind: 'settings' });
      } else if (matchesShortcut('Mod-f', e) && !sheet) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (matchesShortcut('Mod-ArrowUp', e) && !sheet && view === 'home' && homeAt && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        goHome(loadSettings().projectFolders.folders.find((f) => f.id === homeAt)?.parent ?? null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // updatePrefs only uses the functional setState form, so a stale copy is fine
  }, [sheet, settings.shortcuts, view, homeAt]);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    projects.forEach((p) => p.tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1)));
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b, 'en-AU', { sensitivity: 'base' }));
  }, [projects]);

  const activeTag = view.startsWith('tag:') ? view.slice(4) : null;
  const folders = settings.projectFolders;

  const homeFolder = folders.folders.find((f) => f.id === homeAt);
  const homeView: HomeView = { ...HOME_VIEW, ...prefs.home[homeAt ?? ''] };
  const setHomeView = (patch: Partial<HomeView>) => updatePrefs((prev) => ({ home: { ...prev.home, [homeAt ?? '']: { ...prev.home[homeAt ?? ''], ...patch } } }));

  /** Opens a folder on Home (null: Home itself). */
  const goHome = (id: string | null) => {
    setView('home');
    setHomeAt(id);
    setQuery('');
  };

  useEffect(() => {
    place = { view, home: homeAt };
  }, [view, homeAt]);

  // a tag view whose last project lost the tag, or a deleted folder's view, falls back to All projects; a deleted
  // folder open on Home, to Home
  useEffect(() => {
    if ((activeTag && loaded && !allTags.some(([tag]) => tag === activeTag)) ) setView('all');
    if (homeAt && !homeFolder) setHomeAt(null);
  }, [activeTag, allTags, loaded, homeAt, homeFolder]);

  const counts = useMemo(() => {
    const shown = projects.filter((p) => !p.archived);
    const inFolder = new Map<string, number>();
    for (const p of shown) {
      const f = folders.placement[p.id];
      if (f) inFolder.set(f, (inFolder.get(f) || 0) + 1);
    }
    return { all: shown.length, archived: projects.length - shown.length, inFolder };
  }, [projects, folders]);

  const visible = useMemo(() => {
    // archived projects stay in Archived, whatever folder they're in
    let list = activeTag
      ? projects.filter((p) => p.tags.includes(activeTag))
      : view === 'archived'
        ? projects.filter((p) => p.archived)
        : projects.filter((p) => !p.archived);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          // the folder's own name only: every path shares ~/Documents/Spectrum
          (p.path.split(IS_WINDOWS ? /[\\/]/ : '/').pop() || '').toLowerCase().includes(q) ||
          p.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    }
    const dir = prefs.sortDir === 'asc' ? 1 : -1;
    const time = (p: ProjectMeta) => new Date(p[prefs.dateField] || p.createdAt).getTime() || 0;
    return [...list].sort((a, b) =>
      prefs.sortKey === 'name'
        ? dir * a.name.localeCompare(b.name, 'en-AU', { numeric: true, sensitivity: 'base' })
        : dir * (time(a) - time(b))
    );
  }, [projects, view, activeTag, query, prefs.sortKey, prefs.sortDir, prefs.dateField]);

  const title =
    activeTag ?? (view === 'home' ? (homeFolder?.name ?? 'Home') : view === 'github' ? 'GitHub' : view === 'archived' ? 'Archived' : 'All projects');
  /** the folder New puts things in: the one open on Home */
  const here = view === 'home' ? homeAt : null;
  const parentDir = settings.projectsDir || undefined;

  // ─── actions ───

  const open = (p: ProjectMeta) => {
    if (p.missing) locate(p);
    else navigate(`/editor/${p.id}`);
  };

  const attempt = async (fn: () => Promise<unknown>, failure: string) => {
    try {
      await fn();
    } catch (err) {
      toast(`${failure}: ${errorText(err)}`, { tone: 'error' });
    }
    await reload();
  };

  const rename = async (p: ProjectMeta) => {
    const name = (await promptDialog({ title: 'Rename project', defaultValue: p.name, confirmLabel: 'Rename' }))?.trim();
    if (!name || name === p.name) return;
    await attempt(async () => ensureOk(await renameProject(p.id, name), 'Rename failed'), 'Couldn’t rename the project');
  };

  const duplicate = (p: ProjectMeta) =>
    attempt(async () => {
      const res = ensureOk(await copyProject(p.id), 'Copy failed');
      toast(`Duplicated as “${res.project?.name || `${p.name} copy`}”.`, { tone: 'success' });
    }, 'Couldn’t duplicate the project');

  const setTags = async (id: string, tags: string[]) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, tags } : p)));
    try {
      await updateProjectTags(id, tags);
    } catch (err) {
      toast(`Couldn’t update tags: ${errorText(err)}`, { tone: 'error' });
      await reload();
    }
  };

  /** Renames the tag on every project that has it (into an existing tag, the two become one), keeping its colour. */
  const renameTag = async (tag: string) => {
    const name = (await promptDialog({ title: 'Rename tag', defaultValue: tag, confirmLabel: 'Rename' }))?.trim();
    if (!name || name === tag) return;
    const { [tag]: colour, ...others } = loadSettings().tagColours;
    update({ tagColours: colour && !others[name] ? { ...others, [name]: colour } : others });
    if (activeTag === tag) setView(`tag:${name}`);
    for (const p of projects.filter((q) => q.tags.includes(tag))) await setTags(p.id, [...new Set(p.tags.map((t) => (t === tag ? name : t)))]);
  };

  const setTagColour = (tag: string, colour: TagColour | null) => {
    const { [tag]: _, ...others } = loadSettings().tagColours;
    update({ tagColours: colour ? { ...others, [tag]: colour } : others });
  };

  const tagMenu = (tag: string): MenuItems => [
    { label: 'Rename…', icon: 'pencil', onSelect: () => renameTag(tag) },
    { separator: true },
    { label: 'Colour', heading: true },
    ...TAG_COLOUR_NAMES.map((c) => ({
      label: (
        <>
          <span className="tag-dot" style={{ background: TAG_COLOURS[c][1] }} /> {TAG_COLOURS[c][0]}
        </>
      ),
      checked: settings.tagColours[tag] === c,
      onSelect: () => setTagColour(tag, c)
    })),
    { label: 'Automatic', checked: !settings.tagColours[tag], onSelect: () => setTagColour(tag, null) }
  ];

  const toggleArchive = (p: ProjectMeta) =>
    attempt(async () => {
      await archiveProject(p.id, !p.archived);
      toast(p.archived ? `“${p.name}” is back in All projects.` : `Archived “${p.name}”.`);
    }, 'Couldn’t change the project');

  const remove = async (p: ProjectMeta) => {
    const ok = await confirmDialog({
      title: `Remove “${p.name}” from the list?`,
      message: 'The folder stays where it is on disk. Add it again any time with Import › Open existing folder…',
      confirmLabel: 'Remove'
    });
    if (ok) await attempt(() => removeProject(p.id), 'Couldn’t remove the project');
  };

  const moveToBin = async (p: ProjectMeta) => {
    // one in a sync app's folder (as 1.10 used some) goes from the user's other computers too
    const place = await syncPlace(p.path).then((r) => r.place, () => null);
    const ok = await confirmDialog({
      title: `Move “${p.name}” to the ${BIN}?`,
      message: `The project folder and everything in it will be moved to the ${BIN}:\n${tildify(p.path)}${place ? `\nIt’s in ${place.label}, so it goes from your other computers too.` : ''}`,
      confirmLabel: `Move to ${BIN}`,
      destructive: true
    });
    if (!ok) return;
    await attempt(async () => {
      ensureOk(await binProject(p.id), `Moving to the ${BIN} failed`);
      toast(`Moved “${p.name}” to the ${BIN}.`);
    }, `Couldn’t move the project to the ${BIN}`);
  };

  const locate = async (p: ProjectMeta) => {
    const path = await pickFolder({ title: `Locate the folder for “${p.name}”` });
    if (!path) return;
    await attempt(async () => {
      ensureOk(await relocateProject(p.id, path), 'That folder couldn’t be used');
      toast(`Found “${p.name}”.`, { tone: 'success' });
    }, 'Couldn’t relocate the project');
  };

  const reveal = (p: ProjectMeta) => revealProject(p.id).catch((err) => toast(errorText(err), { tone: 'error' }));

  // ─── the move to 2.0 ───

  /** A project 1.10 used in its sync app's folder, copied into the projects folder and listed there. */
  const moveHere = async (p: { id: string; name: string; label: string }) => {
    const ok = await confirmDialog({
      title: `Move “${p.name}” to this computer?`,
      message: `Spectrum copies it into ${tildify(settings.projectsDir || defaultDir) || 'your projects folder'} and works on that copy from then on. Its folder in ${p.label} stays as it is, for a computer still on Spectrum 1.10.`,
      confirmLabel: 'Move to this computer'
    });
    if (!ok) return;
    await attempt(async () => {
      const { project } = await moveProjectHere(p.id, parentDir);
      toast(`“${project.name}” is on this computer now.`, { tone: 'success' });
      setNotice((prev) => prev && { ...prev, inPlace: prev.inPlace.filter((q) => q.id !== p.id) });
    }, 'Couldn’t move the project');
  };

  const dismissNotice = () => {
    setNotice(null);
    dismissMigrationNotice().catch(() => undefined);
  };

  // ─── GitHub ───

  /**
   * Sync with GitHub: a linked project syncs; one GitHub has from the other computer links, after its preview; any
   * other is backed up to a new private repository, after a yes. One in a sync app's folder is offered the move first.
   */
  const syncGitHub = (p: ProjectMeta) =>
    attempt(async () => {
      const s = await getProjectGitHub(p.id);
      if (!s.signedIn) {
        setSheet({ kind: 'settings', section: 'github' });
        return;
      }
      if (s.refusal) throw new Error(s.refusal);
      try {
        if (s.linked) {
          const result = await withDeletionCheck((allowDeletions) => syncWithGitHub(p.id, allowDeletions));
          if (result) toast(`Synced “${p.name}”. ${pullSummary(result)}`, { tone: 'success' });
        } else if (s.link) {
          const result = await linkWithPreview(p.id, p.name);
          if (result) toast(`Linked “${p.name}”. ${pullSummary(result)}`, { tone: 'success' });
        } else {
          const ok = await confirmDialog({
            title: `Back up “${p.name}” to GitHub?`,
            message: 'Spectrum makes a private repository for it on your GitHub and keeps it up to date from then on, so your other computers can get it.',
            confirmLabel: 'Back up'
          });
          if (!ok) return;
          const res = await backUpToGitHub(p.id);
          toast(res.left?.length ? `Backed up “${p.name}”, leaving out ${res.left.join('; ')}.` : `Backed up “${p.name}” to GitHub.`, { tone: res.left?.length ? 'error' : 'success' });
        }
      } catch (err) {
        // GitHub has it from the other computer: linked to that one instead
        const linked = await linkInstead(err, p.id, p.name);
        if (linked) toast(`Linked “${p.name}”. ${pullSummary(linked)}`, { tone: 'success' });
        else if (linked === null) return;
        else if (await offerMove(err, p.id, parentDir)) toast(`Moved “${p.name}” to this computer. Choose Sync with GitHub again to back it up.`, { tone: 'success' });
        else throw err;
      }
    }, 'Couldn’t sync with GitHub');

  // ─── folders ───

  /** Changes the folders as they are now: another computer's may have come in since this render. */
  const changeFolders = (change: (tree: ProjectFolders) => ProjectFolders) => update({ projectFolders: change(loadSettings().projectFolders) });

  const moveToFolder = (projectId: string, folderId: string | null) => changeFolders((tree) => placeProject(tree, projectId, folderId));

  /** Projects ('p:<id>') and folders ('f:<id>') into a folder, or to the top (null); never a folder into itself. */
  const moveInto = (items: string[], folderId: string | null) => {
    // dropped back on itself: nothing to say
    const moving = items.filter((item) => item !== `f:${folderId}`);
    const tree = loadSettings().projectFolders;
    if (folderId && moving.some((item) => item.startsWith('f:') && isWithin(tree, folderId, item.slice(2)))) {
      toast('A folder can’t go inside itself or a folder in it.', { tone: 'error' });
    }
    changeFolders((t) => moveItems(t, moving, folderId));
  };

  /** Inside parent (null: at the top); the new folder's id, or null if cancelled. */
  const newFolder = async (parent: string | null) => {
    const name = (await promptDialog({ title: 'New folder', placeholder: 'Folder name', confirmLabel: 'Create' }))?.trim();
    if (!name) return null;
    const id = crypto.randomUUID();
    changeFolders((tree) => addFolder(tree, { id, name, parent }));
    if (parent) updatePrefs((prev) => ({ closedFolders: prev.closedFolders.filter((f) => f !== parent) }));
    return id;
  };

  const editFolderName = async (f: ProjectFolder) => {
    const name = (await promptDialog({ title: 'Rename folder', defaultValue: f.name, confirmLabel: 'Rename' }))?.trim();
    if (name && name !== f.name) changeFolders((tree) => renameFolder(tree, f.id, name));
  };

  const removeFolder = async (f: ProjectFolder) => {
    const parent = folders.folders.find((g) => g.id === f.parent);
    const ok = await confirmDialog({
      title: `Delete the “${f.name}” folder?`,
      message: `${parent ? `What’s in it moves into “${parent.name}”.` : 'Its folders move to the top, and its projects stay in All projects.'} No project is deleted.`,
      confirmLabel: 'Delete',
      destructive: true
    });
    if (!ok) return;
    // the folder open on Home: its parent opens instead
    if (homeAt === f.id) setHomeAt(f.parent);
    changeFolders((tree) => deleteFolder(tree, f.id));
  };

  const toggleFolder = (id: string) =>
    updatePrefs((prev) => ({ closedFolders: prev.closedFolders.includes(id) ? prev.closedFolders.filter((f) => f !== id) : [...prev.closedFolders, id] }));

  const openExisting = async () => {
    // no defaultPath: accepting the projects folder itself would make every project in it one project
    const path = await pickFolder({ title: 'Open an existing folder as a project' });
    if (!path) return;
    try {
      const project = await openFolder(path);
      navigate(`/editor/${project.id}`);
    } catch (err) {
      toast(`Couldn’t open the folder: ${errorText(err)}`, { tone: 'error' });
    }
  };

  const handleZip = async (file: File) => {
    setBusy(true);
    toast(`Importing ${file.name}…`);
    try {
      const res = ensureOk(await importZip({ file, projectName: file.name.replace(/\.zip$/i, ''), parentDir }), 'Import failed');
      if (!res.project) throw new Error('Import failed');
      navigate(`/editor/${res.project.id}`);
    } catch (err) {
      toast(`Couldn’t import the .zip: ${errorText(err)}`, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  /** move: what Move to folder… does instead, as on Home with several selected */
  const menuFor = (p: ProjectMeta, move?: () => void): MenuItems =>
    p.missing
      ? [
          { label: 'Locate…', icon: 'folder.badge.questionmark', onSelect: () => locate(p) },
          { separator: true },
          { label: 'Remove from list', icon: 'minus.circle', onSelect: () => remove(p) }
        ]
      : [
          { label: 'Open', icon: 'doc.text', onSelect: () => open(p) },
          { separator: true },
          { label: 'Rename…', icon: 'pencil', onSelect: () => rename(p) },
          { label: 'Duplicate', icon: 'plus.square.on.square', onSelect: () => duplicate(p) },
          { label: 'Tags…', icon: 'tag', onSelect: () => setSheet({ kind: 'tags', id: p.id }) },
          { label: 'Move to folder…', icon: 'tray.and.arrow.down', onSelect: move ?? (() => setSheet({ kind: 'move', items: [`p:${p.id}`] })) },
          { label: 'Change template…', icon: 'arrow.triangle.2.circlepath', onSelect: () => setSheet({ kind: 'transfer', id: p.id }) },
          { label: 'Save as template…', icon: 'square.and.arrow.down', onSelect: () => setSheet({ kind: 'saveTemplate', id: p.id }) },
          IS_DESKTOP && { label: `Show in ${FILE_MANAGER}`, icon: 'folder', onSelect: () => reveal(p) },
          { label: 'Sync with GitHub', icon: 'arrow.triangle.2.circlepath', onSelect: () => syncGitHub(p) },
          { separator: true },
          { label: p.archived ? 'Unarchive' : 'Archive', icon: 'archivebox', onSelect: () => toggleArchive(p) },
          { label: 'Remove from list', icon: 'minus.circle', onSelect: () => remove(p) },
          { label: `Move to ${BIN}…`, icon: 'trash', destructive: true, onSelect: () => moveToBin(p) }
        ];

  const folderMenu = (f: ProjectFolder | null, move?: () => void): MenuItems => [
    f && { label: 'Open', icon: 'folder', onSelect: () => goHome(f.id) },
    { label: 'New folder…', icon: 'folder.badge.plus', onSelect: () => newFolder(f?.id ?? null) },
    f && { label: 'Rename…', icon: 'pencil', onSelect: () => editFolderName(f) },
    f && { label: 'Customise Folder…', icon: 'paintpalette', onSelect: () => setSheet({ kind: 'customise', folder: f.id }) },
    f && { label: 'Move to folder…', icon: 'tray.and.arrow.down', onSelect: move ?? (() => setSheet({ kind: 'move', items: [`f:${f.id}`] })) },
    f && { separator: true },
    f && { label: 'Colour', heading: true },
    f && { label: 'No colour', checked: !f.colour, onSelect: () => changeFolders((tree) => colourFolder(tree, f.id, null)) },
    ...(f
      ? FOLDER_COLOURS.map((c) => ({
          label: (
            <>
              <span className={`tag-dot folder-dot folder-colour ${c}`} /> {FOLDER_TINTS[c]}
            </>
          ),
          checked: f.colour === c,
          onSelect: () => changeFolders((tree) => colourFolder(tree, f.id, c))
        }))
      : []),
    f && { separator: true },
    f && { label: 'Delete…', icon: 'trash', destructive: true, onSelect: () => removeFolder(f) }
  ];

  /** Right-click, Shift+F10 or the menu key opens the menu */
  const menuProps = (items: () => MenuItems) => ({
    onContextMenu: (e: ReactMouseEvent) => {
      e.preventDefault();
      setCtx({ x: e.clientX, y: e.clientY, items: items() });
    },
    onKeyDown: (e: ReactKeyboardEvent) => {
      if ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') {
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        setCtx({ x: r.left + 24, y: r.bottom, items: items() });
      }
    }
  });

  const rowProps = (p: ProjectMeta) => ({
    tabIndex: 0,
    // onto a folder in the sidebar, as the file tree drags files
    draggable: true,
    onDoubleClick: () => open(p),
    onKeyDown: (e: ReactKeyboardEvent) => {
      if (e.key === 'Enter' && e.target === e.currentTarget) open(p);
    },
    onContextMenu: (e: ReactMouseEvent) => {
      e.preventDefault();
      setCtx({ x: e.clientX, y: e.clientY, items: menuFor(p) });
    },
    onDragStart: (e: ReactDragEvent) => {
      e.dataTransfer.setData(DRAG_TYPE, `p:${p.id}`);
      e.dataTransfer.effectAllowed = 'move';
    },
    onDragEnd: () => setDropTarget(null)
  });

  /** Somewhere projects and folders can be dropped: into a folder, or out of any (null, All projects and Home). */
  const dropProps = (folderId: string | null, key = folderId ?? '') => ({
    onDragOver: (e: ReactDragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      if (dropTarget !== key) setDropTarget(key);
    },
    onDragLeave: (e: ReactDragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null);
    },
    onDrop: (e: ReactDragEvent) => {
      e.preventDefault();
      setDropTarget(null);
      const items = e.dataTransfer.getData(DRAG_TYPE).split('\n').filter(Boolean);
      if (items.length) moveInto(items, folderId);
    }
  });

  // the folders inside parent, and theirs while open
  const folderRows = (parent: string | null, depth: number): ReactNode =>
    childFolders(folders, parent).map((f) => {
      const nested = folders.folders.some((g) => g.parent === f.id);
      const expanded = !prefs.closedFolders.includes(f.id);
      return (
        <Fragment key={f.id}>
          <div className="folder-row" style={{ paddingLeft: depth * 14 }}>
            {nested ? (
              <button className="folder-disclosure" aria-label={`Folders in ${f.name}`} aria-expanded={expanded} onClick={() => toggleFolder(f.id)}>
                <Icon name="chevron.right" className={`disclosure ${expanded ? 'open' : ''}`} />
              </button>
            ) : (
              <span className="folder-disclosure" />
            )}
            <button
              className={`nav-row ${view === 'home' && homeAt === f.id ? 'active' : ''} ${dropTarget === f.id ? 'drop-into' : ''}`}
              onClick={() => goHome(f.id)}
              {...menuProps(() => folderMenu(f))}
              {...dropProps(f.id)}
            >
              <FolderShape {...f} />
              <span className="nav-label">{f.name}</span>
              <span className="nav-count">{counts.inFolder.get(f.id) || 0}</span>
            </button>
          </div>
          {nested && expanded && folderRows(f.id, depth + 1)}
        </Fragment>
      );
    });

  /** The badge after a project's name (short on a card); a linked one GitHub hasn't had its latest from says since when. */
  const badge = (p: ProjectMeta, card = false) => {
    const problem = problems[p.id];
    if (problem && !p.missing && problem.state === 'left') {
      return (
        <span className={`badge warning ${card ? 'card-badge' : ''}`} title={problem.message}>
          <Icon name="exclamationmark.triangle" />
          {card ? 'Files left out' : 'Some files aren’t on GitHub'}
        </span>
      );
    }
    if (problem && !p.missing) {
      const since = problem.lastBackup ? `Not backed up since ${timeAgo(problem.lastBackup).toLowerCase()}` : 'Not backed up yet';
      return (
        <span className={`badge ${problem.state === 'attention' ? 'warning' : ''} ${card ? 'card-badge' : ''}`} title={problem.message}>
          <Icon name={problem.state === 'attention' ? 'exclamationmark.triangle' : 'clock'} />
          {card ? 'Not backed up' : since}
        </span>
      );
    }
    const b = badgeOf(p);
    if (!b) return null;
    return (
      <span className={`badge ${b.warning ? 'warning' : ''} ${card ? 'card-badge' : ''}`} title={card ? b.text[0] : undefined}>
        {b.text[card ? 1 : 0]}
      </span>
    );
  };

  const tagChips = (p: ProjectMeta) =>
    p.tags.map((tag) => (
      <button
        key={tag}
        className="chip tag-chip"
        title={`Show projects tagged “${tag}”`}
        onClick={(e) => {
          e.stopPropagation();
          setView(`tag:${tag}`);
        }}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <span className="tag-dot" style={{ background: tagColour(tag, settings.tagColours) }} />
        {tag}
      </button>
    ));

  const sortByName = () =>
    updatePrefs(prefs.sortKey === 'name' ? { sortDir: prefs.sortDir === 'asc' ? 'desc' : 'asc' } : { sortKey: 'name', sortDir: 'asc' });

  const dateLabel = prefs.dateField === 'updatedAt' ? 'Modified' : 'Created';
  const dateMenu: MenuItems = [
    { label: 'Modified', checked: prefs.dateField === 'updatedAt', onSelect: () => updatePrefs({ dateField: 'updatedAt', sortKey: 'date', sortDir: 'desc' }) },
    { label: 'Created', checked: prefs.dateField === 'createdAt', onSelect: () => updatePrefs({ dateField: 'createdAt', sortKey: 'date', sortDir: 'desc' }) },
    { separator: true },
    { label: 'Newest first', checked: prefs.sortKey === 'date' && prefs.sortDir === 'desc', onSelect: () => updatePrefs({ sortKey: 'date', sortDir: 'desc' }) },
    { label: 'Oldest first', checked: prefs.sortKey === 'date' && prefs.sortDir === 'asc', onSelect: () => updatePrefs({ sortKey: 'date', sortDir: 'asc' }) }
  ];

  const sheetProject = sheet && 'id' in sheet ? projects.find((p) => p.id === sheet.id) : undefined;

  const shownProjects = useMemo(() => projects.filter((p) => !p.archived), [projects]);
  const layout = view === 'home' ? homeView.layout : prefs.layout;
  const setLayout = (next: Prefs['layout']) => (view === 'home' ? setHomeView({ layout: next }) : updatePrefs({ layout: next }));

  /** A project in the list; on Home, with Home's handlers, its kind and, while searching, its folder's path. */
  const projectRow = (p: ProjectMeta, home?: HomeItem) => {
    const field = home?.date ?? prefs.dateField;
    return (
      <div key={p.id} role="row" className={`project-row ${p.missing ? 'missing' : ''} ${home?.selected ? 'selected' : ''}`} {...rowProps(p)} {...home?.props}>
        <span className="col-thumb"><Thumb project={p} /></span>
        <span className="col-name">
          <span className="project-name-line">
            <span className="project-name">{p.name}</span>
            {badge(p)}
            {p.archived && view !== 'archived' && <span className="badge">Archived</span>}
          </span>
          {home?.where ? <span className="project-path">{home.where}</span> : <span className="project-path" title={p.path}>{tildify(p.path)}</span>}
        </span>
        {home ? (
          <>
            <span className="col-kind">Project</span>
            <span className="col-count" />
          </>
        ) : (
          <span className="col-tags">{tagChips(p)}</span>
        )}
        <span className="col-date" title={formatFull(p[field])}>{timeAgo(p[field])}</span>
        <span className="col-actions">
          <MenuButton icon="ellipsis" title="More" align="end" items={menuFor(p)} />
        </span>
      </div>
    );
  };

  /** A project in the grid; on Home, as projectRow. */
  const projectCard = (p: ProjectMeta, home?: HomeItem) => {
    const field = home?.date ?? prefs.dateField;
    return (
      <div key={p.id} className={`project-card ${p.missing ? 'missing' : ''} ${home?.selected ? 'selected' : ''}`} {...rowProps(p)} {...home?.props}>
        <div className="card-thumb">
          <Thumb project={p} />
          {badge(p, true)}
          <span className="card-menu">
            <MenuButton icon="ellipsis" title="More" className="icon-btn small" align="end" items={menuFor(p)} />
          </span>
        </div>
        <div className="card-name" title={p.name}>{p.name}</div>
        <div className="card-meta" title={formatFull(p[field])}>
          {`${field === 'updatedAt' ? 'Modified' : 'Created'} ${timeAgo(p[field]).replace(/^Just now$/, 'just now')}`}
        </div>
        {home?.where && <div className="card-meta">{home.where}</div>}
        {p.tags.length > 0 && <div className="card-tags">{tagChips(p)}</div>}
      </div>
    );
  };

  // ─── render ───

  const emptyState = () => {
    if (!loaded) return <div className="empty-state"><span className="spinner" /></div>;
    if (loadError) {
      return (
        <div className="empty-state">
          <Icon name="exclamationmark.triangle" size={36} />
          <div className="empty-title">Couldn’t load projects</div>
          <div className="empty-text">{loadError}</div>
          <button className="btn" onClick={() => reload()}><Icon name="arrow.clockwise" /> Try again</button>
        </div>
      );
    }
    if (query.trim()) {
      return (
        <div className="empty-state">
          <Icon name="magnifyingglass" size={36} />
          <div className="empty-title">No results for “{query.trim()}”</div>
          <button className="btn" onClick={() => setQuery('')}>Clear search</button>
        </div>
      );
    }
    if (view === 'archived') {
      return (
        <div className="empty-state">
          <Icon name="archivebox" size={36} />
          <div className="empty-title">No archived projects</div>
          <div className="empty-text">Archive a project from its ··· menu to tidy it away without deleting anything.</div>
        </div>
      );
    }
    if (view === 'home' && homeFolder) {
      return (
        <div className="empty-state">
          <Icon name="folder" size={36} />
          <div className="empty-title">Nothing in “{homeFolder.name}”</div>
          <div className="empty-text">Drag projects or folders onto it, or make one here from New.</div>
        </div>
      );
    }
    return (
      <div className="empty-state">
        <Icon name="doc.text" size={40} />
        <div className="empty-title">{projects.length ? 'Everything here is archived' : 'No projects yet'}</div>
        <div className="empty-text">Start a new paper, or open a folder that already holds your LaTeX files.</div>
        <div className="empty-actions">
          <button className="btn inverse" onClick={() => setSheet({ kind: 'new', template: '' })}><Icon name="plus" /> New project…</button>
          <button className="btn" onClick={openExisting}><Icon name="folder" /> Open existing folder…</button>
        </div>
      </div>
    );
  };

  return (
    <div className={`app-shell projects-page ${prefs.sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {!prefs.sidebarCollapsed && (
        <aside className="app-sidebar">
          <div className="sidebar-top" data-tauri-drag-region>
            <img className="app-icon" src="/app-icon.png" alt="Spectrum" draggable={false} data-tauri-drag-region />
            <button className="icon-btn" title={withShortcut(settings.shortcuts, 'Hide sidebar', 'sidebar')} aria-label="Hide sidebar" onClick={() => updatePrefs({ sidebarCollapsed: true })}>
              <Icon name="sidebar.left" />
            </button>
          </div>

          <nav className="sidebar-scroll">
            <button className={`nav-row ${view === 'home' ? 'active' : ''} ${dropTarget === 'home' ? 'drop-into' : ''}`} onClick={() => goHome(null)} {...dropProps(null, 'home')}>
              <Icon name="house" />
              <span className="nav-label">Home</span>
            </button>
            <button
              className={`nav-row ${view === 'all' ? 'active' : ''} ${dropTarget === '' ? 'drop-into' : ''}`}
              onClick={() => setView('all')}
              {...menuProps(() => folderMenu(null))}
              {...dropProps(null)}
            >
              <Icon name="tray.full" />
              <span className="nav-label">All projects</span>
              <span className="nav-count">{counts.all}</span>
            </button>
            {folderRows(null, 0)}
            <button className={`nav-row ${view === 'github' ? 'active' : ''}`} onClick={() => setView('github')}>
              <Icon name="arrow.triangle.branch" />
              <span className="nav-label">GitHub</span>
            </button>
            <button className={`nav-row ${view === 'archived' ? 'active' : ''}`} onClick={() => setView('archived')}>
              <Icon name="archivebox" />
              <span className="nav-label">Archived</span>
              <span className="nav-count">{counts.archived}</span>
            </button>

            <button className="sidebar-section-title" aria-expanded={prefs.tagsOpen} onClick={() => updatePrefs({ tagsOpen: !prefs.tagsOpen })}>
              <span>Tags</span>
              <Icon name="chevron.right" className={`disclosure ${prefs.tagsOpen ? 'open' : ''}`} />
            </button>
            {prefs.tagsOpen && (
              <>
                {allTags.map(([tag, count]) => (
                  <button
                    key={tag}
                    className={`nav-row ${activeTag === tag ? 'active' : ''}`}
                    onClick={() => setView(`tag:${tag}`)}
                    {...menuProps(() => tagMenu(tag))}
                  >
                    <span className="tag-dot" style={{ background: tagColour(tag, settings.tagColours) }} />
                    <span className="nav-label">{tag}</span>
                    <span className="nav-count">{count}</span>
                  </button>
                ))}
                {allTags.length === 0 && <div className="sidebar-hint">Tag projects from their ··· menu to group them here.</div>}
              </>
            )}
          </nav>

          <div className="sidebar-bottom">
            <button className="nav-row" onClick={() => setSheet({ kind: 'settings' })} title={`Settings (${formatShortcut('Mod-,')})`}>
              <Icon name="gearshape" />
              <span className="nav-label">Settings</span>
              <span className="nav-count" aria-label={`Spectrum ${__APP_VERSION__}`}>{__APP_VERSION__}</span>
            </button>
          </div>
        </aside>
      )}

      <main className="main-panel">
        <header className="panel-header" data-tauri-drag-region>
          {prefs.sidebarCollapsed && (
            <button className="icon-btn" title={withShortcut(settings.shortcuts, 'Show sidebar', 'sidebar')} aria-label="Show sidebar" onClick={() => updatePrefs({ sidebarCollapsed: false })}>
              <Icon name="sidebar.left" />
            </button>
          )}
          {view === 'home' ? (
            <nav className="panel-title home-path" aria-label="Folder path" data-tauri-drag-region>
              <button className="icon-btn" disabled={!homeFolder} title={`Back (${formatShortcut('Mod-ArrowUp')})`} aria-label="Back" onClick={() => goHome(homeFolder?.parent ?? null)}>
                <Icon name="chevron.left" />
              </button>
              <h1 className="home-path-parts">
                {[null, ...folderPath(folders, homeAt)].map((f, i, all) => (
                  <Fragment key={f?.id ?? ''}>
                    {i > 0 && <Icon name="chevron.right" className="home-path-sep" />}
                    <button
                      className={`home-path-part ${dropTarget === `path:${f?.id ?? ''}` ? 'drop-into' : ''}`}
                      aria-current={i === all.length - 1 ? 'page' : undefined}
                      onClick={() => goHome(f?.id ?? null)}
                      {...dropProps(f?.id ?? null, `path:${f?.id ?? ''}`)}
                    >
                      {f?.name ?? 'Home'}
                    </button>
                  </Fragment>
                ))}
              </h1>
            </nav>
          ) : (
            <h1 className="panel-title" data-tauri-drag-region>
              {activeTag && <span className="tag-dot large" style={{ background: tagColour(activeTag, settings.tagColours) }} />}
              {title}
            </h1>
          )}
          <div className="panel-header-tools">
            <label className="search-field">
              <Icon name="magnifyingglass" />
              <input
                ref={searchRef}
                value={query}
                placeholder="Search"
                aria-label="Search projects"
                spellCheck={false}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
              />
              {query && (
                <button className="search-clear" aria-label="Clear search" onClick={() => setQuery('')}>
                  <Icon name="xmark.circle.fill" />
                </button>
              )}
            </label>
            {/* the GitHub view is one list of repositories */}
            {view === 'home' && (
              <MenuButton
                label="Sort"
                items={HOME_SORTS.map(([sort, label]) => ({ label, checked: homeView.sort === sort, onSelect: () => setHomeView({ sort }) }))}
              />
            )}
            {view !== 'github' && (
              <div className="segmented icon-segmented" role="radiogroup" aria-label="View" onKeyDown={radioKeys}>
                <button
                  className={`segment ${layout === 'list' ? 'active' : ''}`}
                  role="radio"
                  aria-checked={layout === 'list'}
                  tabIndex={radioTab(layout === 'list', 0, layout === 'grid')}
                  title="List"
                  onClick={() => setLayout('list')}
                >
                  <Icon name="list.bullet" />
                </button>
                <button
                  className={`segment ${layout === 'grid' ? 'active' : ''}`}
                  role="radio"
                  aria-checked={layout === 'grid'}
                  tabIndex={radioTab(layout === 'grid', 1, true)}
                  title={view === 'home' ? 'Icons' : 'Grid'}
                  onClick={() => setLayout('grid')}
                >
                  <Icon name="square.grid.2x2" />
                </button>
              </div>
            )}
            {view !== 'github' && layout === 'grid' && (
              <input
                className="icon-size"
                type="range"
                min={0.75}
                max={2}
                step={0.25}
                value={prefs.iconSize}
                aria-label="Icon size"
                title="Icon size"
                onChange={(e) => updatePrefs({ iconSize: Number(e.target.value) })}
              />
            )}
            <MenuButton
              label="Import"
              disabled={busy}
              items={[
                { label: 'Upload a .zip…', icon: 'doc.zipper', onSelect: () => zipInputRef.current?.click() },
                { label: 'From arXiv…', icon: 'graduationcap', onSelect: () => setSheet({ kind: 'arxiv' }) },
                { separator: true },
                { label: 'Open existing folder…', icon: 'folder', onSelect: openExisting }
              ]}
            />
            <MenuButton
              label="New"
              icon="plus"
              className="btn inverse"
              align="end"
              // inside the folder showing, as in Finder
              items={[
                { label: here ? 'Blank project here…' : 'Blank project…', icon: 'doc.badge.plus', onSelect: () => setSheet({ kind: 'new', template: '', folder: here }) },
                { label: here ? 'From template here…' : 'From template…', icon: 'square.grid.2x2', onSelect: () => setSheet({ kind: 'gallery', folder: here }) },
                { separator: true },
                { label: here ? 'Folder here…' : 'Folder…', icon: 'folder.badge.plus', onSelect: () => newFolder(here) }
              ]}
            />
          </div>
        </header>

        <div className="panel-body" style={{ '--tile': `${Math.round(116 * prefs.iconSize)}px` } as CSSProperties}>
          {view === 'all' && notice && <MoveNotice notice={notice} onMove={moveHere} onDismiss={dismissNotice} />}
          {view === 'github' ? (
            <GitHubView
              key={settingsClosed}
              query={query}
              parentDir={parentDir}
              onOpen={(id) => navigate(`/editor/${id}`)}
              onChanged={() => reload()}
              onOpenSettings={() => setSheet({ kind: 'settings', section: 'github' })}
            />
          ) : view === 'home' ? (
            <Home
              projects={shownProjects}
              found={query.trim() ? visible : null}
              query={query}
              tree={folders}
              at={homeAt}
              view={homeView}
              title={title}
              empty={emptyState()}
              dropTarget={dropTarget}
              onGo={goHome}
              onOpen={open}
              onSort={(sort) => setHomeView({ sort })}
              onMenu={(x, y, items) => setCtx({ x, y, items })}
              onMove={(items) => setSheet({ kind: 'move', items })}
              folderMenu={folderMenu}
              projectMenu={menuFor}
              dropProps={dropProps}
              card={projectCard}
              row={projectRow}
            />
          ) : visible.length === 0 ? (
            emptyState()
          ) : prefs.layout === 'list' ? (
            <div className="project-list" role="table" aria-label={title}>
              <div className="project-row list-header" role="row">
                <span className="col-thumb" />
                <span className="col-name">
                  <button className={`sort-btn ${prefs.sortKey === 'name' ? 'active' : ''}`} onClick={sortByName}>
                    Name
                    <Icon name={prefs.sortKey !== 'name' ? 'chevron.up.chevron.down' : prefs.sortDir === 'asc' ? 'chevron.up' : 'chevron.down'} />
                  </button>
                </span>
                <span className="col-tags" />
                <span className="col-date">
                  <MenuButton label={dateLabel} className={`sort-btn ${prefs.sortKey === 'date' ? 'active' : ''}`} align="end" items={dateMenu} />
                </span>
                <span className="col-actions" />
              </div>
              {visible.map((p) => projectRow(p))}
            </div>
          ) : (
            <div className="project-grid">{visible.map((p) => projectCard(p))}</div>
          )}
        </div>
      </main>

      <input
        ref={zipInputRef}
        type="file"
        accept=".zip,application/zip"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) handleZip(file);
        }}
      />

      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onClose={() => setCtx(null)} />}

      {sheet?.kind === 'new' && (
        <NewProjectSheet
          templates={templates}
          initialTemplate={sheet.template}
          initialEngine={sheet.engine}
          universe={sheet.universe}
          defaultDir={settings.projectsDir || defaultDir}
          onClose={() => setSheet(null)}
          onBrowse={(engine) => setSheet({ kind: 'gallery', engine, folder: sheet.folder })}
          onUniverse={() => setSheet({ kind: 'universe', folder: sheet.folder })}
          onCreated={(id) => {
            if (sheet.folder) moveToFolder(id, sheet.folder);
            navigate(`/editor/${id}`);
          }}
        />
      )}

      {sheet?.kind === 'gallery' && (
        <TemplateGallerySheet
          templates={templates}
          categories={categories}
          drafts={drafts}
          initialEngine={sheet.engine}
          onClose={() => setSheet(null)}
          onPick={(id) => setSheet({ kind: 'new', template: id, folder: sheet.folder })}
          onUniverse={() => setSheet({ kind: 'universe', folder: sheet.folder })}
          onEdit={(projectId) => navigate(`/editor/${projectId}`)}
          onChanged={reloadTemplates}
        />
      )}

      {sheet?.kind === 'universe' && (
        <UniverseSheet
          onClose={() => setSheet(null)}
          onBack={() => setSheet({ kind: 'gallery', engine: 'typst', folder: sheet.folder })}
          onPick={(t) => setSheet({ kind: 'new', template: '', universe: t, folder: sheet.folder })}
        />
      )}

      {sheet?.kind === 'saveTemplate' && sheetProject && (
        <SaveTemplateSheet
          projectId={sheetProject.id}
          name={sheetProject.name}
          onClose={() => setSheet(null)}
          onSaved={() => {
            setSheet(null);
            reloadTemplates().catch(() => undefined);
          }}
        />
      )}

      {sheet?.kind === 'arxiv' && (
        <ArxivSheet parentDir={parentDir} location={settings.projectsDir || defaultDir} onClose={() => setSheet(null)} onImported={(id) => navigate(`/editor/${id}`)} />
      )}

      {sheet?.kind === 'tags' && sheetProject && (
        <TagsSheet
          project={sheetProject}
          allTags={allTags.map(([tag]) => tag)}
          onChange={(tags) => setTags(sheetProject.id, tags)}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.kind === 'move' && (
        <MoveToFolderSheet
          items={sheet.items}
          projects={projects}
          folders={folders}
          onMove={(folderId) => {
            moveInto(sheet.items, folderId);
            setSheet(null);
          }}
          onNewFolder={async () => {
            const id = await newFolder(null);
            if (!id) return;
            moveInto(sheet.items, id);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.kind === 'customise' && folders.folders.some((f) => f.id === sheet.folder) && (
        <CustomiseFolderSheet folder={folders.folders.find((f) => f.id === sheet.folder)!} onChange={(change) => changeFolders((tree) => change(tree, sheet.folder))} onClose={() => setSheet(null)} />
      )}

      {sheet?.kind === 'transfer' && sheetProject && (
        <Sheet title={`Change template · ${sheetProject.name}`} width={640} onClose={() => setSheet(null)}>
          <TransferPanel
            projectId={sheetProject.id}
            onJobUpdate={(update) => {
              setJob({ ...update, sourceName: sheetProject.name });
              // 'failed' keeps the new project; 'error' removes it
              if (update.status === 'success' || update.status === 'failed' || update.status === 'error') reload();
            }}
            onSwitched={reload}
            onOpenProject={(id) => navigate(`/editor/${id}`)}
          />
        </Sheet>
      )}

      {sheet?.kind === 'settings' && (
        <SettingsSheet
          section={sheet.section}
          onClose={() => {
            setSheet(null);
            setSettingsClosed((n) => n + 1);
            reload();
          }}
        />
      )}

      {job && sheet?.kind !== 'transfer' && (
        <div className="transfer-widget" role="status">
          <div className="transfer-widget-header">
            <Icon name="arrow.triangle.2.circlepath" />
            <span className="truncate">Change template · {job.sourceName}</span>
            <button className="icon-btn small" title="Close" aria-label="Close" onClick={() => setJob(null)}><Icon name="xmark" /></button>
          </div>
          <div className={`transfer-status ${job.status}`}>
            {job.status === 'success' ? (
              <Icon name="checkmark.circle.fill" />
            ) : job.status === 'failed' || job.status === 'error' ? (
              <Icon name="xmark.octagon.fill" />
            ) : (
              <span className="spinner" />
            )}
            <span>{transferStatusLabel(job.status)}</span>
          </div>
          {job.error && <div className="field-hint error">{job.error}</div>}
          {job.progressLog.length > 0 && (
            <div className="log-box">
              {job.progressLog.slice(-8).map((line, i) => <div key={i}>{line}</div>)}
            </div>
          )}
          {(job.status === 'success' || job.status === 'failed') && job.newProjectId && (
            <button className="btn primary small" onClick={() => navigate(`/editor/${job.newProjectId}`)}>Open new project</button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── pieces ───

function Thumb({ project }: { project: ProjectMeta }) {
  const src = thumbnailUrl(project);
  // remembers which URL failed, so a newer thumbnail gets another try
  const [failedSrc, setFailedSrc] = useState('');
  if (project.hasThumbnail && !project.missing && failedSrc !== src) {
    return <img className="thumb" src={src} alt="" loading="lazy" draggable={false} onError={() => setFailedSrc(src)} />;
  }
  return (
    <span className="thumb placeholder" aria-hidden="true">
      <i /><i /><i /><i /><i /><i />
    </span>
  );
}

function NewProjectSheet({
  templates,
  initialTemplate,
  initialEngine,
  universe: chosenUniverse,
  defaultDir,
  onClose,
  onBrowse,
  onUniverse,
  onCreated
}: {
  templates: TemplateMeta[];
  initialTemplate: string;
  initialEngine?: Engine;
  /** a Typst Universe template in place of one of Spectrum's */
  universe?: UniverseTemplate;
  defaultDir: string;
  onClose: () => void;
  /** the gallery, showing this engine's templates */
  onBrowse: (engine: Engine) => void;
  onUniverse: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [template, setTemplate] = useState(initialTemplate);
  const [universe, setUniverse] = useState(chosenUniverse);
  const picked = templates.find((t) => t.id === initialTemplate);
  const [engine, setEngine] = useState<Engine>(chosenUniverse ? 'typst' : picked ? engineOf(picked.mainFile) : initialEngine || 'latex');
  const offered = templates.filter((t) => engineOf(t.mainFile) === engine);
  const chooseEngine = (next: Engine) => {
    setEngine(next);
    setUniverse(undefined);
    if (!templates.some((t) => t.id === template && engineOf(t.mainFile) === next)) setTemplate('');
  };
  const [dir, setDir] = useState('');
  const [creating, setCreating] = useState(false);
  const location = dir || defaultDir;

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const project = universe
        ? await createUniverseProject({ name: trimmed, template: universe.name, version: universe.version, parentDir: location || undefined })
        : await createProject({ name: trimmed, template: template || undefined, parentDir: location || undefined });
      if (!template && !universe) {
        // a blank project still needs something to compile, in the engine chosen
        const blank = BLANK[engine];
        const tree = await getProjectTree(project.id);
        if (!tree.items.some((item) => item.type === 'file' && item.path === blank.file)) {
          await writeFile(project.id, blank.file, blank.text(trimmed));
          await setProjectMainFile(project.id, blank.file).catch(() => undefined);
        }
      }
      onCreated(project.id);
    } catch (err) {
      toast(`Couldn’t create the project: ${errorText(err)}`, { tone: 'error' });
      setCreating(false);
    }
  };

  return (
    <Sheet
      title="New project"
      width={520}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!name.trim() || creating} onClick={create}>
            {creating ? <><span className="spinner" /> Creating…</> : 'Create'}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="new-project-name">Name</label>
        <input
          id="new-project-name"
          className="input"
          autoFocus
          value={name}
          placeholder="My paper"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && create()}
        />
      </div>
      <div className="field">
        <label id="new-project-engine">Write in</label>
        <Segmented className="fill" labelledBy="new-project-engine" value={engine} options={ENGINES} onChange={chooseEngine} />
      </div>
      <div className="field">
        <label id="new-project-template">Template</label>
        {universe ? (
          <>
            <div className="row">
              <span className="path-row grow" aria-labelledby="new-project-template">
                <Icon name="shippingbox" />
                <span className="path-text">{universe.name} {universe.version}, from Typst Universe</span>
              </span>
              <button className="btn" onClick={onUniverse}><Icon name="shippingbox" /> Browse…</button>
            </div>
            <div className="field-hint">
              Licence: {universe.license || 'none given'}. {universe.mitCompatible ? '' : LICENCE_NOTE + ' '}Creating the project downloads this template.
            </div>
          </>
        ) : (
        <div className="row">
          <Select
            className="grow"
            labelId="new-project-template"
            value={template}
            options={[['', 'Blank'], ...offered.map((t): [string, string] => [t.id, t.label])]}
            onChange={setTemplate}
          />
          <button className="btn" onClick={() => onBrowse(engine)}><Icon name="square.grid.2x2" /> Browse…</button>
        </div>
        )}
        {engine === 'typst' && !universe && (
          <button className="btn ghost small" onClick={onUniverse}><Icon name="shippingbox" /> More templates from Typst Universe…</button>
        )}
      </div>
      <div className="field">
        <label id="new-project-location">Location</label>
        <div className="path-row" role="group" aria-labelledby="new-project-location">
          <Icon name="folder" />
          <span className="path-text" title={location}>{location ? tildify(location) : 'Default projects folder'}</span>
          <button
            className="btn small"
            onClick={async () => {
              const picked = await pickFolder({ title: 'Choose where to create the project', defaultPath: location });
              if (picked) setDir(picked);
            }}
          >
            Change…
          </button>
        </div>
        <div className="field-hint">A new folder named after the project is created here.</div>
      </div>
    </Sheet>
  );
}

function TemplateGallerySheet({
  templates,
  categories,
  drafts,
  initialEngine,
  onClose,
  onPick,
  onUniverse,
  onEdit,
  onChanged
}: {
  templates: TemplateMeta[];
  categories: TemplateCategory[];
  drafts: string[];
  initialEngine?: Engine;
  onClose: () => void;
  onPick: (id: string) => void;
  /** opens Typst Universe's templates */
  onUniverse: () => void;
  /** opens the working copy, a project */
  onEdit: (projectId: string) => void;
  /** a template was added, changed or deleted */
  onChanged: () => Promise<void>;
}) {
  const [engine, setEngine] = useState<Engine>(initialEngine || 'latex');
  const [category, setCategory] = useState('all');
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const inEngine = useMemo(() => templates.filter((t) => engineOf(t.mainFile) === engine), [templates, engine]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inEngine.filter(
      (t) =>
        (category === 'all' || t.category === category) &&
        (!featuredOnly || t.featured) &&
        (!q || [t.label, t.description, ...(t.tags || [])].some((s) => (s || '').toLowerCase().includes(q)))
    );
  }, [inEngine, category, featuredOnly, search]);

  const upload = async (file: File) => {
    const base = file.name.replace(/\.zip$/i, '');
    setUploading(true);
    try {
      ensureOk(await uploadTemplate(base.toLowerCase().replace(/[^a-z0-9_-]/g, '_'), base, file), 'Upload failed');
      await onChanged();
      toast(`Added the “${base}” template.`, { tone: 'success' });
    } catch (err) {
      toast(`Couldn’t add the template: ${errorText(err)}`, { tone: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const edit = async (t: TemplateMeta) => {
    try {
      onEdit((await editTemplate(t.id)).project.id);
    } catch (err) {
      toast(`Couldn’t open the template: ${errorText(err)}`, { tone: 'error' });
    }
  };

  const restore = async (t: TemplateMeta) => {
    const ok = await confirmDialog({
      title: `Restore the original “${t.label}” template?`,
      message: 'Your changes to it are replaced by the template as it comes with Spectrum. Projects already made from it don’t change.',
      confirmLabel: 'Restore',
      destructive: true
    });
    if (!ok) return;
    try {
      await restoreTemplate(t.id);
      await onChanged();
      toast(`Restored the original “${t.label}” template.`, { tone: 'success' });
    } catch (err) {
      toast(`Couldn’t restore the template: ${errorText(err)}`, { tone: 'error' });
    }
  };

  const remove = async (t: TemplateMeta) => {
    const ok = await confirmDialog({
      title: `Delete the “${t.label}” template?`,
      message: 'This can’t be undone. Projects already made from it don’t change.',
      confirmLabel: 'Delete',
      destructive: true
    });
    if (!ok) return;
    try {
      await deleteTemplate(t.id);
      await onChanged();
      toast(`Deleted the “${t.label}” template.`);
    } catch (err) {
      toast(`Couldn’t delete the template: ${errorText(err)}`, { tone: 'error' });
    }
  };

  // Spectrum's own can be edited and restored, the user's own edited and deleted
  const menuFor = (t: TemplateMeta): MenuItems => [
    { label: drafts.includes(t.id) ? 'Continue editing' : 'Edit template', icon: 'square.and.pencil', onSelect: () => edit(t) },
    t.edited && { label: 'Restore original…', icon: 'arrow.uturn.backward', onSelect: () => restore(t) },
    t.author === 'User' && { separator: true },
    t.author === 'User' && { label: 'Delete…', icon: 'trash', destructive: true, onSelect: () => remove(t) }
  ];

  return (
    <Sheet title="Choose a template" width={880} className="gallery-sheet" onClose={onClose}>
      <div className="gallery-toolbar">
        <Segmented
          className="fill"
          label="Write in"
          value={engine}
          options={ENGINES}
          onChange={(next) => {
            setEngine(next);
            setCategory('all');
          }}
        />
        <div className="chip-row">
          {[{ id: 'all', label: 'All' }, ...categories.filter((c) => c.id !== 'all' && inEngine.some((t) => t.category === c.id))].map((c) => (
            <button key={c.id} className={`chip ${category === c.id ? 'active' : ''}`} onClick={() => setCategory(c.id)}>
              {c.label}
            </button>
          ))}
          <button className={`chip ${featuredOnly ? 'active' : ''}`} onClick={() => setFeaturedOnly(!featuredOnly)} aria-pressed={featuredOnly}>
            <Icon name={featuredOnly ? 'star.fill' : 'star'} /> Featured
          </button>
        </div>
        <div className="row">
          <label className="search-field">
            <Icon name="magnifyingglass" />
            <input value={search} placeholder="Search templates" spellCheck={false} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <input
            ref={fileRef}
            type="file"
            accept=".zip,application/zip"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) upload(file);
            }}
          />
          <button className="btn" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? <span className="spinner" /> : <Icon name="square.and.arrow.up" />} Upload template…
          </button>
          {engine === 'typst' && <button className="btn" onClick={onUniverse}><Icon name="shippingbox" /> Typst Universe…</button>}
        </div>
      </div>
      {shown.length === 0 ? (
        <div className="empty-state compact">
          <div className="empty-title">No matching templates</div>
          <div className="empty-text">Try another search or category, or upload a template.</div>
          <div className="empty-actions">
            <button
              className="btn"
              onClick={() => {
                setCategory('all');
                setFeaturedOnly(false);
                setSearch('');
              }}
            >
              Show all
            </button>
          </div>
        </div>
      ) : (
        <div className="template-grid">
          {shown.map((t) => (
            <div key={t.id} className="template-item">
              <button className="template-card" onClick={() => onPick(t.id)}>
                <span className="template-paper" aria-hidden="true">
                  <span className="paper-title">{t.label.replace(/\s*\(.*\)\s*$/, '')}</span>
                  <span className="paper-lines"><i /><i /><i /><i /><i /><i /><i /></span>
                  {t.featured && <span className="template-star"><Icon name="star.fill" /></span>}
                </span>
                <span className="template-body">
                  <span className="template-title">
                    {t.label}
                    {t.author === 'User' ? <span className="badge accent">Yours</span> : t.edited && <span className="badge">Edited</span>}
                  </span>
                  {t.description && <span className="template-desc">{t.description}</span>}
                </span>
              </button>
              <span className="card-menu">
                <MenuButton icon="ellipsis" title={`More for ${t.label}`} className="icon-btn small" align="end" items={menuFor(t)} />
              </span>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

/** Name, section and description for a new template made from a project (the editor uses it too). */
export function SaveTemplateSheet({
  projectId,
  name,
  template,
  onClose,
  onSaved
}: {
  projectId: string;
  name: string;
  /** the template a working copy is of, whose section and description start the form */
  template?: string;
  onClose: () => void;
  onSaved: (template: TemplateMeta) => void;
}) {
  const [label, setLabel] = useState(name);
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [categories, setCategories] = useState<TemplateCategory[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listTemplates()
      .then((res) => {
        const sections = (res.categories || []).filter((c) => c.id !== 'all');
        const from = res.templates.find((t) => t.id === template);
        setCategories(sections);
        setCategory(from?.category || sections[0]?.id || '');
        setDescription(from?.description || '');
      })
      .catch((err) => toast(`Couldn’t load the template sections: ${errorText(err)}`, { tone: 'error' }));
  }, [template]);

  const save = async () => {
    if (!label.trim() || !category || saving) return;
    setSaving(true);
    try {
      const res = await saveAsTemplate(projectId, { label: label.trim(), category, description });
      toast(`Saved the “${res.template.label}” template.`, { tone: 'success' });
      onSaved(res.template);
    } catch (err) {
      toast(`Couldn’t save the template: ${errorText(err)}`, { tone: 'error' });
      setSaving(false);
    }
  };
  const onEnter = (e: ReactKeyboardEvent) => e.key === 'Enter' && !e.nativeEvent.isComposing && save();

  return (
    <Sheet
      title={template ? 'Save as new template' : 'Save as template'}
      width={520}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!label.trim() || !category || saving} onClick={save}>
            {saving ? <><span className="spinner" /> Saving…</> : 'Save template'}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="template-name">Name</label>
        <input id="template-name" className="input" autoFocus value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={onEnter} />
      </div>
      <div className="field">
        <label id="template-section">Section</label>
        <Select labelId="template-section" value={category} options={categories.map((c): [string, string] => [c.id, c.label])} onChange={setCategory} />
      </div>
      <div className="field">
        <label htmlFor="template-description">Description</label>
        <input
          id="template-description"
          className="input"
          value={description}
          placeholder="What it’s for, in a line"
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={onEnter}
        />
        <div className="field-hint">The template gets a copy of the project’s files, without its compiled PDFs.</div>
      </div>
    </Sheet>
  );
}

function ArxivSheet({
  parentDir,
  location,
  onClose,
  onImported
}: {
  parentDir?: string;
  location: string;
  onClose: () => void;
  onImported: (id: string) => void;
}) {
  const [input, setInput] = useState('');
  const [progress, setProgress] = useState<{ phase: string; percent: number } | null>(null);
  const [error, setError] = useState('');
  const importing = progress !== null;
  const abortRef = useRef<AbortController | null>(null);

  // closing the sheet (Cancel, Escape, ×, backdrop) cancels a running import
  useEffect(() => () => abortRef.current?.abort(), []);

  const start = async () => {
    const id = input.trim();
    if (!id || importing) return;
    setError('');
    setProgress({ phase: 'download', percent: -1 });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await importArxivSSE({ arxivIdOrUrl: id, parentDir }, (p) => setProgress(p), controller.signal);
      if (!res.ok || !res.project) throw new Error(res.error || 'Import failed');
      onImported(res.project.id);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(errorText(err));
      setProgress(null);
    }
  };

  const label = !progress
    ? ''
    : progress.phase === 'download'
      ? progress.percent >= 0
        ? `Downloading… ${progress.percent}%`
        : 'Downloading…'
      : 'Extracting…';

  return (
    <Sheet
      title="Import from arXiv"
      width={520}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>{importing ? 'Cancel import' : 'Cancel'}</button>
          <button className="btn primary" disabled={!input.trim() || importing} onClick={start}>Import</button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="arxiv-input">arXiv ID or link</label>
        <input
          id="arxiv-input"
          className="input"
          autoFocus
          value={input}
          placeholder="e.g. 1706.03762 or https://arxiv.org/abs/1706.03762"
          spellCheck={false}
          disabled={importing}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && start()}
        />
        <div className="field-hint">The LaTeX source is downloaded into a new project{location ? ` in ${tildify(location)}` : ''}.</div>
      </div>
      {progress && (
        <div className="field">
          <div className="progress-label">{label}</div>
          <div className={`progress ${progress.percent < 0 ? 'indeterminate' : ''}`}>
            <div style={{ width: progress.percent >= 0 ? `${progress.percent}%` : undefined }} />
          </div>
        </div>
      )}
      {error && <div className="field-hint error">{error}</div>}
    </Sheet>
  );
}

const listOf = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] || '');

/**
 * Once, after the move to 2.0: the projects that synced through a cloud location are ordinary projects here now, their
 * copies there left as they are, with what a copy has that this computer never received; the ones used in a sync
 * app's folder can move to this computer.
 */
function MoveNotice({ notice, onMove, onDismiss }: { notice: MigrationNotice; onMove: (p: MigrationNotice['inPlace'][number]) => void; onDismiss: () => void }) {
  const labels = listOf([...new Set([...notice.mirrored, ...notice.inPlace].map((p) => p.label))]);
  const names = listOf(notice.mirrored.map((p) => `“${p.name}”`));
  const reveal = (id: string) => revealCloudCopy(id).catch((err) => toast(errorText(err), { tone: 'error' }));
  const behind = notice.mirrored.filter((p) => p.missing || p.unchecked || p.changed?.length || p.deleted?.length);
  return (
    <div className="move-notice" role="status">
      <Icon name="info.circle" />
      <div className="move-notice-body">
        <div className="move-notice-title">Spectrum 2.0 syncs through GitHub instead of {labels}</div>
        {names && (
          <div className="move-notice-text">
            {names} {notice.mirrored.length > 1 ? 'are' : 'is'} now {notice.mirrored.length > 1 ? 'ordinary projects' : 'an ordinary project'} on this computer. {notice.mirrored.length > 1 ? 'Their copies' : 'Its copy'} in {labels} {notice.mirrored.length > 1 ? 'are' : 'is'} left as {notice.mirrored.length > 1 ? 'they are' : 'it is'} and no longer updated. Update your other computer to 2.0 too, as 1.10 there keeps changing its copy. Then use Sync with GitHub here, and Link or Get from GitHub there.
          </div>
        )}
        {behind.map((p) => {
          const files = [...(p.changed || []), ...(p.deleted || []).map((rel) => `${rel} (deleted there)`)];
          return (
            <div key={p.id} className="move-notice-row">
              <span className="grow">
                {p.missing
                  ? `The copy of “${p.name}” isn’t in ${p.label} any more.`
                  : p.unchecked
                    ? `Spectrum couldn’t look through the copy of “${p.name}” in ${p.label}, so check it for changes this computer doesn’t have.`
                    : `The copy of “${p.name}” in ${p.label} has changes this computer never received: ${listOf([...files.slice(0, 5), ...(files.length > 5 ? [`${files.length - 5} more`] : [])])}. Copy over what you need.`}
              </span>
              {IS_DESKTOP && !p.missing && <button className="btn small" onClick={() => reveal(p.id)}>Show in {FILE_MANAGER}</button>}
            </div>
          );
        })}
        {notice.inPlace.map((p) => (
          <div key={p.id} className="move-notice-row">
            <span className="grow">“{p.name}” is still used in its {p.label} folder. That works, but a sync app can damage the project’s GitHub history.</span>
            <button className="btn small" onClick={() => onMove(p)}>Move to this computer…</button>
          </div>
        ))}
        <div>
          <button className="btn small primary" onClick={onDismiss}>OK</button>
        </div>
      </div>
    </div>
  );
}

function TagsSheet({
  project,
  allTags,
  onChange,
  onClose
}: {
  project: ProjectMeta;
  allTags: string[];
  onChange: (tags: string[]) => void;
  onClose: () => void;
}) {
  const [settings] = useSettings();
  const [input, setInput] = useState('');
  const add = (raw: string) => {
    const tag = raw.trim();
    setInput('');
    if (tag && !project.tags.includes(tag)) onChange([...project.tags, tag]);
  };
  const suggestions = allTags.filter((tag) => !project.tags.includes(tag));

  return (
    <Sheet title={`Tags · ${project.name}`} width={460} onClose={onClose} actions={<button className="btn primary" onClick={onClose}>Done</button>}>
      <div className="chip-row">
        {project.tags.length === 0 && <span className="field-hint">No tags yet.</span>}
        {project.tags.map((tag) => (
          <span key={tag} className="chip tag-chip">
            <span className="tag-dot" style={{ background: tagColour(tag, settings.tagColours) }} />
            {tag}
            <button className="chip-remove" aria-label={`Remove ${tag}`} onClick={() => onChange(project.tags.filter((t) => t !== tag))}>
              <Icon name="xmark" />
            </button>
          </span>
        ))}
      </div>
      <div className="row">
        <input
          className="input grow"
          autoFocus
          value={input}
          placeholder="New tag"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              add(input);
            }
          }}
        />
        <button className="btn" disabled={!input.trim()} onClick={() => add(input)}>Add</button>
      </div>
      {suggestions.length > 0 && (
        <div className="field">
          <label id="existing-tags">Existing tags</label>
          <div className="chip-row" role="group" aria-labelledby="existing-tags">
            {suggestions.map((tag) => (
              <button key={tag} className="chip tag-chip" onClick={() => add(tag)}>
                <span className="tag-dot" style={{ background: tagColour(tag, settings.tagColours) }} />
                {tag}
                <Icon name="plus" />
              </button>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}

/** The one folder a project is in, or none; choosing one moves it there. */
function MoveToFolderSheet({
  items,
  projects,
  folders,
  onMove,
  onNewFolder,
  onClose
}: {
  items: string[];
  projects: ProjectMeta[];
  folders: ProjectFolders;
  onMove: (folderId: string | null) => void;
  onNewFolder: () => void;
  onClose: () => void;
}) {
  const current = sharedPlace(folders, items);
  const name = items.length > 1 ? `${items.length} items` : items[0].startsWith('p:') ? projects.find((p) => `p:${p.id}` === items[0])?.name : folders.folders.find((f) => `f:${f.id}` === items[0])?.name;
  const choice = (id: string | null, name: string, depth: number) => (
    <button
      key={id ?? ''}
      className={`nav-row ${current === id ? 'active' : ''}`}
      style={{ paddingLeft: 10 + depth * 14 }}
      role="radio"
      aria-checked={current === id}
      tabIndex={(current === undefined ? id === null : current === id) ? 0 : -1}
      onClick={() => onMove(id)}
    >
      <Icon name={id ? 'folder' : 'tray.full'} />
      <span className="nav-label">{name}</span>
    </button>
  );
  const tree = (parent: string | null, depth: number): ReactNode[] =>
    childFolders(folders, parent).flatMap((f) => [choice(f.id, f.name, depth), ...tree(f.id, depth + 1)]);

  return (
    <Sheet
      title={`Move to folder · ${name ?? ''}`}
      width={420}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onNewFolder}><Icon name="folder.badge.plus" /> New folder…</button>
          <button className="btn" onClick={onClose}>Cancel</button>
        </>
      }
    >
      <div role="radiogroup" aria-label="Folder" onKeyDown={radioKeys}>
        {choice(null, 'No folder', 0)}
        {tree(null, 0)}
      </div>
    </Sheet>
  );
}
