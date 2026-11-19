export const SYMBOL_SETS: Record<string, { version: number; packages: string[]; libraries: string[]; pics: Record<string, string> }>;
export function picDefinition(key: string, body: string): string;
export function setOfPic(key: string): string | undefined;
export function shapeDefinitions(keys: string[]): string[];
export const FLUID_TINTS: Record<'water' | 'oil' | 'mercury', string>;
/** [key, label, starting value, lowest, highest] */
export type FluidLevel = [string, string, number, number, number];
export const FLUID_LEVELS: Record<string, { liquids: string[]; levels: FluidLevel[] }>;
export const FLUID_KEYS: string;
export const KEYED_PICS: Record<string, string>;
