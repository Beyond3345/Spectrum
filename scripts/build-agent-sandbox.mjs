import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function buildAgentSandbox() {
  if (process.platform !== 'win32') return;
  const root = fileURLToPath(new URL('../', import.meta.url));
  const output = path.join(root, 'native/agent-sandbox/bin/Spectrum.AgentWorker.exe');
  mkdirSync(path.dirname(output), { recursive: true });
  const compiler = path.join(process.env.SystemRoot, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
  const result = spawnSync(compiler, ['/nologo', '/optimize+', '/platform:x64', '/target:exe', '/r:System.Web.Extensions.dll', `/out:${output}`, path.join(root, 'native/agent-sandbox/Worker.cs')], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('Cannot build the Windows isolation worker. Install .NET Framework 4.8; agents remain unavailable.');
  return output;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) buildAgentSandbox();
