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
    ['system', 'System', 'stethoscope']
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
    ['providers', 'Providers', 'key'],
    ['models', 'Models', 'sparkles'],
    ['agents', 'Agents', 'terminal'],
    ['personas', 'Personas', 'brain.head.profile'],
    ['skills', 'Skills', 'graduationcap']
  ]],
  ['Research & Import', [
    ['search', 'Search', 'magnifyingglass'],
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
  providers: 'green',
  models: 'purple',
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
    'Jump between source and PDF', 'Double-click jumps between the source and the PDF', 'SyncTeX', 'Highlight colour', 'Highlight stays for', 'The PDF follows the file you open',
    'Font', 'Size', 'Keys', 'Vim', 'Emacs', 'Editor theme', 'Colours'
  ],
  engines: [
    'Open Logs when a compile fails', 'Underline overfull and underfull boxes', 'LaTeX', 'Typst', 'Markdown', 'Default compiler', 'Tectonic', 'pdfLaTeX', 'XeLaTeX', 'LuaLaTeX', 'Latexmk',
    'Bibliography', 'BibTeX', 'Biber', 'Auto compile', 'Compile errors', 'Draft mode', 'Check syntax before compiling', 'Show live output while compiling', 'TeX installation', 'TeX folder', 'xjyutping',
    'Typst version', 'Tinymist', 'Pandoc'
  ],
  language: ['Languages', 'Add a language', 'Spelling', 'Check spelling as you type', 'Grammar', 'Harper', 'LanguageTool', 'Style suggestions', 'Serial comma', 'Oxford comma', 'Your dictionary'],
  snippets: ['Snippets', 'Trigger', 'New snippet', 'Restore the starters'],
  composer: ['Canvas', 'Grid', 'Dark canvas', 'Minimap', 'Tool keys', 'New drawings', 'Symbol sets', 'Moments', 'Mohr’s circle', 'Vector notation', 'siunitx', 'Force diagrams', 'University styles'],
  projects: ['Open Spectrum on', 'Project switcher opens at', 'Default folder for new projects', 'Opening files', 'Default app', 'Your other computers', 'Use the same settings on each computer', 'This computer’s name'],
  checkpoints: ['Save a checkpoint after each successful compile', 'Checkpoint before AI changes', 'Tell me when a checkpoint can’t be saved', 'Clearing out'],
  github: ['Account', 'Sign in', 'Token', 'Your settings on GitHub', 'Settings repository', 'Sync'],
  providers: ['Connected', 'Available', 'API key', 'Endpoint', 'Region', 'Test connection', 'Connect', 'Disconnect', 'Custom endpoint', 'OpenAI-compatible', 'Ollama', 'OpenRouter', 'Keychain'],
  models: ['Main model', 'Quick model', 'Vision model', 'Reasoning effort', 'Models in the menus', 'Prices', 'Currency', 'Context', 'models.dev', 'Fill in prices from models.dev'],
  agents: ['Local agents', 'Claude Code', 'Codex', 'Automations', 'Compile after an agent’s changes', 'Offer Fix with AI', 'MCP servers', 'Sandbox', 'Network access'],
  personas: ['Personas', 'Default instructions', 'New persona', 'Restore the starters'],
  skills: ['Skills', 'Import a skill', 'New skill', 'Share skills with other agents', 'This project', 'All projects'],
  search: ['Default search', 'Search connections', 'OpenAlex', 'Semantic Scholar', 'SerpApi', 'Google Scholar', 'Exa', 'Tavily', 'Brave Search', 'DDGS', 'Research sources', 'NCBI API key', 'PubMed', 'Unpaywall email', 'Search model', 'Web search'],
  zotero: ['Zotero on this computer', 'Connect', 'Project collections', 'Citing', 'Offer the Zotero library while citing'],
  transfer: ['PDF parser', 'Parser', 'MinerU', 'OCR', 'Change template', 'Template transfer', 'API key', 'Endpoint']
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
