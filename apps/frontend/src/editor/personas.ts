import type { AppSettings, TagColour } from '../app/settings';

/** Instructions picked in chat for a task; while one is chosen it takes the place of the default instructions. */
export type Persona = { id: string; name: string; colour: TagColour; prompt: string };

/** Spectrum's own four, seeded once (Settings › Personas › Reset to defaults puts them back). */
export const STARTER_PERSONAS: Persona[] = [
  {
    id: 'research-writer',
    name: 'Research writer',
    colour: 'blue',
    prompt:
      'Help write the academic prose in this project, in clear and formal Australian English. Keep the author’s argument and voice, and give each paragraph one point to make. Back claims with entries from the project’s bibliography and never make up a reference: when a source is missing, say so and suggest what to search for. Leave LaTeX commands, labels and citation keys as they are.'
  },
  {
    id: 'document-editor',
    name: 'Document editor',
    colour: 'green',
    prompt:
      'Work as a careful copy editor. Fix spelling, grammar, punctuation and consistency in Australian English, and tighten wordy sentences, but leave the meaning, the structure and the author’s voice alone. Make the smallest change that fixes each problem, and don’t touch maths, labels or citation keys. Finish with a short list of what you changed and anything you weren’t sure about.'
  },
  {
    id: 'critical-reviewer',
    name: 'Critical reviewer',
    colour: 'orange',
    prompt:
      'Read the manuscript as a demanding but fair referee. Look for claims the evidence doesn’t support, gaps in the method, statistics that don’t add up, missing comparisons and unclear writing. Sort what you find into major and minor points, point to the section or line for each, and suggest how to fix it. Say what the paper does well too. Don’t change any files unless you’re asked to.'
  },
  {
    id: 'draw-a-figure',
    name: 'Draw a figure',
    colour: 'purple',
    prompt:
      'Help make the figures for this document. In a LaTeX project use TikZ, pgfplots or circuitikz, with each figure in its own file under diagrams/ that compiles on its own. Match the document’s fonts, use colours that people with colour blindness can tell apart, label axes with their units and size each figure for the column it sits in. Give every figure a caption and a label, refer to it in the text, and compile to check the result before you finish.'
  }
];

/** The instructions a chat sends: its persona's, or the default ones when it has none or it was deleted since. */
export const resolveInstructions = (settings: Pick<AppSettings, 'personas' | 'defaultInstructions'>, personaId?: string | null) =>
  (settings.personas.find((p) => p.id === personaId)?.prompt ?? settings.defaultInstructions).trim();

/** The starters back as they were, first, then the user's own. */
export const resetPersonas = (personas: Persona[]) => [...STARTER_PERSONAS, ...personas.filter((p) => !STARTER_PERSONAS.some((s) => s.id === p.id))];

/** A starter as Spectrum wrote it, which a computer joining the others' settings doesn't bring back to them. */
export const isUnchangedStarter = (p: Persona) => STARTER_PERSONAS.some((s) => s.id === p.id && s.name === p.name && s.colour === p.colour && s.prompt === p.prompt);

/** The name Settings asks about before it drops the persona being edited, or '' when nothing typed would be lost. */
export const unsavedPersona = (editing: Persona | null, personas: Persona[]) => {
  if (!editing) return '';
  const saved = personas.find((p) => p.id === editing.id);
  if (saved) return saved.name === editing.name && saved.colour === editing.colour && saved.prompt === editing.prompt ? '' : saved.name;
  return editing.name.trim() || editing.prompt.trim() ? editing.name.trim() || 'New persona' : '';
};
