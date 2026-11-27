import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { AutoPrice, ProviderPreset } from '../api/client';
import Icon from './Icon';
import Select from './Select';
import { autoPrice, normalizeModelId, useAutoPrices } from './autoPrices';
import { useConnectionTest } from './connectionTest';
import { connectionName, connections, contextText, hiddenPatch, isHidden, mainModelPatch, modelRows, ready, roleAt, roleModelPatch } from './providerCards';
import type { Connection, ModelRow } from './providerCards';
import { CURRENCIES, PRICE_FIELDS, ROLE_FIELDS, cleanPrices, effortOptions, followsMain, llmConfigFor, modelOf, recommendedFor, useLivePreset, useProviders, useSettings } from './settings';
import type { AppSettings, Currency, ModelRole, Price } from './settings';
import type { Section } from './settingsNav';

/** What a provider's section found: its models (Ollama's own list, when it answers) and the ones Test connection listed. */
type Listed = { preset: ProviderPreset | null; rows: ModelRow[] };
type Picked = { main: string; id: string };

const sign = (currency?: Currency) => CURRENCIES.find(([code]) => code === (currency || 'USD'))![1];

/** A model's price as a few characters, the user's own before models.dev's: “US$0.27 / US$1.10”, input then output per million tokens. */
export function priceText(own: Price | undefined, auto: Price | undefined) {
  const price = own ?? auto;
  if (price?.input === undefined || price.output === undefined) return '';
  return `${sign(price.currency)}${price.input} / ${sign(price.currency)}${price.output}`;
}

/**
 * The user's own prices, for any model: every connected provider's, the main model when typed, and every model already
 * priced (of any provider, kept when the provider changes). Each price has its currency.
 */
function ModelPrices({
  settings,
  update,
  known,
  picked,
  setPicked
}: {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
  known: [id: string, label: string][];
  picked: Picked;
  setPicked: (picked: Picked) => void;
}) {
  const models = new Map<string, string>([[settings.llmModel, known.find(([id]) => id === settings.llmModel)?.[1] || settings.llmModel]]);
  for (const [id, label] of known) if (!models.has(id)) models.set(id, label);
  for (const id of Object.keys(settings.modelPrices)) if (!models.has(id)) models.set(id, id);
  // a model named here, such as a local agent's, listed until a price is typed for it
  const [named, setNamed] = useState('');
  if (picked.id && !models.has(picked.id) && picked.id === named) models.set(named, named);
  // the model chosen here, until the main model changes
  const model = picked.main === settings.llmModel && models.has(picked.id) ? picked.id : settings.llmModel;
  const auto = useAutoPrices(settings.autoPrices);
  const fromAuto = autoPrice(auto.prices, model);
  const price = settings.modelPrices[model] || {};
  const symbol = sign(price.currency);
  const set = (patch: Partial<Price>) => update({ modelPrices: cleanPrices({ ...settings.modelPrices, [model]: { ...price, ...patch } }) });
  return (
    <>
      <div className="field">
        <label id="settings-modelPrice">Your price for</label>
        <div className="row">
          <Select
            className="grow"
            labelId="settings-modelPrice"
            value={model}
            options={[...models].map(([id, label]): [string, string] => [id, `${label}${id === settings.llmModel ? ' (main model)' : settings.modelPrices[id] ? ' (priced)' : ''}`])}
            onChange={(id) => setPicked({ main: settings.llmModel, id })}
          />
          <Select
            labelId="settings-modelPrice settings-priceCurrency"
            value={price.currency || 'USD'}
            options={CURRENCIES.map(([code, sign, name]): [string, string] => [code, `${name} (${sign.trim()})`])}
            onChange={(currency) => set({ currency: currency as Currency })}
          />
          <span id="settings-priceCurrency" className="sr-only">Currency</span>
        </div>
        <div className="row">
          {PRICE_FIELDS.map((k) => (
            <input
              key={k}
              className="input grow"
              type="number"
              min={0}
              step="any"
              aria-label={`${{ input: 'Input', cached: 'Cached input', output: 'Output' }[k]}, ${symbol.trim()} per million tokens`}
              placeholder={`${{ input: 'Input', cached: 'Cached input', output: 'Output' }[k]}${fromAuto?.[k] !== undefined && !price.currency ? ` (${fromAuto[k]})` : ''}`}
              value={price[k] ?? ''}
              onChange={(e) => set({ [k]: e.target.value.trim() === '' ? undefined : Number(e.target.value) })}
            />
          ))}
        </div>
        <div className="row">
          <input
            className="input grow"
            aria-label="Another model to price, by its name"
            placeholder="Another model, such as a local agent’s: its name"
            value={named}
            onChange={(e) => setNamed(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && named.trim()) { setNamed(named.trim()); setPicked({ main: settings.llmModel, id: named.trim() }); }
            }}
          />
          <button className="btn small" disabled={!named.trim()} onClick={() => { setNamed(named.trim()); setPicked({ main: settings.llmModel, id: named.trim() }); }}>
            Price it
          </button>
        </div>
        <div className="field-hint">
          Input, cached input and output, per million tokens, in your provider’s currency. Both agent tabs show an estimate of the cost from them, in that currency; Spectrum converts no currencies. A price you leave empty comes from models.dev, in US dollars, shown in the empty field. With OpenRouter, or an agent that reports its own cost, that figure is shown instead.
        </div>
      </div>
      <label className="checkbox-row">
        <input type="checkbox" role="switch" checked={settings.autoPrices} onChange={(e) => update({ autoPrices: e.target.checked })} />
        <span>
          Fill in prices from models.dev
          {settings.autoPrices && (
            <span className="field-hint">
              Spectrum takes models.dev’s public price list every six hours, through your proxy, and sends it nothing.{' '}
              {auto.syncedAt ? `Last taken ${new Date(auto.syncedAt).toLocaleString('en-AU')}.` : 'Not taken yet.'}
              {auto.error && ` The last try failed: ${auto.error}.`}
            </span>
          )}
        </span>
      </label>
      {settings.autoPrices && (
        <div>
          <button className="btn small" onClick={() => void auto.refresh()}>Update now</button>
        </div>
      )}
    </>
  );
}

/** One provider's models, under a heading that folds: each with the switch that keeps it in the model menus, its context and its price. */
function ProviderModels({
  conn,
  settings,
  update,
  auto,
  words,
  open,
  onToggle,
  onListed,
  onPrice,
  inUse
}: {
  conn: Connection;
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
  auto: Record<string, AutoPrice>;
  /** the search's words, lower case: a model shows when each is in its name, id, note or provider */
  words: string[];
  open: boolean;
  onToggle: () => void;
  onListed: (at: string, listed: Listed) => void;
  onPrice: (id: string) => void;
  /** the models a role runs on this provider, which stay in the menus */
  inUse: Map<string, string>;
}) {
  const live = useLivePreset(conn.preset, conn.endpoint, true);
  const test = useConnectionTest(conn.id, conn.endpoint, conn.key);
  const rows = modelRows(live.preset, test.models);
  // the lists are the same arrays until Ollama or a test answers again
  const models = live.preset?.models;
  const listed = test.models.join('\n');
  useEffect(() => onListed(conn.at, { preset: live.preset, rows }), [conn.at, models, listed]);

  const name = connectionName(conn);
  const found = rows.filter((m) => words.every((w) => `${m.label} ${m.id} ${m.note} ${name}`.toLowerCase().includes(w)));
  if (words.length && !found.length) return null;
  const on = rows.filter((m) => !isHidden(settings, conn.id, m.id)).length;
  const id = `models-${conn.at.replace(/\W/g, '-')}`;
  const shown = open || words.length > 0;
  return (
    <div className={`skill-card model-group ${shown ? 'open' : ''}`}>
      <div className="model-group-head">
        <button className="model-group-toggle" aria-expanded={shown} aria-controls={shown ? id : undefined} onClick={onToggle}>
          <Icon name={shown ? 'chevron.down' : 'chevron.right'} />
          <span className="agent-card-title">
            <span className="skill-name">{name}</span>
          </span>
          <span className="field-hint">{rows.length ? `${on} of ${rows.length} in the menus` : 'No list'}</span>
        </button>
        {live.preset?.live && <button className="btn small" aria-label={`Refresh ${name}’s models`} onClick={live.refresh}>Refresh</button>}
      </div>
      {shown && (
        <div id={id} className="model-rows">
          {live.error && <div className="field-hint error">{live.error}</div>}
          {!rows.length && !live.error && (
            <div className="field-hint">
              {ready(conn)
                ? 'Spectrum has no list of this server’s models. Test connection in Settings › Providers asks the server for one; until then, choose Other… above and type the model’s name.'
                : 'Add its key in Settings › Providers first.'}
            </div>
          )}
          {found.map((m) => {
            const own = settings.modelPrices[m.id];
            const meta = [contextText((auto[normalizeModelId(m.id)] as (AutoPrice & { context?: number }) | undefined)?.context), priceText(own, autoPrice(auto, m.id))].filter(Boolean);
            const use = inUse.get(m.id);
            return (
              <div className="model-row" key={m.id}>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={!!use || !isHidden(settings, conn.id, m.id)}
                    disabled={!!use}
                    title={use ? `In use as the ${use}` : undefined}
                    onChange={(e) => update(hiddenPatch(settings, conn.id, m.id, !e.target.checked))}
                  />
                  <span>
                    <span>
                      {m.label}
                      {use && <span className="badge accent">{use[0].toUpperCase() + use.slice(1)}</span>}
                    </span>
                    <span className="field-hint">{m.known ? [m.note, !m.vision && !/text only/i.test(m.note) && 'text only'].filter(Boolean).join(', ') : 'Listed by the provider'}</span>
                  </span>
                </label>
                <button
                  className="btn small ghost model-meta"
                  title={own ? 'Your price, input / output per million tokens. Click to change it.' : meta.length ? 'Context and models.dev’s price, input / output per million tokens. Click to set your own.' : 'Set your own price'}
                  aria-label={`Price for ${m.label}${meta.length ? `: ${meta.join(', ')}` : ''}`}
                  onClick={() => onPrice(m.id)}
                >
                  {meta.join(' · ') || 'Set a price'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const ROLE_TEXT: Record<ModelRole, [name: string, use: string]> = {
  quick: ['Quick model', 'Used for autocomplete and for splitting pasted references. Listed models think as little as they allow, so it stays quick; other servers use their own default.'],
  vision: ['Vision model', 'Used for image → LaTeX and the layout check in template transfer, with the model’s recommended effort.']
};

/**
 * Settings › Models: the models Spectrum uses by default (main, quick, vision) chosen from the connected providers'
 * models, which of those models the model menus list, and the prices.
 * otherModel: a role stays on Other… while a typed name happens to match a listed model, e.g. glm-5.3 on the way to glm-5.3-flashx
 */
export default function ModelsPane({
  onSection,
  otherModel,
  setOtherModel
}: {
  onSection: (section: Section) => void;
  otherModel: Record<string, boolean>;
  setOtherModel: Dispatch<SetStateAction<Record<string, boolean>>>;
}) {
  const [settings, update] = useSettings();
  const providers = useProviders();
  const auto = useAutoPrices(settings.autoPrices);
  const [listed, setListed] = useState<Record<string, Listed>>({});
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({ main: true });
  const [picked, setPicked] = useState<Picked>({ main: settings.llmModel, id: settings.llmModel });
  const prices = useRef<HTMLHeadingElement>(null);
  if (!providers.length) return <div className="field-hint section-hint"><span className="spinner" /> Loading the providers…</div>;

  const conns = connections(settings, providers);
  const main = conns[0];
  const multi = conns.length > 1;
  const presetOf = (conn: Connection) => listed[conn.at]?.preset ?? conn.preset;
  const rowsOf = (conn: Connection) => listed[conn.at]?.rows ?? modelRows(conn.preset, []);
  const mainPreset = presetOf(main);
  const mainModel = modelOf(mainPreset, settings.llmModel);
  const effortChoices = effortOptions(mainModel);
  const visionConfig = llmConfigFor(settings, 'vision');
  const imagesGoElsewhere = visionConfig.model !== settings.llmModel || visionConfig.endpoint !== settings.llmEndpoint;

  /** The models a menu offers for a role: every connection's that are switched on (and, for vision, read images). */
  const choices = (role: 'main' | ModelRole, current: string) =>
    conns.flatMap((conn, i) => {
      const preset = presetOf(conn);
      const recommended = role === 'main' ? preset?.recommended.main : recommendedFor(preset, role);
      return rowsOf(conn)
        // a model only the provider lists may not read images, so the vision menu keeps to Spectrum's own
        .filter((m) => (role !== 'vision' || (m.known && m.vision)) && (`${i}|${m.id}` === current || !isHidden(settings, conn.id, m.id)))
        .map((m): [string, string] => [`${i}|${m.id}`, `${multi ? `${connectionName(conn)} · ` : ''}${m.label}${m.id === recommended ? ' (recommended)' : ''}`]);
    });
  const split = (value: string): [Connection, string] => [conns[Number(value.slice(0, value.indexOf('|')))], value.slice(value.indexOf('|') + 1)];

  const mainValue = `0|${settings.llmModel}`;
  const mainChoices = choices('main', mainValue);
  const typedMain = otherModel.main || !mainChoices.some(([value]) => value === mainValue);
  const chooseMain = (value: string) => {
    setOtherModel((was) => ({ ...(value === 'other' ? was : {}), main: value === 'other' }));
    if (value === 'other') return update({ llmModel: '' });
    const [conn, id] = split(value);
    update(mainModelPatch(settings, providers, conn, id, presetOf(conn)));
  };

  const roleField = (role: ModelRole) => {
    const f = ROLE_FIELDS[role];
    const [name, use] = ROLE_TEXT[role];
    const same = followsMain(settings, role);
    const at = roleAt(settings, conns, role);
    const value = same && !at.model ? 'same' : `${conns.indexOf(at.conn)}|${at.model}`;
    const options = choices(role, value);
    const typed = otherModel[role] || (value !== 'same' && !options.some(([v]) => v === value));
    const picked = modelOf(presetOf(at.conn), at.model);
    const blindMain = role === 'vision' && same && !at.model && mainModel && !mainModel.vision;
    return (
      <div className="field">
        <label id={`settings-${role}ModelPick`}>{name}</label>
        <Select
          labelId={`settings-${role}ModelPick`}
          value={typed ? 'other' : value}
          options={[['same', 'Same as main model'], ...options, ['other', 'Other…']]}
          onChange={(next) => {
            setOtherModel((was) => ({ ...was, [role]: next === 'other' }));
            if (next === 'other') return update({ [f.model]: '' });
            if (next === 'same') return update(roleModelPatch(settings, providers, role, null, ''));
            const [conn, id] = split(next);
            update(roleModelPatch(settings, providers, role, conn, id));
          }}
        />
        {typed && (
          <input
            className="input"
            aria-label={`${name} name${multi ? `, on ${connectionName(at.conn)}` : ''}`}
            value={at.model}
            placeholder={same ? settings.llmModel || 'Same as main model' : 'Model name'}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            autoComplete="off"
            onChange={(e) => update({ [f.model]: e.target.value })}
          />
        )}
        <div className={`field-hint ${blindMain ? 'error' : ''}`}>
          {blindMain
            ? 'The main model reads text only, so choose a model that reads images.'
            : [
                typed
                  ? `Type the model’s name exactly as ${multi ? connectionName(at.conn) : 'the provider'} lists it.`
                  : picked?.note
                    ? `${picked.note}.`
                    : at.model && !picked
                      ? 'Listed by the provider. Spectrum has no notes on this model.'
                      : '',
                use
              ]
                .filter(Boolean)
                .join(' ')}
        </div>
      </div>
    );
  };

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const inUse = (conn: Connection) => {
    const used = new Map<string, string>();
    for (const role of ['vision', 'quick'] as const) {
      const at = roleAt(settings, conns, role);
      if (at.conn === conn && at.model) used.set(at.model, `${role} model`);
    }
    if (conn === main && settings.llmModel) used.set(settings.llmModel, 'main model');
    return used;
  };
  const known = conns.flatMap((conn) => rowsOf(conn).map((m): [string, string] => [m.id, m.label]));
  const any = !words.length || conns.some((conn) => rowsOf(conn).some((m) => words.every((w) => `${m.label} ${m.id} ${m.note} ${connectionName(conn)}`.toLowerCase().includes(w))));

  return (
    <>
      {!ready(main) && (
        <div className="field-hint section-hint error">
          {connectionName(main)} has no key yet, so the AI features can’t answer. <button className="link-button" onClick={() => onSection('providers')}>Add it in Settings › Providers</button>.
        </div>
      )}
      <h3 className="form-section-title">Default models</h3>
      <div className="field-hint section-hint">
        Chosen from the models of the providers connected in <button className="link-button" onClick={() => onSection('providers')}>Settings › Providers</button>.
      </div>
      <div className="field">
        <label id="settings-llmModelPick">Main model</label>
        <Select labelId="settings-llmModelPick" value={typedMain ? 'other' : mainValue} options={[...mainChoices, ['other', 'Other…']]} onChange={chooseMain} />
        {typedMain && (
          <>
            <input
              className="input"
              aria-label={`Main model name${multi ? `, on ${connectionName(main)}` : ''}`}
              list="settings-llmModel-list"
              value={settings.llmModel}
              placeholder={mainPreset?.recommended.main || 'Model name'}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              autoComplete="off"
              onChange={(e) => update({ llmModel: e.target.value })}
            />
            <datalist id="settings-llmModel-list">{rowsOf(main).filter((m) => !m.known).map((m) => <option key={m.id} value={m.id} />)}</datalist>
          </>
        )}
        <div className="field-hint">
          {[
            typedMain
              ? `Type the model’s name exactly as ${multi ? connectionName(main) : 'the provider'} lists it.`
              : !mainModel
                ? 'Listed by the provider. Spectrum has no notes on this model.'
                : [mainModel.note && `${mainModel.note}.`, !mainModel.vision && (imagesGoElsewhere ? 'Reads text only, so images go to the vision model.' : 'Reads text only, so set a vision model below for images.')].filter(Boolean).join(' '),
            'The assistant and the Spectrum agent use it.'
          ]
            .filter(Boolean)
            .join(' ')}
        </div>
      </div>
      <div className="field">
        <label id="settings-reasoningEffort">Reasoning effort</label>
        <Select
          labelId="settings-reasoningEffort"
          value={effortChoices.some(([value]) => value === settings.reasoningEffort) ? settings.reasoningEffort : 'default'}
          options={effortChoices}
          onChange={(value) => update({ reasoningEffort: value as AppSettings['reasoningEffort'] })}
        />
        <div className="field-hint">How long the main model may think before answering. Higher levels are slower and cost more.</div>
      </div>
      {roleField('quick')}
      {roleField('vision')}

      <h3 className="form-section-title">Models in the menus</h3>
      <div className="field-hint section-hint">
        A model switched off leaves the model menus: the Spectrum agent’s and the ones above. Beside each is its context and its price for input and output, per million tokens, from models.dev unless you have typed your own.
      </div>
      <label className="search-field model-search">
        <Icon name="magnifyingglass" />
        <input type="search" aria-label="Search models" placeholder="Search models" value={query} spellCheck={false} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="provider-list">
        {conns.map((conn) => (
          <ProviderModels
            key={conn.at}
            conn={conn}
            settings={settings}
            update={update}
            auto={auto.prices}
            words={words}
            open={!!open[conn.at]}
            onToggle={() => setOpen((was) => ({ ...was, [conn.at]: !was[conn.at] }))}
            onListed={(at, found) => setListed((was) => ({ ...was, [at]: found }))}
            onPrice={(id) => {
              setPicked({ main: settings.llmModel, id });
              prices.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
            }}
            inUse={inUse(conn)}
          />
        ))}
        {!any && <div className="field-hint">No model matches “{query.trim()}”.</div>}
      </div>

      <h3 ref={prices} className="form-section-title">Prices</h3>
      <ModelPrices settings={settings} update={update} known={known} picked={picked} setPicked={setPicked} />
    </>
  );
}
