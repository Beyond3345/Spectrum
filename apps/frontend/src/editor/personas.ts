// Stub of the settings branch's personas helper (contract B/C): only resolveInstructions, so the agent workspace
// builds before that branch lands. Replaced by build/p2-settings' file, which also has the starter personas.
import type { AppSettings } from '../app/settings';

/** The chosen persona's instructions, or the default instructions when none is chosen (or it has gone). */
export function resolveInstructions(settings: AppSettings, personaId?: string) {
  return settings.personas.find((p) => p.id === personaId)?.prompt ?? settings.defaultInstructions;
}
