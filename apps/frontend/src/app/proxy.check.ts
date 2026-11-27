// Self-check for Settings › System & Network › Network: what the line says of the proxy in use, or of none. Run:
// npx esbuild apps/frontend/src/app/proxy.check.ts --bundle --platform=node --format=esm --loader:.svg=text --loader:.css=empty --outfile=<scratch>.mjs && node <scratch>.mjs
import { proxyLine } from './ProxySettings';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (actual !== expected) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
eq(proxyLine({ supported: true, typed: '', proxy: { text: 'http://127.0.0.1:7890', from: 'From your shell', source: 'shell' } }), 'Spectrum goes through http://127.0.0.1:7890 (from your shell), and so do its agents, MCP servers and compiles.', 'one in use, and where it came from');
eq(proxyLine({ supported: true, typed: '', proxy: null }).startsWith('No proxy found: Spectrum connects directly.'), true, 'none');
eq(proxyLine({ supported: false, typed: '', proxy: null }).startsWith('On Windows'), true, 'Windows');
console.log('proxy.check: ok');
