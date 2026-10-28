#!/usr/bin/env node
// Writes each local agent's logo, apps/frontend/public/agents/<agent id>.svg, from Lobe Icons (MIT), and its licence.
// The brand-colour drawing where Lobe has one, else the plain one; Settings › Agents and the agent workspace show
// them as images on one white tile. The SVGs are committed; run this again after adding an agent below.
//
//   node scripts/agent-logos.mjs
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'apps/frontend/public/agents');
const licence = path.join(root, 'apps/frontend/public/licences/lobe-icons-MIT.txt');
const PACKAGE = '@lobehub/icons-static-svg@1.101.0';
const INTEGRITY = 'sha512-Ob6WJOjXauLP/A1qZ9OlPlrncPNbwsIGH+ToFdxWt3APtaaMKtbIBGqJ0/LY2eBeUwTQuG7GpUw9LwPiv7OTdg==';

// Spectrum's agent id → Lobe's file. Claude Agent takes the Claude spark, never the Claude Code mascot (claudecode);
// ZCode takes Z.ai's mark, as Lobe has none of ZCode's own
const LOGOS = {
  opencode: 'opencode',
  codex: 'codex-color',
  claude: 'claude-color',
  gemini: 'geminicli-color',
  copilot: 'githubcopilot',
  cursor: 'cursor',
  kimi: 'kimi-color',
  hermes: 'hermesagent',
  qoder: 'qoder-color',
  pi: 'pi',
  deepseek: 'deepseek-color',
  zcode: 'zai',
  workbuddy: 'workbuddy-color'
};

function run(cmd, args) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', shell: process.platform === 'win32' });
  if (res.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${res.stderr || res.error?.message}`);
  return res.stdout;
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'spectrum-agent-logos-'));
const [packed] = JSON.parse(run('npm', ['pack', PACKAGE, '--json', '--silent', '--pack-destination', work]));
if (packed.integrity !== INTEGRITY) throw new Error(`${PACKAGE} isn't the package checked (${packed.integrity})`);
run('tar', ['xzf', path.join(work, packed.filename), '-C', work]);

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
for (const [id, name] of Object.entries(LOGOS)) {
  const svg = fs.readFileSync(path.join(work, 'package/icons', `${name}.svg`), 'utf8');
  // drawings only: nothing that runs, loads or links
  if (/<script|href|<image|<style|<foreignObject|\son[a-z]+=/i.test(svg)) throw new Error(`${name}.svg has more than a drawing`);
  fs.writeFileSync(path.join(outDir, `${id}.svg`), svg);
}

// the package carries no licence file; the repository's
const res = await fetch('https://raw.githubusercontent.com/lobehub/lobe-icons/master/LICENSE');
if (!res.ok) throw new Error(`Couldn't fetch the licence (${res.status})`);
fs.writeFileSync(licence, await res.text());
fs.rmSync(work, { recursive: true, force: true });
console.log(`${Object.keys(LOGOS).length} logos from ${PACKAGE} → ${path.relative(root, outDir)}`);
