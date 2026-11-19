// The languages a document can be written in, and what a model is told about each. Every AI prompt and tool description
// that names a language takes its words from here, in the page and in the backend alike, so none calls a Typst or a
// Markdown document LaTeX: another language is one more entry. Pure, as the page imports it too.

export const DOC_LANGUAGES = {
  latex: {
    name: 'LaTeX',
    extensions: ['tex', 'ltx'],
    // the skill with the rest: fixing a compile, reading the log
    skill: 'spectrum-latex',
    /** the project's documents, for a task over all of them */
    files: '.tex files',
    /** what a rewrite or translation must leave as it is */
    keep: 'LaTeX commands, environments, labels and citation keys',
    /** what autocomplete may write besides paragraphs */
    block: 'a full environment',
    rules: 'LaTeX conventions: headings are \\section{…} and \\subsection{…}; files join with \\input{…} or \\include{…}; a label is \\label{key}, referred to with \\ref{key}; citations use the document’s own command (\\cite{key}, \\citep{key} or \\parencite{key}) with keys from its .bib files; maths is $…$ inline and an equation or align environment on display. Leave the preamble and its packages alone unless the task needs them changed.'
  },
  typst: {
    name: 'Typst',
    extensions: ['typ'],
    skill: 'spectrum-typst',
    files: '.typ files',
    keep: 'Typst markup, # function calls, <labels> and @references',
    block: 'a full list, figure or function call',
    rules: 'Typst conventions: headings are = Title and == Subtitle; *bold* and _emphasis_; code and function calls start with #, as in #figure(image("plot.png"), caption: [A caption]); files join with #include "file.typ" and #import "file.typ"; a label <key> follows its element and is referred to with @key; citations are @key with keys from the file #bibliography("refs.bib") reads; maths is $x^2$ inline and $ x^2 $, with a space inside each dollar sign, on display. Never write LaTeX commands such as \\section, \\textbf or \\cite.'
  },
  markdown: {
    name: 'Markdown',
    extensions: ['md', 'markdown'],
    skill: 'spectrum-markdown',
    files: '.md files',
    keep: 'Markdown markup, the YAML front matter, [@key] citations and maths',
    block: 'a full list or table',
    rules: 'Markdown conventions (pandoc turns it into the PDF): headings are # Title and ## Subtitle; *emphasis* and **bold**; the YAML front matter between --- lines holds title, author and bibliography; citations are [@key], several as [@a; @b], or @key in running text, with keys from the bibliography; a figure is ![Caption](path){#fig:id}; maths is $x^2$ inline and $$…$$ on display. Keep to Markdown: never write LaTeX commands such as \\section, \\textbf or \\cite.'
  }
};

/** The kind of document a file is, by its extension: a key of DOC_LANGUAGES, or null for anything else (.bib, images). */
export function docKind(path) {
  const ext = /\.([^./\\]+)$/.exec(String(path || ''))?.[1].toLowerCase();
  return (ext && Object.keys(DOC_LANGUAGES).find((kind) => DOC_LANGUAGES[kind].extensions.includes(ext))) || null;
}

/**
 * The language of the first of these paths that is a document (the open file, then the project's main file), with its
 * kind; LaTeX when none is.
 */
export function docLanguage(...paths) {
  const kind = paths.map(docKind).find(Boolean) || 'latex';
  return { kind, ...DOC_LANGUAGES[kind] };
}

/** Whether any of these paths is a document, so a prompt may name its language. */
export const hasDocument = (...paths) => paths.some((p) => docKind(p));

// ─── The prompts the page words itself ───

/** Translate, as the assistant asks for it: the selection, the open file, or every document of the project. */
export function translatePrompt(scope, target, language, note = '') {
  const what = { selection: 'the selected text', file: 'the current file', project: `all ${language.files} in the project` }[scope];
  return `Translate ${what} to ${target}. Preserve ${language.keep}.${note ? `\nUser note: ${note}` : ''}`;
}

/** AI autocomplete's request: the heading the cursor is under and, in LaTeX, the environment it is in. */
export function autocompletePrompt(language, { heading = '', environment = '' } = {}) {
  return [
    `You are a ${language.name} writing assistant.`,
    `Continue after <CURSOR> with a coherent next block (1-2 paragraphs or ${language.block}).`,
    heading ? `Current section: ${heading}.` : '',
    environment ? `You are inside the ${environment} environment.` : '',
    'Preserve style and formatting.',
    'Return only the continuation text, no commentary.'
  ].filter(Boolean).join(' ');
}

/** Fix with AI on one line of the Logs tab. */
export const fixPrompt = (language, { severity, message, where = '' }) =>
  `Fix this ${language.name} ${severity}: ${message}${where ? ` (${where})` : ''}. Propose a patch that can be applied.`;
