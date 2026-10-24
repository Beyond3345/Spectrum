#!/usr/bin/env node
// Copies the bundled K-Dense skills from upstream at the pinned commit into skills/, which the app ships:
//   node scripts/sync-skills.mjs
// Each file is checked against the commit's own hash. A skill whose licence is not MIT or Apache-2.0 stops the sync
// (one that names none falls under the repository's MIT licence). The scripts that spend an OpenRouter key are left
// out. Spectrum's own skills (spectrum-*) are written in this repository and left alone. Every skill is fetched and
// checked before skills/ changes, so a failed sync leaves it as it was. Then update THIRD_PARTY_NOTICES.md if the list
// or a licence changed.
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFrontMatter } from '../apps/backend/src/services/skillService.js';

const REPO = 'K-Dense-AI/scientific-agent-skills';
const COMMIT = '593377bb048752abb0152deab9fbb1083a6087df';
const SKILLS = ['paper-lookup', 'literature-review', 'citation-management', 'peer-review', 'scientific-writing', 'scientific-critical-thinking', 'hypothesis-generation', 'venue-templates', 'research-grants', 'scientific-slides', 'latex-posters', 'markdown-mermaid-writing'];
const LEFT_OUT = /^generate_(?:schematic|slide_image)[^/]*\.py$/;
const LICENCES = [[/^mit(?: licen[cs]e)?$/i, 'MIT'], [/^apache(?:[- ]licen[cs]e)?[- ]?2(?:\.0)?(?: licen[cs]e)?$/i, 'Apache-2.0']];
const APACHE_TEXT = 'https://www.apache.org/licenses/LICENSE-2.0.txt';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'skills');
const raw = (file) => `https://raw.githubusercontent.com/${REPO}/${COMMIT}/${file}`;

async function fetchOk(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}
// git's own hash of a file, which the commit's tree lists
const blobSha = (bytes) => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');

const { tree, truncated } = await (await fetchOk(`https://api.github.com/repos/${REPO}/git/trees/${COMMIT}?recursive=1`, { headers: { accept: 'application/vnd.github+json' } })).json();
if (truncated) throw new Error('GitHub cut the file list short; fetch the skills folder by folder instead.');

const manifestFile = path.join(out, 'manifest.json');
const previous = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : {};
const skills = Object.fromEntries(Object.entries(previous.skills || {}).filter(([, s]) => s.source !== REPO));
const stage = path.join(out, `.sync-${randomUUID()}`);
try {
  for (const id of SKILLS) {
    const files = tree.filter((e) => e.type === 'blob' && e.path.startsWith(`skills/${id}/`) && !LEFT_OUT.test(path.posix.basename(e.path)));
    if (!files.some((e) => e.path === `skills/${id}/SKILL.md`)) throw new Error(`${id} has no SKILL.md at ${COMMIT}.`);
    const staged = path.join(stage, id);
    for (const entry of files) {
      const bytes = Buffer.from(await (await fetchOk(raw(entry.path))).arrayBuffer());
      if (blobSha(bytes) !== entry.sha) throw new Error(`${entry.path} doesn't match the commit's copy.`);
      const target = path.join(staged, entry.path.slice(`skills/${id}/`.length));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes, { mode: entry.mode === '100755' ? 0o755 : 0o644 });
    }
    const { data } = readFrontMatter(fs.readFileSync(path.join(staged, 'SKILL.md'), 'utf8'));
    const named = typeof data.license === 'string' ? data.license.trim() : '';
    const licence = named ? LICENCES.find(([pattern]) => pattern.test(named))?.[1] : 'MIT';
    if (!licence) throw new Error(`${id} is under “${named}”, which isn't MIT or Apache-2.0. It was not added.`);
    const meta = data.metadata || {};
    skills[id] = { licence, author: meta['skill-author'] || 'K-Dense Inc.', version: meta.version || '', source: REPO, ...(!named && { note: 'names no licence, so the repository’s MIT licence applies' }) };
    console.log(`${id}: ${files.length} files, ${licence}`);
  }
  const kDense = Buffer.from(await (await fetchOk(raw('LICENSE.md'))).arrayBuffer());
  const apache = Object.values(skills).some((s) => s.licence === 'Apache-2.0') ? await (await fetchOk(APACHE_TEXT)).text() : null;

  // all fetched and checked: only now does skills/ change
  for (const id of SKILLS) {
    fs.rmSync(path.join(out, id), { recursive: true, force: true });
    fs.renameSync(path.join(stage, id), path.join(out, id));
  }
  fs.writeFileSync(path.join(out, 'K-Dense-LICENSE.md'), kDense);
  if (apache) fs.writeFileSync(path.join(out, 'Apache-2.0.txt'), apache);
  const sorted = Object.fromEntries(Object.entries(skills).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(manifestFile, `${JSON.stringify({ upstream: `https://github.com/${REPO}`, commit: COMMIT, skills: sorted }, null, 2)}\n`);
} finally { fs.rmSync(stage, { recursive: true, force: true }); }
console.log(`Skills from ${REPO} at ${COMMIT.slice(0, 7)} → ${path.relative(process.cwd(), out)}`);
