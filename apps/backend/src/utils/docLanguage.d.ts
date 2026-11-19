export type DocKind = 'latex' | 'typst' | 'markdown';
export type DocLanguage = { name: string; extensions: string[]; skill: string; files: string; keep: string; block: string; rules: string };
export const DOC_LANGUAGES: Record<DocKind, DocLanguage>;
export function docKind(path: string): DocKind | null;
export function docLanguage(...paths: (string | undefined)[]): DocLanguage & { kind: DocKind };
export function hasDocument(...paths: (string | undefined)[]): boolean;
export function translatePrompt(scope: 'selection' | 'file' | 'project', target: string, language: DocLanguage, note?: string): string;
export function autocompletePrompt(language: DocLanguage, at?: { heading?: string; environment?: string }): string;
export function fixPrompt(language: DocLanguage, problem: { severity: string; message: string; where?: string }): string;
