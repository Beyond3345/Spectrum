export function escapeTexText(value: unknown): string;
export function withoutComments(text: string): string;
export function matchBrace(text: string, start: number): number;
export function citeKeys(text: string): string[];
export function renameCiteKeys(text: string, keys: Record<string, string>): string;
