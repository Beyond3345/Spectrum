// Self-check for the agents the workspace lists and Settings › Agents' groups. Run:
// npx esbuild apps/frontend/src/editor/agent/agents.check.ts --bundle --platform=node --log-level=warning | node
import { agentGroups, chosenAgent, shownAgents } from './agents';
import type { AgentState, LocalAgent } from '../../api/client';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const agent = (id: string, state: AgentState, extra: Partial<LocalAgent> = {}): LocalAgent => ({
  id,
  name: id,
  command: '',
  args: [],
  runtimePaths: [],
  installed: true,
  supported: true,
  hasKey: false,
  canImport: false,
  keyEnv: '',
  keyEnvs: [],
  url: '',
  loginFound: false,
  loginCopied: false,
  configured: false,
  state,
  setUp: ['ready', 'untested'].includes(state),
  ...extra
});
const agents = [
  agent('opencode', 'ready'),
  agent('codex', 'adapter'),
  agent('claude', 'untested'),
  agent('gemini', 'missing'),
  agent('cursor', 'sign-in'),
  // configured, its Test timed out: still set up
  agent('hermes', 'failed', { configured: true, setUp: true }),
  agent('qoder', 'failed'),
  agent('pi', 'unavailable'),
  agent('workbuddy', 'planned', { planned: 'Planned.' })
];

eq(shownAgents(agents).map((a) => a.id), ['opencode', 'claude', 'hermes'], 'set-up agents in the list’s order');
eq(shownAgents(agents, 'cursor').map((a) => a.id), ['opencode', 'claude', 'cursor', 'hermes'], 'the open session’s agent, once');
eq(shownAgents(agents, 'opencode').map((a) => a.id), ['opencode', 'claude', 'hermes'], 'not twice');
eq(shownAgents(agents, 'workbuddy').map((a) => a.id), ['opencode', 'claude', 'hermes'], 'never WorkBuddy');

eq(chosenAgent(agents, 'cursor', 'claude')?.id, 'cursor', 'the session’s agent first');
eq(chosenAgent(agents, undefined, 'claude')?.id, 'claude', 'then the remembered pick');
eq(chosenAgent(agents, undefined, 'gemini')?.id, 'opencode', 'a pick not set up falls back to the first set up');
eq(chosenAgent([agent('gemini', 'missing')], undefined, null), undefined, 'none set up');

eq(
  agentGroups(agents).map(([group, list]) => [group, list.map((a) => a.id)]),
  [
    ['set-up', ['opencode', 'claude', 'hermes']],
    ['finish', ['codex', 'cursor', 'qoder']],
    ['missing', ['gemini']],
    ['unavailable', ['pi']],
    ['planned', ['workbuddy']]
  ],
  'groups by state, planned last'
);
eq(agentGroups([agent('gemini', 'missing')]).map(([g]) => g), ['missing'], 'empty groups left out');
console.log('agents.check: ok');
