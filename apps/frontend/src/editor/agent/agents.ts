import type { AgentState, LocalAgent } from '../../api/client';

/** The agents the workspace lists: those set up, in the list's order, and the open session's agent. Never a planned one. */
export const shownAgents = (agents: LocalAgent[], sessionAgentId?: string) => agents.filter((a) => !a.planned && (a.setUp || a.id === sessionAgentId));

/** The workspace's chosen agent: the open session's; else the remembered pick when it's set up; else the first set up. */
export function chosenAgent(agents: LocalAgent[], sessionAgentId: string | undefined, picked: string | null) {
  const shown = shownAgents(agents, sessionAgentId);
  return shown.find((a) => a.id === sessionAgentId) ?? shown.find((a) => a.id === picked) ?? shown[0];
}

export type AgentGroup = 'set-up' | 'finish' | 'missing' | 'unavailable' | 'planned';
const ORDER: AgentGroup[] = ['set-up', 'finish', 'missing', 'unavailable', 'planned'];
const groupOf = (a: LocalAgent): AgentGroup =>
  a.state === 'planned' ? 'planned' : a.state === 'unavailable' ? 'unavailable' : a.setUp ? 'set-up' : a.state === 'missing' ? 'missing' : 'finish';

/** Settings › Agents' groups, each in the list's order, with the planned ones last; empty groups left out. */
export const agentGroups = (agents: LocalAgent[]) =>
  ORDER.map((group): [AgentGroup, LocalAgent[]] => [group, agents.filter((a) => groupOf(a) === group)]).filter(([, list]) => list.length);

/** Each state's chip: its words and the badge's tone. */
export const STATE_CHIPS: Record<AgentState, [string, string]> = {
  planned: ['Planned', ''],
  unavailable: ['Unavailable', ''],
  missing: ['Not installed', ''],
  adapter: ['Adapter needed', 'warning'],
  ready: ['Ready', 'success'],
  'sign-in': ['Sign-in needed', 'warning'],
  failed: ['Test failed', 'danger'],
  untested: ['Not tested', 'warning']
};
