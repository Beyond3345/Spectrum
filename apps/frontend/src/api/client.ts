// Typed client for the local Spectrum backend. Every request is same-origin;
// the backend only accepts requests from this machine.

// ─── Shared types ───

export interface ProjectMeta {
  id: string;
  name: string;
  /** absolute folder on disk */
  path: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  archived: boolean;
  /** the folder was moved or deleted outside the app */
  missing: boolean;
  hasThumbnail: boolean;
  /** when the thumbnail was last saved (ms); compiles don't always change updatedAt */
  thumbnailAt?: number | null;
  mainFile?: string;
  /** a working copy of this template, being edited; kept out of the projects list */
  templateDraft?: string;
  /** where it is in a sync app's folder, once a cloud location is set up */
  place?: SyncPlace;
  /** a cloud project: one mirrored into a cloud location, or one in it (moved there, or there since 1.8.0) */
  cloud?: ProjectCloud;
}

/** A folder's place in a sync app's folder, the same on every computer */
export interface SyncPlace {
  provider: 'synology' | 'onedrive' | 'dropbox' | 'google' | 'icloud';
  /** e.g. 'Synology Drive' */
  label: string;
  /** '/'-separated from the top of the sync app's folder, e.g. 'Spectrum/Thesis' */
  rel: string;
  /** the sync app's folder is on this computer, so a missing project may still be on its way */
  here: boolean;
}

/** What Sync to does, Settings › Projects: keep a local copy and mirror it, or move the folder into the cloud location */
export type CloudMode = 'mirror' | 'move';

export interface ProjectCloud {
  mode: CloudMode;
  /** the cloud location's name, e.g. 'OneDrive' */
  label: string;
  /** '/'-separated inside the cloud location */
  rel: string;
  /** the cloud location's folder */
  location: string;
  /** how a mirrored project's syncing stands */
  status?: MirrorStatus;
}

export interface MirrorStatus {
  /** missing: the folder on this computer has gone; not-found: the copy in the cloud location has */
  state: 'synced' | 'syncing' | 'waiting' | 'attention' | 'missing' | 'not-found';
  /** what needs attention, for the user */
  message?: string;
  /** the pass stopped short of deleting many files: Sync anyway goes on */
  brake?: boolean;
  /** the deletions the brake held back, which Sync anyway sends back to let through */
  deleting?: string[];
}

/** A project in a cloud location that this computer doesn't have; Download brings it here */
/** A folder in a cloud location with LaTeX files but no project file: the sync app left out .spectrum here. */
export interface SkippedFolder {
  label: string;
  rel: string;
}

export interface CloudOnlyProject {
  id: string;
  name: string;
  label: string;
  rel: string;
  location: string;
  updatedAt?: string;
}

export interface FileItem {
  path: string;
  type: 'file' | 'dir';
}

export interface FileOrderMap {
  [folder: string]: string[];
}

export interface LLMConfig {
  endpoint: string;
  apiKey: string;
  model: string;
}

export type EffortLevel = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
/** 'default' is the level the provider preset recommends for the model */
export type ReasoningEffort = 'default' | EffortLevel;

export interface ProviderModel {
  id: string;
  label: string;
  note: string;
  vision: boolean;
  /** lowest first; empty when the model has no effort setting */
  levels: EffortLevel[];
  effort: EffortLevel;
}

export interface ProviderPreset {
  id: string;
  name: string;
  endpoint: string;
  regions?: { label: string; endpoint: string }[];
  /** host patterns (RegExp sources) the backend recognises as this provider */
  hosts: string[];
  keyUrl: string;
  note: string;
  models: ProviderModel[];
  recommended: { main: string; fast: string; vision: string; references: string };
  /** takes no key (a local Ollama) */
  local?: boolean;
  /** its server lists the models (Ollama); `models` is only a fallback */
  live?: boolean;
}

export interface TemplateMeta {
  id: string;
  label: string;
  mainFile: string;
  category: string;
  description: string;
  tags: string[];
  /** 'User' for the user's own */
  author: string;
  featured: boolean;
  /** one Spectrum ships, changed by the user */
  edited?: boolean;
}

export interface TemplateCategory {
  id: string;
  label: string;
}

export interface ArxivPaper {
  title: string;
  abstract: string;
  authors: string[];
  url: string;
  arxivId: string;
}

export type CompileEngine = 'auto' | 'pdflatex' | 'xelatex' | 'lualatex' | 'latexmk' | 'tectonic';

/** A non-2xx answer; status tells e.g. a 409 (already exists) apart from other failures. */
export class ApiError extends Error {
  status: number;
  /** the answer's JSON, e.g. a refused save's code and the text on disk */
  data: Record<string, unknown>;
  constructor(message: string, status: number, data: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...((options?.headers as Record<string, string>) || {}) };
  if (options?.body && typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    let message = await res.text();
    let data = {};
    try {
      data = JSON.parse(message);
      message = (data as { error?: string }).error || message;
    } catch {
      // plain text error
    }
    throw new ApiError(message || `Request failed (${res.status})`, res.status, data);
  }
  return res.json() as Promise<T>;
}

const json = (method: string, body: unknown = {}): RequestInit => ({ method, body: JSON.stringify(body) });

// ─── Projects ───

/** scan: look in the cloud locations now rather than after the usual 30 s. */
export function listProjects(scan = false) {
  return request<{ projects: ProjectMeta[]; cloudOnly?: CloudOnlyProject[]; skipped?: SkippedFolder[] }>(`/api/projects${scan ? '?scan=1' : ''}`);
}

/** parentDir: absolute folder to create the project in; defaults to ~/Documents/Spectrum */
export function createProject(payload: { name: string; template?: string; parentDir?: string }) {
  return request<ProjectMeta>('/api/projects', json('POST', payload));
}

/** Adopt an existing folder as a project without moving or copying it. */
export function openFolder(path: string) {
  return request<ProjectMeta>('/api/projects/open-folder', json('POST', { path }));
}

/** A file opened from Finder or Explorer: its project (adopting the folder around it if need be) and its path there. */
export function openFile(path: string) {
  return request<{ projectId: string; file: string }>('/api/projects/open-file', json('POST', { path }));
}

export function renameProject(id: string, name: string) {
  return request<{ ok: boolean; project?: ProjectMeta; error?: string }>(`/api/projects/${id}/rename-project`, json('POST', { name }));
}

export function copyProject(id: string, name?: string) {
  return request<{ ok: boolean; project?: ProjectMeta; error?: string }>(`/api/projects/${id}/copy`, json('POST', { name }));
}

/** Forget the project; the folder stays on disk. */
export function removeProject(id: string) {
  return request<{ ok: boolean }>(`/api/projects/${id}/remove`, json('POST'));
}

/** Move the project folder to the macOS Bin and forget it. */
export function binProject(id: string) {
  return request<{ ok: boolean; error?: string }>(`/api/projects/${id}/trash`, json('POST'));
}

/** Point a project whose folder went missing at its new location. */
export function relocateProject(id: string, path: string) {
  return request<{ ok: boolean; project?: ProjectMeta; error?: string }>(`/api/projects/${id}/relocate`, json('POST', { path }));
}

export function updateProjectTags(id: string, tags: string[]) {
  return request<{ ok: boolean; project?: ProjectMeta }>(`/api/projects/${id}/tags`, json('PATCH', { tags }));
}

export function archiveProject(id: string, archived: boolean) {
  return request<{ ok: boolean; project?: ProjectMeta }>(`/api/projects/${id}/archive`, json('PATCH', { archived }));
}

/** Sync to: mirror the project into a cloud location, or move it there; warning: the moved folder's original couldn't go to the Bin. */
export function syncProjectTo(id: string, payload: { location: string; mode: CloudMode }) {
  return request<{ project: ProjectMeta; warning?: string }>(`/api/projects/${id}/cloud`, json('POST', payload));
}

/** Bring a project that's only in a cloud location to this computer; a mirrored one's copy goes in parentDir, as createProject's. */
export function downloadCloudProject(payload: { location: string; rel: string; id: string; mode: CloudMode; parentDir?: string }) {
  return request<{ project: ProjectMeta }>('/api/cloud/download', json('POST', payload));
}

/**
 * The project stops syncing and stays on this computer (a moved one's folder comes back to parentDir). deleteCloud
 * also deletes the copy in the cloud location, which an ApiError with status 409 refuses, saying why, while another
 * computer needs it there.
 */
export function stopSyncing(id: string, deleteCloud: boolean, parentDir?: string) {
  return request<{ project: ProjectMeta; warning?: string }>(`/api/projects/${id}/cloud/stop`, json('POST', { deleteCloud, parentDir }));
}

/** Sync now; deleting: Sync anyway, past the stop for a sync that would delete many files, for the status's deleting its dialog showed. */
export function syncCloudProject(id: string, deleting: string[] = []) {
  return request<{ status: MirrorStatus }>(`/api/projects/${id}/cloud/sync`, json('POST', { deleting }));
}

export function setProjectMainFile(id: string, mainFile: string) {
  return request<{ ok: boolean }>(`/api/projects/${id}/main-file`, json('PATCH', { mainFile }));
}

export function thumbnailUrl(project: Pick<ProjectMeta, 'id' | 'updatedAt' | 'thumbnailAt'>) {
  return `/api/projects/${project.id}/thumbnail?v=${encodeURIComponent(project.thumbnailAt ?? project.updatedAt)}`;
}

/** png: base64 PNG (no data: prefix) of the first PDF page */
export function saveThumbnail(id: string, png: string) {
  return request<{ ok: boolean }>(`/api/projects/${id}/thumbnail`, json('PUT', { png }));
}

export interface ProjectStats {
  ok: boolean;
  source: 'texcount' | 'estimate';
  words: number;
  wordsInText: number;
  wordsInHeaders: number;
  wordsOutsideText: number;
  headers: number;
  floats: number;
  mathInline: number;
  mathDisplay: number;
  error?: string;
}

export function getProjectStats(id: string, mainFile: string) {
  const qs = new URLSearchParams({ mainFile }).toString();
  return request<ProjectStats>(`/api/projects/${id}/stats?${qs}`);
}

// ─── Files ───

/**
 * documents: the .tex files with a \documentclass of their own, so each compiles to a PDF. conflicts: a sync app's
 * conflict copies, each with its original's path.
 */
export function getProjectTree(id: string) {
  return request<{ items: FileItem[]; fileOrder?: FileOrderMap; mainFile?: string; documents: string[]; conflicts?: Record<string, string> }>(
    `/api/projects/${id}/tree`
  );
}

/** hash: the text's, for a later writeFile's base */
export function getFile(id: string, filePath: string) {
  const qs = new URLSearchParams({ path: filePath }).toString();
  return request<{ content: string; hash: string }>(`/api/projects/${id}/file?${qs}`);
}

/** The file as getFile gives it, without the text when that's still the text with hash `base`. */
export function getFileIfChanged(id: string, filePath: string, base: string) {
  const qs = new URLSearchParams({ path: filePath, base }).toString();
  return request<{ content?: string; hash: string }>(`/api/projects/${id}/file?${qs}`);
}

/**
 * create: only make a new file; it throws an ApiError with status 409 instead of replacing one (any letter case).
 * base: the hash of the text this replaces, as getFile or the last writeFile gave it. A file changed on disk since
 * throws an ApiError with status 409 and data { code: 'CHANGED_ON_DISK', content, hash } (the text there now), and
 * one deleted since data { code: 'DELETED_ON_DISK' }. Without a base it's written whatever is there.
 */
/** typed: a new file's name the user typed, refused when Windows or a sync app can't hold it. */
export function writeFile(id: string, filePath: string, content: string, options: { create?: boolean; base?: string; typed?: boolean } = {}) {
  return request<{ ok: boolean; hash: string }>(
    `/api/projects/${id}/file`,
    json('PUT', { path: filePath, content, ...(options.create && { create: true }), ...(options.base && { base: options.base }), ...(options.typed && { typed: true }) })
  );
}

export function createFolder(id: string, folderPath: string) {
  return request<{ ok: boolean }>(`/api/projects/${id}/folder`, json('POST', { path: folderPath }));
}

export function renamePath(id: string, from: string, to: string) {
  return request<{ ok: boolean }>(`/api/projects/${id}/rename`, json('POST', { from, to }));
}

export function deleteFile(id: string, filePath: string) {
  const qs = new URLSearchParams({ path: filePath }).toString();
  return request<{ ok: boolean; error?: string }>(`/api/projects/${id}/file?${qs}`, { method: 'DELETE' });
}

export function updateFileOrder(id: string, folder: string, order: string[]) {
  return request<{ ok: boolean }>(`/api/projects/${id}/file-order`, json('POST', { folder, order }));
}

/** URL for <img>/<object> previews of project files. */
export function blobUrl(projectId: string, filePath: string, version?: string | number) {
  const qs = new URLSearchParams({ path: filePath });
  if (version !== undefined) qs.set('v', String(version));
  return `/api/projects/${projectId}/blob?${qs.toString()}`;
}

export async function uploadFiles(projectId: string, files: File[], basePath?: string) {
  const form = new FormData();
  files.forEach((file) => {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    form.append('files', file, basePath ? `${basePath}/${rel}` : rel);
  });
  return request<{ ok: boolean; files?: string[] }>(`/api/projects/${projectId}/upload`, { method: 'POST', body: form });
}

// ─── Templates & imports ───

export function listTemplates() {
  return request<{ templates: TemplateMeta[]; categories?: TemplateCategory[] }>('/api/templates');
}

export async function uploadTemplate(templateId: string, templateLabel: string, file: File) {
  const form = new FormData();
  form.append('templateId', templateId);
  form.append('templateLabel', templateLabel);
  form.append('file', file);
  return request<{ ok: boolean; templateId?: string; error?: string }>('/api/templates/upload', { method: 'POST', body: form });
}

/** Open a working copy of the template as a project, or the one already open for it (existing). */
export function editTemplate(id: string) {
  return request<{ ok: boolean; project: ProjectMeta; existing: boolean }>(`/api/templates/${encodeURIComponent(id)}/edit`, json('POST'));
}

/** A new template of the user's own from the project's files; a working copy carries on as the new one's. */
export function saveAsTemplate(projectId: string, details: { label: string; category: string; description: string }) {
  return request<{ ok: boolean; template: TemplateMeta }>('/api/templates', json('POST', { projectId, ...details }));
}

/** Put a working copy's files in its template's place. */
export function saveTemplateDraft(projectId: string) {
  return request<{ ok: boolean; template: TemplateMeta }>(`/api/projects/${projectId}/save-template`, json('POST'));
}

/** Close a working copy and delete it; an ApiError with status 409 means changes not saved to the template, unless discard. */
export function closeTemplateDraft(projectId: string, discard = false) {
  return request<{ ok: boolean }>(`/api/projects/${projectId}/close-template`, json('POST', { discard }));
}

/** Put back the files and details Spectrum ships for an edited template. */
export function restoreTemplate(id: string) {
  return request<{ ok: boolean; template: TemplateMeta }>(`/api/templates/${encodeURIComponent(id)}/restore`, json('POST'));
}

/** Delete one of the user's own templates. */
export function deleteTemplate(id: string) {
  return request<{ ok: boolean }>(`/api/templates/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** Swap the project onto another template's preamble, keeping the document body. No AI involved. */
export function convertTemplate(id: string, targetTemplate: string, mainFile: string) {
  return request<{ ok: boolean; mainFile?: string; changedFiles?: string[]; error?: string }>(
    `/api/projects/${id}/convert-template`,
    json('POST', { targetTemplate, mainFile })
  );
}

export async function importZip(payload: { file: File; projectName?: string; parentDir?: string }) {
  const form = new FormData();
  if (payload.projectName) form.append('projectName', payload.projectName);
  if (payload.parentDir) form.append('parentDir', payload.parentDir);
  form.append('zip', payload.file);
  return request<{ ok: boolean; project?: ProjectMeta; error?: string }>('/api/projects/import-zip', { method: 'POST', body: form });
}

/** Aborting `signal` closes the stream (the backend sees the disconnect) and rejects with an AbortError. */
export function importArxivSSE(
  payload: { arxivIdOrUrl: string; projectName?: string; parentDir?: string },
  onProgress?: (data: { phase: string; percent: number; received?: number; total?: number }) => void,
  signal?: AbortSignal
): Promise<{ ok: boolean; project?: ProjectMeta; error?: string }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const params = new URLSearchParams({ arxivIdOrUrl: payload.arxivIdOrUrl });
    if (payload.projectName) params.set('projectName', payload.projectName);
    if (payload.parentDir) params.set('parentDir', payload.parentDir);
    const es = new EventSource(`/api/projects/import-arxiv-sse?${params.toString()}`);
    signal?.addEventListener('abort', () => {
      es.close();
      reject(new DOMException('Aborted', 'AbortError'));
    });
    es.addEventListener('progress', (e) => {
      try {
        onProgress?.(JSON.parse((e as MessageEvent).data));
      } catch {
        // ignore malformed progress
      }
    });
    es.addEventListener('done', (e) => {
      es.close();
      try {
        resolve(JSON.parse((e as MessageEvent).data));
      } catch {
        resolve({ ok: true });
      }
    });
    es.addEventListener('error', (e) => {
      es.close();
      const data = (e as MessageEvent).data;
      if (data) {
        try {
          resolve({ ok: false, error: JSON.parse(data).error || 'Unknown error' });
          return;
        } catch {
          // fall through
        }
      }
      reject(new Error('Lost connection to the import'));
    });
  });
}

// ─── Compile ───

export interface CompileResult {
  ok: boolean;
  pdf?: string;
  /** relative path of the PDF written next to the document, e.g. "main.pdf" */
  pdfPath?: string;
  log?: string;
  status?: number;
  engine?: string;
  error?: string;
  /** documents it links with \externaldocument, compiled first because their .aux was missing or out of date */
  linked?: { file: string; ok: boolean }[];
  /** Stop ended it; the last PDF stays */
  stopped?: boolean;
}

/** mainFile: the document to compile, the project's main file or another */
/** compileId: the editor's name for this compile, so Stop ends this one (even before it has started) */
export function compileProject(payload: { projectId: string; mainFile: string; engine: CompileEngine; compileId?: string }) {
  return request<CompileResult>('/api/compile', json('POST', payload));
}

/** Ends the compile started with this id (false when it hasn't started yet; it then stops as it starts). */
export function stopCompile(compileId: string) {
  return request<{ ok: boolean }>('/api/compile/stop', json('POST', { compileId }));
}

// ─── SyncTeX: between a spot in the PDF and the source line that made it ───

/** A spot on a page (1-based) in PDF points from its top-left corner, as pdf.js shows the page at scale 1. */
export interface PdfPoint {
  page: number;
  x: number;
  y: number;
}

/** What a source line typeset on a page, in the same points; y is the top edge. */
export interface PdfBox extends PdfPoint {
  width: number;
  height: number;
}

type SynctexFailure = { ok: false; error: string };

/** doc: the document whose PDF is showing */
export function synctexEdit(projectId: string, at: PdfPoint, doc: string) {
  return request<{ ok: true; file: string; line: number; column: number | null } | SynctexFailure>(`/api/projects/${projectId}/synctex/edit`, json('POST', { ...at, doc }));
}

export function synctexView(projectId: string, at: { file: string; line: number; column?: number }, doc: string) {
  return request<{ ok: true; page: number; boxes: PdfBox[] } | SynctexFailure>(`/api/projects/${projectId}/synctex/view`, json('POST', { ...at, doc }));
}

// ─── Version history ───

export type VersionReason = 'manual' | 'before-ai' | 'before-restore' | 'before-transfer';

export interface VersionMeta {
  id: number;
  /** the number to show (v3); ids made since 1.7.0 are long, so two computers never make the same one */
  number: number;
  createdAt: string;
  label: string;
  reason: VersionReason;
  summary: {
    kind: 'initial' | 'edited' | 'updated';
    /** paths that changed versus the previous version */
    files: string[];
    added: number;
    removed: number;
  };
}

export interface VersionFileChange {
  path: string;
  /** untracked: still on disk, but too big or unreadable for versions to keep */
  status: 'added' | 'removed' | 'modified' | 'untracked';
  added: number;
  removed: number;
  binary: boolean;
}

export function listVersions(projectId: string) {
  return request<{ ok: boolean; versions: VersionMeta[] }>(`/api/projects/${projectId}/versions`);
}

export function createVersion(projectId: string, payload: { label?: string; reason?: VersionReason } = {}) {
  return request<{ ok: boolean; version: VersionMeta | null; unchanged: boolean }>(
    `/api/projects/${projectId}/versions`,
    json('POST', payload)
  );
}

/** What changed in a version compared with the one before it. */
export function getVersionChanges(projectId: string, versionId: number) {
  return request<{ ok: boolean; files: VersionFileChange[] }>(`/api/projects/${projectId}/versions/${versionId}/changes`);
}

/** What differs between a version and the files on disk right now. */
export function compareVersionWithCurrent(projectId: string, versionId: number) {
  return request<{ ok: boolean; files: VersionFileChange[] }>(`/api/projects/${projectId}/versions/${versionId}/compare`);
}

export function getVersionFile(projectId: string, versionId: number, filePath: string) {
  const qs = new URLSearchParams({ path: filePath }).toString();
  return request<{ ok: boolean; content?: string; error?: string }>(`/api/projects/${projectId}/versions/${versionId}/file?${qs}`);
}

/** Restore the whole project, or just one file when `path` is given. Saves a safety version first. */
export function restoreVersion(projectId: string, versionId: number, path?: string) {
  return request<{ ok: boolean; safety: VersionMeta | null; keptAside?: string[]; error?: string }>(
    `/api/projects/${projectId}/versions/${versionId}/restore`,
    json('POST', path ? { path } : {})
  );
}

export function renameVersion(projectId: string, versionId: number, label: string) {
  return request<{ ok: boolean; version?: VersionMeta }>(`/api/projects/${projectId}/versions/${versionId}`, json('PATCH', { label }));
}

export function deleteVersion(projectId: string, versionId: number) {
  return request<{ ok: boolean }>(`/api/projects/${projectId}/versions/${versionId}`, { method: 'DELETE' });
}

// ─── The user's other computers ───

/** This computer has the project open (sent every 2 minutes); the answer lists the other computers that do. */
export function markOpen(projectId: string) {
  return request<{ ok: boolean; others: { host: string; since: string }[] }>(`/api/projects/${projectId}/presence`, json('POST'));
}

/** Leaving the project; keepalive, so it still goes when the page is closing. */
export function markClosed(projectId: string) {
  return fetch(`/api/projects/${projectId}/presence`, { method: 'DELETE', keepalive: true }).catch(() => undefined);
}

/** A sync app's conflict copy takes its original's place. */
export function keepConflictCopy(projectId: string, path: string) {
  return request<{ ok: boolean; original: string }>(`/api/projects/${projectId}/conflict-copy/use`, json('POST', { path }));
}

export function binConflictCopy(projectId: string, path: string) {
  return request<{ ok: boolean; error?: string }>(`/api/projects/${projectId}/conflict-copy/bin`, json('POST', { path }));
}

export interface SharedSettings {
  updatedAt: string;
  machineName: string;
  settings: Record<string, unknown>;
}

/** The newest settings another computer shared; shared is false without a cloud location. */
export function getSharedSettings() {
  return request<{ ok: boolean; shared: boolean; latest: SharedSettings | null }>('/api/shared/settings');
}

export function shareSettings(settings: Record<string, unknown>) {
  return request<{ ok: boolean; shared: boolean; updatedAt: string | null }>('/api/shared/settings', json('PUT', { settings }));
}

// ─── Saved chats ───

export type ChatMode = 'assistant' | 'references';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  /** mode-specific extras, e.g. reference results or proposed file changes */
  meta?: Record<string, unknown>;
}

export interface ChatThread {
  id: string;
  title: string;
  mode: ChatMode;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface ChatSummary {
  id: string;
  title: string;
  mode: ChatMode;
  updatedAt: string;
  messageCount: number;
}

export function listChats(projectId: string) {
  return request<{ ok: boolean; chats: ChatSummary[] }>(`/api/projects/${projectId}/chats`);
}

export function getChat(projectId: string, chatId: string) {
  return request<{ ok: boolean; chat: ChatThread }>(`/api/projects/${projectId}/chats/${chatId}`);
}

/**
 * base: the updatedAt of the copy this chat was made from. When the chat was saved since (on another computer),
 * the answer has the chat as saved: the messages there with this one's new ones after them.
 */
export function saveChat(projectId: string, chat: ChatThread, base?: string) {
  return request<{ ok: boolean; chat?: ChatThread }>(`/api/projects/${projectId}/chats/${chat.id}`, json('PUT', { chat, base }));
}

export function deleteChat(projectId: string, chatId: string) {
  return request<{ ok: boolean }>(`/api/projects/${projectId}/chats/${chatId}`, { method: 'DELETE' });
}

// ─── To-dos and PDF notes (one small file each in .spectrum, so two computers' lists merge) ───

/** Where a to-do points: a source line (found again by its text if lines move), a page of a document's PDF, or a reference */
export type TodoLink = { file: string; line: number; snippet?: string } | { doc: string; page: number } | { key: string };

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
  link?: TodoLink;
}

export function listTodos(projectId: string) {
  return request<{ todos: Todo[] }>(`/api/projects/${projectId}/todos`);
}

export function saveTodo(projectId: string, todo: Todo) {
  return request<{ todo: Todo }>(`/api/projects/${projectId}/todos/${todo.id}`, json('PUT', todo));
}

export function deleteTodo(projectId: string, todoId: string) {
  return request<{ ok: boolean }>(`/api/projects/${projectId}/todos/${todoId}`, { method: 'DELETE' });
}

/** A note on a page of a document's PDF; x and y are PDF points from the page's top-left, as PdfPoint */
export interface PdfNote {
  id: string;
  /** the document whose PDF it is on (its .tex) */
  doc: string;
  page: number;
  x: number;
  y: number;
  text: string;
  colour?: string;
  createdAt: string;
  updatedAt: string;
}

export function listNotes(projectId: string, doc: string) {
  return request<{ notes: PdfNote[] }>(`/api/projects/${projectId}/notes?doc=${encodeURIComponent(doc)}`);
}

export function saveNote(projectId: string, note: PdfNote) {
  return request<{ note: PdfNote }>(`/api/projects/${projectId}/notes/${note.id}`, json('PUT', note));
}

export function deleteNote(projectId: string, noteId: string) {
  return request<{ ok: boolean }>(`/api/projects/${projectId}/notes/${noteId}`, { method: 'DELETE' });
}

// ─── AI ───

export interface AgentPatch {
  path: string;
  diff: string;
  /** the file as the AI saw it */
  original: string;
  content: string;
}

export function runAgent(payload: {
  task: string;
  prompt: string;
  selection: string;
  content: string;
  mode: 'direct' | 'tools';
  projectId?: string;
  activePath?: string;
  compileLog?: string;
  llmConfig?: Partial<LLMConfig>;
  searchConfig?: SearchConfig;
  interaction?: 'chat' | 'agent';
  history?: { role: 'user' | 'assistant'; content: string }[];
  reasoningEffort?: ReasoningEffort;
}) {
  return request<{ ok: boolean; reply: string; suggestion: string; patches?: AgentPatch[] }>('/api/agent/run', json('POST', payload));
}

export function callLLM(payload: {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  model?: string;
  llmConfig?: Partial<LLMConfig>;
  /** 'fast': as little thinking as the model allows */
  reasoningEffort?: ReasoningEffort | 'fast';
}) {
  return request<{ ok: boolean; content?: string; error?: string }>('/api/llm', json('POST', payload));
}

// ─── spelling (nodehun, Australian English) and grammar (Harper) ───

export type CheckerStatus = { available: boolean; language: string; error?: string };
export type SpellWordLists = { global: string[]; project: string[] };
export type GrammarSuggestion = { kind: 'replace' | 'remove' | 'insertAfter'; text: string };
export type GrammarIssue = {
  rule: string;
  kind: string;
  from: number;
  to: number;
  message: string;
  suggestions: GrammarSuggestion[];
  /** false when the span runs into LaTeX markup, so a suggestion can't be applied as it is */
  fixable: boolean;
};
export type OxfordComma = 'avoid' | 'require' | 'off';

export function spellStatus() {
  return request<CheckerStatus>('/api/spell/status');
}

export function spellCheck(words: string[], projectId?: string) {
  return request<{ misspelt: string[] }>('/api/spell/check', json('POST', { words, projectId }));
}

export function spellSuggest(word: string) {
  return request<{ suggestions: string[] }>('/api/spell/suggest', json('POST', { word }));
}

export function spellWords(projectId?: string) {
  return request<SpellWordLists>(`/api/spell/words${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`);
}

export function changeSpellWord(payload: { word: string; scope: 'global' | 'project'; projectId?: string; remove?: boolean }) {
  return request<SpellWordLists>('/api/spell/words', json('POST', payload));
}

export function grammarCheck(payload: { text: string; file: string; projectId?: string; style: boolean; oxford: OxfordComma }) {
  return request<{ issues: GrammarIssue[]; ignoredRules: string[] }>('/api/grammar/check', json('POST', payload));
}

export function changeIgnoredGrammarRule(projectId: string, rule: string, remove = false) {
  return request<{ ignoredRules: string[] }>('/api/grammar/ignored', json('POST', { projectId, rule, remove }));
}

export function listProviders() {
  return request<{ providers: ProviderPreset[] }>('/api/llm/providers');
}

/** The models a live preset's server (Ollama) lists right now. */
export function listLiveModels(provider: string, endpoint: string) {
  return request<{ ok: boolean; error?: string } & Partial<Pick<ProviderPreset, 'models' | 'recommended'>>>('/api/llm/models', json('POST', { provider, endpoint }));
}

export async function visionToLatex(payload: {
  projectId: string;
  file: File;
  mode: 'equation' | 'table' | 'figure' | 'algorithm' | 'ocr';
  prompt?: string;
  llmConfig?: Partial<LLMConfig>;
}) {
  const form = new FormData();
  form.append('projectId', payload.projectId);
  form.append('mode', payload.mode);
  if (payload.prompt) form.append('prompt', payload.prompt);
  if (payload.llmConfig) form.append('llmConfig', JSON.stringify(payload.llmConfig));
  form.append('image', payload.file);
  return request<{ ok: boolean; latex?: string; assetPath?: string; error?: string }>('/api/vision/latex', { method: 'POST', body: form });
}

export function plotFromTable(payload: {
  projectId: string;
  tableLatex: string;
  chartType: string;
  title?: string;
  prompt?: string;
  filename?: string;
  retries?: number;
  llmConfig?: Partial<LLMConfig>;
}) {
  return request<{ ok: boolean; assetPath?: string; error?: string }>('/api/plot/from-table', json('POST', payload));
}

// ─── Research ───

export function arxivSearch(payload: { query: string; maxResults?: number }) {
  return request<{ ok: boolean; papers?: ArxivPaper[]; error?: string }>('/api/arxiv/search', json('POST', payload));
}

export type SearchProvider = 'llm' | 'openalex' | 'semanticscholar' | 'serpapi' | 'exa' | 'tavily' | 'brave' | 'ddgs';

export interface SearchConfig {
  provider: SearchProvider;
  connections: { provider: SearchProvider; apiKey?: string; engine?: string }[];
  llmConfig?: Partial<LLMConfig>;
}

export interface SearchResult {
  title: string;
  summary: string;
  url: string;
  bibtex: string;
  authors?: string[];
  year?: string;
  venue?: string;
  doi?: string;
  /** arXiv id without its version */
  arxiv?: string;
  source?: string;
}

/** scholarly: the question is about research literature (Exa then searches publications only) */
export function webSearch(payload: {
  query: string;
  provider?: SearchProvider;
  searchConfig?: SearchConfig;
  purpose?: 'chat' | 'references';
  apiKey?: string;
  engine?: string;
  maxResults?: number;
  scholarly?: boolean;
}) {
  return request<{ ok: boolean; results?: SearchResult[]; provider?: SearchProvider; failures?: { provider: SearchProvider; error: string }[]; error?: string }>('/api/websearch', json('POST', payload));
}

export interface CitationSuggestion extends SearchResult {
  reason: string;
  citeKey: string;
}

export function suggestCitations(payload: { text: string; maxResults?: number; llmConfig?: Partial<LLMConfig>; searchConfig?: SearchConfig }) {
  return request<{ ok: boolean; queries?: string[]; papers?: CitationSuggestion[]; error?: string }>(
    '/api/citations/suggest',
    json('POST', payload)
  );
}

// ─── References chat (DOI / URL / arXiv / title → BibTeX) ───

export interface ReferenceCandidate {
  /** pass back to addReference: a DOI, an arXiv id or a URL */
  id: string;
  title: string;
  authors: string[];
  year?: string;
  venue?: string;
  doi?: string;
}

export interface ReferenceResult {
  input: string;
  status: 'added' | 'duplicate' | 'choose' | 'not_found' | 'error';
  key?: string;
  bibtex?: string;
  bibFile?: string;
  title?: string;
  authors?: string[];
  year?: string;
  doi?: string;
  candidates?: ReferenceCandidate[];
  message?: string;
}

export function resolveReferences(payload: { projectId: string; input: string; bibFile?: string; llmConfig?: Partial<LLMConfig>; searchConfig?: SearchConfig }) {
  return request<{ ok: boolean; results: ReferenceResult[]; bibFile: string; bibIncluded: boolean; error?: string }>(
    '/api/references/resolve',
    json('POST', payload)
  );
}

export function addReference(payload: { projectId: string; candidateId: string; bibFile?: string; searchConfig?: SearchConfig }) {
  return request<{ ok: boolean; result: ReferenceResult; bibFile: string; bibIncluded: boolean; error?: string }>(
    '/api/references/add',
    json('POST', payload)
  );
}

// ─── Template transfer ───

export interface TransferStartPayload {
  sourceProjectId: string;
  sourceMainFile: string;
  targetTemplateId: string;
  targetMainFile: string;
  engine?: CompileEngine;
  layoutCheck?: boolean;
  llmConfig?: Partial<LLMConfig>;
  visionLlmConfig?: Partial<LLMConfig>;
  /** folder to create the new project in; defaults to ~/Documents/Spectrum */
  parentDir?: string;
}

export interface TransferStepResult {
  status: string;
  progressLog: string[];
  error?: string;
  /** base64 PDF, present while the job waits for layout-check page images */
  pdf?: string;
  newProjectId?: string;
}

export interface PageImage {
  page: number;
  base64: string;
  mime: string;
}

export function transferStart(payload: TransferStartPayload) {
  return request<{ jobId: string; newProjectId: string }>('/api/transfer/start', json('POST', payload));
}

export function transferStep(jobId: string) {
  return request<TransferStepResult>('/api/transfer/step', json('POST', { jobId }));
}

export function transferSubmitImages(jobId: string, images: PageImage[]) {
  return request<{ ok: boolean }>('/api/transfer/submit-images', json('POST', { jobId, images }));
}

/** A PDF parser from Settings → Template transfer. */
export interface ParserPreset {
  id: string;
  name: string;
  endpoint: string;
  regions?: { label: string; endpoint: string }[];
  /** where to create a key ('' for a self-hosted server) */
  keyUrl: string;
  note: string;
  /** what the parser calls its key, e.g. 'token' or 'API key' */
  keyName: string;
  /** Mathpix also needs an app ID */
  appId?: boolean;
  /** a self-hosted server may run without a key */
  keyOptional?: boolean;
}

/** The parser a PDF transfer uses; empty fields fall back to the preset's (and for MinerU, the .env file's). */
export interface ParserConfig {
  /** a preset id, or 'custom' with the preset whose API it speaks as protocol */
  id: string;
  protocol?: string;
  endpoint?: string;
  key?: string;
  appId?: string;
}

export interface PdfTransferStartPayload {
  sourceProjectId?: string;
  sourceMainFile?: string;
  targetTemplateId: string;
  targetMainFile: string;
  engine?: CompileEngine;
  layoutCheck?: boolean;
  llmConfig?: Partial<LLMConfig>;
  visionLlmConfig?: Partial<LLMConfig>;
  parser: ParserConfig;
  parentDir?: string;
}

export function listParsers() {
  return request<{ parsers: ParserPreset[] }>('/api/transfer/parsers');
}

export function pdfTransferStart(payload: PdfTransferStartPayload) {
  return request<{ jobId: string; newProjectId: string }>('/api/transfer/start-pdf', json('POST', payload));
}

export async function transferUploadPdf(jobId: string, pdfFile: File) {
  const form = new FormData();
  form.append('jobId', jobId);
  form.append('pdf', pdfFile);
  return request<{ ok: boolean; pdfPath?: string }>('/api/transfer/upload-pdf', { method: 'POST', body: form });
}

// ─── System ───

export interface SystemCheck {
  ok: boolean;
  dataDir: string;
  projectsDir: string;
  tools: Record<string, string | null>;
  /** tools that are on PATH but fail to run, with a short reason */
  problems?: Record<string, string>;
  python: { path: string; found: boolean; matplotlib: boolean; ddgs: boolean };
  platform: string;
}

export function systemCheck() {
  return request<SystemCheck>('/api/system/check');
}

// ─── Cloud locations ───

/** A folder a sync app keeps the same on each computer, which projects sync to */
export interface CloudLocation {
  path: string;
  /** e.g. 'OneDrive' */
  label: string;
  found: boolean;
  /** where it is in its sync app's folder */
  place?: SyncPlace | null;
  /** the projects mirrored into it; it can't be removed while there are any */
  mirrored: number;
}

export interface SyncSettings {
  /** this computer's name, as the other computers show it */
  machineName: string;
  folders: CloudLocation[];
  /** the sync apps' folders on this computer not in the list; target is the folder adding one adds */
  suggestions: { path: string; provider: SyncPlace['provider']; label: string; target: string }[];
  /** the cloud location settings and templates go through, the same on each computer that lists it */
  sharedFolder: string | null;
}

export function getSyncSettings() {
  return request<SyncSettings>('/api/sync');
}

/** folders: the whole list of cloud locations; projectsDir: the default folder for new projects, which a new one mustn't overlap */
export function updateSyncSettings(patch: { folders?: string[]; machineName?: string; projectsDir?: string }) {
  return request<SyncSettings>('/api/sync', json('PATCH', patch));
}

/** Stop listing a project that's only in a cloud location. */
export function hideProject(id: string) {
  return request<{ ok: boolean }>('/api/sync/hide', json('POST', { id }));
}

export function revealProject(projectId: string, filePath?: string) {
  return request<{ ok: boolean; path?: string }>('/api/system/reveal', json('POST', { projectId, path: filePath }));
}

/** Show a mirrored project's copy in its cloud location. */
export function revealCloudCopy(projectId: string) {
  return request<{ ok: boolean; path?: string }>('/api/system/reveal', json('POST', { projectId, cloud: true }));
}

// ─── Local ACP agents ───
export interface LocalAgent {
  id: string; name: string; command: string; args: string[]; runtimePaths: string[];
  installed: boolean; supported: boolean; hasKey: boolean; canImport: boolean;
  keyEnv: string; keyEnvs: string[];
  url: string; note?: string; unavailable?: string; experimental?: boolean;
}
export interface AgentEvent { id: number; type: string; data: any; at: string }
export interface AgentChange {
  path: string; kind: 'created' | 'modified' | 'deleted'; binary: boolean; beforeHash: string | null;
  afterHash: string | null; size: number; original?: string; proposed?: string;
}
export interface AgentUserRequest { requestId: string; kind: string; params: any }
export interface LocalAgentSession {
  id: string; projectId: string; agentId: string; mode: 'review' | 'direct'; status: string;
  createdAt: string; updatedAt: string; events: AgentEvent[]; pending?: AgentUserRequest[];
  recoveries?: { id: string; files: string[] }[];
}
export const listLocalAgents = () => request<{ ok: boolean; agents: LocalAgent[] }>('/api/agents');
export const configureLocalAgent = (id: string, value: { command: string; args: string[]; runtimePaths: string[]; apiKey?: string; keyEnv?: string }) => request<{ ok: boolean }>(`/api/agents/${id}`, json('PUT', value));
export const importLocalAgentLogin = (id: string) => request<{ ok: boolean; files: number }>(`/api/agents/${id}/import-login`, json('POST', {}));
export const listLocalAgentSessions = (projectId: string) => request<{ ok: boolean; sessions: LocalAgentSession[] }>(`/api/agent-sessions?projectId=${encodeURIComponent(projectId)}`);
export const getLocalAgentSession = (id: string) => request<{ ok: boolean; session: LocalAgentSession }>(`/api/agent-sessions/${id}`);
export const createLocalAgentSession = (projectId: string, agentId: string, mode: 'review' | 'direct') => request<{ ok: boolean; session: LocalAgentSession }>('/api/agent-sessions', json('POST', { projectId, agentId, mode }));
export const sendLocalAgentPrompt = (id: string, prompt: string) => request<{ ok: boolean }>(`/api/agent-sessions/${id}/prompt`, json('POST', { prompt }));
export const stopLocalAgentSession = (id: string) => request<{ ok: boolean }>(`/api/agent-sessions/${id}/stop`, json('POST', {}));
export const answerLocalAgent = (id: string, requestId: string, answer: unknown) => request<{ ok: boolean }>(`/api/agent-sessions/${id}/answer`, json('POST', { requestId, answer }));
export const setLocalAgentOption = (id: string, configId: string, value: string) => request<{ ok: boolean }>(`/api/agent-sessions/${id}/option`, json('POST', { configId, value }));
export const getLocalAgentChanges = (id: string) => request<{ ok: boolean; changes: AgentChange[] }>(`/api/agent-sessions/${id}/changes`);
export const recoverLocalAgentApply = (id: string, recoveryId: string) => request<{ ok: boolean }>(`/api/agent-sessions/${id}/recover`, json('POST', { recoveryId }));
export const reviewLocalAgentChanges = (id: string, action: 'apply' | 'reject', changes: AgentChange[]) => request<{ ok: boolean; changes: AgentChange[] }>(`/api/agent-sessions/${id}/review`, json('POST', { action, paths: changes.map((c) => c.path), expected: Object.fromEntries(changes.map((c) => [c.path, c.afterHash])) }));
