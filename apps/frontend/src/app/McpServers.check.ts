// Self-check for Settings › Agents › MCP servers: a command line typed there, as the program and its arguments. Run:
// npx esbuild apps/frontend/src/app/McpServers.check.ts --bundle --platform=node --log-level=warning | node
import { commandWords, hostWords } from './McpServers';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
eq(commandWords('npx -y @scope/server --flag'), ['npx', '-y', '@scope/server', '--flag'], 'words part at spaces');
eq(commandWords(`  node "/Users/a b/server.js"  'x y' z `), ['node', '/Users/a b/server.js', 'x y', 'z'], 'quotes keep a word whole');
eq(commandWords('uvx server ""'), ['uvx', 'server', ''], 'an empty quoted word is a word');
eq(commandWords('   '), [], 'nothing typed is no command');
eq(hostWords(' registry.npmjs.org, api.example.com\n*.example.org '), ['registry.npmjs.org', 'api.example.com', '*.example.org'], 'hosts part at spaces and commas');
eq(hostWords(' , '), [], 'nothing typed is no host');
console.log('McpServers.check: ok');
