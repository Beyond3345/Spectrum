export const SYMBOL_SETS: Record<string, { version: number; packages: string[]; libraries: string[]; pics: Record<string, string> }>;
export function picDefinition(key: string, body: string): string;
export function setOfPic(key: string): string | undefined;
