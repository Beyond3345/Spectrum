import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  changeSpellWord,
  createSkill,
  downloadDictionary,
  installLanguageTool,
  languageToolStatus,
  listLanguages,
  pruneDictionaries,
  removeLanguageTool,
  setLanguageToolMode,
  deleteSkill,
  duplicateSkill,
  getEngines,
  getProjectSettings,
  getSkillSharing,
  installBiber,
  installPandoc,
  installTypst,
  removeBiber,
  removeTypst,
  getSyncSettings,
  grammarStatus,
  importSkill,
  listProjects,
  listSkillFiles,
  listSkills,
  readSkillFile,
  setSkillEnabled,
  setSkillSharing,
  spellStatus,
  spellWords,
  syncPlace,
  systemCheck,
  updateProjectSettings,
  updateSyncSettings,
  writeSkillFile
} from '../api/client';
import type { BibTool, CheckerStatus, CompileEngine, Engines, LanguageInfo, LanguageToolStatus, SearchProvider, Skill, SkillShare, SystemCheck } from '../api/client';
import { COLOUR_ROLES, EDITOR_FONTS, EDITOR_THEMES, chosenColours, editorColours, highlightLines, themeFor, wellColour } from '../editor/editorThemes';
import type { EditorMode } from '../editor/editorThemes';
import { highlightColour } from '../editor/synctex';
import { CheckpointCleanup } from '../editor/tools/VersionsTab';
import { resetPersonas, unsavedPersona } from '../editor/personas';
import type { Persona } from '../editor/personas';
import { ENGINES_CHANGED, LANGUAGES_CHANGED, errorText } from '../editor/shared';
import { ZoteroSettings } from '../editor/ZoteroCite';
import { confirmDialog } from './Dialogs';
import Icon from './Icon';
import Segmented from './Segmented';
import { radioKeys, radioTab } from './Segmented';
import Select from './Select';
import Sheet from './Sheet';
import Tabs from './Tabs';
import { ParserFields } from './TransferPanel';
import GitHubSettings from './GitHubSettings';
import AgentsPane from './AgentSettings';
import DiagramFields from '../diagram/modes/structures/DiagramFields';
import { IS_DESKTOP, claimDefaultHandler, isDefaultHandler, pickFolder, releaseDefaultHandler } from './desktop';
import { toast } from './Toast';
import { IS_MAC, IS_WINDOWS, OS_NAME, tildify } from './platform';
import { ACCENTS, PDF_PAGES_DARK, PDF_PAGES_LIGHT, TAG_COLOURS, useDarkMode } from './appearance';
import { groupSkills, projectSkills, skillId, skillOn } from './skills';

// the notices are long, so they load only when asked for
const Licences = lazy(() => import('./Licences'));
import {
  BIB_TOOLS,
  COMPILE_ENGINES,
  ERROR_HANDLING,
  LIVE_OUTPUT_ENGINES,
  ROLE_FIELDS,
  autoCompileLabel,
  SYNC_HIGHLIGHTS,
  effortOptions,
  followsMain,
  llmConfigFor,
  modelOf,
  presetForEndpoint,
  presetOf,
  presetPatch,
  recommendedFor,
  rolePatch,
  rolePresetOf,
  providerKey,
  providerKeyPatch,
  searchProviderPatch,
  SEARCH_PROVIDERS,
  TAG_COLOUR_NAMES,
  languageName,
  loadSettings,
  useLivePreset,
  useProviders,
  useSettings
} from './settings';
import type { AppSettings, ModelRole, PdfPageDark, PdfPageLight, Theme } from './settings';
import type { ProviderPreset } from '../api/client';
import { FIXED_SHORTCUTS, SHORTCUTS, canonical, formatShortcut, shortcutFromEvent, shortcutKey, shortcutProblem } from './shortcuts';
import type { Shortcut } from './shortcuts';

export type Section =
  | 'appearance'
  | 'editor'
  | 'engines'
  | 'checkpoints'
  | 'composer'
  | 'language'
  | 'shortcuts'
  | 'projects'
  | 'github'
  | 'models'
  | 'personas'
  | 'skills'
  | 'agents'
  | 'search'
  | 'zotero'
  | 'transfer'
  | 'system';

// grouped under headings, so the list reads at a glance
/** Where a list or a switch applies, in Settings › Spelling & grammar and Settings › Skills. */
const SCOPES = [
  ['all', 'All projects'],
  ['project', 'This project']
] as const;

const SECTION_GROUPS: [string, [Section, string, string][]][] = [
  ['General', [
    ['appearance', 'Appearance', 'circle.lefthalf.filled'],
    ['editor', 'Editor', 'text.cursor'],
    ['shortcuts', 'Shortcuts', 'keyboard'],
    ['system', 'System', 'stethoscope']
  ]],
  ['Writing', [
    ['engines', 'Engines', 'hammer'],
    ['language', 'Spelling & grammar', 'textformat.abc.dottedunderline'],
    ['composer', 'Composer', 'pencil'],
    ['checkpoints', 'Checkpoints', 'clock.arrow.circlepath']
  ]],
  ['Projects', [
    ['projects', 'Projects', 'folder'],
    ['github', 'GitHub', 'arrow.triangle.branch'],
    ['zotero', 'Zotero', 'books.vertical'],
    ['transfer', 'Template transfer', 'arrow.triangle.2.circlepath']
  ]],
  ['AI', [
    ['models', 'Models', 'sparkles'],
    ['personas', 'Personas', 'brain.head.profile'],
    ['skills', 'Skills', 'graduationcap'],
    ['agents', 'Agents', 'terminal'],
    ['search', 'Search', 'magnifyingglass']
  ]]
];

const THEMES: [Theme, string, string][] = [
  ['system', 'System', 'circle.lefthalf.filled'],
  ['light', 'Light', 'sun.max'],
  ['dark', 'Dark', 'moon']
];

const SEARCH_NOTES: Record<SearchProvider, string> = {
  llm: 'Uses verified native web search on supported OpenAI or Claude APIs. Other model APIs fall back to your enabled connections.',
  openalex: 'Papers, preprints, books and theses with full details for BibTeX. No key needed; a free key from openalex.org raises the daily limit.',
  semanticscholar: 'Papers in every field with authors, venue and DOI. Works without a key but is often busy; a free key avoids that.',
  serpapi: 'Google Scholar, Google or Baidu results. Needs a SerpApi key.',
  exa: 'Reference searches request publication metadata; chat searches use the whole web. Needs an Exa key.',
  tavily: 'Reference searches prioritise citable sources with dates; chat uses ordinary web search. Needs a Tavily key.',
  brave: 'Reference searches favour citable sources; chat uses ordinary web results. Needs a Brave Search API key.',
  ddgs: 'Google, Bing, Brave, DuckDuckGo and others through the ddgs Python library. No key needed, but it needs Python with ddgs installed.'
};

const TEX = IS_WINDOWS ? 'Install TeX Live or MiKTeX' : 'brew install --cask mactex-no-gui';
const INSTALL_HINTS: Record<string, string> = {
  pdflatex: TEX,
  xelatex: TEX,
  lualatex: TEX,
  latexmk: TEX,
  bibtex: TEX,
  biber: TEX,
  texcount: IS_WINDOWS ? 'Included with TeX Live' : `Included with MacTeX (${TEX})`,
  tectonic: IS_WINDOWS ? 'Install it from tectonic-typesetting.github.io' : 'brew install tectonic'
};

/** projectId: the open project, for Skills' This project; section: the one to open on */
export default function SettingsSheet({ onClose, projectId, section: start = 'appearance' }: { onClose: () => void; projectId?: string; section?: Section }) {
  const [settings, update] = useSettings();
  const [section, setSection] = useState<Section>(start);
  // the skill or persona with unsaved edits, so closing Settings or leaving its page asks first
  const [unsaved, setUnsaved] = useState('');
  const leave = async (then: () => void) => {
    if (unsaved && !(await discardDialog(unsaved))) return;
    setUnsaved('');
    then();
  };
  const [check, setCheck] = useState<SystemCheck | null>(null);
  const [checkError, setCheckError] = useState('');
  const [licences, setLicences] = useState(false);
  const providers = useProviders();
  // Ollama's models come from Ollama itself
  const live = {
    main: useLivePreset(presetOf(providers, settings), settings.llmEndpoint),
    quick: useLivePreset(followsMain(settings, 'quick') ? null : rolePresetOf(providers, settings, 'quick'), settings.referencesEndpoint),
    vision: useLivePreset(followsMain(settings, 'vision') ? null : rolePresetOf(providers, settings, 'vision'), settings.visionEndpoint)
  };
  const preset = live.main.preset;
  const mainModel = modelOf(preset, settings.llmModel);
  const effortChoices = effortOptions(mainModel);
  // stays on Other… while a typed name happens to match a listed model, e.g. glm-5.3 on the way to glm-5.3-flashx
  const [otherModel, setOtherModel] = useState<Record<string, boolean>>({});
  const typedModel = otherModel.main || !mainModel;
  const visionConfig = llmConfigFor(settings, 'vision');
  const imagesGoElsewhere = visionConfig.model !== settings.llmModel || visionConfig.endpoint !== settings.llmEndpoint;

  // a fresh Ollama has no model chosen until it lists what's installed
  const firstModels: Partial<AppSettings> = {};
  if (preset?.live && !settings.llmModel && !otherModel.main && preset.recommended.main) {
    firstModels.llmModel = preset.recommended.main;
    // a text-only main model sends images to the installed model that reads them, as choosing one does
    const reader = recommendedFor(preset, 'vision');
    if (!modelOf(preset, preset.recommended.main)?.vision && followsMain(settings, 'vision') && !settings.visionModel && reader) firstModels.visionModel = reader;
  }
  for (const role of ['quick', 'vision'] as const) {
    const f = ROLE_FIELDS[role];
    const pick = live[role].preset?.live && !settings[f.model] && !otherModel[role] && recommendedFor(live[role].preset, role);
    if (pick) firstModels[f.model] = pick;
  }
  const fill = JSON.stringify(firstModels);
  useEffect(() => {
    if (fill !== '{}') update(JSON.parse(fill));
  }, [fill]);

  /** Another provider's address switches to that provider as the menu does, so the key it had never goes there. */
  const setEndpoint = (value: string) => {
    const next = presetForEndpoint(providers, value);
    // an Ollama on another port is still Ollama, and has no key to leak; an empty field or an https address
    // (a server that wants a key) leaves it, so the key field shows
    if (next?.id === preset?.id || (!next && preset?.local && value.trim() && !/^https:/i.test(value.trim()))) return update({ llmEndpoint: value });
    update(presetPatch(settings, providers, next, value));
  };

  const chooseModel = (id: string) => {
    setOtherModel((was) => ({ ...was, main: id === 'other' }));
    if (id === 'other' || !preset) return update({ llmModel: '' });
    const picked = modelOf(preset, id);
    const reader = recommendedFor(preset, 'vision');
    update({
      llmModel: id,
      reasoningEffort: 'default',
      // a text-only model needs somewhere to send images
      ...(picked && !picked.vision && followsMain(settings, 'vision') && !settings.visionModel && reader && { visionModel: reader })
    });
  };

  /** titleId: the section heading, so a screen reader hears “Quick model Region” rather than just “Region” */
  const regionField = (titleId: string, id: string, preset: ProviderPreset, value: string, onChange: (endpoint: string) => void) => {
    const own = [preset.endpoint, ...(preset.regions || []).map((r) => r.endpoint)];
    return (
      <div className="field">
        <label id={id}>Region</label>
        <Select
          labelId={`${titleId} ${id}`}
          value={value}
          options={[
            [preset.endpoint, 'International'],
            ...(preset.regions || []).map((r): [string, string] => [r.endpoint, r.label]),
            ...(own.includes(value) ? [] : [[value, 'Custom endpoint'] as [string, string]])
          ]}
          onChange={onChange}
        />
      </div>
    );
  };

  const refreshButton = (l: (typeof live)['main']) =>
    l.preset?.live && (
      <button className="btn small" onClick={l.refresh}>
        Refresh
      </button>
    );

  const keyHint = (p: ProviderPreset | null) =>
    p && (
      <>
        Create one on the <a href={p.keyUrl} target="_blank" rel="noreferrer">{p.name} key page</a>. Each provider’s key is kept when you switch.
      </>
    );

  /** The quick or vision model: “Same as main” by default, or its own provider, region, model and key. */
  const roleModel = (role: ModelRole, title: string, use: string, effort: string) => {
    const f = ROLE_FIELDS[role];
    const name = role === 'quick' ? 'Quick model' : 'Vision model';
    const same = followsMain(settings, role);
    const ownLive = same ? live.main : live[role];
    const own = ownLive.preset;
    const value = settings[f.model];
    const choices = (own?.models || []).filter((m) => role === 'quick' || m.vision);
    // an empty name only means “the main model's” while the role follows the main provider
    const typed = otherModel[role] || !own || (value ? !choices.some((m) => m.id === value) : !same);
    const current = same ? 'same' : own?.id || 'custom';
    const picked = modelOf(own, value);
    const blindMain = role === 'vision' && same && !value && mainModel && !mainModel.vision;
    return (
      <>
        <h3 id={`settings-${role}Title`} className="form-section-title">{title}</h3>
        <div className="field-hint section-hint">{use} {effort}</div>
        <div className="field">
          <label id={`settings-${role}Provider`}>Provider</label>
          <Select
            labelId={`settings-${role}Title settings-${role}Provider`}
            value={current}
            options={[
              ['same', `Same as main (${preset?.name || 'Other'})`],
              ...providers.filter((p) => p.id !== preset?.id || p.id === current).map((p): [string, string] => [p.id, p.name]),
              ['custom', 'Other (OpenAI-compatible)']
            ]}
            onChange={(id) => {
              setOtherModel((was) => ({ ...was, [role]: false }));
              update(rolePatch(settings, providers, role, id));
            }}
          />
          {!same && <div className="field-hint">{own ? own.note : 'Any server that speaks the OpenAI chat completions API.'}</div>}
        </div>
        {!same && own?.regions && regionField(`settings-${role}Title`, `settings-${role}Region`, own, settings[f.endpoint], (endpoint) => update({ [f.endpoint]: endpoint }))}
        {!same &&
          text('Endpoint', f.endpoint, {
            name: `${name} endpoint`,
            placeholder: own?.endpoint || 'http://localhost:1234/v1',
            hint: own || settings[f.endpoint] ? '' : 'Until this has an address, the main model is used.',
            // pins the provider, so clearing the field to retype it keeps this section as it is
            onChange: (value) => update({ [f.endpoint]: value, [f.provider]: settings[f.provider] || own?.id || 'custom' })
          })}
        {own && (
          <div className="field">
            <label id={`settings-${role}ModelPick`}>Model</label>
            <div className="row">
              <Select
                className="grow"
                labelId={`settings-${role}Title settings-${role}ModelPick`}
                value={typed ? 'other' : value}
                options={[
                  ...(same ? [['', 'Same as main model'] as [string, string]] : []),
                  ...choices.map((m): [string, string] => [m.id, m.id === recommendedFor(own, role) ? `${m.label} (recommended)` : m.label]),
                  ['other', 'Other…']
                ]}
                onChange={(id) => {
                  setOtherModel((was) => ({ ...was, [role]: id === 'other' }));
                  update({ [f.model]: id === 'other' ? '' : id });
                }}
              />
              {!same && refreshButton(ownLive)}
            </div>
            <div className={`field-hint ${blindMain || (!same && ownLive.error) ? 'error' : ''}`}>
              {blindMain
                ? 'The main model reads text only, so choose a model that reads images.'
                : !same && ownLive.error
                  ? ownLive.error
                  : typed
                    ? 'Type the model’s name exactly as the provider lists it.'
                    : picked?.note
                      ? `${picked.note}.`
                      : ''}
            </div>
          </div>
        )}
        {typed && text(own ? 'Model name' : 'Model', f.model, { name: `${name} name`, placeholder: same ? settings.llmModel || 'Same as main model' : 'Model name' })}
        {!same && !own?.local && text('API key', f.apiKey, { name: `${name} API key`, placeholder: 'Paste your key', secret: true, hint: keyHint(own) })}
      </>
    );
  };

  useEffect(() => {
    if (check || checkError) return;
    systemCheck(settings.texFolder || undefined).then(setCheck).catch((err) => setCheckError(err instanceof Error ? err.message : String(err)));
  }, [check, checkError]);

  const recheck = () => {
    setCheck(null);
    setCheckError('');
  };

  // a TeX folder chosen or cleared is looked in at once
  useEffect(recheck, [settings.texFolder]);

  /** name: the spoken name when the visible label repeats across sections, e.g. “Vision model API key” */
  const text = (
    label: string,
    key: keyof AppSettings,
    opts: { placeholder?: string; secret?: boolean; hint?: ReactNode; name?: string; onChange?: (value: string) => void } = {}
  ) => (
    <div className="field">
      <label htmlFor={`settings-${key}`}>{label}</label>
      <input
        id={`settings-${key}`}
        aria-label={opts.name}
        className="input"
        type={opts.secret ? 'password' : 'text'}
        value={String(settings[key] ?? '')}
        placeholder={opts.placeholder}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        autoComplete="off"
        onChange={(e) => (opts.onChange ? opts.onChange(e.target.value) : update({ [key]: e.target.value }))}
      />
      {opts.hint && <div className="field-hint">{opts.hint}</div>}
    </div>
  );

  const defaultProjectsDir = check?.projectsDir || '~/Documents/Spectrum';
  const ddgsMissing =
    settings.searchConnections.includes('ddgs') && check && !check.python.ddgs
      ? check.python.found
        ? `ddgs isn’t installed for ${check.python.path}. Install it with: ${check.python.path} -m pip install ddgs`
        : 'Python wasn’t found. Install Python 3, then: python3 -m pip install ddgs'
      : '';

  return (
    <Sheet title="Settings" onClose={() => leave(onClose)} width={780} className="settings-sheet">
      <div className="settings-layout">
        <nav className="settings-nav">
          {SECTION_GROUPS.map(([heading, sections]) => (
            <div key={heading} className="settings-nav-group" role="group" aria-label={heading}>
              <div className="settings-nav-heading">{heading}</div>
              {sections.map(([value, label, icon]) => (
                <button key={value} className={`nav-row ${section === value ? 'active' : ''}`} onClick={() => value !== section && leave(() => (setSection(value), setLicences(false)))}>
                  <Icon name={icon} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="settings-pane">
          {section === 'appearance' && (
            <>
              <h3 className="form-section-title">Theme</h3>
              <div className="theme-picker">
                {THEMES.map(([value, label, icon]) => (
                  <button
                    key={value}
                    className={`theme-option ${value} ${settings.theme === value ? 'active' : ''}`}
                    onClick={() => update({ theme: value })}
                    aria-pressed={settings.theme === value}
                  >
                    <span className="theme-swatch"><span /></span>
                    <span className="theme-label"><Icon name={icon} /> {label}</span>
                  </button>
                ))}
              </div>
              <div className="field-hint">System follows the {OS_NAME} appearance and switches automatically.</div>

              <h3 id="settings-accent" className="form-section-title">Accent colour</h3>
              <div className="row">
                <div className="accent-picker" role="radiogroup" aria-labelledby="settings-accent" onKeyDown={radioKeys}>
                  {ACCENTS.map(([value, label, colour], i) => (
                    <button
                      key={value}
                      className={`accent-swatch ${value}`}
                      style={{ '--swatch': value === 'custom' ? settings.accentCustom : colour } as CSSProperties}
                      role="radio"
                      aria-checked={settings.accent === value}
                      tabIndex={radioTab(settings.accent === value, i, ACCENTS.some(([v]) => v === settings.accent))}
                      aria-label={label}
                      title={label}
                      onClick={() => update({ accent: value })}
                    />
                  ))}
                </div>
                <input
                  type="color"
                  className="colour-well"
                  aria-label="Custom accent colour"
                  title="Custom accent colour"
                  value={settings.accentCustom}
                  onChange={(e) => update({ accent: 'custom', accentCustom: e.target.value })}
                />
              </div>
              <div className="field-hint">
                Follow {OS_NAME} uses the accent colour chosen in {IS_WINDOWS ? 'Settings → Personalisation → Colours' : 'System Settings'}.
              </div>

              {/* see-through glass is macOS's alone */}
              {IS_DESKTOP && !IS_WINDOWS && (
                <>
                  <h3 className="form-section-title">Window</h3>
                  <label className="checkbox-row">
                    <input type="checkbox" role="switch" checked={settings.glass} onChange={(e) => update({ glass: e.target.checked })} />
                    <span>
                      See-through window
                      <span className="field-hint">Liquid Glass on macOS 26 and later, a frosted blur on earlier versions.</span>
                    </span>
                  </label>
                  <div className="field">
                    <label htmlFor="settings-glassClarity">Clarity</label>
                    <div className="range-row">
                      <span aria-hidden="true">Frosted</span>
                      <input
                        id="settings-glassClarity"
                        type="range"
                        min={0}
                        max={100}
                        value={settings.glassClarity}
                        disabled={!settings.glass}
                        onChange={(e) => update({ glassClarity: Number(e.target.value) })}
                      />
                      <span aria-hidden="true">Clear</span>
                    </div>
                  </div>
                </>
              )}

              <h3 className="form-section-title">PDF pages</h3>
              <div className="row">
                <div className="field grow">
                  <label id="settings-pdfPageLight">Light mode</label>
                  <Select
                    labelId="settings-pdfPageLight"
                    value={settings.pdfPageLight}
                    options={PDF_PAGES_LIGHT}
                    onChange={(value) => update({ pdfPageLight: value as PdfPageLight })}
                  />
                </div>
                <div className="field grow">
                  <label id="settings-pdfPageDark">Dark mode</label>
                  <Select
                    labelId="settings-pdfPageDark"
                    value={settings.pdfPageDark}
                    options={PDF_PAGES_DARK}
                    onChange={(value) => update({ pdfPageDark: value as PdfPageDark })}
                  />
                </div>
              </div>
              <div className="field-hint">Dark and Black turn the ink light. Dimmed keeps the page’s own colours, a little darker. The PDF’s More menu changes the colour for the mode showing.</div>
            </>
          )}

          {section === 'editor' && <EditorPane />}

          {section === 'engines' && <EnginesPane />}

          {section === 'checkpoints' && <CheckpointsPane />}

          {section === 'composer' && <ComposerPane />}

          {section === 'language' && <LanguagePane projectId={projectId} />}

          {section === 'shortcuts' && <ShortcutsPane />}

          {section === 'personas' && <PersonasPane onUnsaved={setUnsaved} />}

          {section === 'skills' && <SkillsPane projectId={projectId} onUnsaved={setUnsaved} />}

          {section === 'agents' && <AgentsPane />}

          {section === 'github' && <GitHubSettings />}

          {section === 'projects' && (
            <>
              <div className="field">
                <label id="settings-openOn">Open Spectrum on</label>
                <div>
                  <Segmented
                    labelledBy="settings-openOn"
                    value={settings.openOn}
                    options={[['home', 'Home'], ['all', 'All projects']]}
                    onChange={(openOn) => update({ openOn })}
                  />
                </div>
                <div className="field-hint">Home shows your folders and the projects in no folder. All projects lists every project at once.</div>
              </div>
              <div className="field">
                <label id="settings-switcherOpensAt">Project switcher opens at</label>
                <div>
                  <Segmented
                    labelledBy="settings-switcherOpensAt"
                    value={settings.switcherOpensAt}
                    options={[['home', 'Home'], ['folder', 'This project’s folder']]}
                    onChange={(switcherOpensAt) => update({ switcherOpensAt })}
                  />
                </div>
                <div className="field-hint">The list under the project’s name at the top of the editor. With this project’s folder, it opens at the folder the project is in, beside the projects and folders there.</div>
              </div>
              <div className="field">
                <label id="settings-projectsDir">Default folder for new projects</label>
                <div className="path-row" role="group" aria-labelledby="settings-projectsDir">
                  <Icon name="folder" />
                  <span className="path-text" title={settings.projectsDir || defaultProjectsDir}>{settings.projectsDir || defaultProjectsDir}</span>
                  <button
                    className="btn small"
                    onClick={async () => {
                      const picked = await pickFolder({ title: 'Choose the default folder for new projects', defaultPath: settings.projectsDir || check?.projectsDir });
                      if (!picked) return;
                      // never in a sync app's folder, which corrupts the repositories GitHub sync keeps in each project
                      const place = (await syncPlace(picked).catch(() => null))?.place;
                      if (place) toast(`That folder is in ${place.label}, which can damage a project’s GitHub history. Choose a folder that isn’t synced.`, { tone: 'error' });
                      else update({ projectsDir: picked });
                    }}
                  >
                    Change…
                  </button>
                  <button className="btn small" disabled={!settings.projectsDir} onClick={() => update({ projectsDir: '' })}>Reset</button>
                </div>
                <div className="field-hint">
                  New, imported and arXiv projects are created here unless another location is chosen. Existing projects stay where they are.
                </div>
              </div>
              {IS_DESKTOP && (
                <>
                  <h3 className="form-section-title">Opening files</h3>
                  {IS_WINDOWS ? (
                    <>
                      <div className="field-hint">Windows leaves the choice to you, for each kind of file. PDFs stay with your PDF viewer.</div>
                      {FILE_GROUPS.map(({ name, exts: [first, ...rest] }) => (
                        <div className="field" key={name}>
                          <div>{capitalised(name)}</div>
                          <div className="field-hint">
                            Right-click a .{first} file, choose Open with → Choose another app, pick Spectrum and select Always{rest.length ? `, then do the same for ${dotted(rest)} files` : ''}.
                          </div>
                        </div>
                      ))}
                    </>
                  ) : (
                    <FileDefaults />
                  )}
                </>
              )}
              <h3 className="form-section-title">Your other computers</h3>
              <label className="checkbox-row">
                <input type="checkbox" role="switch" checked={settings.syncSettings} onChange={(e) => update({ syncSettings: e.target.checked })} />
                <span>
                  Use the same settings on each computer
                  <span className="field-hint">
                    Through your settings repository, once it’s on in Settings › GitHub: appearance, editor, spelling, shortcuts, personas and the folders on the Projects page. API keys, models, folders on disk and the window’s look stay on
                    each computer.
                  </span>
                </span>
              </label>
              <ComputerName />
            </>
          )}

          {section === 'models' && (
            <>
              <h3 id="settings-mainTitle" className="form-section-title">Main model</h3>
              <div className="field">
                <label id="settings-llmProvider">Provider</label>
                <Select
                  labelId="settings-mainTitle settings-llmProvider"
                  value={preset?.id || 'custom'}
                  options={[...providers.map((p): [string, string] => [p.id, p.name]), ['custom', 'Other (OpenAI-compatible)']]}
                  onChange={(id) => {
                    setOtherModel({});
                    update(presetPatch(settings, providers, providers.find((p) => p.id === id) || null));
                  }}
                />
                <div className="field-hint">
                  {preset ? preset.note : 'Any server that speaks the OpenAI chat completions API, such as LM Studio or vLLM.'}
                </div>
              </div>
              {preset?.regions && regionField('settings-mainTitle', 'settings-llmRegion', preset, settings.llmEndpoint, (endpoint) => update({ llmEndpoint: endpoint }))}
              {text('Endpoint', 'llmEndpoint', {
                name: 'Main model endpoint',
                placeholder: preset?.endpoint || 'https://api.openai.com/v1/chat/completions',
                hint: preset?.local
                  ? 'For Ollama on another computer, use its address, e.g. http://192.168.1.20:11434, and turn on Expose Ollama to the network in its settings.'
                  : preset
                    ? ''
                    : 'The chat completions address or the base URL, e.g. http://localhost:1234/v1',
                onChange: setEndpoint
              })}
              {preset && (
                <div className="field">
                  <label id="settings-llmModelPick">Model</label>
                  <div className="row">
                    <Select
                      className="grow"
                      labelId="settings-mainTitle settings-llmModelPick"
                      value={typedModel ? 'other' : mainModel.id}
                      options={[
                        ...preset.models.map((m): [string, string] => [m.id, m.id === preset.recommended.main ? `${m.label} (recommended)` : m.label]),
                        ['other', 'Other…']
                      ]}
                      onChange={chooseModel}
                    />
                    {refreshButton(live.main)}
                  </div>
                  <div className={`field-hint ${live.main.error ? 'error' : ''}`}>
                    {live.main.error ||
                      (typedModel
                        ? 'Type the model’s name exactly as the provider lists it.'
                        : [
                            mainModel.note && `${mainModel.note}.`,
                            !mainModel.vision && (imagesGoElsewhere ? 'Reads text only, so images go to the vision model.' : 'Reads text only, so set a vision model below for images.')
                          ]
                            .filter(Boolean)
                            .join(' '))}
                  </div>
                </div>
              )}
              {typedModel && text(preset ? 'Model name' : 'Model', 'llmModel', { name: 'Main model name', placeholder: preset?.recommended.main || 'Model name' })}
              {!preset?.local &&
                text('API key', 'llmApiKey', {
                  name: 'Main model API key',
                  placeholder: 'Paste your key',
                  secret: true,
                  hint: keyHint(preset)
                })}
              <div className="field">
                <label id="settings-reasoningEffort">Reasoning effort</label>
                <Select
                  labelId="settings-mainTitle settings-reasoningEffort"
                  value={effortChoices.some(([value]) => value === settings.reasoningEffort) ? settings.reasoningEffort : 'default'}
                  options={effortChoices}
                  onChange={(value) => update({ reasoningEffort: value as AppSettings['reasoningEffort'] })}
                />
                <div className="field-hint">
                  How long the model may think before answering. Higher levels are slower and cost more.
                </div>
              </div>

              {roleModel('quick', 'Quick model', 'Used for autocomplete and for splitting pasted references.', 'Listed models think as little as they allow, so it stays quick; other servers use their own default.')}
              {roleModel('vision', 'Vision model', 'Used for image → LaTeX and the layout check in template transfer.', 'Uses the model’s recommended effort.')}
            </>
          )}

          {section === 'search' && (
            <>
              <div className="field">
                <label id="settings-searchProvider">Default search</label>
                <Select labelId="settings-searchProvider" value={settings.searchProvider} options={SEARCH_PROVIDERS}
                  onChange={(value) => update(searchProviderPatch(settings, value as SearchProvider))} />
                <div className="field-hint">Tried first. If it fails or returns no usable results, Spectrum tries the other enabled connections below in order.</div>
              </div>
              <h3 className="form-section-title">Search connections</h3>
              <div className="field-hint section-hint">Keep several connected at once. Reference lookups request citation details; chat searches use the general web. Fallback requests use each connection’s own account.</div>
              {SEARCH_PROVIDERS.map(([provider, label]) => {
                const enabled = provider === settings.searchProvider || settings.searchConnections.includes(provider);
                const needsKey = !['llm', 'ddgs'].includes(provider);
                const optional = ['openalex', 'semanticscholar'].includes(provider);
                return <div className="field" key={provider}>
                  <label className="checkbox-row">
                    <input type="checkbox" role="switch" checked={enabled} disabled={provider === settings.searchProvider}
                      onChange={(e) => update({ searchConnections: e.target.checked
                        ? [...new Set([...settings.searchConnections, provider])]
                        : settings.searchConnections.filter((p) => p !== provider) })} />
                    {label}{provider === settings.searchProvider ? ' (default)' : ''}
                  </label>
                  {enabled && <>
                    <div className="field-hint">{SEARCH_NOTES[provider]}</div>
                    {provider === 'ddgs' && ddgsMissing && <div className="field-hint error">{ddgsMissing}</div>}
                    {needsKey && <>
                      <label htmlFor={`search-key-${provider}`}>{label} API key{optional ? ' (optional)' : ''}</label>
                      <input id={`search-key-${provider}`} className="input" type="password" autoComplete="off" spellCheck={false}
                        value={providerKey(settings, provider)} onChange={(e) => update(providerKeyPatch(settings, provider, e.target.value))} />
                    </>}
                    {provider === 'serpapi' && <>
                      <label id="settings-serpEngine">SerpApi engine for references</label>
                      <Select labelId="settings-serpEngine" value={settings.serpEngine}
                        options={[["google_scholar", "Google Scholar (papers)"], ["google", "Google"], ["baidu", "Baidu"]]}
                        onChange={(value) => update({ serpEngine: value as AppSettings['serpEngine'] })} />
                    </>}
                  </>}
                </div>;
              })}

              <h3 className="form-section-title">Research sources</h3>
              <div className="field-hint section-hint">
                Research in the sidebar searches OpenAlex, Semantic Scholar, arXiv, Crossref and PubMed itself. Each works without these; a key or email gets more
                searches a day, and they stay on this computer. The OpenAlex and Semantic Scholar connections above share their keys with Research.
              </div>
              {(['openalex', 'semanticscholar'] as const).map((provider) => {
                const label = provider === 'openalex' ? 'OpenAlex' : 'Semantic Scholar';
                // a connection that's on shows its key above
                if (provider === settings.searchProvider || settings.searchConnections.includes(provider)) return null;
                return <div className="field" key={provider}>
                  <label htmlFor={`research-key-${provider}`}>{label} API key <span className="optional">Optional</span></label>
                  <input id={`research-key-${provider}`} className="input" type="password" autoComplete="off" spellCheck={false}
                    value={providerKey(settings, provider)} onChange={(e) => update(providerKeyPatch(settings, provider, e.target.value))} />
                </div>;
              })}
              {text('OpenAlex email', 'openalexEmail', { placeholder: 'you@example.com', hint: 'Sent with each OpenAlex request, so OpenAlex can contact you about heavy use.' })}
              {text('NCBI API key', 'ncbiKey', { secret: true, hint: 'Lets PubMed take more searches a second. Make one in your NCBI account settings.' })}
              {text('Unpaywall email', 'unpaywallEmail', { placeholder: 'you@example.com', hint: 'Get PDF asks Unpaywall for an open-access copy of a paper, and Unpaywall needs an email address with each request.' })}

              <h3 className="form-section-title">Search model <span className="optional">Optional</span></h3>
              <div className="field-hint section-hint">Used for web search only. Leave blank to use the main model.</div>
              {text('Endpoint', 'searchEndpoint', { name: 'Search model endpoint', placeholder: settings.llmEndpoint })}
              {text('Model', 'searchModel', { name: 'Search model name', placeholder: settings.llmModel })}
              {text('API key', 'searchApiKey', { name: 'Search model API key', placeholder: 'sk-…', secret: true })}
            </>
          )}

          {section === 'zotero' && <ZoteroSettings projectId={projectId} />}

          {section === 'transfer' && (
            <>
              <div className="field-hint section-hint">
                The parser turns a PDF into Markdown for the “From the PDF (parser → LaTeX)” mode of Change template.
              </div>
              <ParserFields />
            </>
          )}

          {section === 'system' && licences && (
            <Suspense fallback={<div className="field-hint"><span className="spinner" /> Loading…</div>}>
              <Licences onBack={() => setLicences(false)} />
            </Suspense>
          )}

          {section === 'system' && !licences && (
            <>
              <h3 className="form-section-title">Tools</h3>
              {checkError && <div className="field-hint error">{checkError}</div>}
              {!check && !checkError && <div className="field-hint"><span className="spinner" /> Checking…</div>}
              {check && (
                <div className="sys-list">
                  {Object.entries(check.tools).map(([name, found]) => {
                    const problem = check.problems?.[name];
                    const state = problem ? 'broken' : found ? 'ok' : 'missing';
                    const detail = problem || found || INSTALL_HINTS[name] || 'Not installed';
                    return (
                      <div key={name} className={`sys-row ${state}`}>
                        <Icon name={problem ? 'exclamationmark.triangle.fill' : found ? 'checkmark.circle.fill' : 'minus.circle'} />
                        <span className="sys-name">{name}</span>
                        <span className="sys-detail" title={detail}>{detail}</span>
                      </div>
                    );
                  })}
                  {(['matplotlib', 'ddgs'] as const).map((module) => (
                    <div key={module} className={`sys-row ${check.python[module] ? 'ok' : 'missing'}`}>
                      <Icon name={check.python[module] ? 'checkmark.circle.fill' : 'minus.circle'} />
                      <span className="sys-name">python + {module}</span>
                      <span className="sys-detail">
                        {check.python[module] ? check.python.path : check.python.found ? `${check.python.path} -m pip install ${module}` : 'Python not found'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <h3 className="form-section-title">Folders</h3>
              <div className="kv-list">
                <div className="kv-row"><span>App data</span><code>{check?.dataDir || '…'}</code></div>
                <div className="kv-row"><span>Default projects folder</span><code>{settings.projectsDir || check?.projectsDir || '…'}</code></div>
              </div>
              <div>
                <button className="btn small" onClick={recheck} disabled={!check && !checkError}>
                  <Icon name="arrow.clockwise" /> Check again
                </button>
              </div>
              <h3 className="form-section-title">About</h3>
              <div className="field-hint section-hint">
                Spectrum {__APP_VERSION__} is under the MIT Licence. It includes software, fonts and word lists under their own licences.
              </div>
              <div>
                <button className="btn small" onClick={() => setLicences(true)}>
                  <Icon name="doc.text" /> Licences
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </Sheet>
  );
}

/** Settings › Projects: what the other computers call this one, e.g. in “Backup from <computer>”. */
function ComputerName() {
  const [saved, setSaved] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const show = ({ machineName }: { machineName: string }) => {
    setSaved(machineName);
    setName(machineName);
    setError('');
  };
  useEffect(() => {
    getSyncSettings().then(show, (err) => setError(errorText(err)));
  }, []);

  return (
    <div className="field">
      <label htmlFor="settings-machineName">This computer’s name</label>
      <input
        id="settings-machineName"
        className="input"
        value={name}
        disabled={saved === null}
        spellCheck={false}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => saved !== null && name.trim() !== saved && updateSyncSettings({ machineName: name }).then(show, (err) => setError(errorText(err)))}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <div className="field-hint">Your other computers show it, e.g. for a backup made on this one.</div>
      {error && <div className="field-hint error">{error}</div>}
    </div>
  );
}

/** Settings › Projects › Opening files, each with a switch of its own; main.rs's OPENABLE has every extension */
const FILE_GROUPS = [
  { name: 'LaTeX documents', exts: ['tex', 'ltx'] },
  { name: 'bibliographies', exts: ['bib'] },
  { name: 'other TeX files', exts: ['sty', 'cls', 'clo', 'dtx', 'ins', 'bst', 'bbx', 'cbx', 'lbx', 'dbx'] },
  { name: 'Typst documents', exts: ['typ'] },
  { name: 'Markdown documents', exts: ['md', 'markdown'] }
];
const capitalised = (text: string) => text[0].toUpperCase() + text.slice(1);
const dotted = (exts: string[]) => {
  const names = exts.map((ext) => `.${ext}`);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
};

/** macOS: on makes Spectrum the default for a kind of file, off gives it back to the app that had it. */
function FileDefaults() {
  // as macOS says (null until it answers), asked again when the window comes back, so a change made in Finder shows
  const [on, setOn] = useState<(boolean | null)[]>(() => FILE_GROUPS.map(() => null));
  const [busy, setBusy] = useState(false);
  const read = () => Promise.all(FILE_GROUPS.map(({ exts }) => isDefaultHandler(exts).catch(() => null))).then(setOn);
  useEffect(() => {
    read();
    window.addEventListener('focus', read);
    return () => window.removeEventListener('focus', read);
  }, []);
  const change = ({ name, exts }: (typeof FILE_GROUPS)[number], open: boolean) => {
    setBusy(true);
    (open ? claimDefaultHandler : releaseDefaultHandler)(exts)
      .then(
        () => toast(open ? `Spectrum now opens ${dotted(exts)} files.` : `${capitalised(name)} open in the app that had them before.`, { tone: 'success' }),
        (err) => toast(open ? `Couldn’t make Spectrum the default: ${err}` : `${err}`, { tone: 'error' })
      )
      .finally(() => read().finally(() => setBusy(false)));
  };

  return (
    <>
      <div className="field-hint">
        Switch one on and Finder opens those files in Spectrum. Switch it off to give them back to the app that opened them before. Spectrum took LaTeX documents and bibliographies when it first opened. PDFs stay with your PDF viewer.
      </div>
      {FILE_GROUPS.map((group, i) => (
        <label className="checkbox-row" key={group.name}>
          <input type="checkbox" role="switch" checked={!!on[i]} disabled={busy || on[i] === null} onChange={(e) => change(group, e.target.checked)} />
          <span>
            Open {group.name} with Spectrum
            <span className="field-hint">{dotted(group.exts)}</span>
          </span>
        </label>
      ))}
    </>
  );
}

const SHORTCUT_GROUPS: Shortcut['group'][] =['Editing', 'Selection', 'Folding', 'PDF', 'App'];

function ShortcutsPane() {
  const [settings, update] = useSettings();
  const overrides = settings.shortcuts;
  const [recording, setRecording] = useState('');
  const [problem, setProblem] = useState('');

  const keyOf = (id: string) => shortcutKey(overrides, id);
  const clashesWith = (id: string) => {
    const key = canonical(keyOf(id));
    return key ? SHORTCUTS.filter((s) => s.id !== id && canonical(keyOf(s.id)) === key).map((s) => s.label) : [];
  };
  const assign = (id: string, key: string) => {
    const next = { ...overrides };
    if (canonical(key) === canonical(SHORTCUTS.find((s) => s.id === id)!.key)) delete next[id];
    else next[id] = key;
    update({ shortcuts: next });
  };
  const stop = () => {
    setRecording('');
    setProblem('');
  };

  // Listening on the document rather than the button: WebKit doesn't focus a clicked button, and the
  // capture phase keeps the keys from the sheet's Escape and the page shortcuts.
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      const plain = !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey;
      // Tab still moves on, which ends the recording
      if (e.key === 'Tab' && plain) return stop();
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') return stop();
      if ((e.key === 'Backspace' || e.key === 'Delete') && plain) {
        assign(recording, '');
        return stop();
      }
      const key = shortcutFromEvent(e);
      if (!key) return;
      const why = shortcutProblem(key);
      if (why) return setProblem(why);
      assign(recording, key);
      stop();
    };
    // a click anywhere but the chip being recorded ends the recording
    const onDown = (e: MouseEvent) => {
      if (!(e.target as Element | null)?.closest?.(`[data-shortcut="${recording}"]`)) stop();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDown, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDown, true);
    };
  });

  return (
    <>
      <div className="field-hint section-hint">
        Click a shortcut and press the new keys. Delete removes it and Escape cancels. Tab and {IS_MAC ? '⇧Tab' : 'Shift+Tab'} also indent and unindent the selected lines.
      </div>
      {SHORTCUT_GROUPS.map((group) => (
        <div key={group}>
          <h3 className="form-section-title">{group}</h3>
          <div className="kv-list">
            {SHORTCUTS.filter((s) => s.group === group).map((s) => {
              const key = formatShortcut(keyOf(s.id));
              const clashes = clashesWith(s.id);
              const active = recording === s.id;
              return (
                <div key={s.id} className="kv-row shortcut-row">
                  <span>
                    {s.label}
                    {active && problem ? (
                      <span className="shortcut-note" role="alert">{problem}</span>
                    ) : (
                      clashes.length > 0 && <span className="shortcut-note">Also used by {clashes.join(' and ')}</span>
                    )}
                  </span>
                  <span className="shortcut-keys">
                    {s.id in overrides && (
                      <button className="icon-btn small" title="Restore default" aria-label={`Restore the default shortcut for ${s.label}`} onClick={() => assign(s.id, s.key)}>
                        <Icon name="arrow.counterclockwise" />
                      </button>
                    )}
                    <button
                      className={`key-chip ${active ? 'recording' : ''} ${clashes.length ? 'clash' : ''}`}
                      aria-label={`${s.label}: ${active ? 'type a shortcut' : key || 'none'}`}
                      data-shortcut={s.id}
                      onClick={() => (active ? stop() : (setProblem(''), setRecording(s.id)))}
                    >
                      {active ? 'Type a shortcut' : key || 'None'}
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <h3 className="form-section-title">Fixed</h3>
      <div className="kv-list">
        {FIXED_SHORTCUTS.map(([label, key]) => (
          <div key={label} className="kv-row shortcut-row">
            <span>{label}</span>
            <kbd>{formatShortcut(key)}</kbd>
          </div>
        ))}
      </div>
      <div>
        <button className="btn small" disabled={!Object.keys(overrides).length} onClick={() => update({ shortcuts: {} })}>
          Restore all defaults
        </button>
      </div>
    </>
  );
}

const PREVIEW = highlightLines('\\section{Results} % draft\n\\begin{figure}[h]\n  \\includegraphics{plot}\n\\end{figure}\nEnergy is $E = mc^2$\nas shown by \\cite{einstein}.');
const PREVIEW_ACTIVE = 2;
const PREVIEW_SELECTED = 4;

/** A few lines of LaTeX in a theme's colours, with the current line, a selection and the cursor. */
function EditorPreview({ colours }: { colours: Record<string, string> }) {
  const style = Object.fromEntries(COLOUR_ROLES.map(([role, , cssVar]) => [`--${cssVar}`, colours[role]])) as CSSProperties;
  return (
    <div className="editor-preview" style={style} aria-hidden="true">
      {PREVIEW.map((pieces, i) => (
        <div key={i} className={i === PREVIEW_ACTIVE ? 'pv-active' : undefined}>
          <span className="pv-number">{i + 1}</span>
          <span className={i === PREVIEW_SELECTED ? 'pv-selection' : undefined}>
            {pieces.map(([role, text], j) => (role ? <span key={j} className={`pv-${role}`}>{text}</span> : text))}
          </span>
          {i === PREVIEW_ACTIVE && <span className="pv-cursor" />}
        </div>
      ))}
    </div>
  );
}

const themeKey = (mode: EditorMode) => (mode === 'light' ? 'editorThemeLight' : 'editorThemeDark');

/** Citing, jumping to the PDF, which PDF shows, the font, a theme for each mode and any colour changed from the theme. */
function EditorPane() {
  const [settings, update] = useSettings();
  const dark = useDarkMode();
  const lasts = settings.syncHighlightSeconds === 1 ? '1 second' : `${settings.syncHighlightSeconds} seconds`;
  // starts on the mode that's on screen
  const [mode, setMode] = useState<EditorMode>(() =>
    settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'
  );
  const changed = settings.editorColours[mode];
  const colours = chosenColours(settings, mode);
  // the accent as #rrggbb (it may be macOS's AccentColor), for Spectrum's accent-based selection
  const accent = useMemo(() => {
    const probe = document.createElement('i');
    probe.style.color = 'var(--accent)';
    document.body.append(probe);
    const rgb = getComputedStyle(probe).color.match(/\d+/g) || [];
    probe.remove();
    return `#${rgb.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
  }, [settings.accent, settings.accentCustom]);
  const font = settings.editorFont === 'custom' || EDITOR_FONTS.some((f) => f.id === settings.editorFont) ? settings.editorFont : 'system';

  return (
    <>
      <label className="checkbox-row">
        <input type="checkbox" role="switch" checked={settings.autoInsertCite} onChange={(e) => update({ autoInsertCite: e.target.checked })} />
        <span>
          <span>
            Insert <code>\cite</code> at the cursor after adding a reference
          </span>
          <span className="field-hint">Applies when the References chat adds or finds a single reference.</span>
        </span>
      </label>

      <h3 className="form-section-title">Jump between source and PDF</h3>
      <label className="checkbox-row">
        <input type="checkbox" role="switch" checked={settings.syncDoubleClick} onChange={(e) => update({ syncDoubleClick: e.target.checked })} />
        <span>
          Double-click jumps between the source and the PDF
          <span className="field-hint">Double-click the PDF to find that spot in the source, or a line in a .tex file to find it in the PDF beside it.</span>
        </span>
      </label>
      <div className="field">
        <label id="settings-syncHighlight">Highlight colour</label>
        <div className="row">
          <div className="accent-picker" role="radiogroup" aria-labelledby="settings-syncHighlight" onKeyDown={radioKeys}>
            {SYNC_HIGHLIGHTS.map(([value, label], i) => (
              <button
                key={value}
                className={`accent-swatch ${value}`}
                style={{ '--swatch': highlightColour({ ...settings, syncHighlightColour: value }, dark) } as CSSProperties}
                role="radio"
                aria-checked={settings.syncHighlightColour === value}
                tabIndex={radioTab(settings.syncHighlightColour === value, i, SYNC_HIGHLIGHTS.some(([v]) => v === settings.syncHighlightColour))}
                aria-label={label}
                title={label}
                onClick={() => update({ syncHighlightColour: value })}
              />
            ))}
          </div>
          <input
            type="color"
            className="colour-well"
            aria-label="Custom highlight colour"
            title="Custom highlight colour"
            value={settings.syncHighlightCustom}
            onChange={(e) => update({ syncHighlightColour: 'custom', syncHighlightCustom: e.target.value })}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="settings-syncHighlightSeconds">Highlight lasts {lasts}</label>
        <div className="range-row">
          <span aria-hidden="true">1 s</span>
          <input
            id="settings-syncHighlightSeconds"
            type="range"
            min={1}
            max={10}
            value={settings.syncHighlightSeconds}
            aria-valuetext={lasts}
            onChange={(e) => update({ syncHighlightSeconds: Number(e.target.value) })}
          />
          <span aria-hidden="true">10 s</span>
        </div>
      </div>

      <h3 className="form-section-title">PDF</h3>
      <label className="checkbox-row">
        <input type="checkbox" role="switch" checked={settings.pdfFollowsFile} onChange={(e) => update({ pdfFollowsFile: e.target.checked })} />
        <span>
          PDF follows the open file
          <span className="field-hint">
            Opening another document’s .tex shows its PDF, and Compile builds the document showing. A chapter with a <code>% !TEX root</code> comment shows
            its root’s PDF, and other files leave the PDF as it is.
          </span>
        </span>
      </label>

      <h3 className="form-section-title">Font</h3>
      <div className="editor-theme-columns">
        <div className="field">
          <label id="settings-editorFont">Font</label>
          <Select
            labelId="settings-editorFont"
            value={font}
            options={[
              ...EDITOR_FONTS.map((f): [string, ReactNode] => [f.id, <span style={{ fontFamily: f.css }}>{f.label}</span>]),
              ['custom', 'Other installed font…']
            ]}
            onChange={(value) => update({ editorFont: value })}
          />
        </div>
        <div className="field">
          <label id="settings-editorFontSize">Font size</label>
          <Select
            labelId="settings-editorFontSize"
            value={String(settings.editorFontSize)}
            options={[11, 12, 13, 14, 15, 16, 18, 20].map((n) => [String(n), `${n} pt`])}
            onChange={(value) => update({ editorFontSize: Number(value) })}
          />
        </div>
      </div>
      {font === 'custom' && (
        <div className="field">
          <label htmlFor="settings-editorFontCustom">Installed font name</label>
          <input
            id="settings-editorFontCustom"
            className="input"
            value={settings.editorFontCustom}
            placeholder="Iosevka"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            autoComplete="off"
            onChange={(e) => update({ editorFontCustom: e.target.value })}
          />
          <div className="field-hint">
            {IS_WINDOWS
              ? 'The family name as Settings → Personalisation → Fonts shows it. Consolas is used until it matches an installed font.'
              : 'The family name as Font Book shows it. SF Mono is used until it matches an installed font.'}
          </div>
        </div>
      )}

      <h3 className="form-section-title">Theme</h3>
      <div className="field-hint section-hint">Any light theme goes with any dark one. With System, the editor switches between them with {OS_NAME}.</div>
      <div className="editor-theme-columns">
        {(['light', 'dark'] as const).map((m) => (
          <div key={m} className="field">
            <label id={`settings-${themeKey(m)}`}>{m === 'light' ? 'Light theme' : 'Dark theme'}</label>
            <Select
              labelId={`settings-${themeKey(m)}`}
              value={themeFor(settings[themeKey(m)], m).id}
              options={EDITOR_THEMES.filter((t) => t.mode === m).map((t): [string, ReactNode] => [
                t.id,
                <>
                  <span className="theme-chip" style={{ background: t.colours.bg }}>
                    {(['command', 'arg', 'math'] as const).map((role) => <i key={role} style={{ background: t.colours[role] }} />)}
                  </span>
                  {t.label}
                </>
              ])}
              onChange={(id) => update({ [themeKey(m)]: id })}
            />
            <EditorPreview colours={editorColours(settings, m)} />
          </div>
        ))}
      </div>

      <h3 className="form-section-title">Colours</h3>
      <div className="field-hint section-hint">
        Changes go on top of {themeFor(settings[themeKey(mode)], mode).label} and stay when you choose another theme.
      </div>
      <div className="colours-bar">
        <Segmented
          label="Colours for"
          value={mode}
          options={[
            ['light', 'Light'],
            ['dark', 'Dark']
          ]}
          onChange={setMode}
        />
        <button className="btn small" disabled={!Object.keys(changed).length} onClick={() => update({ editorColours: { ...settings.editorColours, [mode]: {} } })}>
          Reset to theme
        </button>
      </div>
      <div className="colour-grid">
        {COLOUR_ROLES.map(([role, label]) => (
          <label key={role} className="colour-row">
            <input
              type="color"
              value={wellColour(colours[role], colours.bg, accent)}
              onChange={(e) => update({ editorColours: { ...settings.editorColours, [mode]: { ...changed, [role]: e.target.value } } })}
            />
            <span>{label}</span>
            {role in changed && <span className="colour-changed" role="img" aria-label="changed" title="Changed from the theme" />}
          </label>
        ))}
      </div>
    </>
  );
}

const sizeLabel = (bytes: number) => (bytes ? (bytes / 1_000_000).toFixed(1) + ' MB' : 'size unknown');
const versionAtLeast = (version: string, minimum: string) => {
  const left = version.split('.').map(Number);
  const right = minimum.split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    if ((left[i] || 0) !== (right[i] || 0)) return (left[i] || 0) > (right[i] || 0);
  }
  return true;
};

/** Settings › Engines: the LaTeX, Typst and Markdown engines, and the compile defaults a project uses until it chooses its own. */
function EnginesPane() {
  const [settings, update] = useSettings();
  const defaults = settings.compileDefaults;
  const set = (patch: Partial<typeof defaults>) => update({ compileDefaults: { ...defaults, ...patch } });
  const [tab, setTab] = useState<'latex' | 'typst' | 'markdown'>('latex');
  const [engines, setEngines] = useState<Engines | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const loadEngines = () => getEngines().then(setEngines).catch((err) => setError(errorText(err)));
  useEffect(() => {
    loadEngines();
  }, []);
  const install = async (version: string) => {
    setBusy('typst:' + version);
    setError('');
    try {
      setEngines((await installTypst(version)).engines);
      window.dispatchEvent(new Event(ENGINES_CHANGED));
      toast('Installed Typst ' + version + '.', { tone: 'success' });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy('');
    }
  };
  const remove = async (version: string) => {
    const isDefault = version === defaults.typstVersion;
    const builtIn = engines?.typst.builtIn ? 'the built-in Typst ' + engines.typst.builtIn : 'the built-in Typst';
    const message = (isDefault ? 'It’s the default version, so projects that don’t pin their own will use ' + builtIn + '. ' : '')
      + 'A project that pins this version will ask for it again the next time it compiles.';
    if (!(await confirmDialog({ title: 'Remove Typst ' + version + '?', message, confirmLabel: 'Remove' }))) return;
    setBusy('typst:' + version);
    setError('');
    try {
      setEngines((await removeTypst(version)).engines);
      // Default version would otherwise name a version this computer no longer has
      if (loadSettings().compileDefaults.typstVersion === version) update({ compileDefaults: { ...loadSettings().compileDefaults, typstVersion: '' } });
      window.dispatchEvent(new Event(ENGINES_CHANGED));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy('');
    }
  };
  const downloadPandoc = async () => {
    setBusy('pandoc');
    setError('');
    try {
      setEngines((await installPandoc()).engines);
      window.dispatchEvent(new Event(ENGINES_CHANGED));
      toast('Downloaded pandoc.', { tone: 'success' });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy('');
    }
  };
  const changeBiber = async () => {
    const remove = Boolean(engines?.biber.installed);
    if (remove && !(await confirmDialog({ title: 'Remove Biber?', message: 'Documents that use biblatex with Biber won’t compile with the built-in Tectonic until it’s downloaded again.', confirmLabel: 'Remove' }))) return;
    setBusy('biber');
    setError('');
    try {
      setEngines((await (remove ? removeBiber() : installBiber())).engines);
      window.dispatchEvent(new Event(ENGINES_CHANGED));
      if (!remove) toast('Downloaded Biber.', { tone: 'success' });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy('');
    }
  };
  const pandoc = engines?.pandoc.found ?? null;
  const pandocOld = !!pandoc?.version && engines != null && !versionAtLeast(pandoc.version, engines.pandoc.minimum.latex);

  return (
    <>
      <Tabs value={tab} onChange={setTab} items={[{ value: 'latex', label: 'LaTeX' }, { value: 'typst', label: 'Typst' }, { value: 'markdown', label: 'Markdown' }]} />
      {error && <div className="field-hint error">{error}</div>}
      {tab === 'latex' && (
        <>
      <div className="field-hint section-hint">
        Every project compiles with these until you change its compiler, auto compile, bibliography tool or draft mode from the Compile button’s menu. Error handling and the syntax check apply to every project. They stay on this computer.
      </div>
      <div className="field">
        <label id="settings-engine">Compiler</label>
        <Select
          labelId="settings-engine"
          value={defaults.engine}
          options={COMPILE_ENGINES.map(([value, label]) => [value, value === 'auto' ? 'Auto (recommended)' : label])}
          onChange={(value) => set({ engine: value as CompileEngine })}
        />
        <div className="field-hint">
          Auto reads a <code>% !TEX program</code> comment, uses XeLaTeX when the document needs Unicode fonts, and pdfLaTeX otherwise.
          When no TeX is installed, Auto uses the built-in Tectonic, which downloads each package the first time a document needs it.
        </div>
      </div>
      <div className="field">
        <label id="settings-autoCompile">Auto compile</label>
        <Select
          labelId="settings-autoCompile"
          value={String(defaults.autoCompile)}
          options={Array.from({ length: 11 }, (_, n): [string, string] => [String(n), autoCompileLabel(n)])}
          onChange={(value) => set({ autoCompile: Number(value) })}
        />
        <div className="field-hint">Compiles the document showing once you stop typing for that long. A newer compile takes the place of one that’s out of date. The Compile button’s menu turns it on or off for each project, with this pause.</div>
      </div>
      <div className="field">
        <label id="settings-haltOnError">Compile error handling</label>
        <Select
          labelId="settings-haltOnError"
          value={String(defaults.haltOnError)}
          options={ERROR_HANDLING.map(([value, label]): [string, string] => [String(value), label])}
          onChange={(value) => set({ haltOnError: value === 'true' })}
        />
        <div className="field-hint">Stop on first error ends the compile there, so the log points at it. Otherwise TeX carries on and makes what PDF it can.</div>
      </div>
      <div className="field">
        <label id="settings-bibTool">Bibliography tool</label>
        <Select labelId="settings-bibTool" value={defaults.bibTool} options={BIB_TOOLS} onChange={(value) => set({ bibTool: value as BibTool })} />
        <div className="field-hint">
          Auto reads a <code>% !BIB program</code> comment, and otherwise runs the tool the document’s bibliography package needs.
        </div>
      </div>
      <label className="checkbox-row">
        <input type="checkbox" role="switch" checked={defaults.draft} onChange={(e) => set({ draft: e.target.checked })} />
        <span>
          Fast draft mode
          <span className="field-hint">One pass with images drawn as boxes, for quick previews. Numbers and references can lag behind until a full compile.</span>
        </span>
      </label>
      <label className="checkbox-row">
        <input type="checkbox" role="switch" checked={defaults.syntaxCheck} onChange={(e) => set({ syntaxCheck: e.target.checked })} />
        <span>
          Syntax check before compiling
          <span className="field-hint">
            With TexLab, a compile you start first looks for unbalanced braces and mismatched environments, and asks before going on. Undefined references and citations never stop it.
          </span>
        </span>
      </label>

      <h3 className="form-section-title">Show live output while compiling</h3>
      <div className="field-hint section-hint">
        The engine’s output takes the PDF’s place as it comes, with a line saying what it’s doing, and the PDF comes back when the compile ends. Typst compiles too quickly to need it.
      </div>
      {LIVE_OUTPUT_ENGINES.map(([engine, label]) => (
        <label key={engine} className="checkbox-row">
          <input
            type="checkbox"
            role="switch"
            checked={settings.liveOutput[engine]}
            onChange={(e) => update({ liveOutput: { ...settings.liveOutput, [engine]: e.target.checked } })}
          />
          <span>
            {label}
            {engine === 'tectonic' && <span className="field-hint">Shows each package it downloads, which can take minutes on a first compile.</span>}
            {engine === 'markdown' && <span className="field-hint">The LaTeX step of a Markdown document, whichever LaTeX engine it uses.</span>}
          </span>
        </label>
      ))}

      <h3 className="form-section-title">TeX installation</h3>
      <div className="field">
        <label id="settings-texFolder">TeX folder</label>
        <div className="path-row" role="group" aria-labelledby="settings-texFolder">
          <Icon name="folder" />
          <span className="path-text" title={settings.texFolder}>
            {settings.texFolder || 'None: the TeX on your PATH'}
          </span>
          <button
            className="btn small"
            onClick={async () => {
              const picked = await pickFolder({ title: 'Choose the folder with the TeX programs', defaultPath: settings.texFolder });
              if (picked) update({ texFolder: picked });
            }}
          >
            Change…
          </button>
          <button className="btn small" disabled={!settings.texFolder} onClick={() => update({ texFolder: '' })}>
            Reset
          </button>
        </div>
        <div className="field-hint">
          For a second TeX installation, tried before the one on your PATH, e.g.{' '}
          <code>{IS_WINDOWS ? 'C:\\texlive\\2026\\bin\\windows' : '/usr/local/texlive/2026/bin/universal-darwin'}</code>.
        </div>
      </div>
      {engines?.biber.size != null && (
        <div className="field">
          <label>Biber for Tectonic</label>
          <div className="field-hint">
            {engines.biber.installed ? `Biber ${engines.biber.installed}, downloaded by Spectrum. ` : ''}
            The built-in Tectonic runs it for a bibliography that uses biblatex with Biber. Its biblatex needs this version, so another Biber on your computer won’t do. TeX Live and MiKTeX use their own.
          </div>
          <button className="btn" disabled={busy === 'biber'} onClick={changeBiber}>
            {busy === 'biber'
              ? engines.biber.installed ? 'Removing…' : 'Downloading…'
              : engines.biber.installed ? 'Remove Biber' : `Download Biber ${engines.biber.downloadable} (${sizeLabel(engines.biber.size)})`}
          </button>
        </div>
      )}
      <label className="checkbox-row">
        <input type="checkbox" role="switch" checked={settings.openLogsOnFail} onChange={(e) => update({ openLogsOnFail: e.target.checked })} />
        <span>
          Open Logs when a compile fails
          <span className="field-hint">Tools › Logs opens in the PDF’s place. Auto compile leaves it closed.</span>
        </span>
      </label>
        </>
      )}

      {tab === 'typst' && (
        <>
          <div className="field-hint section-hint">
            Typst is built into Spectrum. Older versions install here, and a project pins one from the Compile button’s menu.
          </div>
          {!engines ? (
            <div className="field-hint">Reading the engines…</div>
          ) : (
            <>
              <div className="field">
                <label>Built in</label>
                <div className="field-hint">
                  {engines.typst.builtIn ? `Typst ${engines.typst.builtIn}, built in.` : 'This copy of Spectrum has no built-in Typst.'}
                  {engines.typst.system && ` Also found: Typst ${engines.typst.system.version || 'an unknown version'} at ${engines.typst.system.path}.`}
                </div>
              </div>
              <h3 className="form-section-title">Versions</h3>
              {engines.typst.available.map((release) => {
                const installed = engines.typst.installed.includes(release.version);
                const working = busy === 'typst:' + release.version;
                return (
                  <div className="field" key={release.version}>
                    <div className="row spread">
                      <span>Typst {release.version}</span>
                      <span className="field-hint">{release.released} · {sizeLabel(release.size)}</span>
                      <button className="btn small" disabled={Boolean(busy)} onClick={() => (installed ? remove(release.version) : install(release.version))}>
                        {working && !installed ? 'Installing…' : installed ? 'Remove' : 'Install'}
                      </button>
                    </div>
                  </div>
                );
              })}
              <div className="field">
                <label id="settings-typstVersion">Default version</label>
                <Select
                  labelId="settings-typstVersion"
                  value={defaults.typstVersion}
                  options={[['', engines.typst.builtIn ? `Built in (${engines.typst.builtIn})` : 'Built in'], ...engines.typst.installed.map((version): [string, string] => [version, 'Typst ' + version])]}
                  onChange={(value) => set({ typstVersion: value })}
                />
                <div className="field-hint">A project that doesn’t pin its own version uses this one.</div>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'markdown' && (
        <>
          <div className="field-hint section-hint">
            Markdown compiles through pandoc, then LaTeX or Typst. Spectrum uses a pandoc on your computer or one you download here.
          </div>
          {!engines ? (
            <div className="field-hint">Reading the engines…</div>
          ) : (
            <>
              <div className="field">
                <label>pandoc</label>
                <div className="field-hint">
                  {pandoc
                    ? `pandoc ${pandoc.version || 'with an unknown version'}, ${pandoc.fromDownload ? 'downloaded by Spectrum' : 'at ' + pandoc.path}.`
                    : 'No pandoc was found on this computer.'}
                  {pandocOld && ` This one is older than pandoc ${engines.pandoc.minimum.typst}, which Typst output needs.`}
                </div>
                {(!pandoc || pandocOld) && (
                  <button className="btn" disabled={busy === 'pandoc'} onClick={downloadPandoc}>
                    {busy === 'pandoc' ? 'Downloading…' : `Download pandoc ${engines.pandoc.downloadable} (about 42 MB)`}
                  </button>
                )}
              </div>
              <div className="field">
                <label id="settings-markdownEngine">PDF engine</label>
                <Select
                  labelId="settings-markdownEngine"
                  value={defaults.markdownEngine}
                  options={[['latex', 'LaTeX'], ['typst', 'Typst']]}
                  onChange={(value) => set({ markdownEngine: value as 'latex' | 'typst' })}
                />
                <div className="field-hint">
                  LaTeX writes LaTeX and compiles it with your TeX or the built-in Tectonic. Typst writes Typst, which needs pandoc {engines.pandoc.minimum.typst} or later.
                </div>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}

/** Settings › Checkpoints: the one after each compile, the notice when one can't be saved, and clearing out old ones. */
function CheckpointsPane() {
  const [settings, update] = useSettings();
  return (
    <>
      <div className="field-hint section-hint">Checkpoints stay on this computer, in each project’s hidden .spectrum folder. Tools › Checkpoints lists them.</div>
      <label className="checkbox-row">
        <input type="checkbox" role="switch" checked={settings.checkpointOnCompile} onChange={(e) => update({ checkpointOnCompile: e.target.checked })} />
        <span>
          Save a checkpoint when a compile succeeds
          <span className="field-hint">
            Only when the source changed since the last checkpoint, and at most one every 10 minutes: a newer one takes the place of the last automatic one. The
            ones you save and the “Before …” ones are never replaced.
          </span>
        </span>
      </label>
      <label className="checkbox-row">
        <input type="checkbox" role="switch" checked={settings.checkpointNotice} onChange={(e) => update({ checkpointNotice: e.target.checked })} />
        <span>
          Warn me when a checkpoint fails to save
          <span className="field-hint">Says when saving fails, or when a file was too large or unreadable to keep, rather than failing quietly.</span>
        </span>
      </label>
      <h3 className="form-section-title">Clearing out</h3>
      <div>
        <CheckpointCleanup projects={async () => (await listProjects()).projects.filter((p) => !p.missing).map((p) => p.id)} />
      </div>
      <div className="field-hint">In every project on this computer. Tools › Checkpoints does the same for one project.</div>
    </>
  );
}

/** The diagram composer: mixing symbol sets, and the conventions a new drawing starts with. */
function ComposerPane() {
  const [settings, update] = useSettings();
  return (
    <>
      <div className="field-hint section-hint">These follow you to your other computers when settings sync is on. A drawing keeps the conventions it was made with; change one in the drawing’s Style menu.</div>
      <label className="checkbox-row">
        <input type="checkbox" role="switch" checked={settings.composerMixSets} onChange={(e) => update({ composerMixSets: e.target.checked })} />
        <span>
          Symbols from other packages
          <span className="field-hint">
            Adds a Symbol sets… button below a drawing’s symbols, for adding another package’s symbols to it, such as mechanical supports in a circuit. A
            diagram’s own symbols are always there.
          </span>
        </span>
      </label>
      <div className="field">
        <label id="settings-composerMoments">Bending moment diagrams</label>
        <Select
          labelId="settings-composerMoments"
          value={settings.composerMoments}
          options={[
            ['tension', 'Tension side (sagging below)'],
            ['positive', 'Positive up']
          ]}
          onChange={(value) => update({ composerMoments: value as AppSettings['composerMoments'] })}
        />
      </div>
      <div className="field">
        <label id="settings-composerMohrShear">Mohr’s circle shear axis</label>
        <Select
          labelId="settings-composerMohrShear"
          value={settings.composerMohrShear}
          options={[
            ['down', 'τ positive downward'],
            ['clockwise-above', 'Clockwise shear plotted above'],
            ['up', 'τ positive upward']
          ]}
          onChange={(value) => update({ composerMohrShear: value as AppSettings['composerMohrShear'] })}
        />
        <div className="field-hint">With τ positive downward, 2θ on the circle turns the same way as θ on the element.</div>
      </div>
      <div className="field">
        <label>Structure diagrams</label>
        <div className="field-hint">Which force diagrams a new structure draws, and their fills: any xcolor name or mix, such as blue!15.</div>
        <DiagramFields looks={settings.composerDiagrams} onChange={(composerDiagrams) => update({ composerDiagrams })} />
      </div>
      <label className="checkbox-row">
        <input type="checkbox" role="switch" checked={settings.composerSiUnits} onChange={(e) => update({ composerSiUnits: e.target.checked })} />
        <span>
          Write units with siunitx
          <span className="field-hint">
            A value such as 10 kN is written as {'\\qty{10}{\\kilo\\newton}'} and a unit alone as {'\\unit{\\kilo\\newton\\metre}'}, and Insert adds siunitx to the
            document. Not in Typst or Mermaid drawings.
          </span>
        </span>
      </label>
    </>
  );
}

/** What checks a language's spelling, and whether its dictionary is here. */
function spellingLabel(info: LanguageInfo | undefined) {
  if (!info) return 'No spelling dictionary';
  switch (info.state) {
    case 'bundled': return 'Spelling: built in';
    case 'downloaded': return 'Spelling: downloaded';
    case 'downloading': return 'Spelling: downloading…';
    case 'failed': return 'Spelling: download failed';
    case 'available': return 'Spelling: not downloaded';
    default: return info.tag === 'zh-TW' ? 'Marks Simplified characters' : 'No spelling dictionary';
  }
}

/** What checks a language's grammar, given the English choice and LanguageTool's state. */
function grammarLabel(info: LanguageInfo | undefined, englishGrammar: AppSettings['englishGrammar'], lt: LanguageToolStatus | null) {
  const ready = lt?.mode === 'local' && lt.installed;
  if (info?.harper && (englishGrammar === 'harper' || !ready)) return 'Grammar: Harper';
  if (info?.languageTool) return ready ? 'Grammar: LanguageTool' : 'Grammar: needs LanguageTool';
  return 'No grammar checker';
}

/** Spelling and grammar: the languages listed (the user's or the project's own), the checkers, LanguageTool and the word list. */
function LanguagePane({ projectId }: { projectId?: string }) {
  const [settings, update] = useSettings();
  const [status, setStatus] = useState<CheckerStatus | null>(null);
  const [grammar, setGrammar] = useState<CheckerStatus | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [words, setWords] = useState<string[] | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [catalogue, setCatalogue] = useState<LanguageInfo[] | null>(null);
  const [lt, setLt] = useState<LanguageToolStatus | null>(null);
  const [scope, setScope] = useState<'all' | 'project'>('all');
  // the project's own list; null while it uses the user's, undefined until read
  const [projectList, setProjectList] = useState<string[] | null | undefined>(undefined);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    setStatus(null);
    setGrammar(null);
    const load = (name: string, get: () => Promise<CheckerStatus>, set: (value: CheckerStatus) => void) => {
      get().catch((err) => ({ available: false, engine: name, version: null, error: errorText(err) })).then((value) => { if (active) set(value); });
    };
    load('Hunspell', spellStatus, setStatus);
    load('Harper', grammarStatus, setGrammar);
    return () => { active = false; };
  }, [refresh]);

  const loadCatalogue = () => listLanguages().then((res) => setCatalogue(res.languages), (err) => setError(errorText(err)));
  useEffect(() => {
    spellWords().then((lists) => setWords(lists.global)).catch(() => setWords([]));
    void loadCatalogue();
    languageToolStatus().then(setLt, () => undefined);
  }, []);
  useEffect(() => {
    if (!projectId) return;
    getProjectSettings(projectId).then((res) => {
      setProjectList(res.settings.language?.languages ?? null);
      // a project with its own list shows that one first
      if (res.settings.language?.languages) setScope('project');
    }, () => setProjectList(null));
  }, [projectId]);
  // LanguageTool's download is followed while it runs
  useEffect(() => {
    if (!lt?.downloading) return;
    const timer = window.setTimeout(() => languageToolStatus().then(setLt, () => undefined), 1000);
    return () => window.clearTimeout(timer);
  }, [lt]);

  const change = (word: string, remove = false) => {
    setError('');
    changeSpellWord({ word, scope: 'global', remove })
      .then((lists) => {
        setWords(lists.global);
        if (!remove) setDraft('');
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  };

  const inProject = !!projectId && scope === 'project';
  const ownList = inProject && Array.isArray(projectList);
  const list = ownList ? projectList : settings.languages;
  const info = (tag: string) => catalogue?.find((entry) => entry.tag === tag);

  const saveProject = (next: string[] | null) =>
    updateProjectSettings(projectId!, { language: { languages: next } })
      .then((res) => {
        setProjectList(res.settings.language?.languages ?? null);
        window.dispatchEvent(new Event(LANGUAGES_CHANGED));
      })
      .catch((err) => setError(errorText(err)));
  const setList = (next: string[]) => (ownList ? void saveProject(next) : update({ languages: next }));
  /** what the last Move did, for screen readers */
  const [moved, setMoved] = useState('');
  const move = (index: number, by: number) => {
    const next = [...list];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    setList(next);
    const tag = list[index];
    setMoved(`Moved ${languageName(tag)} to position ${index + by + 1} of ${list.length}`);
    refocus.current = tag;
  };
  // a language moved to the top or bottom has that Move button disabled, so the focus goes to its other one
  const refocus = useRef<string | null>(null);
  useEffect(() => {
    const tag = refocus.current;
    refocus.current = null;
    const active = document.activeElement as HTMLButtonElement | null;
    if (!tag || (active && active !== document.body && !active.disabled)) return;
    document.querySelector<HTMLElement>(`[data-move="${tag}"]:not(:disabled)`)?.focus();
  }, [list]);

  const download = (tag: string) => {
    setCatalogue((prev) => prev && prev.map((entry) => (entry.tag === tag ? { ...entry, state: 'downloading' } : entry)));
    downloadDictionary(tag)
      .catch((err) => toast(errorText(err), { tone: 'error' }))
      .finally(() => void loadCatalogue());
  };

  // dictionaries on this computer that neither the user's list nor this project's uses
  const keep = new Set([...settings.languages, ...(projectList || [])]);
  const unused = (catalogue || []).filter((entry) => entry.state === 'downloaded' && !keep.has(entry.tag));
  const unusedBytes = unused.reduce((sum, entry) => sum + (entry.bytes || 0), 0);
  const prune = () => pruneDictionaries([...keep]).then(() => loadCatalogue(), (err) => setError(errorText(err)));

  const query = search.trim().toLowerCase();
  const choices = (catalogue || [])
    .filter((entry) => !list.includes(entry.tag))
    .map((entry) => ({ ...entry, name: languageName(entry.tag) }))
    .filter((entry) => !query || entry.name.toLowerCase().includes(query) || entry.tag.toLowerCase().startsWith(query))
    .sort((a, b) => a.name.localeCompare(b.name, 'en-AU'));

  const ltReady = lt?.mode === 'local' && lt.installed;
  const mb = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`;

  return (
    <>
      <h3 className="form-section-title">Languages</h3>
      <div className="field-hint section-hint">
        Spectrum checks each paragraph in one of these languages, and only these. It works out which one from the text. When a paragraph could be more than one, it uses the one higher in the list.
      </div>
      {projectId && (
        <Segmented label="The list for" value={scope} options={SCOPES} onChange={setScope} />
      )}
      {inProject && !ownList ? (
        <div className="path-row">
          <span className="field-hint">This project uses your list.</span>
          <button className="btn small" disabled={projectList === undefined} onClick={() => void saveProject(settings.languages)}>Give this project its own list</button>
        </div>
      ) : (
        <>
          <div className="kv-list language-list">
            {list.map((tag, index) => {
              const entry = info(tag);
              return (
                <div key={tag} className="kv-row">
                  <span className="grow">
                    {languageName(tag)}
                    <span className="field-hint">
                      {' '}{spellingLabel(entry)} · {grammarLabel(entry, settings.englishGrammar, lt)}
                    </span>
                  </span>
                  {entry && (entry.state === 'available' || entry.state === 'failed') && (
                    <button className="btn small" title={entry.error} onClick={() => download(tag)}>
                      {entry.state === 'failed' ? 'Try again' : `Download (${sizeLabel(entry.bytes || 0)}, ${entry.licence})`}
                    </button>
                  )}
                  <button className="icon-btn small" title="Move up" aria-label={`Move ${languageName(tag)} up`} data-move={tag} disabled={index === 0} onClick={() => move(index, -1)}>
                    <Icon name="chevron.up" />
                  </button>
                  <button className="icon-btn small" title="Move down" aria-label={`Move ${languageName(tag)} down`} data-move={tag} disabled={index === list.length - 1} onClick={() => move(index, 1)}>
                    <Icon name="chevron.down" />
                  </button>
                  <button className="icon-btn small" title={`Remove ${languageName(tag)}`} aria-label={`Remove ${languageName(tag)}`} disabled={list.length === 1} onClick={() => setList(list.filter((t) => t !== tag))}>
                    <Icon name="xmark" />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="sr-only" role="status">
            {moved}
          </div>
          <div className="path-row">
            <button className="btn small" disabled={!catalogue || list.length >= 20} onClick={() => setAdding((value) => !value)}>
              <Icon name="plus" /> Add a language…
            </button>
            {ownList && <button className="btn small ghost" onClick={() => void saveProject(null)}>Use my list</button>}
          </div>
          {adding && (
            <div className="language-picker">
              <label className="search-field">
                <Icon name="magnifyingglass" />
                <input value={search} placeholder="Search" aria-label="Search languages" spellCheck={false} autoFocus onChange={(e) => setSearch(e.target.value)} />
              </label>
              <div className="kv-list" style={{ maxHeight: 240, overflowY: 'auto' }}>
                {choices.map((entry) => (
                  <button key={entry.tag} className="kv-row" onClick={() => { setList([...list, entry.tag]); setAdding(false); setSearch(''); }}>
                    <span className="grow">{entry.name}</span>
                    <span className="field-hint">{spellingLabel(entry).replace('Spelling: not downloaded', `Spelling: ${sizeLabel(entry.bytes || 0)} download`)}</span>
                  </button>
                ))}
                {!choices.length && <div className="kv-row"><span>No language matches.</span></div>}
              </div>
            </div>
          )}
          {inProject && <div className="field-hint">This project’s list travels with the project and replaces yours for it.</div>}
        </>
      )}
      <div className="field-hint">A language’s dictionary downloads from GitHub when you ask. Most are under 6 MB.</div>
      {unusedBytes > 0 && (
        <div className="path-row">
          <button className="btn small" onClick={() => void prune()}>Remove unused dictionaries ({sizeLabel(unusedBytes)})</button>
        </div>
      )}

      <h3 className="form-section-title">Spelling</h3>
      <label className="checkbox-row">
        <input type="checkbox" role="switch" checked={settings.spellCheck} onChange={(e) => update({ spellCheck: e.target.checked })} />
        <span>
          Check spelling as you type
          <span className="field-hint">Misspelt words in .tex, .typ, .md and .txt files get a red underline. Right-click one for suggestions.</span>
        </span>
      </label>
      <CheckerDetails name="Hunspell" status={status} />
      {(catalogue || []).filter((entry) => entry.state === 'downloaded').map((entry) => (
        <div key={entry.tag} className="field-hint">{languageName(entry.tag)}: {entry.source}, {entry.licence}</div>
      ))}

      <h3 className="form-section-title">Grammar</h3>
      <div className="field">
        <label id="settings-englishGrammar">English grammar</label>
        <Select
          labelId="settings-englishGrammar"
          value={settings.englishGrammar}
          options={[
            ['harper', 'Harper (on this computer)'],
            ['languagetool', 'LanguageTool']
          ]}
          onChange={(value) => update({ englishGrammar: value as AppSettings['englishGrammar'] })}
        />
        <div className="field-hint">Harper checks English only. Other languages use LanguageTool.</div>
      </div>
      <label className="checkbox-row">
        <input type="checkbox" role="switch" checked={settings.grammarStyle} onChange={(e) => update({ grammarStyle: e.target.checked })} />
        <span>
          Include style suggestions
          <span className="field-hint">Long sentences, wordiness, redundancy and readability, as well as grammar.</span>
        </span>
      </label>
      <div className="field">
        <label id="settings-oxfordComma">Serial (Oxford) comma</label>
        <Select
          labelId="settings-oxfordComma"
          value={settings.oxfordComma}
          options={[
            ['avoid', 'Flag it (Australian Government style)'],
            ['require', 'Require it'],
            ['off', 'Don’t check']
          ]}
          onChange={(value) => update({ oxfordComma: value as AppSettings['oxfordComma'] })}
        />
        <div className="field-hint">Harper only. Check grammar from the button beside the assistant, or with {formatShortcut(shortcutKey(settings.shortcuts, 'grammar')) || 'its shortcut'}.</div>
      </div>
      <CheckerDetails name="Harper" status={grammar} />

      <h3 className="form-section-title">LanguageTool</h3>
      <div className="field">
        <label id="settings-languageTool">Connection</label>
        <Select
          labelId="settings-languageTool"
          value={lt?.mode || 'off'}
          options={[
            ['off', 'Off'],
            ['local', 'On this computer']
          ]}
          onChange={(value) => setLanguageToolMode(value as 'off' | 'local').then(setLt, (err) => setError(errorText(err)))}
        />
        <div className="field-hint">
          {lt?.mode !== 'local'
            ? 'Without LanguageTool, Spectrum checks grammar in English only.'
            : `Spectrum downloads LanguageTool ${lt.version} (${mb(lt.bytes - lt.javaBytes)}) and a Java runtime (${mb(lt.javaBytes)}) into its data folder when you ask, and runs them only while you check grammar. Nothing you check leaves this computer.`}
        </div>
      </div>
      {lt?.mode === 'local' && (
        <div className="field-hint section-hint" aria-live="polite">
          {lt.downloading ? (
            <div>Downloading LanguageTool: {Math.round(lt.downloading.done / 1_000_000)} of {mb(lt.downloading.total)}</div>
          ) : lt.installed ? (
            <div className="path-row">
              <span>LanguageTool {lt.version} · Java {lt.java?.replace(/\+.*$/, '')} · {lt.running ? 'Running' : 'Starts with the first check'}</span>
              <button className="btn small ghost" onClick={() => removeLanguageTool().then(setLt, (err) => setError(errorText(err)))}>Remove</button>
            </div>
          ) : (
            <div className="path-row">
              <span>LanguageTool is not downloaded yet.</span>
              <button className="btn small" onClick={() => installLanguageTool().then(setLt, (err) => setError(errorText(err)))}>Download</button>
            </div>
          )}
          {lt.error && <div className="error">{lt.error}</div>}
          {lt.stopped && ltReady && (
            <div className="error">
              {lt.stopped.message}
              <details>
                <summary>Diagnostic details</summary>
                <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{lt.stopped.details}</pre>
              </details>
            </div>
          )}
        </div>
      )}

      <div className="field-hint section-hint">Every checker runs on this computer. Engine and dictionary updates come with Spectrum updates.</div>
      <div className="path-row">
        <button className="btn small" disabled={!status || !grammar} onClick={() => setRefresh((value) => value + 1)}>Refresh diagnostics</button>
        <button className="btn small" disabled={!status || !grammar} onClick={async () => {
          try {
            await navigator.clipboard.writeText(JSON.stringify({ spelling: status, grammar, languageTool: lt }, null, 2));
            toast('Copied checker diagnostics.');
          } catch { toast('Couldn’t copy diagnostics. You can select them under Diagnostic details.'); }
        }}>Copy diagnostics</button>
      </div>
      {error && <div className="field-hint error">{error}</div>}

      <h3 className="form-section-title">Your dictionary</h3>
      <div className="field-hint section-hint">Words added here are accepted in every project. Words added to a project’s dictionary from the right-click menu stay with that project.</div>
      <form
        className="path-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) change(draft.trim());
        }}
      >
        <input className="input grow" aria-label="Word to add" placeholder="Add a word" value={draft} spellCheck={false} onChange={(e) => setDraft(e.target.value)} />
        <button className="btn small" type="submit" disabled={!draft.trim()}>
          Add
        </button>
      </form>
      {words && (
        <div className="kv-list">
          {words.length ? (
            words.map((word) => (
              <div key={word} className="kv-row">
                <span>{word}</span>
                <button className="icon-btn small" title={`Remove “${word}”`} aria-label={`Remove ${word}`} onClick={() => change(word, true)}>
                  <Icon name="xmark" />
                </button>
              </div>
            ))
          ) : (
            <div className="kv-row">
              <span>No words yet.</span>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function CheckerDetails({ name, status }: { name: string; status: CheckerStatus | null }) {
  return <div className="field-hint section-hint" aria-live="polite">
    {!status ? `Checking ${name}…` : <>
      <div>{name} {status.version || 'version unavailable'} · {!status.available ? 'Unavailable' : status.started === false ? 'Starts with the first check' : 'Ready'}{status.languages ? ' · Australian, American, British, Canadian and Indian English' : ''}</div>
      {/* versions only for files that match their build information */}
      {status.diagnostics?.assets.integrity === 'verified' && status.diagnostics.assets.manifest?.binding && <div>Spectrum’s Hunspell binding {status.diagnostics.assets.manifest.binding.version}</div>}
      {status.error && <div className="error">{status.error}</div>}
      {status.diagnostics?.assets.warnings.map((warning) => <div className="error" key={warning}>{warning}</div>)}
      {status.diagnostics?.dictionaries?.integrity === 'verified' && status.diagnostics.dictionaries.manifest?.components?.map((item) => <div key={item.name}>{[item.name, item.version].filter(Boolean).join(' ')}</div>)}
      {status.diagnostics?.dictionaries?.warnings.map((warning) => <div className="error" key={warning}>{warning}</div>)}
      <details>
        <summary>Diagnostic details</summary>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(status, null, 2)}</pre>
      </details>
    </>}
  </div>;
}

// what the agent routes take: a persona's name, and instructions (a persona's or the default ones)
const PERSONA_NAME_MAX = 200;
const INSTRUCTIONS_MAX = 20000;

/** Asks before unsaved edits to name are dropped; true to let them go. */
const discardDialog = (name: string) =>
  confirmDialog({ title: `Discard your changes to “${name}”?`, confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true });

/**
 * Tells the sheet, while this pane shows, which skill or persona has unsaved edits ('' for none): after every render,
 * so a guard a Discard cleared while the pane stayed is armed again by the next keystroke.
 */
const useUnsaved = (report: (name: string) => void, name: string) => {
  useEffect(() => report(name));
  useEffect(() => () => report(''), []);
};

/** A count once text nears its limit. */
function CharactersLeft({ text, max }: { text: string; max: number }) {
  return text.length > max * 0.9 ? <div className="field-hint">{`${text.length.toLocaleString('en-AU')} of ${max.toLocaleString('en-AU')} characters`}</div> : null;
}

/** Settings › Personas: the default instructions, and the personas picked in chat that take their place. */
function PersonasPane({ onUnsaved }: { onUnsaved: (name: string) => void }) {
  const [settings, update] = useSettings();
  // a copy of the one being edited or created, kept only with Save
  const [editing, setEditing] = useState<Persona | null>(null);
  const creating = !!editing && !settings.personas.some((p) => p.id === editing.id);
  useUnsaved(onUnsaved, unsavedPersona(editing, settings.personas));

  const save = () => {
    if (!editing) return;
    const next = { ...editing, name: editing.name.trim() };
    const personas = loadSettings().personas;
    update({ personas: creating ? [...personas, next] : personas.map((p) => (p.id === next.id ? next : p)) });
    setEditing(null);
  };
  const remove = async (persona: Persona) => {
    const ok = await confirmDialog({
      title: `Delete “${persona.name}”?`,
      message: 'Chats that use it go back to your default instructions.',
      confirmLabel: 'Delete',
      destructive: true
    });
    if (ok) update({ personas: loadSettings().personas.filter((p) => p.id !== persona.id) });
  };
  const reset = async () => {
    const ok = await confirmDialog({
      title: 'Reset the starter personas?',
      message: 'Research writer, Document editor, Critical reviewer and Draw a figure go back to how Spectrum wrote them. Your own personas stay as they are.',
      confirmLabel: 'Reset'
    });
    if (ok) update({ personas: resetPersonas(loadSettings().personas) });
  };

  const form = editing && (
    <div key="persona-form" className="persona-form">
      <div className="field">
        <label htmlFor="persona-name">Name</label>
        <input id="persona-name" className="input" maxLength={PERSONA_NAME_MAX} value={editing.name} autoFocus onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
      </div>
      <div className="field">
        <label id="persona-colour">Colour</label>
        <div className="accent-picker" role="radiogroup" aria-labelledby="persona-colour" onKeyDown={radioKeys}>
          {TAG_COLOUR_NAMES.map((colour, i) => (
            <button
              key={colour}
              className="accent-swatch"
              style={{ '--swatch': TAG_COLOURS[colour][1] } as CSSProperties}
              role="radio"
              aria-checked={editing.colour === colour}
              tabIndex={radioTab(editing.colour === colour, i, TAG_COLOUR_NAMES.includes(editing.colour))}
              aria-label={TAG_COLOURS[colour][0]}
              title={TAG_COLOURS[colour][0]}
              onClick={() => setEditing({ ...editing, colour })}
            />
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor="persona-prompt">Instructions</label>
        <textarea id="persona-prompt" className="input" rows={7} maxLength={INSTRUCTIONS_MAX} value={editing.prompt} onChange={(e) => setEditing({ ...editing, prompt: e.target.value })} />
        <div className="field-hint">How the assistant should work and write while this persona is chosen. They take the place of your default instructions.</div>
        <CharactersLeft text={editing.prompt} max={INSTRUCTIONS_MAX} />
      </div>
      <div className="row">
        <span className="grow" />
        <button className="btn small" onClick={() => setEditing(null)}>Cancel</button>
        <button className="btn small primary" disabled={!editing.name.trim() || !editing.prompt.trim()} onClick={save}>
          {creating ? 'Create' : 'Save'}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="field-hint section-hint">
        Pick a persona in the assistant or the agent workspace to give a chat instructions for a task. They follow you to your other computers with your settings.
      </div>
      <div className="field">
        <label htmlFor="settings-defaultInstructions">Default instructions</label>
        <textarea
          id="settings-defaultInstructions"
          className="input"
          rows={4}
          maxLength={INSTRUCTIONS_MAX}
          value={settings.defaultInstructions}
          placeholder="For example: keep answers short, and ask before restructuring a section."
          onChange={(e) => update({ defaultInstructions: e.target.value })}
        />
        <div className="field-hint">Used in every chat without a persona. Autocomplete never uses them.</div>
        <CharactersLeft text={settings.defaultInstructions} max={INSTRUCTIONS_MAX} />
      </div>

      <h3 className="form-section-title">Personas</h3>
      <div className="kv-list">
        {settings.personas.map((persona) =>
          editing?.id === persona.id ? (
            form
          ) : (
            <div key={persona.id} className="kv-row persona-row">
              <span className="tag-dot large" style={{ background: TAG_COLOURS[persona.colour][1] }} />
              <span className="persona-text">
                {persona.name}
                <span className="field-hint">{persona.prompt}</span>
              </span>
              <button className="icon-btn small" title="Edit" aria-label={`Edit ${persona.name}`} disabled={!!editing} onClick={() => setEditing(persona)}>
                <Icon name="pencil" />
              </button>
              <button className="icon-btn small" title="Delete" aria-label={`Delete ${persona.name}`} disabled={!!editing} onClick={() => remove(persona)}>
                <Icon name="trash" />
              </button>
            </div>
          )
        )}
        {creating && form}
        {!settings.personas.length && !creating && (
          <div className="kv-row">
            <span>No personas. Reset to defaults puts the starters back.</span>
          </div>
        )}
      </div>
      <div className="row">
        <button className="btn small" disabled={!!editing} onClick={() => setEditing({ id: crypto.randomUUID(), name: '', colour: 'blue', prompt: '' })}>
          <Icon name="plus" /> Create persona
        </button>
        <button className="btn small" disabled={!!editing} onClick={reset}>
          Reset to defaults
        </button>
      </div>
    </>
  );
}

/** Settings › Skills: every skill in its group with a switch for all projects or this one, your own skills' files, and sharing. */
function SkillsPane({ projectId, onUnsaved }: { projectId?: string; onUnsaved: (name: string) => void }) {
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  /** the switch just clicked, shown in its new place while the save runs */
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'all' | 'project'>('all');
  const [view, setView] = useState<'create' | Skill | null>(null);
  const inProject = !!projectId && scope === 'project';

  const load = () =>
    listSkills(projectId).then(
      (res) => {
        setSkills(res.skills);
        setError('');
      },
      (err) => setError(errorText(err))
    );
  useEffect(() => {
    load();
  }, [projectId]);

  /** Runs a change, then lists the skills again; false if it failed. */
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await work();
      await load();
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setBusy(false);
    }
  };
  /** on, off, or null to follow Settings again; read fresh so choices made on the other computer stay */
  const setForProject = (skill: Skill, on: boolean | null) =>
    run(async () => {
      const { settings } = await getProjectSettings(projectId!);
      await updateProjectSettings(projectId!, { skills: projectSkills(settings.skills, skill.id, on) });
    });
  // run never throws, so a failed save clears pending and the switch goes back to the saved state
  const toggle = async (skill: Skill, on: boolean) => {
    setPending({ [skill.id]: on });
    await (inProject ? setForProject(skill, on === skill.enabled ? null : on) : run(() => setSkillEnabled(skill.id, on)));
    setPending({});
  };
  const addFolder = async () => {
    const picked = await pickFolder({ title: 'Choose a skill’s folder, the one with its SKILL.md' });
    if (picked) run(() => importSkill(picked));
  };
  const remove = async (skill: Skill) => {
    const ok = await confirmDialog({
      title: `Delete “${skill.name}”?`,
      message: 'Spectrum deletes its folder and every file in it, and agents stop using it.',
      confirmLabel: 'Delete',
      destructive: true
    });
    if (ok) run(() => deleteSkill(skill.id));
  };

  if (view === 'create')
    return <CreateSkill busy={busy} error={error} onUnsaved={onUnsaved} onCancel={() => setView(null)} onCreate={async (skill) => (await run(() => createSkill(skill))) && setView(null)} />;
  if (view) return <SkillFiles skill={view} onUnsaved={onUnsaved} onBack={() => (setView(null), load())} />;

  const groups = skills ? groupSkills(skills, query) : [];
  return (
    <>
      <div className="field-hint section-hint">
        Instructions in the Agent Skills format: a folder with a SKILL.md. The assistant sees each skill’s name and description and reads the rest when it needs it,
        or straight away when you type /skill-id. Local agents get the ones switched on in their private home.
      </div>
      <div className="row skills-bar">
        <label className="search-field grow">
          <Icon name="magnifyingglass" />
          <input value={query} placeholder="Search" aria-label="Search skills" spellCheck={false} onChange={(e) => setQuery(e.target.value)} />
          {query && (
            <button className="search-clear" aria-label="Clear search" onClick={() => setQuery('')}>
              <Icon name="xmark.circle.fill" />
            </button>
          )}
        </label>
        {projectId && (
          <Segmented label="Switches apply to" value={scope} options={SCOPES} onChange={setScope} />
        )}
      </div>
      <div className="field-hint">
        {inProject
          ? 'Switches change this project alone. Its choices travel with the project.'
          : projectId
            ? 'Switches change every project that hasn’t made its own choice.'
            : 'Switches change every project. Open Settings from a project to change one project alone.'}
      </div>
      <div className="row">
        <button className="btn small" disabled={busy} onClick={() => setView('create')}>
          <Icon name="plus" /> Create skill
        </button>
        <button className="btn small" disabled={busy} onClick={addFolder}>
          <Icon name="folder.badge.plus" /> Add folder…
        </button>
      </div>
      {error && <div className="field-hint error">{error}</div>}
      {!skills && !error && (
        <div className="field-hint">
          <span className="spinner" /> Loading…
        </div>
      )}
      {skills && !groups.length && <div className="field-hint">{query ? 'No skills match.' : 'No skills yet.'}</div>}
      {groups.map(([group, list]) => (
        <div key={group} className="skill-group">
          <h3 className="form-section-title">{group}</h3>
          {list.map((skill) => (
            <div key={skill.id} className="skill-card">
              <div className="skill-card-head">
                <span className="skill-name">{skill.name}</span>
                {skill.project && <span className="badge accent">Changed for this project</span>}
                {skill.project && (
                  <button className="btn small" disabled={busy} onClick={() => setForProject(skill, null)}>
                    Reset
                  </button>
                )}
                <span className="grow" />
                <input
                  type="checkbox"
                  role="switch"
                  checked={pending[skill.id] ?? skillOn(skill, inProject)}
                  disabled={busy}
                  aria-label={`Use ${skill.name} ${inProject ? 'in this project' : 'in every project'}`}
                  onChange={(e) => toggle(skill, e.target.checked)}
                />
              </div>
              {skill.description && <div className="field-hint skill-description">{skill.description}</div>}
              <div className="skill-meta">
                {[skill.author, skill.licence, skill.version && `Version ${skill.version}`, `${skill.files} ${skill.files === 1 ? 'file' : 'files'}`].filter(Boolean).join(' · ')}
              </div>
              {skill.compatibility && <div className="skill-meta">Needs: {skill.compatibility}</div>}
              <div className="row">
                <button className="btn small" onClick={() => setView(skill)}>
                  {skill.source === 'own' ? 'Edit files' : 'Files'}
                </button>
                <button className="btn small" disabled={busy} onClick={() => run(() => duplicateSkill(skill.id))}>
                  Duplicate
                </button>
                {skill.source === 'own' && (
                  <button className="btn small" disabled={busy} onClick={() => remove(skill)}>
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
      <SkillSharing refresh={skills} />
    </>
  );
}

/** A new skill of your own: its name, the description the assistant decides by, and the instructions. */
function CreateSkill({
  busy,
  error,
  onUnsaved,
  onCancel,
  onCreate
}: {
  busy: boolean;
  error: string;
  onUnsaved: (name: string) => void;
  onCancel: () => void;
  onCreate: (skill: { id: string; name: string; description: string; body: string }) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');
  const id = skillId(name);
  useUnsaved(onUnsaved, name.trim() || description.trim() || body.trim() ? name.trim() || 'New skill' : '');
  return (
    <>
      <div className="row">
        <button className="btn small" onClick={onCancel}>
          <Icon name="chevron.left" /> Skills
        </button>
      </div>
      <h3 className="form-section-title">New skill</h3>
      <div className="field">
        <label htmlFor="skill-name">Name</label>
        <input id="skill-name" className="input" value={name} autoFocus placeholder="Lab style guide" onChange={(e) => setName(e.target.value)} />
        <div className="field-hint">{id ? `Saved as ${id}, and typed as /${id} in chat.` : 'Use letters or numbers: they become its folder’s name.'}</div>
      </div>
      <div className="field">
        <label htmlFor="skill-description">Description</label>
        <textarea id="skill-description" className="input" rows={3} maxLength={1024} value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="field-hint">What it does and when to use it. The assistant reads only this until it needs the skill, so name the tasks it’s for.</div>
      </div>
      <div className="field">
        <label htmlFor="skill-body">Instructions</label>
        <textarea id="skill-body" className="input mono" rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="field-hint">In Markdown, saved as the skill’s SKILL.md.</div>
      </div>
      {error && <div className="field-hint error">{error}</div>}
      <div className="row">
        <span className="grow" />
        <button className="btn small" onClick={onCancel}>Cancel</button>
        <button
          className="btn small primary"
          disabled={busy || !id || !description.trim() || !body.trim()}
          onClick={() => onCreate({ id, name: name.trim(), description: description.trim(), body })}
        >
          Create skill
        </button>
      </div>
    </>
  );
}

/** A skill's files, read-only for a built-in one; your own skill's are edited here. */
function SkillFiles({ skill, onUnsaved, onBack }: { skill: Skill; onUnsaved: (name: string) => void; onBack: () => void }) {
  const own = skill.source === 'own';
  const [files, setFiles] = useState<string[]>([]);
  const [path, setPath] = useState('SKILL.md');
  const [text, setText] = useState<string | null>(null);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const changed = text !== null && text !== saved;
  useUnsaved(onUnsaved, changed ? skill.name : '');

  useEffect(() => {
    listSkillFiles(skill.id).then((res) => setFiles(res.files.map((f) => f.path)), (err) => setError(errorText(err)));
  }, [skill.id]);
  // ponytail: every file reads as text, so a picture shows as garbage; a preview can come when skills carry images
  useEffect(() => {
    setText(null);
    readSkillFile(skill.id, path).then(
      (res) => {
        setText(res.content);
        setSaved(res.content);
        setError('');
      },
      (err) => setError(errorText(err))
    );
  }, [skill.id, path]);

  /** Leaves this file only once unsaved changes are let go. */
  const leave = async (then: () => void) => {
    if (changed && !(await discardDialog(path))) return;
    then();
  };
  const save = async () => {
    if (text === null) return;
    setSaving(true);
    try {
      await writeSkillFile(skill.id, path, text);
      setSaved(text);
      setError('');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="row skills-bar">
        <button className="btn small" onClick={() => leave(onBack)}>
          <Icon name="chevron.left" /> Skills
        </button>
        <span className="skill-name grow truncate">{skill.name}</span>
        {!own && <span className="badge">Built in: duplicate it to make changes</span>}
      </div>
      <div className="skill-files">
        <div className="skill-file-list" role="listbox" aria-label="Files">
          {(files.length ? files : ['SKILL.md']).map((file) => (
            <button key={file} className={`nav-row ${file === path ? 'active' : ''}`} role="option" aria-selected={file === path} onClick={() => file !== path && leave(() => setPath(file))}>
              <Icon name="doc.text" />
              <span className="truncate">{file}</span>
            </button>
          ))}
        </div>
        <textarea
          className="input mono skill-file-text"
          aria-label={path}
          value={text ?? ''}
          placeholder={text === null ? 'Loading…' : undefined}
          readOnly={!own || text === null}
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      {error && <div className="field-hint error">{error}</div>}
      {own && (
        <div className="row">
          <span className="grow" />
          <button className="btn small" disabled={!changed || saving} onClick={() => setText(saved)}>Revert</button>
          <button className="btn small primary" disabled={!changed || saving} onClick={save}>Save</button>
        </div>
      )}
    </>
  );
}

/**
 * The switch that links your skills where agents run outside Spectrum look for them, off by default. refresh: the skills
 * as last listed, whose changes (a switch, a new or deleted skill) add or remove links.
 */
function SkillSharing({ refresh }: { refresh: unknown }) {
  const [share, setShare] = useState<SkillShare | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getSkillSharing().then(setShare, (err) => setError(errorText(err)));
  }, [refresh]);
  const turn = async (enabled: boolean) => {
    setBusy(true);
    try {
      setShare(await setSkillSharing(enabled));
      setError('');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const linked = share?.targets.filter((t) => t.linked).length ?? 0;
  return (
    <>
      <h3 className="form-section-title">
        Share skills with other agents on this computer
        {share && <span className="badge">{linked} of {share.targets.length} linked</span>}
      </h3>
      <label className="checkbox-row">
        <input type="checkbox" role="switch" checked={!!share?.enabled} disabled={!share || busy} onChange={(e) => turn(e.target.checked)} />
        <span>
          Link your skills for agents you run yourself
          <span className="field-hint">
            Your own skills that are switched on, linked into the folders below where that agent’s folder already exists. Nothing already there is replaced. Agents
            started from Spectrum don’t need this.
          </span>
        </span>
      </label>
      {share?.targets.map((target) => (
        <div key={target.path} className="path-row">
          <Icon name="link" />
          <span className="path-text">
            <span className="path-label">{target.agent}</span>
            {tildify(target.path)}
          </span>
          <span className={`badge ${target.linked ? 'success' : ''}`}>{target.linked ? 'Linked' : target.exists ? 'Not linked' : 'Not on this computer'}</span>
        </div>
      ))}
      {error && <div className="field-hint error">{error}</div>}
    </>
  );
}
