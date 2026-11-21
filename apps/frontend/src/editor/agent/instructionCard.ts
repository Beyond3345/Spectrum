// The card on the Local agents tab for the project's instruction files that the user hasn't allowed: an Isolated
// session leaves them out of the agent's copy (agentInstructions.js), a direct one can't.
import type { InstructionFile } from '../../api/client';

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** Names joined in plain English, no Oxford comma: “A, B and C”. */
const joined = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

export type InstructionCard = {
  summary: string;
  note: string;
  /** the files not allowed, each with who reads it */
  rows: (InstructionFile & { by: string })[];
  /** those still waiting for a choice (open the card) */
  asking: InstructionFile[];
};

/** null when every instruction file is allowed (or there are none). nameOf: an agent id's name. */
export function instructionCard(files: InstructionFile[], mode: 'review' | 'direct', nameOf: (id: string) => string): InstructionCard | null {
  const rows = files.filter((f) => f.state !== 'allowed').map((f) => ({ ...f, by: `Read by ${joined(f.readBy.map((id) => (id === 'spectrum' ? 'the Spectrum agent' : nameOf(id))))}` }));
  if (!rows.length) return null;
  const asking = rows.filter((f) => f.state === 'ask');
  const count = plural(rows.length, 'instruction file');
  return mode === 'direct'
    ? {
        summary: `The agent can read ${count} you haven’t allowed`,
        note: 'A Direct session works in your project’s folder, so the agent reads these as it finds them. An Isolated session leaves them out unless you allow them.',
        rows,
        asking
      }
    : {
        summary: `${count} left out of the agent’s copy${asking.length && asking.length < rows.length ? ` · ${asking.length} new` : ''}`,
        note: 'Agents read these files as instructions. They came with the project or changed outside Spectrum, so they stay out of the agent’s copy until you allow them. A task can go now without them.',
        rows,
        asking
      };
}
