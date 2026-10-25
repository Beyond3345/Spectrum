// Typed client for the local Spectrum backend. Every request is same-origin;
// the backend only accepts requests from this machine.

import type { BibRecord, Finding } from '../editor/preflight/run';

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
}

/** A folder's place in a sync app's folder, the same on every computer */
export interface SyncPlace {
  provider: 'synology' | 'onedrive' | 'dropbox' | 'google' | 'icloud';
  /** e.g. 'Synology Drive' */
  label: string;
  /** '/'-separated from the top of the sync app's folder, e.g. 'Spectrum/Thesis' */
  rel: string;
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

export function listProjects() {
  return request<{ projects: ProjectMeta[] }>('/api/projects');
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

/**
 * Move to this computer: a project used in a sync app's folder copied into parentDir (default: the projects folder)
 * and listed there; left: the folder it was in, which stays as it is.
 */
export function moveProjectHere(id: string, parentDir?: string) {
  return request<{ project: ProjectMeta; left: { label: string; path: string } }>(`/api/projects/${id}/move-here`, json('POST', { parentDir }));
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
  /** each \label's number and page, from the document's kept .aux files after its last compile */
  labels?: Record<string, { number: string; page: string }>;
  /** when those .aux files were written (ms), null before the first compile */
  auxAt?: number | null;
  /** a file the document reads is newer than the kept .aux */
  stale?: boolean;
  /** the contents' entries from the kept .aux files, in order; number '' for an unnumbered one */
  headings?: { level: string; number: string; page: string }[];
}

/** doc: the project-relative document; sent as mainFile too, which texcount counts from (looked for in texFolder first) */
export function getProjectStats(id: string, doc: string, texFolder?: string) {
  const qs = new URLSearchParams({ mainFile: doc, doc, ...(texFolder && { texFolder }) }).toString();
  return request<ProjectStats>(`/api/projects/${id}/stats?${qs}`);
}

export type BibTool = 'auto' | 'bibtex' | 'biber';

/** A project's compile choices; a key that's missing uses the app's default (Settings › Engines › LaTeX). */
export interface CompileOptions {
  engine?: CompileEngine;
  /** seconds after the last edit, 0 = off */
  autoCompile?: number;
  haltOnError?: boolean;
  bibTool?: BibTool;
  draft?: boolean;
  /** TexLab's syntax check before compiling (the editor runs it) */
  syntaxCheck?: boolean;
  /** the Typst version a Typst project pins ('' is the built-in one) */
  typstVersion?: string;
  /** the PDF engine a Markdown project compiles through */
  markdownEngine?: 'latex' | 'typst';
}

/** .spectrum/settings.json, which travels with the project (1.10.4 ignores it) */
export interface ProjectSettings {
  compile?: CompileOptions;
  /** skills the project turns on or off, whatever this computer has */
  skills?: ProjectSkills;
}

export interface ProjectSkills {
  on: string[];
  off: string[];
}

export function getProjectSettings(id: string) {
  return request<{ settings: ProjectSettings }>(`/api/projects/${id}/settings`);
}

/** A compile key set to null is removed, so the app's default applies again; skills replaces the project's choices (null: none). */
export function updateProjectSettings(id: string, patch: { compile?: { [K in keyof CompileOptions]?: CompileOptions[K] | null }; skills?: ProjectSkills | null }) {
  return request<{ settings: ProjectSettings }>(`/api/projects/${id}/settings`, json('PATCH', patch));
}

// ─── Files ───

/**
 * documents: the .tex files with a \documentclass of their own, so each compiles to a PDF. diagrams: the files the
 * diagram composer can open (a figures/*.tex that ends with its drawing, any .mmd). conflicts: a sync app's conflict
 * copies, each with its original's path.
 */
export function getProjectTree(id: string) {
  return request<{ items: FileItem[]; fileOrder?: FileOrderMap; mainFile?: string; documents: string[]; diagrams?: string[]; conflicts?: Record<string, string> }>(
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

/** unmoved: how many PDF notes and to-dos couldn't follow the file */
export function renamePath(id: string, from: string, to: string) {
  return request<{ ok: boolean; unmoved?: number }>(`/api/projects/${id}/rename`, json('POST', { from, to }));
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

/** A Typst compile's own diagnostics, in place of the LaTeX log parser. */
export interface CompileDiagnostic {
  severity: 'error' | 'warning';
  message: string;
  file: string;
  line: number;
  column: number;
}

export interface CompileResult {
  ok: boolean;
  pdf?: string;
  /** relative path of the PDF written next to the document, e.g. "main.pdf" */
  pdfPath?: string;
  /** that copy wasn't updated (another program on Windows holds it), so only `pdf` is this compile's */
  pdfStale?: boolean;
  log?: string;
  status?: number;
  engine?: string;
  /** the Typst version the compile used */
  typstVersion?: string;
  /** Typst's errors and warnings, whose cards point at the source lines */
  errors?: CompileDiagnostic[];
  error?: string;
  /** documents it links with \externaldocument, compiled first because their .aux was missing or out of date */
  linked?: { file: string; ok: boolean }[];
  /** Stop ended it; the last PDF stays */
  stopped?: boolean;
  /** the document compiled: the one asked for, or the document its % !TEX root names */
  doc?: string;
  /** the checkpoint asked for: saved or not, why it couldn't be, and files it left out (too large or unreadable) */
  checkpoint?: { saved: boolean; id?: number; error?: string; skipped?: string[] };
}

/**
 * mainFile: the document to compile, the project's main file or another. compileId: the editor's name for this
 * compile, so Stop ends this one (even before it has started). fresh: clear the document's kept build files first.
 * texFolder: a TeX installation's folder to try first. checkpoint: save one if the compile succeeds and the source
 * changed since the last.
 */
export function compileProject(payload: {
  projectId: string;
  mainFile: string;
  engine: CompileEngine;
  compileId?: string;
  haltOnError?: boolean;
  bibTool?: BibTool;
  draft?: boolean;
  fresh?: boolean;
  texFolder?: string;
  checkpoint?: boolean;
  typstInputs?: Record<string, string>;
}) {
  return request<CompileResult>('/api/compile', json('POST', payload));
}

/** Ends the compile started with this id (false when it hasn't started yet; it then stops as it starts). */
export function stopCompile(compileId: string) {
  return request<{ ok: boolean }>('/api/compile/stop', json('POST', { compileId }));
}

// ─── Diagram composer ───

/**
 * A diagram's preview: its figures/<name>.tex compiled as a document of its own, with the files kept from its last
 * compile and no checkpoint, which leaves the project's main file and the editor's PDF as they are. Writes
 * figures/<name>.pdf, which the editor's Insert diagram can also use. compileId: for stopCompile, when a newer change
 * makes this preview stale.
 */
export function compileDiagram(payload: { projectId: string; file: string; engine?: CompileEngine; compileId?: string; texFolder?: string }) {
  const { file, engine = 'auto', ...rest } = payload;
  return compileProject({ ...rest, mainFile: file, engine, draft: false, fresh: false });
}

/**
 * A circuit part to draw: tikz is its circuitikz key ('R', 'op amp'), options its other keys ('mirror'), pins the
 * anchors to measure ('+', 'out'). Letters, digits, spaces and . , = + - / * < > ^ ! | : only.
 */
export interface SymbolPart {
  id: string;
  tikz: string;
  kind: 'path' | 'node';
  options?: string[];
  pins?: string[];
}

/**
 * A part's page of the PDF, in PDF points (pdf.js at scale 1): origin is its reference point from the page's top-left
 * corner (y down), each pin an offset from the reference point (y up, as in TikZ). A path part's glyph lies between its
 * start and end pins, with no leads; a node part sits with its reference point where \node … at (x,y) puts it.
 */
export interface SymbolPage {
  id: string;
  page: number;
  width: number;
  height: number;
  origin: { x: number; y: number };
  pins: { name: string; x: number; y: number }[];
  /** TeX's first error while drawing this part */
  error?: string;
}

/**
 * The parts drawn by the installed circuitikz, a page each, in the diagram's style: ctikzOptions are the picture's
 * options (a \ctikzset key as /tikz/circuitikz/<key>). texFolder: Settings › Engines › LaTeX's TeX folder. Kept in the
 * data folder's cache by the request, so asking again is quick.
 */
export function diagramSymbols(payload: { parts: SymbolPart[]; style: { ctikzOptions: string }; texFolder?: string }) {
  return request<{ ok: boolean; pdf?: string; pages?: SymbolPage[]; log?: string; error?: string }>('/api/diagram/symbols', json('POST', payload));
}

// ─── TexLab's diagnostics ───

/** One of TexLab's findings in a file: lines and columns from 1, code by name (e.g. 'missing-brace', 'undefined-label'). */
export interface TexlabDiagnostic {
  line: number;
  col: number;
  endLine: number;
  endCol: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  code?: string;
  source: 'texlab';
}

/** TexLab's latest diagnostics by project path, once it has caught up with the latest edit; available is false without TexLab. */
export function getDiagnostics(projectId: string) {
  return request<{ ok: boolean; available: boolean; files: Record<string, TexlabDiagnostic[]> }>(`/api/projects/${projectId}/diagnostics`);
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

// ─── Review ───

/** When doc's PDF and the newest file it reads were written (ms; null: none), and with bib the project's .bib entries. */
export function getReviewState(projectId: string, doc: string, bib = false) {
  const qs = new URLSearchParams({ doc, ...(bib && { bib: '1' }) }).toString();
  return request<{ ok: true; pdfAt: number | null; sourceAt: number | null; bib?: BibRecord[] }>(`/api/projects/${projectId}/review/state?${qs}`);
}

/** anchored: the quote is on (or near) line, which points at it; otherwise the place is the model's guess. */
export interface AiFinding {
  severity: 'major' | 'minor' | 'note';
  category: string;
  file: string;
  line: number;
  quote: string;
  issue: string;
  suggestion: string;
  anchored: boolean;
}

/** score out of 10, confidence out of 5; files: those the model read */
export interface AiReview {
  summary: string;
  strengths: string[];
  score: number | null;
  confidence: number | null;
  findings: AiFinding[];
  limits: string[];
  files: string[];
}

/** The AI review of doc, told what Preflight found. Read-only; aborting signal stops the model call. */
export function runAiReview(
  payload: { projectId: string; doc: string; activePath: string; findings: Finding[]; llmConfig?: Partial<LLMConfig>; reasoningEffort?: ReasoningEffort },
  signal?: AbortSignal
) {
  return request<({ ok: true } & AiReview) | { ok: false; error: string; stopped?: boolean }>('/api/review', { ...json('POST', payload), signal });
}

// ─── Version history ───

/** compile: saved after a successful compile (Settings › Checkpoints), the one kind called automatic */
export type VersionReason = 'manual' | 'before-ai' | 'before-restore' | 'before-transfer' | 'compile';

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

/** Deletes the automatic (after compile) checkpoints older than this many days; manual and “Before …” ones stay. */
export function deleteOldCheckpoints(projectId: string, olderThanDays: number) {
  const qs = new URLSearchParams({ automatic: '1', olderThanDays: String(olderThanDays) }).toString();
  return request<{ removed: number }>(`/api/projects/${projectId}/versions?${qs}`, { method: 'DELETE' });
}

// ─── The user's other computers ───

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

/** The newest settings another computer shared; shared is false until there's somewhere to share them. */
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
  /** a Spectrum agent thread, listed in the agent workspace rather than the bottom card */
  agent?: true;
  /** the persona chosen for this chat (Settings › Personas) */
  persona?: string;
}

export interface ChatSummary {
  id: string;
  title: string;
  mode: ChatMode;
  updatedAt: string;
  messageCount: number;
  agent?: true;
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

/** A to-do an agent suggests (its suggest_todo tool); it is only saved when the user adds it */
export type SuggestedTodo = { text: string; link?: TodoLink };

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
  /** the persona's or default instructions; never sent for autocomplete */
  instructions?: string;
  /** a skill's id, whose instructions go in whole (the composer's /skill-id) */
  skill?: string;
  /** tools mode: the thread's proposals still open, which the run goes on from */
  drafts?: { path: string; original: string; proposed: string }[];
}) {
  // tools mode: changes lists its patches as local agents' changes tray does, todos the to-dos it suggests and steps
  // its tool calls
  return request<{ ok: boolean; reply: string; suggestion: string; patches?: AgentPatch[]; changes?: AgentChange[]; todos?: SuggestedTodo[]; steps?: AgentStep[] }>('/api/agent/run', json('POST', payload));
}

/** One of the Spectrum agent's tool calls: the tool, what it was about (a path, a query, an id) and whether it worked */
export type AgentStep = { tool: string; about?: string; ok: boolean };

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

export type CheckerAssets = {
  version: string | null;
  integrity: 'verified' | 'mismatch' | 'unknown';
  warnings: string[];
  manifest: { version: string; binding?: { version: string }; components?: { name: string; version: string }[]; [key: string]: unknown } | null;
};
export type CheckerStatus = {
  /** started: false while Harper waits for its first check, which starts it */
  available: boolean; started?: boolean; language: string; error?: string; engine: string; version: string | null;
  diagnostics?: { appVersion: string; node: string; platform: string; arch: string; assets: CheckerAssets; dictionaries?: CheckerAssets };
};
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

export function grammarStatus() {
  return request<CheckerStatus>('/api/grammar/status');
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

export type ResearchSource = 'openalex' | 'semanticscholar' | 'arxiv' | 'crossref' | 'pubmed' | 'web' | 'zotero' | 'bib';

/** One paper in a session, merged across the sources that found it. inBib: its key in the project's .bib. */
export interface ResearchResult {
  id: string;
  title: string;
  authors?: string[];
  year?: string;
  venue?: string;
  doi?: string;
  arxiv?: string;
  url?: string;
  abstract?: string;
  sources: ResearchSource[];
  /** its item key, when the Zotero library gave it: it goes into the .bib from there, under its Zotero key */
  zotero?: string;
  citations?: number;
  /** a link to an open-access copy */
  openAccess?: string;
  /** false: a source knows it as published; missing: none can tell */
  preprint?: boolean;
  inBib?: string;
  decision?: 'keep' | 'drop';
  reason?: string;
  /** from the optional AI triage */
  why?: string;
  suggest?: 'keep' | 'drop';
  theme?: string;
}

export interface ResearchRun {
  at: string;
  queries: string[];
  perSource: Partial<Record<ResearchSource, { count: number; error?: string }>>;
  filters?: { yearFrom?: number; yearTo?: number; preprints?: false };
  triage?: { count: number; error?: string };
}

export interface ResearchSession {
  id: string;
  question: string;
  sources: ResearchSource[];
  createdAt: string;
  updatedAt: string;
  runs: ResearchRun[];
  results: ResearchResult[];
}

export interface ResearchSummary { id: string; question: string; sources: ResearchSource[]; createdAt: string; updatedAt: string; count: number; kept: number }

/** This computer's keys for the sources, sent with each search and never stored. */
export interface ResearchKeys { openalexKey?: string; openalexEmail?: string; semanticScholarKey?: string; ncbiKey?: string }

/** sessionId: another run of that session. triage: one AI call adds why, suggest and theme. */
export function searchResearch(payload: {
  projectId: string;
  question: string;
  sources: ResearchSource[];
  yearFrom?: number;
  yearTo?: number;
  preprints?: boolean;
  triage?: boolean;
  sessionId?: string;
  keys?: ResearchKeys;
  searchConfig?: SearchConfig;
  llmConfig?: Partial<LLMConfig>;
}) {
  return request<{ ok: boolean; session: ResearchSession }>('/api/research/search', json('POST', payload));
}

export const listResearch = (projectId: string) => request<{ ok: boolean; sessions: ResearchSummary[] }>(`/api/projects/${projectId}/research`);
export const getResearch = (projectId: string, id: string) => request<{ ok: boolean; session: ResearchSession }>(`/api/projects/${projectId}/research/${id}`);
export const deleteResearch = (projectId: string, id: string) => request<{ ok: boolean }>(`/api/projects/${projectId}/research/${id}`, { method: 'DELETE' });

/** Merged into the stored session field by field; null takes a field out. */
export type ResearchChange = { id: string } & { [K in 'decision' | 'suggest' | 'reason' | 'why' | 'theme']?: ResearchResult[K] | null };
export function updateResearch(projectId: string, id: string, change: { question?: string; results?: ResearchChange[] }) {
  return request<{ ok: boolean; session: ResearchSession }>(`/api/projects/${projectId}/research/${id}`, json('PUT', change));
}

/** Through the references resolver; without resultIds, the kept results not in the .bib yet. */
export function addResearchResults(projectId: string, id: string, payload: { resultIds?: string[]; bibFile?: string; searchConfig?: SearchConfig }) {
  return request<{ ok: boolean; results: { id: string; status: ReferenceResult['status']; key?: string; message?: string }[]; bibFile: string; bibIncluded: boolean; session: ResearchSession }>(
    `/api/projects/${projectId}/research/${id}/add`,
    json('POST', payload)
  );
}

/** research/notes/<key>.md, made only when it isn't there yet. */
export const researchNote = (projectId: string, id: string, resultId: string) =>
  request<{ ok: boolean; path: string; created: boolean }>(`/api/projects/${projectId}/research/${id}/note`, json('POST', { resultId }));

/** An open-access PDF into research/papers; email lets Unpaywall be asked. existing: it was there already. */
export const researchPdf = (projectId: string, id: string, resultId: string, email?: string) =>
  request<{ ok: boolean; path: string; existing?: boolean }>(`/api/projects/${projectId}/research/${id}/pdf`, json('POST', { resultId, email }));

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

// ─── Zotero (its local API and Better BibTeX, through the backend) ───

export interface ZoteroStatus {
  running: boolean;
  version: string;
  /** 'off': Zotero's "Allow other applications on this computer to communicate with Zotero" isn't ticked */
  localApi: 'on' | 'off' | 'missing' | null;
  /** Better BibTeX's version, null when it isn't installed */
  betterBibtex: string | null;
  /** Better BibTeX's citation picker answers */
  cayw: boolean;
  /** Zotero takes writes (Zotero 10), so each project can have its collection */
  writes: boolean;
  /** Zotero allowed Spectrum to write; the permission itself stays in the backend */
  authorised: boolean;
  message?: string;
}

/** A library item, with the key its .bib entry goes in under (Zotero's or Better BibTeX's, else an AuthorYear one). */
export interface ZoteroHit {
  itemKey: string;
  key: string;
  title: string;
  authors: string[];
  year?: string;
  venue?: string;
  doi?: string;
}

/** How the project's Spectrum collection stands after a sync. */
export interface ZoteroSync {
  state: 'off' | 'unreachable' | 'readonly' | 'empty' | 'waiting' | 'synced' | 'error';
  message?: string;
  /** 'Spectrum › Thesis' */
  collection?: string;
  added?: number;
  created?: number;
  removed?: number;
}

type ZoteroAdded = { ok: boolean; results: ReferenceResult[]; bibFile: string; bibIncluded: boolean };

export const zoteroStatus = () => request<{ ok: boolean } & ZoteroStatus>('/api/zotero/status');
/** Zotero's Allow prompt; it waits until the user answers there, or cancelZotero. */
export const authoriseZotero = () => request<{ ok: boolean; cancelled?: boolean } & Partial<ZoteroStatus>>('/api/zotero/authorize', json('POST'));
export const disconnectZotero = () => request<{ ok: boolean } & ZoteroStatus>('/api/zotero/authorize', { method: 'DELETE' });
/** Stops what waits in Zotero: the Allow prompt or the citation picker. */
export const cancelZotero = () => request<{ ok: boolean }>('/api/zotero/cancel', json('POST'));
/** message: why nothing came (Zotero closed, its local API off) */
export const searchZotero = (q: string, signal?: AbortSignal) =>
  request<{ ok: boolean; items: ZoteroHit[]; message?: string }>(`/api/zotero/search?q=${encodeURIComponent(q)}`, { signal });
/** Better BibTeX's picker in Zotero for command (parencite, citep or cite); text: the citation it wrote, under Zotero's keys. */
export const pickFromZotero = (projectId: string, command: string, bibFile?: string) =>
  request<Partial<ZoteroAdded> & { ok: boolean; cancelled?: boolean; text?: string }>(`/api/projects/${projectId}/zotero/cite`, json('POST', { command, bibFile }));
/** Library items (by item key) into the .bib under their Zotero keys. */
export const addFromZotero = (projectId: string, items: string[], bibFile?: string) =>
  request<ZoteroAdded>(`/api/projects/${projectId}/zotero/add`, json('POST', { items, bibFile }));
/** The project's collection brought up to its .bib; entries only ever go in from here. */
export const syncZotero = (projectId: string) => request<{ ok: boolean } & ZoteroSync>(`/api/projects/${projectId}/zotero/sync`, json('POST'));

// ─── Template transfer ───

export interface TransferStartPayload {
  sourceProjectId: string;
  sourceMainFile: string;
  targetTemplateId: string;
  targetMainFile: string;
  engine?: CompileEngine;
  /** Settings › Engines › LaTeX's TeX folder, which the compiles look in first */
  texFolder?: string;
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
  texFolder?: string;
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

/** texFolder: Settings › Engines › LaTeX's TeX folder, looked in first */
export function systemCheck(texFolder?: string) {
  return request<SystemCheck>(`/api/system/check${texFolder ? `?${new URLSearchParams({ texFolder })}` : ''}`);
}

// ─── This computer and the sync apps' folders ───

export function getSyncSettings() {
  return request<{ machineName: string }>('/api/sync');
}

/** machineName: what the other computers call this one; '' goes back to the system's name. */
export function updateSyncSettings(patch: { machineName: string }) {
  return request<{ machineName: string }>('/api/sync', json('PATCH', patch));
}

/** Where a folder is in a sync app's folder (OneDrive, iCloud Drive…), or null. */
export function syncPlace(path: string) {
  return request<{ place: SyncPlace | null }>('/api/sync/place', json('POST', { path }));
}

/** A project 1.10 mirrored into a cloud location, and what its copy there has that this computer never received. */
export interface MigratedProject {
  id: string;
  name: string;
  /** the cloud location's sync app, e.g. 'Synology Drive' */
  label: string;
  /** '/'-separated, the project's own files */
  changed?: string[];
  deleted?: string[];
  /** the copy isn't there any more */
  missing?: boolean;
  /** the copy couldn't be looked through (online-only, out of reach) */
  unchecked?: boolean;
}

/** What the move to 2.0 did with the projects that synced through a cloud location: inPlace ones are used there. */
export interface MigrationNotice {
  mirrored: MigratedProject[];
  inPlace: { id: string; name: string; label: string }[];
}

export function getMigrationNotice() {
  return request<{ notice: MigrationNotice | null }>('/api/migration');
}

export function dismissMigrationNotice() {
  return request<{ ok: boolean }>('/api/migration/dismiss', json('POST'));
}

export function revealProject(projectId: string, filePath?: string) {
  return request<{ ok: boolean; path?: string }>('/api/system/reveal', json('POST', { projectId, path: filePath }));
}

/** Show the copy 1.10 mirrored the project into, or a file in it, in Finder or Explorer. */
export function revealCloudCopy(projectId: string, filePath?: string) {
  return request<{ ok: boolean; path?: string }>('/api/system/reveal', json('POST', { projectId, cloud: true, path: filePath }));
}

// ─── Local ACP agents ───
export interface LocalAgent {
  id: string; name: string; command: string; args: string[]; runtimePaths: string[];
  installed: boolean; supported: boolean; hasKey: boolean; canImport: boolean;
  keyEnv: string; keyEnvs: string[];
  url: string; note?: string; unavailable?: string; experimental?: boolean;
}
/**
 * type 'update' carries an ACP session/update; 'todo' a to-do the agent suggested ({ text, link? }); 'reset' the paths a
 * rejection put back in the draft. first: a stored event that joins streamed pieces names its first piece's id, and
 * replaces the pieces first..id
 */
export interface AgentEvent { id: number; type: string; data: any; at: string; first?: number }
/** A persona's instructions for a local agent; null clears the session's. */
export interface AgentPersona { name: string; prompt: string }
/**
 * What the editor sends with a prompt, as ACP resources: todos sends the open to-dos, research a research session's id,
 * skill a skill's SKILL.md in whole
 */
export interface AgentPromptContext { activePath?: string; selection?: string; log?: string; todos?: boolean; research?: string; skill?: string }
export interface AgentChange {
  path: string; kind: 'created' | 'modified' | 'deleted'; binary: boolean; beforeHash: string | null;
  afterHash: string | null; size: number; original?: string; proposed?: string;
}
export interface AgentUserRequest { requestId: string; kind: string; params: any }
export interface LocalAgentSession {
  id: string; projectId: string; agentId: string; mode: 'review' | 'direct'; status: string;
  createdAt: string; updatedAt: string; events: AgentEvent[]; pending?: AgentUserRequest[];
  recoveries?: { id: string; files: string[] }[]; persona?: AgentPersona;
  /** the first task's first line */
  title?: string;
}
export const listLocalAgents = () => request<{ ok: boolean; agents: LocalAgent[] }>('/api/agents');
export const configureLocalAgent = (id: string, value: { command: string; args: string[]; runtimePaths: string[]; apiKey?: string; keyEnv?: string }) => request<{ ok: boolean }>(`/api/agents/${id}`, json('PUT', value));
export const importLocalAgentLogin = (id: string) => request<{ ok: boolean; files: number }>(`/api/agents/${id}/import-login`, json('POST', {}));
export const listLocalAgentSessions = (projectId: string) => request<{ ok: boolean; sessions: LocalAgentSession[] }>(`/api/agent-sessions?projectId=${encodeURIComponent(projectId)}`);
export const getLocalAgentSession = (id: string) => request<{ ok: boolean; session: LocalAgentSession }>(`/api/agent-sessions/${id}`);
export const createLocalAgentSession = (projectId: string, agentId: string, mode: 'review' | 'direct', persona?: AgentPersona | null) => request<{ ok: boolean; session: LocalAgentSession }>('/api/agent-sessions', json('POST', { projectId, agentId, mode, persona }));
/** persona: left out keeps the session's; another one starts a new agent session that hears the conversation so far */
export const sendLocalAgentPrompt = (id: string, prompt: string, options: { context?: AgentPromptContext; persona?: AgentPersona | null } = {}) => request<{ ok: boolean }>(`/api/agent-sessions/${id}/prompt`, json('POST', { prompt, ...options }));
export const stopLocalAgentSession = (id: string) => request<{ ok: boolean }>(`/api/agent-sessions/${id}/stop`, json('POST', {}));
export const answerLocalAgent = (id: string, requestId: string, answer: unknown) => request<{ ok: boolean }>(`/api/agent-sessions/${id}/answer`, json('POST', { requestId, answer }));
export const setLocalAgentOption = (id: string, configId: string, value: string) => request<{ ok: boolean }>(`/api/agent-sessions/${id}/option`, json('POST', { configId, value }));
export const getLocalAgentChanges = (id: string) => request<{ ok: boolean; changes: AgentChange[] }>(`/api/agent-sessions/${id}/changes`);
export const recoverLocalAgentApply = (id: string, recoveryId: string) => request<{ ok: boolean }>(`/api/agent-sessions/${id}/recover`, json('POST', { recoveryId }));
/** The agent's draft compiled on its own (review sessions only); pdf is base64, or null when none was made. */
export const previewLocalAgentDraft = (id: string, options: { mainFile?: string; engine?: string } = {}) => {
  const query = new URLSearchParams(Object.entries(options).filter(([, v]) => v) as [string, string][]).toString();
  return request<{ ok: boolean; pdf: string | null; log: string }>(`/api/agent-sessions/${id}/preview${query ? `?${query}` : ''}`);
};
export const reviewLocalAgentChanges = (id: string, action: 'apply' | 'reject', changes: AgentChange[]) => request<{ ok: boolean; changes: AgentChange[] }>(`/api/agent-sessions/${id}/review`, json('POST', { action, paths: changes.map((c) => c.path), expected: Object.fromEntries(changes.map((c) => [c.path, c.afterHash])) }));

// ─── Skills ───
/**
 * enabled: on for this computer; project: the project's own choice, when listed for one; active: on in that project.
 * licence and author come from the skill (the bundled ones' from the shipped list).
 */
export interface Skill {
  id: string; name: string; description: string; author: string; licence: string; version: string;
  source: 'bundled' | 'own'; files: number; compatibility?: string; enabled: boolean; project?: 'on' | 'off'; active: boolean;
}
export interface SkillShareTarget { agent: 'agents' | 'claude'; path: string; exists: boolean; linked: boolean }
export interface SkillShare { enabled: boolean; targets: SkillShareTarget[] }
export const listSkills = (projectId?: string) => request<{ ok: boolean; skills: Skill[] }>(`/api/skills${projectId ? `?project=${encodeURIComponent(projectId)}` : ''}`);
export const setSkillEnabled = (id: string, enabled: boolean) => request<{ ok: boolean }>(`/api/skills/${id}`, json('PATCH', { enabled }));
/** name: a title for it; the id is its folder's and SKILL.md's name */
export const createSkill = (skill: { id: string; name?: string; description: string; body?: string }) => request<{ ok: boolean; skill: Skill }>('/api/skills', json('POST', skill));
/** A copy of a skill's folder (regular files only) as one of the user's own. */
export const importSkill = (folder: string) => request<{ ok: boolean; skill: Skill }>('/api/skills/import', json('POST', { path: folder }));
export const duplicateSkill = (id: string) => request<{ ok: boolean; skill: Skill }>(`/api/skills/${id}/duplicate`, json('POST', {}));
export const deleteSkill = (id: string) => request<{ ok: boolean }>(`/api/skills/${id}`, { method: 'DELETE' });
export const listSkillFiles = (id: string) => request<{ ok: boolean; files: { path: string; size: number }[] }>(`/api/skills/${id}/files`);
export const readSkillFile = (id: string, file: string) => request<{ ok: boolean; content: string }>(`/api/skills/${id}/file?path=${encodeURIComponent(file)}`);
/** The user's own skills only. */
export const writeSkillFile = (id: string, file: string, content: string) => request<{ ok: boolean }>(`/api/skills/${id}/file?path=${encodeURIComponent(file)}`, json('PUT', { content }));
export const getSkillSharing = () => request<SkillShare & { ok: boolean }>('/api/skills/share');
export const setSkillSharing = (enabled: boolean) => request<SkillShare & { ok: boolean }>('/api/skills/share', json('PUT', { enabled }));

// ─── GitHub (projects and settings between the user's computers; the token stays in the backend) ───

export interface GitHubAuth {
  signedIn: boolean;
  login: string;
  name: string;
  /** Spectrum has an OAuth app to sign in with the device code; without one, a pasted token */
  deviceSignIn: boolean;
  /** the private spectrum-settings repository is on */
  settingsRepo: boolean;
}

export interface GitHubProblem {
  /** waiting: only for the connection (or a file still changing), tried again every 2 minutes; left: backed up without some files */
  state: 'waiting' | 'attention' | 'left';
  message: string;
  at: string;
  /** when the last backup reached GitHub, for “Not backed up since …” */
  lastBackup?: string | null;
  /** the files the last backup left out (key-like, over 100 MB), each with why */
  left?: string[];
}

export interface GitHubStatus {
  signedIn: boolean;
  /** the project's folder is a Git repository */
  repo: boolean;
  /** why Spectrum leaves the repository alone (LFS, submodules, mid-merge, another program in it) */
  refusal: string | null;
  linked: boolean;
  link: { owner: string; repo: string; url: string } | null;
  /** a Finder copy's settings name the original's repository */
  copyOf: { owner: string; repo: string } | null;
  ahead: number;
  behind: number;
  lastBackup: string | null;
  /** the sync app whose folder the project is in, which damages repositories */
  syncFolder: string | null;
  /** whether a shared repository gets chats, to-dos, PDF notes and research (null: not asked) */
  personal: boolean | null;
  askPersonal: boolean;
  problem: GitHubProblem | null;
  /** what the last commit left out (key-like, over 100 MB), each with why */
  left: string[];
}

/** What a pull (or Link, or Sync) did: confirm, it would delete `deleting` files and waits for allowDeletions. */
export interface GitHubPull {
  state: 'current' | 'merged' | 'confirm' | 'preview';
  fromTheirs: number;
  conflicts: number;
  /** a file in .spectrum changed: the to-dos, PDF notes and research panels reload */
  changedApp: boolean;
  deleting: number;
  problems: string[];
}

export interface GitHubRepoProject {
  owner: string;
  repo: string;
  private: boolean;
  pushedAt: string;
  /** the project's id and name, from its project.json */
  id: string;
  name: string;
  /** the project on this computer with that id */
  local: string | null;
  /** the repository's page on GitHub */
  url: string;
  linked: boolean;
  ahead: number;
  behind: number;
}

export const getGitHub = () => request<GitHubAuth & { ok: boolean }>('/api/github');
export const signInToGitHub = (token: string) => request<GitHubAuth & { ok: boolean }>('/api/github/token', json('POST', { token }));
export const signOutOfGitHub = () => request<GitHubAuth & { ok: boolean }>('/api/github', { method: 'DELETE' });
export const setSettingsRepo = (on: boolean) => request<GitHubAuth & { ok: boolean }>('/api/github/settings-repo', json('PUT', { on }));
export const startGitHubDevice = () => request<{ ok: boolean; id: string; userCode: string; verificationUri: string; expiresAt: string }>('/api/github/device', json('POST'));
export const gitHubDeviceState = (id: string) => request<{ ok: boolean; state: 'waiting' | 'done' | 'expired' | 'denied' | 'failed'; error?: string }>(`/api/github/device/${id}`);
export const cancelGitHubDevice = (id: string) => request<{ ok: boolean }>(`/api/github/device/${id}`, { method: 'DELETE' });
/** The settings repository brought up to date; first: this computer's settings aren't in it yet. */
/** force: a pull now, however recently the last one was. */
export const syncSettingsRepo = (force = false) => request<{ ok: boolean; ready: boolean; first: boolean; error?: string }>('/api/github/settings/sync', json('POST', { force }));
/** This computer's personas joined with the settings repository's, one file each there. */
export const syncPersonas = (personas: unknown[]) => request<{ ok: boolean; personas: unknown[]; changed: boolean }>('/api/github/personas', json('POST', { personas }));
export const listGitHubRepos = () => request<{ ok: boolean; repos: GitHubRepoProject[] }>('/api/github/repos');
export const gitHubProblems = () => request<{ ok: boolean; problems: Record<string, GitHubProblem> }>('/api/github/problems');
/** Get from GitHub: cloned into parentDir (default: the projects folder), with the project's own id. */
export const getFromGitHub = (owner: string, repo: string, parentDir?: string) => request<{ ok: boolean; project: ProjectMeta }>('/api/github/clone', json('POST', { owner, repo, parentDir }));
export const getProjectGitHub = (id: string) => request<GitHubStatus & { ok: boolean }>(`/api/projects/${id}/github`);
export const initialiseGit = (id: string) => request<GitHubStatus & { ok: boolean }>(`/api/projects/${id}/github/init`, json('POST'));
export const backUpToGitHub = (id: string, label?: string) => request<{ ok: boolean; left?: string[]; pulled?: GitHubPull }>(`/api/projects/${id}/github/backup`, json('POST', { label }));
export const pullFromGitHub = (id: string, allowDeletions = false) => request<{ ok: boolean; result: GitHubPull }>(`/api/projects/${id}/github/pull`, json('POST', { allowDeletions }));
export const syncWithGitHub = (id: string, allowDeletions = false) => request<{ ok: boolean; result: GitHubPull }>(`/api/projects/${id}/github/sync`, json('POST', { allowDeletions }));
/** Link to owner/repo (default: the one the project's settings name); preview: what it would do, writing nothing. */
export const linkGitHub = (id: string, options: { owner?: string; repo?: string; preview?: boolean; allowDeletions?: boolean } = {}) =>
  request<{ ok: boolean; result: GitHubPull }>(`/api/projects/${id}/github/link`, json('POST', options));
export const setGitHubPersonal = (id: string, personal: boolean) => request<{ ok: boolean }>(`/api/projects/${id}/github/personal`, json('PUT', { personal }));
/** The editor opened the project: pulled from GitHub when it's linked; message when that couldn't happen. */
export const gitHubOpened = (id: string) => request<{ ok: boolean; linked: boolean; result?: GitHubPull; message?: string }>(`/api/projects/${id}/github/opened`, json('POST'));
/** The editor left the project (sent as the window closes too). */
export const gitHubLeft = (id: string) => fetch(`/api/projects/${id}/github/left`, { method: 'POST', keepalive: true }).catch(() => undefined);
