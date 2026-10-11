import { promises as fs } from 'fs';
import { applyPatch, createTwoFilesPatch } from 'diff';
import { safeJoin } from '../utils/pathUtils.js';
import { listFilesRecursive } from '../utils/fsUtils.js';
import { extractPathFromPatch } from '../utils/diffUtils.js';
import { resolveLLMConfig, chatCompletion, NO_API_KEY } from './llmService.js';
import { getProjectRoot } from './projectService.js';
import { extractArxivId, fetchArxivEntry, buildArxivBibtex, searchArxiv } from './arxivService.js';

const MAX_STEPS = 15;

// chatCompletion already words its errors for people
export function llmErrorMessage(error) {
  return error || 'The request to the model failed.';
}

const fn = (name, description, properties = {}, required = []) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } }
});
const str = { type: 'string' };

const TOOL_SPECS = [
  fn('read_file', 'Read a UTF-8 file from the project. Input: { path } (relative to project root).', { path: str }, ['path']),
  fn('list_files', 'List files under a directory. Input: { dir } (relative path, optional).', { dir: str }),
  fn('propose_patch', 'Propose a full file rewrite. Input: { path, content }. This does NOT write. It returns a patch for user confirmation.', { path: str, content: str }, ['path', 'content']),
  fn('apply_patch', 'Apply a unified diff to a file and propose changes. Input: { patch, path? }. This does NOT write.', { patch: str, path: str }, ['patch']),
  fn('get_compile_log', 'Return the latest compile log from the client (read-only). Input: { }.'),
  fn('arxiv_search', 'Search arXiv papers. Input: { query, maxResults? }.', { query: str, maxResults: { type: 'number' } }, ['query']),
  fn('arxiv_bibtex', 'Generate BibTeX for an arXiv paper. Input: { arxivId }.', { arxivId: str }, ['arxivId'])
];

export async function runToolAgent({
  projectId,
  activePath,
  task,
  prompt,
  selection,
  compileLog,
  llmConfig,
  reasoningEffort
}) {
  if (!projectId) {
    return { ok: false, reply: 'Missing projectId, so tools mode is unavailable.', patches: [] };
  }

  const projectRoot = await getProjectRoot(projectId);
  const pendingPatches = [];

  const tools = {
    read_file: async ({ path: filePath }) => {
      const content = await fs.readFile(safeJoin(projectRoot, filePath), 'utf8');
      return content.slice(0, 20000);
    },
    list_files: async ({ dir }) => {
      const root = dir ? safeJoin(projectRoot, dir) : projectRoot;
      const items = await listFilesRecursive(root, '');
      return JSON.stringify({ files: items.filter((item) => item.type === 'file').map((item) => item.path) });
    },
    propose_patch: async ({ path: filePath, content }) => {
      let original = '';
      try {
        original = await fs.readFile(safeJoin(projectRoot, filePath), 'utf8');
      } catch {
        original = '';
      }
      const diff = createTwoFilesPatch(filePath, filePath, original, content, 'current', 'proposed');
      pendingPatches.push({ path: filePath, original, content, diff });
      return `Patch prepared for ${filePath}. Awaiting user confirmation.`;
    },
    apply_patch: async ({ patch, path: providedPath }) => {
      const filePath = providedPath || extractPathFromPatch(patch);
      if (!filePath) throw new Error('Patch missing file path');
      const original = await fs.readFile(safeJoin(projectRoot, filePath), 'utf8');
      const patched = applyPatch(original, patch);
      if (patched === false) throw new Error('Failed to apply patch');
      const diff = createTwoFilesPatch(filePath, filePath, original, patched, 'current', 'proposed');
      pendingPatches.push({ path: filePath, original, content: patched, diff });
      return `Patch applied in memory for ${filePath}. Awaiting user confirmation.`;
    },
    get_compile_log: async () => compileLog || 'No compile log provided.',
    arxiv_search: async ({ query, maxResults }) => JSON.stringify({ papers: await searchArxiv(query, maxResults || 5) }),
    arxiv_bibtex: async ({ arxivId }) => {
      const id = extractArxivId(arxivId);
      if (!id) throw new Error('Invalid arXiv ID');
      const entry = await fetchArxivEntry(id);
      if (!entry) throw new Error('No arXiv metadata found');
      return buildArxivBibtex(entry);
    }
  };

  const resolved = resolveLLMConfig(llmConfig);
  if (!resolved.apiKey) {
    return { ok: false, reply: NO_API_KEY, patches: [] };
  }

  const system = [
    'You are a LaTeX paper assistant for Spectrum.',
    'You can read files and propose patches via tools, and you may call tools multiple times.',
    'If a request affects multiple files (e.g., sections + bib), inspect and update all relevant files.',
    'You can use arxiv_search to find papers and arxiv_bibtex to generate BibTeX.',
    'Never assume writes are applied; use propose_patch and wait for user confirmation.',
    'Use apply_patch for localized edits; use propose_patch for full-file rewrites.',
    'Be concise. Provide a short summary in the final response.'
  ].join(' ');

  const userInput = [
    `Task: ${task || 'polish'}`,
    activePath ? `Active file: ${activePath}` : '',
    prompt ? `User prompt: ${prompt}` : '',
    selection ? `Selection:\n${selection}` : '',
    compileLog ? `Compile log:\n${compileLog}` : ''
  ].filter(Boolean).join('\n\n');

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: userInput }
  ];

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const result = await chatCompletion({ ...resolved, messages, tools: TOOL_SPECS, reasoningEffort });
    if (!result.ok) {
      return { ok: false, reply: llmErrorMessage(result.error), patches: pendingPatches };
    }
    const { content, tool_calls: toolCalls } = result.message;
    if (!toolCalls?.length) {
      return { ok: true, reply: content || '', patches: pendingPatches };
    }
    // the whole message goes back: DeepSeek, Kimi and Gemini need their reasoning fields in a tool loop
    messages.push({ ...result.message, content: content || null });
    for (const call of toolCalls) {
      let output;
      try {
        const handler = tools[call.function?.name];
        if (!handler) throw new Error(`Unknown tool ${call.function?.name}`);
        output = await handler(JSON.parse(call.function.arguments || '{}'));
      } catch (err) {
        output = `Error: ${err.message}`;
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: String(output) });
    }
  }

  return {
    ok: true,
    reply: `Stopped after ${MAX_STEPS} tool steps without a final answer.`,
    patches: pendingPatches
  };
}
