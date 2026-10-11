import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { changeSpellWord, spellStatus, spellWords, systemCheck } from '../api/client';
import type { CheckerStatus, SearchProvider, SystemCheck } from '../api/client';
import Icon from './Icon';
import Select from './Select';
import Sheet from './Sheet';
import { pickFolder } from './desktop';
import {
  COMPILE_ENGINES,
  ROLE_FIELDS,
  effectiveEffort,
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
  useProviders,
  useSettings
} from './settings';
import type { AppSettings, ModelRole, Theme } from './settings';
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
  ['tavily', 'Tavily'],
  ['brave', 'Brave Search']
];

const MACTEX = 'brew install --cask mactex-no-gui';
const INSTALL_HINTS: Record<string, string> = {
  pdflatex: MACTEX,
  xelatex: MACTEX,
  lualatex: MACTEX,
  latexmk: MACTEX,
  bibtex: MACTEX,
  biber: MACTEX,
  texcount: `Included with MacTeX (${MACTEX})`,
  tectonic: 'brew install tectonic'
};

export default function SettingsSheet({ onClose }: { onClose: () => void }) {
  const [settings, update] = useSettings();
  const [section, setSection] = useState<Section>('appearance');
  const [check, setCheck] = useState<SystemCheck | null>(null);
  const [checkError, setCheckError] = useState('');
  const providers = useProviders();
  const preset = presetOf(providers, settings);
  const mainModel = modelOf(preset, settings.llmModel);
  const effortChoices = effortOptions(mainModel);
  // stays on Other… while a typed name happens to match a listed model, e.g. glm-5.3 on the way to glm-5.3-flashx
  const [otherModel, setOtherModel] = useState<Record<string, boolean>>({});
  const typedModel = otherModel.main || !mainModel;
  const visionConfig = llmConfigFor(settings, 'vision');
  const imagesGoElsewhere = visionConfig.model !== settings.llmModel || visionConfig.endpoint !== settings.llmEndpoint;

  /** Another provider's address switches to that provider as the menu does, so the key it had never goes there. */
  const setEndpoint = (value: string) => {
    const next = presetForEndpoint(providers, value);
    if (next?.id === preset?.id) return update({ llmEndpoint: value });
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
    const own = rolePresetOf(providers, settings, role);
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
            <Select
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
            <div className={`field-hint ${blindMain ? 'error' : ''}`}>
              {blindMain
                ? 'The main model reads text only, so choose a model that reads images.'
                : typed
                  ? 'Type the model’s name exactly as the provider lists it.'
                  : picked
                    ? `${picked.note}.`
                    : ''}
            </div>
          </div>
        )}
        {typed && text(own ? 'Model name' : 'Model', f.model, { name: `${name} name`, placeholder: same ? settings.llmModel || 'Same as main model' : 'Model name' })}
        {!same && text('API key', f.apiKey, { name: `${name} API key`, placeholder: 'Paste your key', secret: true, hint: keyHint(own) })}
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
  const providerNeedsKey = ['serpapi', 'tavily', 'brave', 'semanticscholar'].includes(settings.searchProvider);

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
              <div className="field-hint">System follows the macOS appearance and switches automatically.</div>
            </>
          )}

          {section === 'editor' && (
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
              <div className="field">
                <label id="settings-editorFontSize">Font size</label>
                <Select
                  labelId="settings-editorFontSize"
                  value={String(settings.editorFontSize)}
                  options={[11, 12, 13, 14, 15, 16, 18, 20].map((n) => [String(n), `${n} pt`])}
                  onChange={(value) => update({ editorFontSize: Number(value) })}
                />
              </div>
              <label className="checkbox-row">
                <input type="checkbox" checked={settings.autoInsertCite} onChange={(e) => update({ autoInsertCite: e.target.checked })} />
                <span>
                  Insert <code>\cite</code> at the cursor after adding a reference
                  <span className="field-hint">Applies when the References chat adds or finds a single reference.</span>
                </span>
              </label>
            </>
          )}

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
                  {preset ? preset.note : 'Any server that speaks the OpenAI chat completions API, such as LM Studio, Ollama or vLLM.'}
                </div>
              </div>
              {preset?.regions && regionField('settings-mainTitle', 'settings-llmRegion', preset, settings.llmEndpoint, (endpoint) => update({ llmEndpoint: endpoint }))}
              {text('Endpoint', 'llmEndpoint', {
                name: 'Main model endpoint',
                placeholder: 'https://api.openai.com/v1/chat/completions',
                hint: preset ? '' : 'The chat completions address or the base URL, e.g. http://localhost:1234/v1',
                onChange: setEndpoint
              })}
              {preset && (
                <div className="field">
                  <label id="settings-llmModelPick">Model</label>
                  <Select
                    labelId="settings-mainTitle settings-llmModelPick"
                    value={typedModel ? 'other' : mainModel.id}
                    options={[
                      ...preset.models.map((m): [string, string] => [m.id, m.id === preset.recommended.main ? `${m.label} (recommended)` : m.label]),
                      ['other', 'Other…']
                    ]}
                    onChange={chooseModel}
                  />
                  <div className="field-hint">
                    {typedModel
                      ? 'Type the model’s name exactly as the provider lists it.'
                      : `${mainModel.note}.${mainModel.vision ? '' : imagesGoElsewhere ? ' Reads text only, so images go to the vision model.' : ' Reads text only, so set a vision model below for images.'}`}
                  </div>
                </div>
              )}
              {typedModel && text(preset ? 'Model name' : 'Model', 'llmModel', { name: 'Main model name', placeholder: preset?.recommended.main || 'Model name' })}
              {text('API key', 'llmApiKey', {
                name: 'Main model API key',
                placeholder: 'Paste your key',
                secret: true,
                hint: keyHint(preset)
              })}
              <div className="field">
                <label id="settings-reasoningEffort">Reasoning effort</label>
                <Select
                  labelId="settings-mainTitle settings-reasoningEffort"
                  value={effectiveEffort(settings, providers)}
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
                  onChange={(value) => update({ searchProvider: value as SearchProvider })}
                />
                <div className="field-hint">
                  {settings.searchProvider === 'llm'
                    ? 'Relies on a model with built-in web search.'
                    : 'The provider finds the sources; the model only splits the question and writes the summary.'}
                </div>
              </div>
              {settings.searchProvider === 'serpapi' && (
                <div className="field">
                  <label id="settings-serpEngine">SerpApi engine</label>
                  <Select
                    labelId="settings-serpEngine"
                    value={settings.serpEngine}
                    options={[['google', 'Google'], ['google_scholar', 'Google Scholar'], ['baidu', 'Baidu']]}
                    onChange={(value) => update({ serpEngine: value as AppSettings['serpEngine'] })}
                  />
                </div>
              )}
              {providerNeedsKey &&
                text('Provider API key', 'searchProviderKey', {
                  secret: true,
                  hint: settings.searchProvider === 'semanticscholar' ? 'Optional; raises the Semantic Scholar rate limit.' : ''
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
                MinerU converts a compiled PDF to Markdown for the “MinerU (PDF → Markdown → LaTeX)” mode of Change template.
              </div>
              {text('MinerU API', 'mineruApiBase', { placeholder: 'https://mineru.net/api/v4' })}
              {text('MinerU token', 'mineruToken', { secret: true })}
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
                  <div className={`sys-row ${check.python.matplotlib ? 'ok' : 'missing'}`}>
                    <Icon name={check.python.matplotlib ? 'checkmark.circle.fill' : 'minus.circle'} />
                    <span className="sys-name">python + matplotlib</span>
                    <span className="sys-detail">
                      {check.python.matplotlib ? check.python.path : check.python.found ? 'pip install matplotlib' : 'Python not found'}
                    </span>
                  </div>
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
        Click a shortcut and press the new keys. Delete removes it and Escape cancels. Tab and ⇧Tab also indent and unindent the selected lines.
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
