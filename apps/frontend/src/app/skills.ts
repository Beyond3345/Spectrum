import type { ProjectSkills, Skill } from '../api/client';

export const SKILL_GROUPS = ['Research', 'Writing', 'Review', 'Submission', 'Your skills'] as const;
export type SkillGroup = (typeof SKILL_GROUPS)[number];

// the bundled pack by group; a bundled skill not listed here (a newer one) shows under Writing
const GROUP_OF: Record<string, SkillGroup> = {
  'paper-lookup': 'Research',
  'literature-review': 'Research',
  'citation-management': 'Research',
  'hypothesis-generation': 'Research',
  'scientific-writing': 'Writing',
  'research-grants': 'Writing',
  'markdown-mermaid-writing': 'Writing',
  'spectrum-latex': 'Writing',
  'spectrum-related-work': 'Writing',
  'peer-review': 'Review',
  'scientific-critical-thinking': 'Review',
  'spectrum-verify-claims': 'Review',
  'venue-templates': 'Submission',
  'scientific-slides': 'Submission',
  'latex-posters': 'Submission'
};

export const skillGroup = (skill: Skill): SkillGroup => (skill.source === 'own' ? 'Your skills' : GROUP_OF[skill.id] ?? 'Writing');

/** On for every project, or, in a project, its own choice where it made one. */
export const skillOn = (skill: Skill, inProject: boolean) => (inProject && skill.project ? skill.project === 'on' : skill.enabled);

/** The skills matching every word of the search, in their groups by name; empty groups are left out. */
export function groupSkills(skills: Skill[], query: string): [SkillGroup, Skill[]][] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const found = skills.filter((s) => words.every((w) => [s.id, s.name, s.description, s.author].join(' ').toLowerCase().includes(w)));
  return SKILL_GROUPS.map((group): [SkillGroup, Skill[]] => [
    group,
    found.filter((s) => skillGroup(s) === group).sort((a, b) => a.name.localeCompare(b.name))
  ]).filter(([, list]) => list.length);
}

/** A project's skill choices with one changed: on, off, or null to follow Settings again. */
export function projectSkills(current: ProjectSkills | undefined, id: string, on: boolean | null): ProjectSkills {
  const others = (list: string[] = []) => list.filter((s) => s !== id);
  return { on: [...others(current?.on), ...(on === true ? [id] : [])], off: [...others(current?.off), ...(on === false ? [id] : [])] };
}

/** A skill's folder name from what it's called: lowercase words joined by hyphens, as Agent Skills needs. */
export const skillId = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 64)
    .replace(/^-+|-+$/g, '');
