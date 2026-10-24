// Self-check for Settings › Skills: groups, search, on or off per project, and new skills' folder names. Run:
// npx esbuild apps/frontend/src/app/skills.check.ts --bundle --platform=node --log-level=warning | node
import { groupSkills, projectSkills, skillId, skillOn } from './skills';
import type { Skill } from '../api/client';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const skill = (id: string, extra: Partial<Skill> = {}): Skill => ({
  id,
  name: id,
  description: '',
  author: 'K-Dense Inc.',
  licence: 'MIT',
  version: '1.0',
  source: 'bundled',
  files: 1,
  enabled: true,
  ...extra
});
const skills = [
  skill('peer-review', { description: 'Structured manuscript review' }),
  skill('paper-lookup'),
  skill('citation-management'),
  skill('latex-posters'),
  skill('spectrum-typst', { author: 'Spectrum' }),
  skill('lab-style', { name: 'Lab style', source: 'own', author: 'Me', description: 'How our group writes' }),
  skill('peer-review-copy', { source: 'own', description: 'My review rules' })
];
const names = (groups: ReturnType<typeof groupSkills>) => groups.map(([group, list]) => [group, list.map((s) => s.id)]);

// each in its group, by name, with own copies of a bundled skill under Your skills and a bundled one Spectrum doesn't
// know yet under Writing
eq(names(groupSkills(skills, '')), [
  ['Research', ['citation-management', 'paper-lookup']],
  ['Writing', ['spectrum-typst']],
  ['Review', ['peer-review']],
  ['Submission', ['latex-posters']],
  ['Your skills', ['lab-style', 'peer-review-copy']]
], 'groups');

// every word must match the id, name, description or author, in any case; empty groups go
eq(names(groupSkills(skills, 'REVIEW')), [['Review', ['peer-review']], ['Your skills', ['peer-review-copy']]], 'one word');
eq(names(groupSkills(skills, 'review my')), [['Your skills', ['peer-review-copy']]], 'every word');
eq(names(groupSkills(skills, 'group')), [['Your skills', ['lab-style']]], 'description');
eq(names(groupSkills(skills, 'spectrum')), [['Writing', ['spectrum-typst']]], 'author');
eq(groupSkills(skills, 'nothing like it'), [], 'no match');

// a project's own choice wins there, and only there
const off = skill('a', { enabled: true, project: 'off' });
eq([skillOn(off, true), skillOn(off, false)], [false, true], 'off for the project');
eq(skillOn(skill('b', { enabled: false }), true), false, 'no choice: follows Settings');

// changing one keeps the project's other choices; null follows Settings again
const current = { on: ['x'], off: ['y', 'a'] };
eq(projectSkills(current, 'a', true), { on: ['x', 'a'], off: ['y'] }, 'switched on');
eq(projectSkills(current, 'a', null), { on: ['x'], off: ['y'] }, 'reset');
eq(projectSkills(undefined, 'z', false), { on: [], off: ['z'] }, 'first choice');

// a new skill's folder: lowercase words and hyphens, at most 64 characters, accents dropped
eq(skillId('Résumé  tips: v2!'), 'resume-tips-v2', 'folder name');
eq(skillId('—'), '', 'nothing usable');
eq(skillId(`${'a'.repeat(63)} b`), 'a'.repeat(63), 'never ends on a hyphen');

console.log('skills.check: ok');
