import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { changeSpellWord, getSyncSettings, spellStatus, spellWords, systemCheck, updateSyncSettings } from '../api/client';
import type { CheckerStatus, SearchProvider, SyncSettings, SystemCheck } from '../api/client';
import { COLOUR_ROLES, EDITOR_FONTS, EDITOR_THEMES, chosenColours, editorColours, highlightLines, themeFor, wellColour } from '../editor/editorThemes';
import type { EditorMode } from '../editor/editorThemes';
import { highlightColour } from '../editor/synctex';
import Icon from './Icon';
import Select from './Select';
import Sheet from './Sheet';
import { ParserFields } from './TransferPanel';
import { IS_DESKTOP, claimDefaultHandler, pickFolder } from './desktop';
import { toast } from './Toast';
import { IS_MAC, IS_WINDOWS, OS_NAME } from './platform';
import { ACCENTS, PDF_PAGES_DARK, PDF_PAGES_LIGHT, useDarkMode } from './appearance';
import {
  COMPILE_ENGINES,
  ROLE_FIELDS,
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
  useLivePreset,
  useProviders,
  useSettings
} from './settings';
import type { AppSettings, ModelRole, PdfPageDark, PdfPageLight, Theme } from './settings';
import type { ProviderPreset } from '../api/client';
import { FIXED_SHORTCUTS, SHORTCUTS, canonical, formatShortcut, shortcutFromEvent, shortcutKey, shortcutProblem } from './shortcuts';
import type { Shortcut } from './shortcuts';

type Section = 'appearance' | 'editor' | 'language' | 'shortcuts' | 'projects' | 'models' | 'search' | 'transfer' | 'system';

const SECTIONS: [Section, string, string][] = [
  ['appearance', 'Appearance', 'circle.lefthalf.filled'],
  ['editor', 'Editor', 'text.cursor'],
  ['language', 'Spelling & grammar', 'textformat.abc.dottedunderline'],
  ['shortcuts', 'Shortcuts', 'keyboard'],
  ['projects', 'Projects', 'folder'],
  ['models', 'Models', 'sparkles'],
  ['search', 'Search', 'magnifyingglass'],
  ['transfer', 'Template transfer', 'arrow.triangle.2.circlepath'],
  ['system', 'System', 'stethoscope']
];

const THEMES: [Theme, string, string][] = [
  ['system', 'System', 'circle.lefthalf.filled'],
  ['light', 'Light', 'sun.max'],
  ['dark', 'Dark', 'moon']
];

const SEARCH_PROVIDERS: [SearchProvider, string][] = [
  ['llm', 'Model’s built-in web search'],
  ['openalex', 'OpenAlex (free)'],
  ['semanticscholar', 'Semantic Scholar'],
  ['serpapi', 'SerpApi (Google, Scholar, Baidu)'],
  ['exa', 'Exa'],
  ['tavily', 'Tavily'],
  ['brave', 'Brave Search'],
  ['ddgs', 'DDGS (free)']
];

const SEARCH_NOTES: Record<SearchProvider, string> = {
  llm: 'The search model looks the sources up itself, so it needs built-in web search. Check its DOIs before you cite them.',
  openalex: 'Papers, preprints, books and theses with full details for BibTeX. No key needed; a free key from openalex.org raises the daily limit.',
  semanticscholar: 'Papers in every field with authors, venue and DOI. Works without a key but is often busy; a free key avoids that.',
  serpapi: 'Google Scholar, Google or Baidu results. Needs a SerpApi key.',
  exa: 'Neural search that looks only at papers for research questions and at the whole web for LaTeX ones. Needs an Exa key.',
  tavily: 'Web search that puts arXiv, publishers, standards, CTAN and TeX Stack Exchange first. Needs a Tavily key; each search uses 2 credits.',
  brave: 'Brave’s own index, ranked to put papers, standards and LaTeX documentation first. Needs a Brave Search API key.',
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

export default function SettingsSheet({ onClose }: { onClose: () => void }) {
  const [settings, update] = useSettings();
  const [section, setSection] = useState<Section>('appearance');
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
    systemCheck().then(setCheck).catch((err) => setCheckError(err instanceof Error ? err.message : String(err)));
  }, [check, checkError]);

  const recheck = () => {
    setCheck(null);
    setCheckError('');
  };

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
  const providerNeedsKey = !['llm', 'ddgs'].includes(settings.searchProvider);
  const keyOptional = ['openalex', 'semanticscholar'].includes(settings.searchProvider);
  const ddgsMissing =
    settings.searchProvider === 'ddgs' && check && !check.python.ddgs
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

          {section === 'language' && <LanguagePane />}

          {section === 'shortcuts' && <ShortcutsPane />}

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
                      if (picked) update({ projectsDir: picked });
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
              <SyncedFolders onChange={recheck} />
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
                    Through the synced projects folder: appearance, editor, spelling and shortcuts. API keys, models, folders and the window’s look stay on each computer.
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
                <label id="settings-searchProvider">Web search provider</label>
                <Select
                  labelId="settings-searchProvider"
                  value={settings.searchProvider}
                  options={SEARCH_PROVIDERS}
                  onChange={(value) => update(searchProviderPatch(settings, value as SearchProvider))}
                />
                <div className="field-hint">{SEARCH_NOTES[settings.searchProvider]}</div>
                {ddgsMissing && <div className="field-hint error">{ddgsMissing}</div>}
              </div>
              {settings.searchProvider === 'serpapi' && (
                <div className="field">
                  <label id="settings-serpEngine">SerpApi engine</label>
                  <Select
                    labelId="settings-serpEngine"
                    value={settings.serpEngine}
                    options={[['google_scholar', 'Google Scholar (papers)'], ['google', 'Google'], ['baidu', 'Baidu']]}
                    onChange={(value) => update({ serpEngine: value as AppSettings['serpEngine'] })}
                  />
                </div>
              )}
              {providerNeedsKey &&
                text(keyOptional ? 'Provider API key (optional)' : 'Provider API key', 'searchProviderKey', {
                  secret: true,
                  hint: 'Each provider’s key is kept when you switch.'
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

/** Settings › Projects: the folders a sync app keeps the same on each computer, where Spectrum looks for projects. */
function SyncedFolders({ onChange }: { onChange: () => void }) {
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

  const save = async (patch: { folders?: string[]; machineName?: string }) => {
    try {
      show(await updateSyncSettings(patch));
      setError('');
      // the first synced folder is where new projects go
      if (patch.folders) onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  const paths = sync?.folders.map((f) => f.path) || [];
  const add = async (path?: string) => {
    const picked = path || (await pickFolder({ title: 'Choose a folder your sync app keeps on each computer' }));
    if (picked) await save({ folders: [...paths, picked] });
  };

  return (
    <>
      <h3 className="form-section-title">Synced project folders</h3>
      <div className="field-hint section-hint">
        Folders that Synology Drive, OneDrive, Dropbox or iCloud Drive keep the same on your other computers. Spectrum finds the projects in them, so a project
        started on one computer turns up on the other once it has synced. Add the same folders on each computer. New projects go in
        the first one unless you choose a default folder above.
      </div>
      {sync?.folders.map((f) => (
        <div key={f.path} className="path-row">
          <Icon name="folder" />
          <span className="path-text" title={f.path}>{f.label ? `${f.label}: ${f.path}` : f.path}</span>
          {!f.found && <span className="badge warning">Not found</span>}
          <button className="btn small" onClick={() => save({ folders: paths.filter((p) => p !== f.path) })}>Remove</button>
        </div>
      ))}
      {sync?.suggestions.map((s) => (
        <div key={s.path} className="path-row">
          <Icon name="folder.badge.plus" />
          <span className="path-text" title={s.path}>{s.label}: {s.path}</span>
          <button className="btn small" onClick={() => add(s.path)}>Add</button>
        </div>
      ))}
      <div>
        <button className="btn small" disabled={!sync} onClick={() => add()}>Add…</button>
      </div>
      {sync && sync.folders.length > 1 && sync.sharedFolder && (
        <div className="field-hint">Settings and templates go between your computers through {sync.sharedFolder}, so add it on each one.</div>
      )}
      {error && <div className="field-hint error">{error}</div>}
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
        <div className="field-hint">Your other computers show it, e.g. for a project that’s only on this one.</div>
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

/** The compiler, jumping to the PDF, the font, a theme for each mode and any colour changed from the theme. */
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
      <div className="field">
        <label id="settings-compileEngine">Default compiler</label>
        <Select
          labelId="settings-compileEngine"
          value={settings.compileEngine}
          options={COMPILE_ENGINES.map(([value, label]) => [value, value === 'auto' ? 'Auto (recommended)' : label])}
          onChange={(value) => update({ compileEngine: value as AppSettings['compileEngine'] })}
        />
        <div className="field-hint">
          Auto reads a <code>% !TEX program</code> comment, uses XeLaTeX when the document needs Unicode fonts, and pdfLaTeX otherwise. The compiler can also be changed per session from the Compile button.
        </div>
      </div>
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
