// Spectrum's tools for a local agent, an MCP server over stdio that the agent starts inside its own isolation:
//   node server.js --root <working copy> --state <this run's folder in the agent's home>
// It has no authority of its own: it reads and writes only what the agent may, and talks to nothing but the agent and
// the public HTTPS services the agent may reach.
import path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { APP_VERSION } from '../config/constants.js';
import * as tools from './tools.js';
import { DATA_RULE, SKILL_RULE, skillText, untrusted } from '../utils/outsideText.js';

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

const server = new McpServer({ name: 'spectrum', version: APP_VERSION }, { instructions: `Spectrum’s tools for the document in your working copy. ${DATA_RULE} ${SKILL_RULE}` });
// The registry's tools (tools.js TOOLS, which the Spectrum agent registers too), with this host's side of them: the
// working copy, the run's folder with the context Spectrum left there, and the skills it copied into this home.
const ctx = {
  root: async () => root,
  state,
  opensFiles: true,
  todos: () => tools.listTodos(state),
  // left for Spectrum to show once the turn ends
  suggestTodo: (todo) => tools.suggestTodo(state, todo),
  loadSkill: tools.loadHomeSkill
};
// every answer as JSON text inside a marker naming the tool it came from (a skill's as a skill): what a paper's
// abstract, a .bib field or a log says is never the user speaking; a failure as the tool's error, for the agent to read
for (const tool of tools.TOOLS) {
  server.registerTool(tool.name, { description: tool.description, inputSchema: tool.schema, annotations: { readOnlyHint: tool.readOnly } }, async (input) => {
    try {
      const answer = await tool.run(ctx, input || {});
      const { image, ...rest } = answer?.image ? answer : {};
      const result = image ? rest : answer;
      const text = typeof result === 'string' ? result : JSON.stringify(result);
      // a page or a figure the tool drew comes as an image block after its words
      return { content: [{ type: 'text', text: tool.name === 'load_skill' ? skillText(input?.id, text) : untrusted(tool.name, text) }, ...(image ? [{ type: 'image', data: image.data, mimeType: image.type }] : [])] };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: untrusted(tool.name, err.message) }] };
    }
  });
}

await server.connect(new StdioServerTransport());
