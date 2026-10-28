// the agents with a logo in public/agents (scripts/agent-logos.mjs, from Lobe Icons)
const LOGOS = new Set(['opencode', 'codex', 'claude', 'gemini', 'copilot', 'cursor', 'kimi', 'hermes', 'qoder', 'pi', 'deepseek', 'zcode', 'workbuddy']);

export const monogram = (name: string) => name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2);

/** An agent's logo in its brand colours, or the first two letters of its name, for the white .agent-icon tile. */
export default function AgentLogo({ agent }: { agent: { id: string; name: string } }) {
  return LOGOS.has(agent.id) ? (
    <img className="agent-logo" src={`/agents/${agent.id}.svg`} alt="" draggable={false} />
  ) : (
    <span className="agent-monogram" aria-hidden="true">
      {monogram(agent.name)}
    </span>
  );
}
