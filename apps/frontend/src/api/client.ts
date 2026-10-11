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
  keyUrl: string;
  note: string;
  models: ProviderModel[];
  recommended: { main: string; fast: string; vision: string; references: string };
}

export interface TemplateMeta {
  id: string;
  label: string;
  mainFile: string;
  category: string;
  description: string;
  tags: string[];
  author: string;
  featured: boolean;
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
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
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
    try {
      message = JSON.parse(message).error || message;
    } catch {
      // plain text error
    }
    throw new ApiError(message || `Request failed (${res.status})`, res.status);
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

export function getProjectTree(id: string) {
  return request<{ items: FileItem[]; fileOrder?: FileOrderMap; mainFile?: string }>(`/api/projects/${id}/tree`);
}

export function getFile(id: string, filePath: string) {
  const qs = new URLSearchParams({ path: filePath }).toString();
  return request<{ content: string }>(`/api/projects/${id}/file?${qs}`);
}

/** create: only make a new file; it throws an ApiError with status 409 instead of replacing one (any letter case). */
export function writeFile(id: string, filePath: string, content: string, options: { create?: boolean } = {}) {
  return request<{ ok: boolean }>(`/api/projects/${id}/file`, json('PUT', { path: filePath, content, ...(options.create && { create: true }) }));
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
  /** relative path of the PDF written next to the main file, e.g. "main.pdf" */
  pdfPath?: string;
  log?: string;
  status?: number;
  engine?: string;
  error?: string;
}

export function compileProject(payload: { projectId: string; mainFile: string; engine: CompileEngine }) {
  return request<CompileResult>('/api/compile', json('POST', payload));
}

// ─── Version history ───

export type VersionReason = 'manual' | 'before-ai' | 'before-restore' | 'before-transfer';

export interface VersionMeta {
  id: number;
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

export function saveChat(projectId: string, chat: ChatThread) {
  return request<{ ok: boolean }>(`/api/projects/${projectId}/chats/${chat.id}`, json('PUT', { chat }));
}

export function deleteChat(projectId: string, chatId: string) {
  return request<{ ok: boolean }>(`/api/projects/${projectId}/chats/${chatId}`, { method: 'DELETE' });
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

export function listProviders() {
  return request<{ providers: ProviderPreset[] }>('/api/llm/providers');
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

export type SearchProvider = 'llm' | 'openalex' | 'semanticscholar' | 'serpapi' | 'tavily' | 'brave';

export interface SearchResult {
  title: string;
  summary: string;
  url: string;
  bibtex: string;
  authors?: string[];
  year?: string;
  source?: string;
}

export function webSearch(payload: { query: string; provider: Exclude<SearchProvider, 'llm'>; apiKey?: string; engine?: string; maxResults?: number }) {
  return request<{ ok: boolean; results?: SearchResult[]; error?: string }>('/api/websearch', json('POST', payload));
}

export interface CitationSuggestion extends SearchResult {
  reason: string;
  citeKey: string;
}

export function suggestCitations(payload: { text: string; maxResults?: number; llmConfig?: Partial<LLMConfig> }) {
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

export function resolveReferences(payload: { projectId: string; input: string; bibFile?: string; llmConfig?: Partial<LLMConfig> }) {
  return request<{ ok: boolean; results: ReferenceResult[]; bibFile: string; bibIncluded: boolean; error?: string }>(
    '/api/references/resolve',
    json('POST', payload)
  );
}

export function addReference(payload: { projectId: string; candidateId: string; bibFile?: string }) {
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

export interface MineruConfig {
  apiBase?: string;
  token?: string;
  modelVersion?: string;
}

export interface MineruTransferStartPayload {
  sourceProjectId?: string;
  sourceMainFile?: string;
  targetTemplateId: string;
  targetMainFile: string;
  engine?: CompileEngine;
  layoutCheck?: boolean;
  llmConfig?: Partial<LLMConfig>;
  visionLlmConfig?: Partial<LLMConfig>;
  mineruConfig?: MineruConfig;
  parentDir?: string;
}

export function mineruTransferStart(payload: MineruTransferStartPayload) {
  return request<{ jobId: string; newProjectId: string }>('/api/transfer/start-mineru', json('POST', payload));
}

export async function mineruTransferUploadPdf(jobId: string, pdfFile: File) {
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
  python: { path: string; found: boolean; matplotlib: boolean };
  platform: string;
}

export function systemCheck() {
  return request<SystemCheck>('/api/system/check');
}

export function revealProject(projectId: string, filePath?: string) {
  return request<{ ok: boolean; path?: string }>('/api/system/reveal', json('POST', { projectId, path: filePath }));
}
