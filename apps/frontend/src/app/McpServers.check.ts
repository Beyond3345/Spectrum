// Self-check for Settings › Agents › MCP servers: a command line typed there, as the program and its arguments. Run:
// npx esbuild apps/frontend/src/app/McpServers.check.ts --bundle --platform=node --log-level=warning | node
import { commandWords, downloadHosts, hostWords, portWords } from './McpServers';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
eq(commandWords('npx -y @scope/server --flag'), ['npx', '-y', '@scope/server', '--flag'], 'words part at spaces');
eq(commandWords(`  node "/Users/a b/server.js"  'x y' z `), ['node', '/Users/a b/server.js', 'x y', 'z'], 'quotes keep a word whole');
eq(commandWords('uvx server ""'), ['uvx', 'server', ''], 'an empty quoted word is a word');
eq(commandWords('   '), [], 'nothing typed is no command');
eq(hostWords(' registry.npmjs.org, api.example.com\n*.example.org '), ['registry.npmjs.org', 'api.example.com', '*.example.org'], 'hosts part at spaces and commas');
eq(hostWords(' , '), [], 'nothing typed is no host');
eq(portWords('23119, 11434 abc 123456'), [23119, 11434, 'abc', '123456'], 'ports are numbers, anything else left for the backend to refuse by name');
// a command that downloads its program first is offered its registry before the first Check
const npm = ['registry.npmjs.org'];
const pypi = ['pypi.org', 'files.pythonhosted.org'];
eq(downloadHosts('npx', ['-y', '@modelcontextprotocol/server-memory']), { tool: 'npx', hosts: npm }, 'npx needs the npm registry');
eq(downloadHosts('/opt/homebrew/bin/npx', ['-y', 'x']), { tool: 'npx', hosts: npm }, 'by its full path too');
eq(downloadHosts('C:\\Program Files\\nodejs\\npx.cmd', ['x']), { tool: 'npx', hosts: npm }, 'and as a Windows shim');
eq(downloadHosts('npm', ['exec', 'x']), { tool: 'npm', hosts: npm }, 'npm');
eq(downloadHosts('bunx', ['x']), { tool: 'bunx', hosts: npm }, 'bunx uses the npm registry');
eq(downloadHosts('pnpm', ['dlx', 'x']), { tool: 'pnpm dlx', hosts: npm }, 'pnpm dlx');
eq(downloadHosts('pnpm', ['exec', 'x']), null, 'pnpm without dlx runs what is installed');
eq(downloadHosts('uvx', ['mcp-server-fetch']), { tool: 'uvx', hosts: pypi }, 'uvx needs PyPI’s index and file hosts');
eq(downloadHosts('pipx', ['run', 'x']), { tool: 'pipx', hosts: pypi }, 'pipx too');
eq(downloadHosts('node', ['/srv/server.js']), null, 'a program on this computer downloads nothing');
eq(downloadHosts('npx-like', []), null, 'only the tool itself');
console.log('McpServers.check: ok');
