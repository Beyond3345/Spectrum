import type { IconColour } from './appearance';

// Settings' sidebar: the panes in their groups, each pane's icon colour, and what the search box at its top finds.

export type Section =
  | 'appearance'
  | 'editor'
  | 'engines'
  | 'checkpoints'
  | 'composer'
  | 'language'
  | 'shortcuts'
  | 'snippets'
  | 'projects'
  | 'github'
  | 'providers'
  | 'models'
  | 'personas'
  | 'skills'
  | 'agents'
  | 'search'
  | 'zotero'
  | 'transfer'
  | 'system';

// grouped under headings, so the list reads at a glance: [id, name, icon]
export const SECTION_GROUPS: [string, [Section, string, string][]][] = [
  ['General', [
    ['appearance', 'Appearance', 'circle.lefthalf.filled'],
    ['shortcuts', 'Shortcuts', 'keyboard'],
    ['system', 'System & Network', 'stethoscope']
  ]],
  ['Writing & Editor', [
    ['editor', 'Editor', 'text.cursor'],
    ['engines', 'Engines', 'hammer'],
    ['language', 'Spelling & grammar', 'textformat.abc.dottedunderline'],
    ['snippets', 'Snippets', 'curlybraces'],
    ['composer', 'Diagram composer', 'pencil']
  ]],
  ['Workspace & Sync', [
    ['projects', 'Projects', 'folder'],
    ['checkpoints', 'Checkpoints', 'clock.arrow.circlepath'],
    ['github', 'GitHub', 'arrow.triangle.branch']
  ]],
  ['AI & Agents', [
    ['providers', 'Providers', 'cpu'],
    ['models', 'Models', 'sparkle'],
    ['agents', 'Agents', 'terminal'],
    ['personas', 'Personas', 'person'],
    ['skills', 'Skills', 'graduationcap']
  ]],
  ['Research & Import', [
    ['search', 'Search & Web', 'magnifyingglass'],
    ['zotero', 'Zotero', 'books.vertical'],
    ['transfer', 'Document parsers', 'text.viewfinder']
  ]]
];

// each pane's icon in its own colour, far from its neighbours' in the list (appearance.ts ICON_COLOURS; the check
// measures it); GitHub and Zotero in their own brand colours
export const SECTION_HUES: Record<Section, IconColour> = {
  appearance: 'pink',
  shortcuts: 'indigo',
  system: 'gray',
  editor: 'blue',
  engines: 'orange',
  language: 'red',
  snippets: 'yellow',
  composer: 'green',
  projects: 'cyan',
  checkpoints: 'brown',
  github: 'github',
  providers: 'purple',
  models: 'indigo',
  agents: 'teal',
  personas: 'pink',
  skills: 'orange',
  search: 'blue',
  zotero: 'zotero',
  transfer: 'mint'
};

/**
 * What the search box finds in each pane besides its name: the labels and headings of its settings, as the pane shows
 * them, and a few words people look for them by.
 * ponytail: kept by hand, so a setting added to a pane is found only once its label is added here; the upgrade is to
 * collect the labels from the panes themselves (each field registering its label), when the list drifts.
 */
export const SECTION_LABELS: Record<Section, string[]> = {
  appearance: ['Theme', 'Light', 'Dark', 'Colour style', 'Accent colour', 'See-through window', 'Liquid Glass', 'Clarity', 'PDF pages'],
  shortcuts: ['Keyboard shortcuts', 'Editing', 'Selection', 'Folding', 'PDF', 'App', 'Fixed', 'Restore all defaults'],
  system: ['Network', 'Proxy', 'Tools', 'Folders', 'App data', 'About', 'Licences', 'Version', 'Show the setup page again', 'Tell me when a newer Spectrum is out', 'Updates'],
  editor: [
    'Insert \\cite at the cursor after adding a reference', 'Typing', 'Continue lists', 'Close maths delimiters', 'Show the maths at the cursor', 'To-dos', 'New to-dos go',
    'Jump between source and PDF', 'Double-click jumps between the source and the PDF', 'SyncTeX', 'Highlight colour', 'Highlight lasts', 'PDF follows the open file',
    'Font', 'Font size', 'Keys', 'Editing keys', 'Vim', 'Emacs', 'Light theme', 'Dark theme', 'Colours'
  ],
  engines: [
    'Open Logs when a compile fails', 'Underline overfull and underfull boxes', 'LaTeX', 'Typst', 'Markdown', 'Compiler', 'Auto compile', 'Compile error handling', 'Bibliography tool', 'BibTeX', 'Biber',
    'Fast draft mode', 'Precompile the preamble', 'Syntax check before compiling', 'Show live output while compiling', 'Tectonic', 'pdfLaTeX', 'XeLaTeX', 'LuaLaTeX', 'Latexmk', 'TeX installation',
    'TeX folder', 'xjyutping folder', 'Typst version', 'Tinymist', 'Pandoc'
  ],
  language: ['Languages', 'Add a language', 'Spelling', 'Check spelling as you type', 'Grammar', 'English grammar', 'Harper', 'Include style suggestions', 'Serial (Oxford) comma', 'LanguageTool', 'Your dictionary'],
  snippets: ['Create snippet', 'Trigger', 'Reset to defaults'],
  composer: [
    'Canvas', 'Background', 'Grid', 'Dark canvas', 'Minimap', 'Tool keys', 'New drawings', 'Symbols from other packages', 'Bending moment diagrams', 'Mohr’s circle shear axis', 'Vector names', 'Structure diagrams',
    'Axial force diagram', 'Shear force diagram', 'Write units with siunitx', 'University styles'
  ],
  projects: ['Open Spectrum on', 'Project switcher opens at', 'Default folder for new projects', 'Opening files', 'Default app', 'Your other computers', 'Use the same settings on each computer', 'This computer’s name'],
  checkpoints: ['Save a checkpoint when a compile succeeds', 'Warn me when a checkpoint fails to save', 'Save a checkpoint before every change I apply', 'Clearing out', 'Delete automatic checkpoints'],
  github: ['Account', 'Sign in with GitHub', 'Token', 'Your settings on GitHub', 'Keep my settings in a private repository', 'Sync'],
  providers: ['Connected', 'Available', 'API key', 'Endpoint', 'Region', 'Test connection', 'Connect', 'Disconnect', 'Custom endpoint', 'OpenAI-compatible', 'Ollama', 'OpenRouter', 'Keychain'],
  models: ['Default models', 'Main model', 'Quick model', 'Vision model', 'Reasoning effort', 'Models in the menus', 'Prices', 'Your price for', 'Currency', 'Context', 'Fill in prices from models.dev'],
  agents: ['Local agents', 'Claude Code', 'Codex', 'MCP servers', 'Automations', 'Compile after applying changes', 'Offer a fix when that compile fails', 'Sandbox', 'Network access'],
  personas: ['Default instructions', 'Create persona', 'Reset to defaults'],
  skills: ['Create skill', 'Add folder', 'Share skills with other agents on this computer', 'This project', 'All projects'],
  search: [
    'Default search', 'Search connections', 'Model’s built-in web search', 'OpenAlex', 'Semantic Scholar', 'SerpApi', 'Google Scholar', 'Exa', 'Tavily', 'Brave Search', 'DDGS', 'Research sources', 'OpenAlex email',
    'NCBI API key', 'PubMed', 'Unpaywall email', 'Search model'
  ],
  zotero: ['Zotero on this computer', 'Better BibTeX', 'Project collections', 'Citing', 'Suggest items from your Zotero library in \\cite completion'],
  transfer: ['PDF parser', 'Parser', 'MinerU', 'OCR', 'Change template', 'Template transfer', 'Token', 'Endpoint']
};

const fold = (text: string) => text.toLowerCase().replace(/[’']/g, '');

/**
 * The panes a search finds, in the sidebar's order: every word typed is in the pane's name, its group's, or one of
 * its settings' labels. Each with the first label that matched when the name alone did not ('' otherwise). An empty
 * search finds every pane.
 */
export function findSections(query: string): Map<Section, string> {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const found = new Map<Section, string>();
  for (const [group, sections] of SECTION_GROUPS) {
    for (const [id, name] of sections) {
      const title = fold(`${name} ${group}`);
      if (words.every((w) => title.includes(w))) found.set(id, '');
      else {
        // one label with every word left over from the name, else the words spread over the pane's labels
        const rest = words.filter((w) => !title.includes(w));
        const label = SECTION_LABELS[id].find((l) => rest.every((w) => fold(l).includes(w)));
        if (label !== undefined) found.set(id, label);
        else if (rest.every((w) => SECTION_LABELS[id].some((l) => fold(l).includes(w)))) found.set(id, SECTION_LABELS[id].find((l) => fold(l).includes(rest[0]))!);
      }
    }
  }
  return found;
}
