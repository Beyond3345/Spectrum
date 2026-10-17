import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  archiveProject,
  binProject,
  copyProject,
  createProject,
  deleteTemplate,
  downloadCloudProject,
  editTemplate,
  getProjectTree,
  getSyncSettings,
  hideProject,
  importArxivSSE,
  importZip,
  listProjects,
  listTemplates,
  openFolder,
  relocateProject,
  removeProject,
  renameProject,
  restoreTemplate,
  revealCloudCopy,
  revealProject,
  saveAsTemplate,
  setProjectMainFile,
  stopSyncing,
  syncCloudProject,
  syncProjectTo,
  systemCheck,
  thumbnailUrl,
  updateProjectTags,
  uploadTemplate,
  writeFile
} from '../api/client';
import type { CloudLocation, CloudOnlyProject, MirrorStatus, ProjectCloud, ProjectMeta, SyncPlace, TemplateCategory, TemplateMeta } from '../api/client';
import Icon from './Icon';
import { ContextMenu, MenuButton } from './Menu';
import type { MenuItems } from './Menu';
import Select from './Select';
import Sheet from './Sheet';
import SettingsSheet from './SettingsSheet';
import TransferPanel, { transferStatusLabel } from './TransferPanel';
import type { TransferJob } from './TransferPanel';
import { confirmDialog, promptDialog } from './Dialogs';
import { toast } from './Toast';
import { IS_DESKTOP, pickFolder } from './desktop';
import { addFolder, childFolders, deleteFolder, placeProject, renameFolder } from './folders';
import type { ProjectFolder, ProjectFolders } from './folders';
import { BIN, FILE_MANAGER, IS_WINDOWS, tildify } from './platform';
import { loadSettings, useSettings } from './settings';
import { formatShortcut, matchesShortcut, shortcutKey, withShortcut } from './shortcuts';

// ─── helpers ───

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Throws on `{ ok: false }` answers so callers can use one catch. */
function ensureOk<T extends { ok?: boolean; error?: string }>(res: T, fallback: string): T {
  if (res.ok === false) throw new Error(res.error || fallback);
  return res;
}

const relative = new Intl.RelativeTimeFormat('en-AU', { numeric: 'always' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['minute', 60],
  ['hour', 3600],
  ['day', 86400],
  ['week', 604800],
  ['month', 2629800],
  ['year', 31557600]
];

function timeAgo(iso: string) {
  const secs = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(secs)) return '';
  if (secs < 60) return 'Just now';
  const [unit, size] = UNITS.filter(([, s]) => secs >= s).pop()!;
  return relative.format(-Math.floor(secs / size), unit);
}

const fullDate = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const formatFull = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : fullDate.format(d);
};

/** A listed project, or one only in a cloud location (cloudOnly), shown greyed out */
type Row = ProjectMeta & { cloudOnly?: CloudOnlyProject };

/**
 * In place of the path once the project is in a sync app's folder: “Synology Drive · Spectrum/Thesis”; one in a cloud
 * location from the location, as the ones only there are: “OneDrive · Thesis”
 */
const whereText = (p: Row) => {
  const place = p.cloudOnly || (p.cloud?.mode === 'move' ? p.cloud : p.place);
  return place ? `${place.label} · ${place.rel}` : tildify(p.path);
};

// what to check when a sync app's folder isn't on this computer
const SIGNED_IN: Record<SyncPlace['provider'], string> = {
  synology: 'is Drive Client installed and signed in?',
  onedrive: 'is OneDrive installed and signed in?',
  dropbox: 'is Dropbox installed and signed in?',
  google: 'is Google Drive installed and signed in?',
  icloud: 'is iCloud Drive turned on?'
};

/**
 * Why a project can't open here, for the list and (shorter) for a card. A sync app can't say whether a folder is
 * still on its way or was moved or binned on the other computer, so the words cover both.
 */
function absence(p: Row): [string, string] {
  if (p.place?.here) return [`On ${p.place.label} – not on this computer yet`, 'Not on this computer yet'];
  if (p.place) return [`${p.place.label} folder not found – ${SIGNED_IN[p.place.provider]}`, `${p.place.label} not found`];
  return ['Folder missing', 'Folder missing'];
}

// how a mirrored project's syncing stands, for its badge
const MIRROR_TEXT: Record<MirrorStatus['state'], (label: string) => string> = {
  synced: () => 'Synced',
  syncing: () => 'Syncing…',
  waiting: (label) => `Waiting for ${label}`,
  attention: () => 'Needs attention',
  missing: () => 'Folder missing',
  'not-found': (label) => `Not in ${label}`
};

/**
 * The badge by a project's name, [long, short] as absence() gives: why it can't open here, or how a cloud project
 * stands. A moved one is the sync app's to keep in step, so its badge only says where it is.
 */
function badgeOf(p: Row): { icon?: string; text: [string, string]; warning: boolean } | null {
  if (p.cloudOnly) return { icon: 'arrow.down.circle', text: [`In ${p.cloudOnly.label}, not on this computer`, 'Not on this computer'], warning: false };
  if (p.missing) return { text: absence(p), warning: true };
  if (!p.cloud) return null;
  const state = p.cloud.status?.state;
  const text = state ? MIRROR_TEXT[state](p.cloud.label) : p.cloud.label;
  const warning = state === 'attention' || state === 'missing' || state === 'not-found';
  return { icon: warning ? 'exclamationmark.triangle' : 'cloud', text: [text, text], warning };
}

// a project card or row on its way to a folder in the sidebar
const DRAG_TYPE = 'application/x-spectrum-project';

const TAG_COLOURS = [
  'var(--accent)',
  'var(--green)',
  'var(--orange)',
  'var(--red)',
  'var(--yellow)',
  'color-mix(in srgb, var(--accent) 55%, var(--red))',
  'color-mix(in srgb, var(--green) 55%, var(--accent))'
];
const tagColour = (tag: string) => TAG_COLOURS[[...tag].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % TAG_COLOURS.length];

const texEscape = (s: string) => s.replace(/[\\~^]/g, '').replace(/[&%$#_{}]/g, '\\$&');
const blankTex = (name: string) => `\\documentclass[11pt]{article}

\\title{${texEscape(name)}}
\\author{}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Introduction}


\\end{document}
`;

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
};
const PREFS_KEY = 'spectrum-projects-view';
const DEFAULT_PREFS: Prefs = { layout: 'list', sortKey: 'date', dateField: 'updatedAt', sortDir: 'desc', sidebarCollapsed: false, tagsOpen: true, closedFolders: [] };

function loadPrefs(): Prefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(window.localStorage.getItem(PREFS_KEY) || '{}') };
  } catch {
    return DEFAULT_PREFS;
  }
}

type SheetState =
  | { kind: 'new'; template: string }
  | { kind: 'gallery' }
  | { kind: 'arxiv' }
  | { kind: 'tags'; id: string }
  | { kind: 'folder'; id: string }
  | { kind: 'stopSyncing'; id: string }
  | { kind: 'transfer'; id: string }
  | { kind: 'saveTemplate'; id: string }
  | { kind: 'settings' }
  | null;

type ActiveJob = TransferJob & { sourceName: string };

// ─── page ───

export default function ProjectPage() {
  const navigate = useNavigate();
  const [settings, update] = useSettings();
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  /** projects in the cloud locations that this computer doesn't have */
  const [cloudOnly, setCloudOnly] = useState<CloudOnlyProject[]>([]);
  const [locations, setLocations] = useState<CloudLocation[]>([]);
  /** the templates with a working copy open, which the gallery offers to go on editing */
  const [drafts, setDrafts] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [categories, setCategories] = useState<TemplateCategory[]>([]);
  const [defaultDir, setDefaultDir] = useState('');
  const [view, setView] = useState('all'); // 'all' | 'cloud' | 'archived' | 'tag:<name>' | 'folder:<id>'
  const [query, setQuery] = useState('');
  const [prefs, setPrefs] = useState(loadPrefs);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number; items: MenuItems } | null>(null);
  /** the sidebar row a dragged project would drop into: a folder's id, or '' for All projects */
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

  const reload = useCallback(async (scan = false) => {
    try {
      const res = await listProjects(scan);
      const all = (res.projects || []).map((p) => ({ ...p, tags: p.tags || [] }));
      // working copies of templates open from the template gallery, not the list
      setProjects(all.filter((p) => !p.templateDraft));
      setDrafts(all.flatMap((p) => p.templateDraft || []));
      setCloudOnly(res.cloudOnly || []);
      setLoadError('');
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

  // for Sync to
  const loadLocations = () => getSyncSettings().then((res) => setLocations(res.folders)).catch(() => undefined);

  useEffect(() => {
    reload();
    reloadTemplates().catch((err) => toast(`Couldn’t load templates: ${errorText(err)}`, { tone: 'error' }));
    systemCheck().then((res) => setDefaultDir(res.projectsDir || '')).catch(() => undefined);
    loadLocations();
  }, [reload, reloadTemplates]);

  // with cloud locations, projects arriving from another computer and how syncing stands show up when the window comes
  // to the front, and every 30 s; every 3 s while a project is syncing, so Synced shows when it is
  const synced = locations.length > 0;
  const syncing = projects.some((p) => p.cloud?.status?.state === 'syncing');
  useEffect(() => {
    if (!synced) return;
    const onFocus = () => reload(true);
    const timer = window.setInterval(() => document.visibilityState === 'visible' && reload(), syncing ? 3000 : 30_000);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.clearInterval(timer);
    };
  }, [synced, syncing, reload]);

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
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // updatePrefs only uses the functional setState form, so a stale copy is fine
  }, [sheet, settings.shortcuts]);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    projects.forEach((p) => p.tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1)));
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b, 'en-AU', { sensitivity: 'base' }));
  }, [projects]);

  const activeTag = view.startsWith('tag:') ? view.slice(4) : null;
  const folders = settings.projectFolders;
  const activeFolder = view.startsWith('folder:') ? folders.folders.find((f) => f.id === view.slice(7)) : undefined;

  // a tag view whose last project lost the tag, or a deleted folder's view, falls back to All projects
  useEffect(() => {
    if ((activeTag && loaded && !allTags.some(([tag]) => tag === activeTag)) || (view.startsWith('folder:') && !activeFolder)) setView('all');
  }, [activeTag, allTags, loaded, view, activeFolder]);

  const counts = useMemo(() => {
    const shown = projects.filter((p) => !p.archived);
    const inFolder = new Map<string, number>();
    for (const p of shown) {
      const f = folders.placement[p.id];
      if (f) inFolder.set(f, (inFolder.get(f) || 0) + 1);
    }
    return { all: shown.length, cloud: shown.filter((p) => p.cloud).length + cloudOnly.length, archived: projects.length - shown.length, inFolder };
  }, [projects, cloudOnly, folders]);

  const visible = useMemo(() => {
    // archived projects stay in Archived, whatever folder they're in
    let list = activeTag
      ? projects.filter((p) => p.tags.includes(activeTag))
      : view === 'archived'
        ? projects.filter((p) => p.archived)
        : projects.filter((p) => !p.archived && (view === 'cloud' ? p.cloud : !activeFolder || folders.placement[p.id] === activeFolder.id));
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
  }, [projects, view, activeTag, activeFolder, folders, query, prefs.sortKey, prefs.sortDir, prefs.dateField]);

  // greyed out after the rest of Cloud projects
  const rows = useMemo((): Row[] => {
    if (view !== 'cloud') return visible;
    const q = query.trim().toLowerCase();
    return [
      ...visible,
      ...cloudOnly
        .filter((c) => !q || c.name.toLowerCase().includes(q))
        .map((c) => ({ id: c.id, name: c.name, path: '', createdAt: '', updatedAt: c.updatedAt || '', tags: [], archived: false, missing: true, hasThumbnail: false, cloudOnly: c }))
    ];
  }, [visible, cloudOnly, view, query]);

  const title = activeTag ?? activeFolder?.name ?? (view === 'cloud' ? 'Cloud projects' : view === 'archived' ? 'Archived' : 'All projects');
  const parentDir = settings.projectsDir || undefined;

  // ─── actions ───

  const open = (p: Row) => {
    if (p.cloudOnly) download(p.cloudOnly);
    else if (p.missing) locate(p);
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

  const toggleArchive = (p: ProjectMeta) =>
    attempt(async () => {
      await archiveProject(p.id, !p.archived);
      toast(p.archived ? `“${p.name}” is back in All projects.` : `Archived “${p.name}”.`);
    }, 'Couldn’t change the project');

  const remove = async (p: Row) => {
    const ok = await confirmDialog({
      title: `Remove “${p.name}” from the list?`,
      message: p.cloudOnly
        ? `It stays in ${p.cloudOnly.label}. To use it again, open its folder there with Import › Open existing folder…, and Spectrum works on it in ${p.cloudOnly.label} itself.`
        : p.missing && p.cloud?.mode === 'mirror'
          ? `Its copy in ${p.cloud.label} stays, and shows in Cloud projects to download again.`
          : 'The folder stays where it is on disk. Add it again any time with Import › Open existing folder…',
      confirmLabel: 'Remove'
    });
    if (ok) await attempt(() => (p.cloudOnly ? hideProject(p.id) : removeProject(p.id)), 'Couldn’t remove the project');
  };

  const moveToBin = async (p: ProjectMeta) => {
    const ok = await confirmDialog({
      title: `Move “${p.name}” to the ${BIN}?`,
      message: `The project folder and everything in it will be moved to the ${BIN}:\n${tildify(p.path)}${
        p.cloud?.mode === 'move' ? `\nIt’s in ${p.cloud.label}, so it goes from your other computers too.` : ''
      }`,
      confirmLabel: `Move to ${BIN}`,
      destructive: true
    });
    if (!ok) return;
    await attempt(async () => {
      ensureOk(await binProject(p.id), `Moving to the ${BIN} failed`);
      toast(`Moved “${p.name}” to the ${BIN}.`);
    }, `Couldn’t move the project to the ${BIN}`);
  };

  const locate = async (p: Row) => {
    const path = await pickFolder({ title: `Locate the folder for “${p.name}”` });
    if (!path) return;
    await attempt(async () => {
      ensureOk(await relocateProject(p.id, path), 'That folder couldn’t be used');
      toast(`Found “${p.name}”.`, { tone: 'success' });
    }, 'Couldn’t relocate the project');
  };

  const reveal = (p: ProjectMeta) => revealProject(p.id).catch((err) => toast(errorText(err), { tone: 'error' }));

  // ─── cloud projects ───

  /** A location's name, with its folder's when another in the same sync app has that name too */
  const locationName = (l: CloudLocation) =>
    locations.filter((m) => m.label === l.label).length > 1 ? `${l.label} · ${l.path.split(/[\\/]/).pop()}` : l.label || l.path;

  const syncTo = (p: ProjectMeta, l: CloudLocation) => {
    const name = locationName(l);
    return attempt(async () => {
      const move = settings.cloudMode === 'move';
      toast(`${move ? 'Moving' : 'Syncing'} “${p.name}” to ${name}…`);
      const { warning } = await syncProjectTo(p.id, { location: l.path, mode: settings.cloudMode });
      toast(warning || (move ? `Moved “${p.name}” to ${name}.` : `“${p.name}” now syncs with ${name}.`), { tone: warning ? 'error' : 'success' });
    }, `Couldn’t sync the project to ${name}`);
  };

  const download = (c: CloudOnlyProject) =>
    attempt(async () => {
      toast(settings.cloudMode === 'move' ? `Adding “${c.name}” from ${c.label}…` : `Downloading “${c.name}” from ${c.label}…`);
      const { project } = await downloadCloudProject({ location: c.location, rel: c.rel, id: c.id, mode: settings.cloudMode, parentDir });
      // used where it is (Move, or a default folder in a sync app's folder): nothing came down
      toast(project?.cloud?.mode === 'move' ? `“${c.name}” is in your list, used in ${c.label}.` : `“${c.name}” is on this computer now.`, { tone: 'success' });
    }, 'Couldn’t download the project');

  const syncNow = (p: ProjectMeta, deleting?: string[]) => {
    setProjects((prev) => prev.map((q) => (q.id === p.id && q.cloud ? { ...q, cloud: { ...q.cloud, status: { state: 'syncing' } } } : q)));
    return attempt(() => syncCloudProject(p.id, deleting), 'Couldn’t sync the project');
  };

  // past the stop for a sync that would delete many files
  const syncAnyway = async (p: ProjectMeta) => {
    const ok = await confirmDialog({
      title: `Sync “${p.name}” anyway?`,
      message: p.cloud?.status?.message,
      confirmLabel: 'Sync anyway',
      destructive: true
    });
    // the deletions the dialog showed, not whatever a pass since has held back
    if (ok) await syncNow(p, p.cloud?.status?.deleting);
  };

  const revealCloud = (p: ProjectMeta) => revealCloudCopy(p.id).catch((err) => toast(errorText(err), { tone: 'error' }));

  // ─── folders ───

  /** Changes the folders as they are now: another computer's may have come in since this render. */
  const changeFolders = (change: (tree: ProjectFolders) => ProjectFolders) => update({ projectFolders: change(loadSettings().projectFolders) });

  const moveToFolder = (projectId: string, folderId: string | null) => changeFolders((tree) => placeProject(tree, projectId, folderId));

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
    if (ok) changeFolders((tree) => deleteFolder(tree, f.id));
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

  // Sync to, a heading over the cloud locations as menus here have no submenus; the rest once it's a cloud project
  const cloudMenu = (p: ProjectMeta): MenuItems => {
    if (p.cloud) {
      const mirrored = p.cloud.mode === 'mirror';
      return [
        { separator: true },
        mirrored && { label: 'Sync now', icon: 'arrow.clockwise', onSelect: () => syncNow(p) },
        p.cloud.status?.brake && { label: 'Sync anyway…', icon: 'exclamationmark.triangle', onSelect: () => syncAnyway(p) },
        { label: 'Stop syncing…', icon: 'xmark', onSelect: () => setSheet({ kind: 'stopSyncing', id: p.id }) },
        IS_DESKTOP && mirrored && { label: `Show cloud copy in ${FILE_MANAGER}`, icon: 'cloud', onSelect: () => revealCloud(p) }
      ];
    }
    if (!locations.length) return [];
    return [
      { separator: true },
      { heading: true, label: 'Sync to' },
      // not a location in the sync app its folder is in already (Documents backed up to OneDrive, say), which syncs it
      // as it is; another app's is a copy like any other
      ...locations.map((l) => ({
        label: locationName(l),
        icon: 'cloud',
        disabled: !l.found || (!!p.place && p.place.provider === l.place?.provider),
        onSelect: () => syncTo(p, l)
      }))
    ];
  };

  const menuFor = (p: Row): MenuItems =>
    p.cloudOnly
      ? [
          { label: 'Download', icon: 'arrow.down.circle', onSelect: () => open(p) },
          { separator: true },
          { label: 'Remove from list', icon: 'minus.circle', onSelect: () => remove(p) }
        ]
      : p.missing
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
            { label: 'Move to folder…', icon: 'tray.and.arrow.down', onSelect: () => setSheet({ kind: 'folder', id: p.id }) },
            { label: 'Change template…', icon: 'arrow.triangle.2.circlepath', onSelect: () => setSheet({ kind: 'transfer', id: p.id }) },
            { label: 'Save as template…', icon: 'square.and.arrow.down', onSelect: () => setSheet({ kind: 'saveTemplate', id: p.id }) },
            IS_DESKTOP && { label: `Show in ${FILE_MANAGER}`, icon: 'folder', onSelect: () => reveal(p) },
            ...cloudMenu(p),
            { separator: true },
            { label: p.archived ? 'Unarchive' : 'Archive', icon: 'archivebox', onSelect: () => toggleArchive(p) },
            { label: 'Remove from list', icon: 'minus.circle', onSelect: () => remove(p) },
            { label: `Move to ${BIN}…`, icon: 'trash', destructive: true, onSelect: () => moveToBin(p) }
          ];

  const folderMenu = (f: ProjectFolder | null): MenuItems => [
    { label: 'New folder…', icon: 'folder.badge.plus', onSelect: () => newFolder(f?.id ?? null) },
    f && { label: 'Rename…', icon: 'pencil', onSelect: () => editFolderName(f) },
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

  const rowProps = (p: Row) => ({
    tabIndex: 0,
    // onto a folder in the sidebar, as the file tree drags files
    draggable: !p.cloudOnly,
    onDoubleClick: () => open(p),
    onKeyDown: (e: ReactKeyboardEvent) => {
      if (e.key === 'Enter' && e.target === e.currentTarget) open(p);
    },
    onContextMenu: (e: ReactMouseEvent) => {
      e.preventDefault();
      setCtx({ x: e.clientX, y: e.clientY, items: menuFor(p) });
    },
    onDragStart: (e: ReactDragEvent) => {
      e.dataTransfer.setData(DRAG_TYPE, p.id);
      e.dataTransfer.effectAllowed = 'move';
    },
    onDragEnd: () => setDropTarget(null)
  });

  /** A sidebar row a project can be dropped on: into a folder, or out of any (null, All projects). */
  const dropProps = (folderId: string | null) => ({
    onDragOver: (e: ReactDragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      if (dropTarget !== (folderId ?? '')) setDropTarget(folderId ?? '');
    },
    onDragLeave: (e: ReactDragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null);
    },
    onDrop: (e: ReactDragEvent) => {
      e.preventDefault();
      setDropTarget(null);
      const id = e.dataTransfer.getData(DRAG_TYPE);
      if (id) moveToFolder(id, folderId);
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
              className={`nav-row ${view === `folder:${f.id}` ? 'active' : ''} ${dropTarget === f.id ? 'drop-into' : ''}`}
              onClick={() => setView(`folder:${f.id}`)}
              {...menuProps(() => folderMenu(f))}
              {...dropProps(f.id)}
            >
              <Icon name="folder" />
              <span className="nav-label">{f.name}</span>
              <span className="nav-count">{counts.inFolder.get(f.id) || 0}</span>
            </button>
          </div>
          {nested && expanded && folderRows(f.id, depth + 1)}
        </Fragment>
      );
    });

  /** The badge after a project's name (short on a card); one that needs attention says what, with Sync anyway past the brake. */
  const badge = (p: Row, card = false) => {
    const b = badgeOf(p);
    if (!b) return null;
    const className = `badge ${b.warning ? 'warning' : ''} ${card ? 'card-badge' : ''}`;
    const content = (
      <>
        {b.icon && <Icon name={b.icon} />}
        {b.text[card ? 1 : 0]}
      </>
    );
    if (p.cloud?.status?.brake && !p.missing) {
      return (
        <button
          className={className}
          title={p.cloud.status.message}
          aria-label={`${b.text[0]}: Sync anyway…`}
          onClick={(e) => {
            e.stopPropagation();
            syncAnyway(p);
          }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {content}
        </button>
      );
    }
    return <span className={className} title={(!p.missing && p.cloud?.status?.message) || (card ? b.text[0] : undefined)}>{content}</span>;
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
        <span className="tag-dot" style={{ background: tagColour(tag) }} />
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
    if (view === 'cloud') {
      return (
        <div className="empty-state">
          <Icon name="cloud" size={36} />
          <div className="empty-title">No cloud projects</div>
          <div className="empty-text">
            {locations.length
              ? 'Choose Sync to from a project’s ··· menu to keep it in a cloud location, where your other computers find it.'
              : 'Add a cloud location in Settings › Projects, then choose Sync to from a project’s ··· menu.'}
          </div>
        </div>
      );
    }
    if (activeFolder) {
      return (
        <div className="empty-state">
          <Icon name="folder" size={36} />
          <div className="empty-title">Nothing in “{activeFolder.name}”</div>
          <div className="empty-text">Drag projects onto the folder in the sidebar, or choose Move to folder… from a project’s ··· menu.</div>
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
            <button className={`nav-row ${view === 'cloud' ? 'active' : ''}`} onClick={() => setView('cloud')}>
              <Icon name="cloud" />
              <span className="nav-label">Cloud projects</span>
              <span className="nav-count">{counts.cloud}</span>
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
                  <button key={tag} className={`nav-row ${activeTag === tag ? 'active' : ''}`} onClick={() => setView(`tag:${tag}`)}>
                    <span className="tag-dot" style={{ background: tagColour(tag) }} />
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
          <h1 className="panel-title" data-tauri-drag-region>
            {activeTag && <span className="tag-dot large" style={{ background: tagColour(activeTag) }} />}
            {title}
          </h1>
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
            <div className="segmented icon-segmented" role="radiogroup" aria-label="View">
              <button
                className={`segment ${prefs.layout === 'list' ? 'active' : ''}`}
                role="radio"
                aria-checked={prefs.layout === 'list'}
                title="List"
                onClick={() => updatePrefs({ layout: 'list' })}
              >
                <Icon name="list.bullet" />
              </button>
              <button
                className={`segment ${prefs.layout === 'grid' ? 'active' : ''}`}
                role="radio"
                aria-checked={prefs.layout === 'grid'}
                title="Grid"
                onClick={() => updatePrefs({ layout: 'grid' })}
              >
                <Icon name="square.grid.2x2" />
              </button>
            </div>
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
              items={[
                { label: 'Blank project…', icon: 'doc.badge.plus', onSelect: () => setSheet({ kind: 'new', template: '' }) },
                { label: 'From template…', icon: 'square.grid.2x2', onSelect: () => setSheet({ kind: 'gallery' }) },
                { separator: true },
                // inside the folder showing, as in Finder
                { label: 'Folder…', icon: 'folder.badge.plus', onSelect: () => newFolder(activeFolder?.id ?? null) }
              ]}
            />
          </div>
        </header>

        <div className="panel-body">
          {rows.length === 0 ? (
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
              {rows.map((p) => (
                <div key={p.id} role="row" className={`project-row ${p.missing ? 'missing' : ''}`} {...rowProps(p)}>
                  <span className="col-thumb"><Thumb project={p} /></span>
                  <span className="col-name">
                    <span className="project-name-line">
                      <span className="project-name">{p.name}</span>
                      {badge(p)}
                      {p.archived && view !== 'archived' && <span className="badge">Archived</span>}
                    </span>
                    <span className="project-path" title={p.path || undefined}>{p.cloud?.status?.message || whereText(p)}</span>
                  </span>
                  <span className="col-tags">{tagChips(p)}</span>
                  <span className="col-date" title={formatFull(p[prefs.dateField])}>{timeAgo(p[prefs.dateField])}</span>
                  <span className="col-actions">
                    <MenuButton icon="ellipsis" title="More" align="end" items={menuFor(p)} />
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="project-grid">
              {rows.map((p) => (
                <div key={p.id} className={`project-card ${p.missing ? 'missing' : ''}`} {...rowProps(p)}>
                  <div className="card-thumb">
                    <Thumb project={p} />
                    {badge(p, true)}
                    <span className="card-menu">
                      <MenuButton icon="ellipsis" title="More" className="icon-btn small" align="end" items={menuFor(p)} />
                    </span>
                  </div>
                  <div className="card-name" title={p.name}>{p.name}</div>
                  <div className="card-meta" title={formatFull(p[prefs.dateField])}>
                    {p.cloudOnly ? whereText(p) : `${dateLabel} ${timeAgo(p[prefs.dateField]).replace(/^Just now$/, 'just now')}`}
                  </div>
                  {p.tags.length > 0 && <div className="card-tags">{tagChips(p)}</div>}
                </div>
              ))}
            </div>
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
          defaultDir={settings.projectsDir || defaultDir}
          onClose={() => setSheet(null)}
          onBrowse={() => setSheet({ kind: 'gallery' })}
          onCreated={(id) => navigate(`/editor/${id}`)}
        />
      )}

      {sheet?.kind === 'gallery' && (
        <TemplateGallerySheet
          templates={templates}
          categories={categories}
          drafts={drafts}
          onClose={() => setSheet(null)}
          onPick={(id) => setSheet({ kind: 'new', template: id })}
          onEdit={(projectId) => navigate(`/editor/${projectId}`)}
          onChanged={reloadTemplates}
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

      {sheet?.kind === 'folder' && sheetProject && (
        <MoveToFolderSheet
          project={sheetProject}
          folders={folders}
          onMove={(folderId) => {
            moveToFolder(sheetProject.id, folderId);
            setSheet(null);
          }}
          onNewFolder={async () => {
            const id = await newFolder(null);
            if (!id) return;
            moveToFolder(sheetProject.id, id);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.kind === 'stopSyncing' && sheetProject?.cloud && (
        <StopSyncingSheet
          project={sheetProject}
          cloud={sheetProject.cloud}
          defaultDir={settings.projectsDir || defaultDir}
          onClose={() => setSheet(null)}
          onStopped={() => {
            setSheet(null);
            reload();
          }}
        />
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
          onClose={() => {
            setSheet(null);
            // the cloud locations may have changed
            reload(true);
            loadLocations();
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
  defaultDir,
  onClose,
  onBrowse,
  onCreated
}: {
  templates: TemplateMeta[];
  initialTemplate: string;
  defaultDir: string;
  onClose: () => void;
  onBrowse: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [template, setTemplate] = useState(initialTemplate);
  const [dir, setDir] = useState('');
  const [creating, setCreating] = useState(false);
  const location = dir || defaultDir;

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const project = await createProject({ name: trimmed, template: template || undefined, parentDir: location || undefined });
      if (!template) {
        // a blank project still needs something to compile
        const tree = await getProjectTree(project.id);
        if (!tree.items.some((item) => item.type === 'file' && item.path.endsWith('.tex'))) {
          await writeFile(project.id, 'main.tex', blankTex(trimmed));
          await setProjectMainFile(project.id, 'main.tex').catch(() => undefined);
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
        <label id="new-project-template">Template</label>
        <div className="row">
          <Select
            className="grow"
            labelId="new-project-template"
            value={template}
            options={[['', 'Blank'], ...templates.map((t): [string, string] => [t.id, t.label])]}
            onChange={setTemplate}
          />
          <button className="btn" onClick={onBrowse}><Icon name="square.grid.2x2" /> Browse…</button>
        </div>
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
  onClose,
  onPick,
  onEdit,
  onChanged
}: {
  templates: TemplateMeta[];
  categories: TemplateCategory[];
  drafts: string[];
  onClose: () => void;
  onPick: (id: string) => void;
  /** opens the working copy, a project */
  onEdit: (projectId: string) => void;
  /** a template was added, changed or deleted */
  onChanged: () => Promise<void>;
}) {
  const [category, setCategory] = useState('all');
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter(
      (t) =>
        (category === 'all' || t.category === category) &&
        (!featuredOnly || t.featured) &&
        (!q || [t.label, t.description, ...(t.tags || [])].some((s) => (s || '').toLowerCase().includes(q)))
    );
  }, [templates, category, featuredOnly, search]);

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
        <div className="chip-row">
          {[{ id: 'all', label: 'All' }, ...categories.filter((c) => c.id !== 'all')].map((c) => (
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
            <span className="tag-dot" style={{ background: tagColour(tag) }} />
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
                <span className="tag-dot" style={{ background: tagColour(tag) }} />
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
  project,
  folders,
  onMove,
  onNewFolder,
  onClose
}: {
  project: ProjectMeta;
  folders: ProjectFolders;
  onMove: (folderId: string | null) => void;
  onNewFolder: () => void;
  onClose: () => void;
}) {
  const current = folders.placement[project.id] ?? null;
  const choice = (id: string | null, name: string, depth: number) => (
    <button
      key={id ?? ''}
      className={`nav-row ${current === id ? 'active' : ''}`}
      style={{ paddingLeft: 10 + depth * 14 }}
      role="radio"
      aria-checked={current === id}
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
      title={`Move to folder · ${project.name}`}
      width={420}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onNewFolder}><Icon name="folder.badge.plus" /> New folder…</button>
          <button className="btn" onClick={onClose}>Cancel</button>
        </>
      }
    >
      <div role="radiogroup" aria-label="Folder">
        {choice(null, 'No folder', 0)}
        {tree(null, 0)}
      </div>
    </Sheet>
  );
}

/** Stop syncing: the project stays on this computer, and the copy in the cloud location stays or is deleted. */
function StopSyncingSheet({
  project,
  cloud,
  defaultDir,
  onClose,
  onStopped
}: {
  project: ProjectMeta;
  cloud: ProjectCloud;
  /** where a moved project's folder comes back to */
  defaultDir: string;
  onClose: () => void;
  onStopped: () => void;
}) {
  // the choice being carried out: whether it deletes the copy
  const [stopping, setStopping] = useState<boolean | null>(null);
  // why it couldn't be done (for Delete: another computer has the project open, say), which may clear: tried again
  const [error, setError] = useState('');
  // Spectrum can't find its copy there, so there's nothing to keep or delete
  const gone = cloud.status?.state === 'not-found';

  const stop = async (deleteCloud: boolean) => {
    setStopping(deleteCloud);
    setError('');
    try {
      const { warning } = await stopSyncing(project.id, deleteCloud, defaultDir || undefined);
      if (warning) toast(warning, { tone: 'error' });
      else toast(deleteCloud ? `Deleted “${project.name}” from ${cloud.label}.` : gone ? `“${project.name}” no longer syncs.` : `“${project.name}” no longer syncs. The copy in ${cloud.label} stays.`);
      onStopped();
    } catch (err) {
      setError(errorText(err));
      setStopping(null);
    }
  };
  const working = (
    <>
      <span className="spinner" /> Stopping…
    </>
  );

  return (
    <Sheet
      title={`Stop syncing “${project.name}”?`}
      width={520}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          {!gone && (
            <button className="btn destructive" disabled={stopping !== null} onClick={() => stop(true)}>
              {stopping === true ? working : `Delete it from ${cloud.label}`}
            </button>
          )}
          <button className="btn primary" disabled={stopping !== null} onClick={() => stop(false)}>
            {stopping === false ? working : gone ? 'Stop syncing' : `Keep the copy in ${cloud.label}`}
          </button>
        </>
      }
    >
      <div className="field-hint">
        {gone ? (
          `Spectrum can’t find its copy in ${cloud.label}. The project stays on this computer as it is.`
        ) : (
          <>
            {cloud.mode === 'move'
              ? `Spectrum copies it back to ${defaultDir ? tildify(defaultDir) : 'the default projects folder'} on this computer.`
              : 'It stays on this computer as it is.'}{' '}
            Keep the copy in {cloud.label} for your other computers, or delete it there.
          </>
        )}
      </div>
      {error && <div className="field-hint error">{error}</div>}
    </Sheet>
  );
}
