// Self-check for the editor's project switcher. Run:
// npx esbuild apps/frontend/src/app/switcher.check.ts --bundle --platform=node --log-level=warning | node
import type { ProjectMeta } from '../api/client';
import { NO_FOLDERS, addFolder, placeProject } from './folders';
import { projectKind, switcherLevel, switcherStart } from './ProjectSwitcher';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const project = (id: string, name: string, mainFile: string, updatedAt: string, more: Partial<ProjectMeta> = {}) =>
  ({ id, name, mainFile, updatedAt, createdAt: '2026-01-01T00:00:00Z', archived: false, tags: [], ...more }) as ProjectMeta;

// Home › Uni › uni_2, and Work; Project 1 and Project 2 in Uni
let t = addFolder(NO_FOLDERS, { id: 'uni', name: 'Uni', parent: null });
t = addFolder(t, { id: 'uni2', name: 'uni_2', parent: 'uni' });
t = addFolder(t, { id: 'work', name: 'Work', parent: null });
t = placeProject(placeProject(placeProject(t, 'p1', 'uni'), 'p2', 'uni'), 'deep', 'uni2');
const projects = [
  project('p2', 'Project 2', 'main.typ', '2026-03-01T00:00:00Z'),
  project('p1', 'Project 1', 'main.tex', '2026-02-01T00:00:00Z'),
  project('deep', 'Notes', 'README.md', '2026-04-01T00:00:00Z'),
  project('top', 'Essay', 'essay.tex', '2026-01-05T00:00:00Z'),
  project('old', 'Archived', 'main.tex', '2026-01-05T00:00:00Z', { archived: true }),
  project('gone', 'Missing', 'main.tex', '2026-01-05T00:00:00Z', { missing: true }),
  project('draft', 'Draft', 'main.tex', '2026-01-05T00:00:00Z', { templateDraft: 'tpl' })
];
const keys = (at: string | null, sort: 'name' | 'updatedAt' = 'name', current = 'p1') => switcherLevel(projects, t, at, sort, current).map((i) => i.key);

eq(keys(null), ['f:uni', 'f:work', 'p:top'], 'Home: folders first, then the projects in none, without archived, missing or drafts');
eq(keys('uni'), ['f:uni2', 'p:p1', 'p:p2'], 'Uni: uni_2, then Project 1 and Project 2 by name');
eq(keys('uni', 'updatedAt'), ['f:uni2', 'p:p2', 'p:p1'], 'by date changed, newest first');
eq(keys('uni2'), ['p:deep'], 'inside uni_2');
eq(keys(null, 'name', 'old'), ['f:uni', 'f:work', 'p:old', 'p:top'], 'the open project shows even when archived');

eq(projects.map(projectKind), ['typst', 'latex', 'markdown', 'latex', 'latex', 'latex', 'latex'], 'kind from the main file');
eq(projectKind(project('x', 'X', '', '')), 'latex', 'no main file yet');

eq(switcherStart(t, 'p1', 'home'), null, 'opens at Home');
eq(switcherStart(t, 'p1', 'folder'), 'uni', 'opens at the project’s folder');
eq(switcherStart(t, 'top', 'folder'), null, 'a project in no folder opens at Home');

console.log('switcher: all checks passed');
