import BrandMark, { agentBrand } from '../../app/BrandMark';

export const monogram = (name: string) => name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2);

/**
 * An agent's mark for the .agent-icon tile: its line mark, or its logo in its brand colours with Settings ›
 * Appearance › Logos on Full logos (BrandMark, shared with the providers and the models). An agent of the user's
 * own, which has no mark, shows the first two letters of its name.
 */
export default function AgentLogo({ agent }: { agent: { id: string; name: string } }) {
  const brand = agentBrand(agent.id);
  return brand ? (
    <BrandMark brand={brand} className="agent-logo" />
  ) : (
    <span className="agent-monogram" aria-hidden="true">
      {monogram(agent.name)}
    </span>
  );
}
