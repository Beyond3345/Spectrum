// Spectrum's tools for a local agent, an MCP server over stdio that the agent starts inside its own isolation:
//   node server.js --root <working copy> --state <this run's folder in the agent's home>
// It has no authority of its own: it reads and writes only what the agent may, and talks to nothing but the agent and
// the public HTTPS services the agent may reach.
import path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { APP_VERSION } from '../config/constants.js';
import * as tools from './tools.js';

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? path.resolve(process.argv[i + 1]) : null;
};
const root = arg('--root');
const state = arg('--state');
if (!root || !state) {
  console.error('Usage: server.js --root <working copy> --state <run folder> [--compile --main <file> --engine <engine>]');
  process.exit(2);
}
// --compile: one compile of the copy, its answer on stdout, for Spectrum's preview of an agent's draft
if (process.argv.includes('--compile')) {
  const value = (name) => process.argv[process.argv.indexOf(name) + 1];
  const result = await tools.compile(root, state, { main: value('--main'), engine: value('--engine') });
  // a pipe on macOS takes its writes later: exit once this one is out
  await new Promise((resolve) => process.stdout.write(JSON.stringify(result), resolve));
  process.exit(0);
}

const server = new McpServer({ name: 'spectrum', version: APP_VERSION });
// every answer as JSON text; a failure as the tool's error, for the agent to read
const tool = (name, description, inputSchema, run) => server.registerTool(name, { description, inputSchema }, async (input) => {
  try {
    const result = await run(input || {});
    return { content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result) }] };
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: err.message }] };
  }
});

tool('compile', 'Compile the project in your working copy with its LaTeX engine. Returns whether it built, each error as file:line, the undefined citations and references, and where the PDF is. Nothing is written into the working copy. Input: { main?, engine? } (engine: auto, pdflatex, xelatex, lualatex, latexmk or tectonic).',
  { main: z.string().optional(), engine: z.enum(['auto', 'pdflatex', 'xelatex', 'lualatex', 'latexmk', 'tectonic']).optional() }, (input) => tools.compile(root, state, input));
tool('get_log', 'The last compile\'s errors as file:line, its undefined citations and references, and the end of its log.', {}, () => tools.getLog(state));
tool('project_map', 'The document\'s main file and engine, the files it includes, its outline and labels, and the references and citations that do not resolve. LaTeX, Typst (= headings, <label>, @key, #include) and Markdown (# headings, {#id}, @key) documents; a Typst or Markdown heading\'s level is its depth.', {}, () => tools.projectMap(root, state));
tool('bib_entries', 'Every entry of the project\'s bibliography: key, type, title, authors, year, DOI and file.', {}, () => tools.listBibEntries(root, state));
tool('bib_search', 'Bibliography entries whose key, title, authors, DOI or year hold every word of the query. Search before adding an entry so a work never gets a second key.', { query: z.string() }, ({ query }) => tools.searchBibEntries(root, state, query));
tool('literature_search', 'Search scholarly databases (OpenAlex, then Semantic Scholar, then arXiv) for papers: titles, authors, years, venues, DOIs and summaries. Input: { query, limit? } (up to 10).',
  { query: z.string(), limit: z.number().int().min(1).max(10).optional() }, ({ query, limit }) => tools.literatureSearch(query, limit));
tool('fetch_bibtex', 'BibTeX for a DOI, an arXiv id or link, or else the best match for a title. Input: { id }.', { id: z.string() }, ({ id }) => tools.fetchBibtex(id));
tool('list_todos', 'The project\'s open to-dos, with where each points, as they were when this session started.', {}, () => tools.listTodos(state));
tool('suggest_todo', 'Suggest a to-do for the user\'s list. It is not added: the user sees it as a card when your turn ends and adds it if they want. Input: { text, link? }, link being { file, line } for a source line, { doc, page } for a PDF page or { key } for a reference.',
  { text: z.string(), link: z.object({ file: z.string().optional(), line: z.number().int().optional(), doc: z.string().optional(), page: z.number().int().optional(), key: z.string().optional() }).optional() }, (input) => tools.suggestTodo(state, input));
tool('load_skill', 'Load one of the project\'s skills: its full instructions, its folder and its files.', { id: z.string() }, ({ id }) => tools.loadHomeSkill(id));

await server.connect(new StdioServerTransport());
