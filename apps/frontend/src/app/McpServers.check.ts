import assert from 'node:assert/strict';
import { commandWords } from './McpServers';

// a command line typed in Settings › Agents › MCP servers, as the program and its arguments
assert.deepEqual(commandWords('npx -y @scope/server --flag'), ['npx', '-y', '@scope/server', '--flag']);
assert.deepEqual(commandWords(`  node "/Users/a b/server.js"  'x y' z `), ['node', '/Users/a b/server.js', 'x y', 'z']);
assert.deepEqual(commandWords('uvx server ""'), ['uvx', 'server', '']);
assert.deepEqual(commandWords('   '), []);
console.log('McpServers.check: ok');
