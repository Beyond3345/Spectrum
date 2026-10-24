// Stub so the shell typechecks before the merge; build/p1-pdf-todos replaces this file with the real scanner.

export function scanTodos(files: { path: string; text: string }[]): { file: string; line: number; text: string; kind: string }[] {
  return files.flatMap(({ path, text }) =>
    text.split('\n').flatMap((line, i) => {
      const m = /\\todo(?:\[[^\]]*\])?\{([^}]*)\}/.exec(line);
      return m ? [{ file: path, line: i + 1, text: m[1], kind: 'todo' }] : [];
    })
  );
}
