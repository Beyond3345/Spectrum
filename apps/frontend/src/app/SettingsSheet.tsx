import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  changeSpellWord,
  configureLocalAgent,
  createSkill,
  deleteSkill,
  duplicateSkill,
  getProjectSettings,
  getSkillSharing,
  getSyncSettings,
  importLocalAgentLogin,
  importSkill,
  listLocalAgents,
  listProjects,
  listSkillFiles,
  listSkills,
  readSkillFile,
  setSkillEnabled,
  setSkillSharing,
  spellStatus,
  spellWords,
  systemCheck,
  updateProjectSettings,
  updateSyncSettings,
  writeSkillFile
} from '../api/client';
import type { BibTool, CheckerStatus, CloudMode, CompileEngine, LocalAgent, SearchProvider, Skill, SkillShare, SyncSettings, SystemCheck } from '../api/client';
import { COLOUR_ROLES, EDITOR_FONTS, EDITOR_THEMES, chosenColours, editorColours, highlightLines, themeFor, wellColour } from '../editor/editorThemes';
import type { EditorMode } from '../editor/editorThemes';
import { highlightColour } from '../editor/synctex';
import { CheckpointCleanup } from '../editor/tools/VersionsTab';
import { resetPersonas } from '../editor/personas';
import type { Persona } from '../editor/personas';
import { AGENTS_CHANGED, errorText } from '../editor/shared';
import { confirmDialog } from './Dialogs';
import Icon from './Icon';
import Select from './Select';
import Sheet from './Sheet';
import Tabs from './Tabs';
import { ParserFields } from './TransferPanel';
import { IS_DESKTOP, claimDefaultHandler, pickFolder } from './desktop';
import { toast } from './Toast';
import { IS_MAC, IS_WINDOWS, OS_NAME, tildify } from './platform';
import { ACCENTS, PDF_PAGES_DARK, PDF_PAGES_LIGHT, TAG_COLOURS, useDarkMode } from './appearance';
import { groupSkills, projectSkills, skillId, skillOn } from './skills';
import {
  BIB_TOOLS,
  COMPILE_ENGINES,
  ERROR_HANDLING,
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
  searchProviderPatch,
  SEARCH_PROVIDERS,
  TAG_COLOUR_NAMES,
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
  | 'language'
  | 'shortcuts'
  | 'projects'
  | 'models'
  | 'personas'
  | 'skills'
  | 'agents'
  | 'search'
  | 'transfer'
  | 'system';

const SECTIONS: [Section, string, string][] = [
  ['appearance', 'Appearance', 'circle.lefthalf.filled'],
  ['editor', 'Editor', 'text.cursor'],
  ['engines', 'Engines', 'hammer'],
  ['checkpoints', 'Checkpoints', 'clock.arrow.circlepath'],
  ['language', 'Spelling & grammar', 'textformat.abc.dottedunderline'],
  ['shortcuts', 'Shortcuts', 'keyboard'],
  ['projects', 'Projects', 'folder'],
  ['models', 'Models', 'sparkles'],
  ['personas', 'Personas', 'brain.head.profile'],
  ['skills', 'Skills', 'graduationcap'],
  ['agents', 'Agents', 'terminal'],
  ['search', 'Search', 'magnifyingglass'],
  ['transfer', 'Template transfer', 'arrow.triangle.2.circlepath'],
  ['system', 'System', 'stethoscope']
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

const SEP = IS_WINDOWS ? '\\' : '/';
/** p is root or inside it, in any letter case. */
const under = (p: string, root: string) => `${p.toLowerCase()}${SEP}`.startsWith(`${root.toLowerCase()}${SEP}`);

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
  const [check, setCheck] = useState<SystemCheck | null>(null);
  const [checkError, setCheckError] = useState('');
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
    <Sheet title="Settings" onClose={onClose} width={780} className="settings-sheet">
      <div className="settings-layout">
        <nav className="settings-nav">
          {SECTIONS.map(([value, label, icon]) => (
            <button key={value} className={`nav-row ${section === value ? 'active' : ''}`} onClick={() => setSection(value)}>
              <Icon name={icon} />
              <span>{label}</span>
            </button>
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
                <div className="accent-picker" role="radiogroup" aria-labelledby="settings-accent">
                  {ACCENTS.map(([value, label, colour]) => (
                    <button
                      key={value}
                      className={`accent-swatch ${value}`}
                      style={{ '--swatch': value === 'custom' ? settings.accentCustom : colour } as CSSProperties}
                      role="radio"
                      aria-checked={settings.accent === value}
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
                    <input type="checkbox" checked={settings.glass} onChange={(e) => update({ glass: e.target.checked })} />
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

          {section === 'language' && <LanguagePane />}

          {section === 'shortcuts' && <ShortcutsPane />}

          {section === 'personas' && <PersonasPane />}

          {section === 'skills' && <SkillsPane projectId={projectId} />}

          {section === 'agents' && <AgentsPane />}

          {section === 'projects' && (
            <>
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
                      // never in a cloud location, or holding one: every new project would be a cloud project there
                      const folders = (await getSyncSettings().catch(() => null))?.folders || [];
                      const inside = folders.find((f) => under(picked, f.path) || under(f.path, picked));
                      if (inside) toast(`That folder ${under(picked, inside.path) ? 'is in' : 'holds'} ${inside.label}, a cloud location. Choose a folder on this computer.`, { tone: 'error' });
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
              <CloudLocations />
              {IS_DESKTOP && (
                <>
                  <h3 className="form-section-title">Opening files</h3>
                  {IS_WINDOWS ? (
                    <div className="field-hint">
                      Windows leaves the choice to you: right-click a .tex or .bib file, choose Open with → Choose another app, pick Spectrum and select Always.
                    </div>
                  ) : (
                    <div className="field">
                      <div>
                        <button
                          className="btn small"
                          onClick={() =>
                            claimDefaultHandler().then(
                              () => toast('Spectrum now opens .tex and .bib files.', { tone: 'success' }),
                              (err) => toast(`Couldn’t make Spectrum the default: ${err}`, { tone: 'error' })
                            )
                          }
                        >
                          Make Spectrum the default for .tex and .bib files
                        </button>
                      </div>
                      <div className="field-hint">Spectrum did this when it first opened. Use it again if another app has taken them since. PDFs stay with your PDF viewer.</div>
                    </div>
                  )}
                </>
              )}
              <h3 className="form-section-title">Your other computers</h3>
              <label className="checkbox-row">
                <input type="checkbox" checked={settings.syncSettings} onChange={(e) => update({ syncSettings: e.target.checked })} />
                <span>
                  Use the same settings on each computer
                  <span className="field-hint">
                    Through your cloud locations: appearance, editor, spelling, shortcuts, personas and the folders on the Projects page. API keys, models, folders on disk, what Sync to does and
                    the window’s look stay on each computer.
                  </span>
                </span>
              </label>
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
                    <input type="checkbox" checked={enabled} disabled={provider === settings.searchProvider}
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
                        value={provider === settings.searchProvider ? settings.searchProviderKey : settings.searchProviderKeys[provider] || ''}
                        onChange={(e) => update({ searchProviderKeys: { ...settings.searchProviderKeys, [provider]: e.target.value },
                          ...(provider === settings.searchProvider && { searchProviderKey: e.target.value }) })} />
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

              <h3 className="form-section-title">Search model <span className="optional">Optional</span></h3>
              <div className="field-hint section-hint">Used for web search only. Leave blank to use the main model.</div>
              {text('Endpoint', 'searchEndpoint', { name: 'Search model endpoint', placeholder: settings.llmEndpoint })}
              {text('Model', 'searchModel', { name: 'Search model name', placeholder: settings.llmModel })}
              {text('API key', 'searchApiKey', { name: 'Search model API key', placeholder: 'sk-…', secret: true })}
            </>
          )}

          {section === 'transfer' && (
            <>
              <div className="field-hint section-hint">
                The parser turns a PDF into Markdown for the “From the PDF (parser → LaTeX)” mode of Change template.
              </div>
              <ParserFields />
            </>
          )}

          {section === 'system' && (
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
            </>
          )}
        </div>
      </div>
    </Sheet>
  );
}

/** Settings › Projects: the cloud locations, folders a sync app keeps the same on each computer, which projects sync to. */
function CloudLocations() {
  const [settings, update] = useSettings();
  const [sync, setSync] = useState<SyncSettings | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const show = (next: SyncSettings) => {
    setSync(next);
    setName(next.machineName);
  };
  useEffect(() => {
    getSyncSettings().then(show, (err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const save = async (patch: Parameters<typeof updateSyncSettings>[0]) => {
    try {
      show(await updateSyncSettings(patch));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  const paths = sync?.folders.map((f) => f.path) || [];
  const add = async (path?: string) => {
    const picked = path || (await pickFolder({ title: 'Choose a folder your sync app keeps on each computer' }));
    if (picked) await save({ folders: [...paths, picked], projectsDir: settings.projectsDir || undefined });
  };

  return (
    <>
      <h3 className="form-section-title">Cloud locations</h3>
      <div className="field-hint section-hint">
        Folders that OneDrive, Dropbox, Synology Drive or iCloud Drive keep the same on your other computers, or any folder that syncs. Choose Sync to from a
        project’s ··· menu to keep it in one, and add the same locations on each computer to find it there.
      </div>
      {sync?.folders.map((f) => (
        <div key={f.path} className="path-row">
          <Icon name="cloud" />
          <span className="path-text">
            <span className="path-label">{f.label}</span>
            {tildify(f.path)}
          </span>
          {!f.found && <span className="badge warning">Not found</span>}
          <button className="btn small" onClick={() => save({ folders: paths.filter((p) => p !== f.path) })}>Remove</button>
        </div>
      ))}
      {sync?.suggestions.map((s) => {
        // the app's own folder can't be added when it holds the default folder chosen here: its Spectrum folder then
        const target = settings.projectsDir && under(settings.projectsDir, s.target) ? `${s.path}${SEP}Spectrum` : s.target;
        return (
          <div key={target} className="path-row">
            <Icon name="folder.badge.plus" />
            <span className="path-text">
              <span className="path-label">{s.label}</span>
              {tildify(target)}
            </span>
            <button className="btn small" onClick={() => add(target)}>Add</button>
          </div>
        );
      })}
      <div>
        <button className="btn small" disabled={!sync} onClick={() => add()}>Add…</button>
      </div>
      {sync && sync.folders.length > 1 && sync.sharedFolder && (
        <div className="field-hint">Settings and templates go between your computers through {tildify(sync.sharedFolder)}, so add it on each one.</div>
      )}
      {error && <div className="field-hint error">{error}</div>}
      <div className="field">
        <label id="settings-cloudMode">When a project syncs</label>
        <Select
          labelId="settings-cloudMode"
          value={settings.cloudMode}
          options={[
            ['mirror', 'Keep a local copy and mirror it'],
            ['move', 'Move it into the cloud location']
          ]}
          onChange={(value) => update({ cloudMode: value as CloudMode })}
        />
        <div className="field-hint">
          {settings.cloudMode === 'mirror'
            ? 'The project stays in its folder here, and Spectrum keeps a copy in the cloud location in step with it.'
            : 'The project’s folder moves into the cloud location, and the sync app keeps it the same on each computer.'}{' '}
          On this computer, for the next Sync to or Download; projects syncing now stay as they are.
        </div>
      </div>
      <div className="field">
        <label htmlFor="settings-machineName">This computer’s name</label>
        <input
          id="settings-machineName"
          className="input"
          value={name}
          disabled={!sync}
          spellCheck={false}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => sync && name.trim() !== sync.machineName && save({ machineName: name })}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <div className="field-hint">Your other computers show it, e.g. for a project open on this one.</div>
      </div>
    </>
  );
}

const SHORTCUT_GROUPS: Shortcut['group'][] = ['Editing', 'Selection', 'Folding', 'PDF', 'App'];

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
        <input type="checkbox" checked={settings.autoInsertCite} onChange={(e) => update({ autoInsertCite: e.target.checked })} />
        <span>
          <span>
            Insert <code>\cite</code> at the cursor after adding a reference
          </span>
          <span className="field-hint">Applies when the References chat adds or finds a single reference.</span>
        </span>
      </label>

      <h3 className="form-section-title">Jump between source and PDF</h3>
      <label className="checkbox-row">
        <input type="checkbox" checked={settings.syncDoubleClick} onChange={(e) => update({ syncDoubleClick: e.target.checked })} />
        <span>
          Double-click jumps between the source and the PDF
          <span className="field-hint">Double-click the PDF to find that spot in the source, or a line in a .tex file to find it in the PDF beside it.</span>
        </span>
      </label>
      <div className="field">
        <label id="settings-syncHighlight">Highlight colour</label>
        <div className="row">
          <div className="accent-picker" role="radiogroup" aria-labelledby="settings-syncHighlight">
            {SYNC_HIGHLIGHTS.map(([value, label]) => (
              <button
                key={value}
                className={`accent-swatch ${value}`}
                style={{ '--swatch': highlightColour({ ...settings, syncHighlightColour: value }, dark) } as CSSProperties}
                role="radio"
                aria-checked={settings.syncHighlightColour === value}
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
        <input type="checkbox" checked={settings.pdfFollowsFile} onChange={(e) => update({ pdfFollowsFile: e.target.checked })} />
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
        <div className="segmented small" role="radiogroup" aria-label="Colours for">
          {(['light', 'dark'] as const).map((m) => (
            <button key={m} className={`segment ${mode === m ? 'active' : ''}`} role="radio" aria-checked={mode === m} onClick={() => setMode(m)}>
              {m === 'light' ? 'Light' : 'Dark'}
            </button>
          ))}
        </div>
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

/** Settings › Engines: the LaTeX tab's compile defaults, which a project uses until it makes its own choice. */
function EnginesPane() {
  const [settings, update] = useSettings();
  const defaults = settings.compileDefaults;
  const set = (patch: Partial<typeof defaults>) => update({ compileDefaults: { ...defaults, ...patch } });

  return (
    <>
      <Tabs value="latex" onChange={() => undefined} items={[{ value: 'latex', label: 'LaTeX' }]} />
      <div className="field-hint section-hint">
        Every project compiles with these until you change one for that project from the Compile button’s menu. They stay on this computer.
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
        <div className="field-hint">Compiles the document showing once you stop typing for that long. A newer compile takes the place of one that’s out of date.</div>
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
        <input type="checkbox" checked={defaults.draft} onChange={(e) => set({ draft: e.target.checked })} />
        <span>
          Fast draft mode
          <span className="field-hint">One pass with images drawn as boxes, for quick previews. Numbers and references can lag behind until a full compile.</span>
        </span>
      </label>

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
      <label className="checkbox-row">
        <input type="checkbox" checked={settings.openLogsOnFail} onChange={(e) => update({ openLogsOnFail: e.target.checked })} />
        <span>
          Open Logs when a compile fails
          <span className="field-hint">Tools › Logs opens in the PDF’s place. Auto compile leaves it closed.</span>
        </span>
      </label>
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
        <input type="checkbox" checked={settings.checkpointOnCompile} onChange={(e) => update({ checkpointOnCompile: e.target.checked })} />
        <span>
          Save a checkpoint when a compile succeeds
          <span className="field-hint">
            Only when the source changed since the last checkpoint, and at most one every 10 minutes: a newer one takes the place of the last automatic one. The
            ones you save and the “Before …” ones are never replaced.
          </span>
        </span>
      </label>
      <label className="checkbox-row">
        <input type="checkbox" checked={settings.checkpointNotice} onChange={(e) => update({ checkpointNotice: e.target.checked })} />
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

/** Spelling and grammar in Australian English: the switches, the serial comma and the personal word list. */
function LanguagePane() {
  const [settings, update] = useSettings();
  const [status, setStatus] = useState<CheckerStatus | null>(null);
  const [words, setWords] = useState<string[] | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    spellStatus().then(setStatus).catch((err) => setStatus({ available: false, language: 'en-AU', error: err instanceof Error ? err.message : String(err) }));
    spellWords().then((lists) => setWords(lists.global)).catch(() => setWords([]));
  }, []);

  const change = (word: string, remove = false) => {
    setError('');
    changeSpellWord({ word, scope: 'global', remove })
      .then((lists) => {
        setWords(lists.global);
        if (!remove) setDraft('');
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  };

  return (
    <>
      <div className="field-hint section-hint">
        Spectrum checks writing in Australian English. Spelling uses SCOWL’s en_AU dictionary with Australian words from AussieDic, and grammar uses Harper.
      </div>

      <h3 className="form-section-title">Spelling</h3>
      <label className="checkbox-row">
        <input type="checkbox" checked={settings.spellCheck} onChange={(e) => update({ spellCheck: e.target.checked })} />
        <span>
          Check spelling as you type
          <span className="field-hint">Misspelt words in .tex, .md and .txt files get a red underline. Right-click one for suggestions.</span>
        </span>
      </label>
      {status && !status.available && <div className="field-hint error">{status.error || 'The spell checker couldn’t start.'}</div>}

      <h3 className="form-section-title">Grammar</h3>
      <label className="checkbox-row">
        <input type="checkbox" checked={settings.grammarStyle} onChange={(e) => update({ grammarStyle: e.target.checked })} />
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
        <div className="field-hint">Check grammar from the button beside the assistant, or with {formatShortcut(shortcutKey(settings.shortcuts, 'grammar')) || 'its shortcut'}.</div>
      </div>

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
      {error && <div className="field-hint error">{error}</div>}
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

/** Settings › Personas: the default instructions, and the personas picked in chat that take their place. */
function PersonasPane() {
  const [settings, update] = useSettings();
  // a copy of the one being edited or created, kept only with Save
  const [editing, setEditing] = useState<Persona | null>(null);
  const creating = !!editing && !settings.personas.some((p) => p.id === editing.id);

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
        <input id="persona-name" className="input" value={editing.name} autoFocus onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
      </div>
      <div className="field">
        <label id="persona-colour">Colour</label>
        <div className="accent-picker" role="radiogroup" aria-labelledby="persona-colour">
          {TAG_COLOUR_NAMES.map((colour) => (
            <button
              key={colour}
              className="accent-swatch"
              style={{ '--swatch': TAG_COLOURS[colour][1] } as CSSProperties}
              role="radio"
              aria-checked={editing.colour === colour}
              aria-label={TAG_COLOURS[colour][0]}
              title={TAG_COLOURS[colour][0]}
              onClick={() => setEditing({ ...editing, colour })}
            />
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor="persona-prompt">Instructions</label>
        <textarea id="persona-prompt" className="input" rows={7} value={editing.prompt} onChange={(e) => setEditing({ ...editing, prompt: e.target.value })} />
        <div className="field-hint">How the assistant should work and write while this persona is chosen. They take the place of your default instructions.</div>
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
          value={settings.defaultInstructions}
          placeholder="For example: keep answers short, and ask before restructuring a section."
          onChange={(e) => update({ defaultInstructions: e.target.value })}
        />
        <div className="field-hint">Used in every chat without a persona. Autocomplete never uses them.</div>
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

// the native switch look where the web view has one (Safari 17.4 and later); elsewhere a tick box
const SWITCH = { switch: '' } as object;

/** Settings › Skills: every skill in its group with a switch for all projects or this one, your own skills' files, and sharing. */
function SkillsPane({ projectId }: { projectId?: string }) {
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
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
  const toggle = (skill: Skill, on: boolean) => (inProject ? setForProject(skill, on === skill.enabled ? null : on) : run(() => setSkillEnabled(skill.id, on)));
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

  if (view === 'create') return <CreateSkill busy={busy} error={error} onCancel={() => setView(null)} onCreate={async (skill) => (await run(() => createSkill(skill))) && setView(null)} />;
  if (view) return <SkillFiles skill={view} onBack={() => (setView(null), load())} />;

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
          <div className="segmented small" role="radiogroup" aria-label="Switches apply to">
            {(['all', 'project'] as const).map((value) => (
              <button key={value} className={`segment ${scope === value ? 'active' : ''}`} role="radio" aria-checked={scope === value} onClick={() => setScope(value)}>
                {value === 'all' ? 'All projects' : 'This project'}
              </button>
            ))}
          </div>
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
                  {...SWITCH}
                  checked={skillOn(skill, inProject)}
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
      <SkillSharing />
    </>
  );
}

/** A new skill of your own: its name, the description the assistant decides by, and the instructions. */
function CreateSkill({
  busy,
  error,
  onCancel,
  onCreate
}: {
  busy: boolean;
  error: string;
  onCancel: () => void;
  onCreate: (skill: { id: string; name: string; description: string; body: string }) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');
  const id = skillId(name);
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
function SkillFiles({ skill, onBack }: { skill: Skill; onBack: () => void }) {
  const own = skill.source === 'own';
  const [files, setFiles] = useState<string[]>([]);
  const [path, setPath] = useState('SKILL.md');
  const [text, setText] = useState<string | null>(null);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const changed = text !== null && text !== saved;

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

  /** Leaves this file only once unsaved changes are let go. ponytail: closing Settings itself doesn't ask; a guard on the sheet if that loses work */
  const leave = async (then: () => void) => {
    if (changed && !(await confirmDialog({ title: `Discard your changes to ${path}?`, confirmLabel: 'Discard', destructive: true }))) return;
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
            <button key={file} className={`nav-row ${file === path ? 'active' : ''}`} role="option" aria-selected={file === path} onClick={() => leave(() => setPath(file))}>
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

/** The switch that links your skills where agents run outside Spectrum look for them, off by default. */
function SkillSharing() {
  const [share, setShare] = useState<SkillShare | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getSkillSharing().then(setShare, (err) => setError(errorText(err)));
  }, []);
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
        <input type="checkbox" role="switch" {...SWITCH} checked={!!share?.enabled} disabled={!share || busy} onChange={(e) => turn(e.target.checked)} />
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

/** Settings › Agents: each local agent's program, key, launcher arguments and runtime folders, and copying its login in. */
function AgentsPane() {
  const [agents, setAgents] = useState<LocalAgent[] | null>(null);
  // the agent last picked in the agent workspace, which its "Set up in Settings › Agents" opens
  const [agentId, setAgentId] = useState(() => {
    try {
      return localStorage.getItem('spectrum-agent-pick') || 'opencode';
    } catch {
      return 'opencode';
    }
  });
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('[]');
  const [runtimePaths, setRuntimePaths] = useState('');
  const [key, setKey] = useState('');
  const [keyEnv, setKeyEnv] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const current = agents?.find((a) => a.id === agentId) ?? agents?.[0];

  const refresh = () =>
    listLocalAgents().then((res) => {
      setAgents(res.agents);
      return res.agents;
    });
  useEffect(() => {
    refresh()
      // a pick that can't run here (OpenCode on Windows) opens at the first agent that can, as the workspace does
      .then((list) => setAgentId((id) => (list.find((a) => a.id === id && !a.unavailable) ?? list.find((a) => !a.unavailable))?.id ?? id))
      .catch((err) => setError(errorText(err)));
  }, []);
  // the form shows what's saved for the agent picked, and again after each save
  useEffect(() => {
    if (!current) return;
    setCommand(current.command);
    setArgs(JSON.stringify(current.args));
    setRuntimePaths(current.runtimePaths.join('\n'));
    setKey('');
    setKeyEnv(current.keyEnv);
  }, [current?.id, current?.command, current?.keyEnv, JSON.stringify(current?.args), JSON.stringify(current?.runtimePaths)]);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const launcherArgs = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(args);
    } catch {
      // the message below
    }
    if (!Array.isArray(parsed) || !parsed.every((a) => typeof a === 'string')) throw new Error('Launcher arguments must be a JSON list of strings, e.g. ["acp"].');
    return parsed as string[];
  };
  const save = (agent: LocalAgent) =>
    run(async () => {
      const paths = runtimePaths.split('\n').map((p) => p.trim()).filter(Boolean);
      await configureLocalAgent(agent.id, { command, args: launcherArgs(), runtimePaths: paths, keyEnv, ...(key && { apiKey: key }) });
      setKey('');
      await refresh();
      window.dispatchEvent(new Event(AGENTS_CHANGED));
    });
  const copyLogin = (agent: LocalAgent) =>
    run(async () => {
      const res = await importLocalAgentLogin(agent.id);
      toast(`Copied ${res.files} login and configuration ${res.files === 1 ? 'file' : 'files'} into ${agent.name}’s private home.`, { tone: 'success' });
    });
  // with what's saved rather than the form, so unsaved edits stay unsaved
  const removeKey = (agent: LocalAgent) =>
    run(async () => {
      await configureLocalAgent(agent.id, { command: agent.command, args: agent.args, runtimePaths: agent.runtimePaths, apiKey: '' });
      await refresh();
      window.dispatchEvent(new Event(AGENTS_CHANGED));
    });

  return (
    <>
      <div className="field-hint section-hint">
        Coding agents installed on this computer, such as {IS_WINDOWS ? 'Kimi Code, Hermes, Qoder and Cursor' : 'OpenCode, Codex and Claude'}, work on a project from the agent workspace. Each runs isolated with a private
        home of its own, and in review mode on a copy of the project, so you choose which changes come in.
      </div>
      {IS_WINDOWS && (
        <div className="field-hint">
          On Windows, local agents get no Spectrum tools yet, such as compiling or searching the literature. Skills and the workspace’s task buttons work all the
          same.
        </div>
      )}
      {!agents && !error && (
        <div className="field-hint">
          <span className="spinner" /> Loading…
        </div>
      )}
      {current && (
        <>
          <div className="field">
            <label id="settings-agent">Agent</label>
            <Select
              labelId="settings-agent"
              value={current.id}
              disabled={busy}
              options={agents!.map((a): [string, string] => [
                a.id,
                `${a.name}${a.experimental ? ' · Experimental' : ''}${a.unavailable ? (a.id === 'workbuddy' ? ' · Planned' : ' · Unavailable') : ''}`
              ])}
              onChange={(id) => {
                setAgentId(id);
                setError('');
              }}
            />
            <div className="field-hint">
              {current.unavailable || current.note}{' '}
              <a href={current.url} target="_blank" rel="noreferrer">
                Setup guide
              </a>
            </div>
            {!current.unavailable && !current.installed && <div className="field-hint error">Not found. Install it, or choose its executable below.</div>}
            {!current.unavailable && !current.supported && (
              <div className="field-hint error">Agent isolation isn’t available on this computer. Repair or reinstall Spectrum before starting an agent.</div>
            )}
          </div>
          {!current.unavailable && (
            <>
              <div className="field">
                <label htmlFor="settings-agentCommand">Executable</label>
                <input
                  id="settings-agentCommand"
                  className="input"
                  value={command}
                  placeholder={current.command}
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="off"
                  autoComplete="off"
                  onChange={(e) => setCommand(e.target.value)}
                />
              </div>
              <div className="field">
                <label id="settings-agentKeyEnv">Provider credential</label>
                <Select
                  labelId="settings-agentKeyEnv"
                  value={keyEnv}
                  options={current.keyEnvs.map((name): [string, string] => [name, name.replace(/_(API_KEY|PERSONAL_ACCESS_TOKEN)$/, '').replace(/_/g, ' ')])}
                  onChange={setKeyEnv}
                />
              </div>
              <div className="field">
                <label htmlFor="settings-agentKey">API key or access token</label>
                <input
                  id="settings-agentKey"
                  className="input"
                  type="password"
                  autoComplete="off"
                  value={key}
                  placeholder={current.hasKey && keyEnv === current.keyEnv ? 'Saved on this computer; leave blank to keep it' : 'Optional when a copied login is there'}
                  onChange={(e) => setKey(e.target.value)}
                />
                {current.hasKey && keyEnv !== current.keyEnv && (
                  <div className="field-hint">Saving another provider removes the saved key, so enter that provider’s key here.</div>
                )}
              </div>
              <details className="agent-advanced">
                <summary>Advanced</summary>
                <div className="field">
                  <label htmlFor="settings-agentArgs">Launcher arguments (a JSON list)</label>
                  <input id="settings-agentArgs" className="input mono" value={args} spellCheck={false} onChange={(e) => setArgs(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="settings-agentRuntime">Runtime folders, one a line</label>
                  <textarea id="settings-agentRuntime" className="input mono" rows={3} value={runtimePaths} spellCheck={false} onChange={(e) => setRuntimePaths(e.target.value)} />
                  <div className="field-hint">
                    Folders the agent may read its installed libraries from, such as a Python 3.11 or later for skills’ scripts. Choose specific folders: your
                    home folder and the live project are never opened to it.
                  </div>
                </div>
              </details>
              <div className="row">
                <button className="btn small primary" disabled={busy} onClick={() => save(current)}>
                  Save setup
                </button>
                {current.canImport && (
                  <button className="btn small" disabled={busy} onClick={() => copyLogin(current)}>
                    Copy existing login
                  </button>
                )}
                {current.hasKey && (
                  <button className="btn small" disabled={busy} onClick={() => removeKey(current)}>
                    Remove saved key
                  </button>
                )}
              </div>
              <div className="field-hint">
                Keys and copied logins stay in Spectrum’s private data on this computer. The agent’s tools and commands stay isolated, and MCP servers set up for it
                outside Spectrum get no access to this computer.
              </div>
            </>
          )}
        </>
      )}
      {error && <div className="field-hint error">{error}</div>}
    </>
  );
}
