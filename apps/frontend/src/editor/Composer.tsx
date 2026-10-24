import { useEffect, useRef, useState } from 'react';
import { addReference, getChat, resolveReferences, runAgent, visionToLatex } from '../api/client';
import type { ChatMessage, ChatMode, ChatThread, ReferenceResult } from '../api/client';
import Icon from '../app/Icon';
import Select from '../app/Select';
import { MenuButton } from '../app/Menu';
import { effortOptions, modelOf, presetOf, searchConfigFor, updateSettings, useLivePreset, useProviders } from '../app/settings';
import { useEditor } from './EditorContext';
import type { PendingChange } from './EditorContext';
import { Markdown, VISION_HINTS, VISION_MODES, buildProjectContext, citationText, errorText, isTex, patchesToChanges } from './shared';
import type { VisionMode } from './shared';
import { chatMessage, useChatThread } from './chatThread';
import { resolveInstructions } from './personas';
import { PersonaPicker } from './agent/parts';
import ChatsList from './ChatsList';

type QuickAction = 'polish' | 'rewrite' | 'structure' | 'translate';
type TranslateScope = 'selection' | 'file' | 'project';
type ProposedFile = { filePath: string; proposed: string };
type ReferencesMeta = { results: ReferenceResult[]; bibFile: string; bibIncluded: boolean };
/** what we keep in ChatMessage.meta */
type MessageMeta = { changes?: ProposedFile[]; references?: ReferencesMeta; latex?: string; error?: boolean };

const LANGUAGES = ['English', 'Chinese', 'Japanese', 'Korean', 'French', 'German', 'Spanish'];
const ACTION_VERBS: Record<Exclude<QuickAction, 'translate'>, string> = { polish: 'Polish', rewrite: 'Rewrite', structure: 'Restructure' };

const msg = (role: ChatMessage['role'], content: string, meta?: MessageMeta) => chatMessage(role, content, meta);
const metaOf = (m: ChatMessage) => (m.meta || {}) as MessageMeta;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function summariseReferences(results: ReferenceResult[], bibFile: string) {
  const count = (...statuses: ReferenceResult['status'][]) => results.filter((r) => statuses.includes(r.status)).length;
  const added = count('added');
  const dup = count('duplicate');
  const choose = count('choose');
  const failed = count('not_found', 'error');
  return [
    added && `Added ${plural(added, 'reference')} to ${bibFile}.`,
    dup && `${plural(dup, 'reference')} ${dup === 1 ? 'is' : 'are'} already in the project.`,
    choose && 'Pick the right match below.',
    failed && `${plural(failed, 'item')} couldn’t be found.`
  ]
    .filter(Boolean)
    .join(' ');
}

const authorLine = (authors?: string[], year?: string, venue?: string) =>
  [authors?.length ? `${authors.slice(0, 3).join(', ')}${authors.length > 3 ? ' et al.' : ''}` : '', year, venue].filter(Boolean).join(' · ');

/**
 * Floating chat card at the bottom of the editor column. "Assistant" asks the main model about the open file (and
 * rewrites a selection for review); "References" turns DOIs, links, arXiv IDs or titles into .bib entries. Work on
 * the project's files is the agent workspace's.
 */
export default function Composer({
  open,
  onOpenChange,
  chatId,
  onChatIdChange,
  focusSignal,
  onContinueInAgent,
  onManagePersonas
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId: string | null;
  onChatIdChange: (id: string | null) => void;
  focusSignal: number;
  /** an Edit chat saved before 2.0 carries on as a Spectrum agent thread */
  onContinueInAgent: (chatId: string) => void;
  onManagePersonas: () => void;
}) {
  const api = useEditor();
  // async handlers read the newest editor state, not the one from when they started
  const latest = useRef(api);
  latest.current = api;

  const [mode, setMode] = useState<ChatMode>('assistant');
  // the persona for a chat not started yet; a chat keeps its own
  const [newPersona, setNewPersona] = useState<string | undefined>();
  const providers = useProviders();
  const { preset } = useLivePreset(presetOf(providers, api.settings), api.settings.llmEndpoint);
  const effortChoices = effortOptions(modelOf(preset, api.settings.llmModel));
  const { thread, threadRef, show, append, update } = useChatThread({
    projectId: api.projectId,
    notify: api.notify,
    fresh: () => ({ mode, ...(newPersona && { persona: newPersona }) }),
    onCreate: onChatIdChange
  });
  const [input, setInput] = useState('');
  // the history menu: every saved Ask and References chat, and the Edit chats from before 2.0
  const [history, setHistory] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('');
  /** chats with a request running; the spinner and the disabled send belong to those chats only */
  const [busyChats, setBusyChats] = useState<string[]>([]);
  const [useSelection, setUseSelection] = useState(true);
  const [scope, setScope] = useState<TranslateScope>('selection');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const visionModeRef = useRef<VisionMode>('equation');

  const busy = !!thread && busyChats.includes(thread.id);
  const hasSelection = Boolean(api.selectionText);
  const translateScope: TranslateScope = scope === 'selection' && !hasSelection ? 'file' : scope;
  const personaId = thread ? thread.persona : newPersona;

  // open the chat picked in the Chats list
  useEffect(() => {
    if ((threadRef.current?.id ?? null) === chatId) return;
    if (!chatId) {
      show(null);
      return;
    }
    let live = true;
    getChat(api.projectId, chatId)
      .then((res) => {
        if (!live) return;
        show(res.chat);
        setMode(res.chat.mode);
      })
      .catch((err) => latest.current.notify(`Couldn’t open the chat: ${errorText(err)}`, 'error'));
    return () => {
      live = false;
    };
  }, [chatId, api.projectId]);

  // focus when opened or asked to (⌘L), but leave the editor focused on first load
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current && open) inputRef.current?.focus();
    mounted.current = true;
  }, [focusSignal, open]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread?.messages.length, busy, open]);

  /** owner: the thread as it was when the action started (the user may have switched chats since) */
  const updateMeta = (owner: ChatThread, index: number, meta: MessageMeta) =>
    update(owner, (chat) => ({ ...chat, messages: chat.messages.map((m, i) => (i === index ? { ...m, meta } : m)) }));

  const choosePersona = (id: string | undefined) => {
    if (thread) update(thread, (chat) => ({ ...chat, persona: id }));
    else setNewPersona(id);
  };

  const startNewChat = () => {
    setHistory(false);
    show(null);
    onChatIdChange(null);
    inputRef.current?.focus();
  };

  const switchMode = (next: ChatMode) => {
    if (next === mode) return;
    if (threadRef.current?.messages.length) startNewChat();
    setMode(next);
    inputRef.current?.focus();
  };

  const insertCite = async (key: string) => {
    const a = latest.current;
    if (!isTex(a.activePath)) {
      a.notify('Open a .tex file to insert the citation.');
      return;
    }
    a.insertAtCursor(await citationText(a, [key]), { afterSelection: true });
  };

  const afterReferences = async (results: ReferenceResult[], bibFile: string) => {
    const a = latest.current;
    if (!results.some((r) => r.status === 'added')) return;
    if (!a.bibFiles.includes(bibFile)) await a.refreshTree();
    await a.reloadFiles([bibFile]);
  };

  /** Cites a single looked-up reference at the cursor, but only where the user has put it (and without taking focus from here). */
  const autoCite = async (results: ReferenceResult[]) => {
    const [only] = results;
    const a = latest.current;
    if (!a.settings.autoInsertCite || results.length !== 1 || !only.key || (only.status !== 'added' && only.status !== 'duplicate')) return;
    const cite = await citationText(a, [only.key]);
    const line = isTex(a.activePath) ? a.insertAtCursor(cite, { afterSelection: true, focus: false, placedOnly: true }) : null;
    a.notify(line ? `Inserted ${cite} in ${a.activePath.split('/').pop()}, line ${line}.` : `Click where ${cite} should go, then choose Insert citation.`);
  };

  const markBusy = (chatId: string, on: boolean) => setBusyChats((prev) => (on ? [...prev, chatId] : prev.filter((id) => id !== chatId)));

  const sendReferences = async (text: string) => {
    setInput('');
    const base = append(threadRef.current, msg('user', text));
    markBusy(base.id, true);
    try {
      const res = await resolveReferences({ projectId: api.projectId, input: text, llmConfig: api.llm.quick,
        searchConfig: searchConfigFor(api.settings, api.llm.search) });
      if (!res.ok) throw new Error(res.error || 'The lookup failed.');
      const references: ReferencesMeta = { results: res.results, bibFile: res.bibFile, bibIncluded: res.bibIncluded };
      append(base, msg('assistant', summariseReferences(res.results, res.bibFile) || 'Nothing to add.', { references }));
      await afterReferences(res.results, res.bibFile);
      await autoCite(res.results);
    } catch (err) {
      append(base, msg('assistant', `Couldn’t look that up: ${errorText(err)}`, { error: true }));
    } finally {
      markBusy(base.id, false);
    }
  };

  const addCandidate = async (index: number, resultIndex: number, candidateId: string) => {
    const owner = threadRef.current;
    const message = owner?.messages[index];
    const refs = message && metaOf(message).references;
    if (!owner || !refs) return;
    markBusy(owner.id, true);
    try {
      const res = await addReference({ projectId: api.projectId, candidateId, bibFile: refs.bibFile,
        searchConfig: searchConfigFor(api.settings, api.llm.search) });
      if (!res.ok) throw new Error(res.error || 'The reference couldn’t be added.');
      const results = refs.results.map((r, i) => (i === resultIndex ? { ...res.result, input: r.input } : r));
      updateMeta(owner, index, { ...metaOf(message), references: { results, bibFile: res.bibFile, bibIncluded: res.bibIncluded } });
      await afterReferences([res.result], res.bibFile);
      autoCite([res.result]);
    } catch (err) {
      latest.current.notify(errorText(err), 'error');
    } finally {
      markBusy(owner.id, false);
    }
  };

  const actionLabel = (action: QuickAction, language: string, withSelection: boolean) => {
    if (action !== 'translate') return `${ACTION_VERBS[action]} the ${withSelection ? 'selection' : 'current file'}`;
    const target = { selection: 'the selection', file: 'the current file', project: 'the whole project' }[translateScope];
    return `Translate ${target} to ${language}`;
  };

  const sendAssistant = async (text: string, action?: QuickAction, language = 'English') => {
    // snapshot: the editor keeps changing while the model works
    const { activePath, editorValue, selectionRange } = api;
    const selection = useSelection ? api.selectionText : '';
    const chat = !action;
    if (!chat && !activePath) {
      api.notify('Open a file first.');
      return;
    }
    if (action === 'translate' && translateScope === 'selection' && !selection) {
      api.notify('Select some text to translate first.');
      return;
    }
    const label = action ? actionLabel(action, language, Boolean(selection)) : '';
    setInput('');
    const base = append(threadRef.current, msg('user', label ? [label, text].filter(Boolean).join('\n\n') : text));
    markBusy(base.id, true);
    try {
      let prompt = text;
      let agentMode: 'direct' | 'tools' = chat || action ? 'direct' : 'tools';
      let selectionArg = selection;
      let content = editorValue;
      if (action === 'translate') {
        const note = text ? `\nUser note: ${text}` : '';
        if (translateScope === 'project') {
          agentMode = 'tools';
          selectionArg = '';
          content = '';
          prompt = `Translate all .tex files in the project to ${language}. Preserve LaTeX commands and structure.${note}`;
        } else if (translateScope === 'file') {
          selectionArg = '';
          prompt = `Translate the current file to ${language}. Preserve LaTeX commands and structure.${note}`;
        } else {
          prompt = `Translate the selected text to ${language}. Preserve LaTeX commands and structure.${note}`;
        }
      }
      if (!chat) {
        const context = await buildProjectContext(api);
        if (context) prompt = `${prompt}\n\n[Project Context]\n${context}`;
      }
      const history = chat
        ? base.messages
            .slice(0, -1)
            .filter((m) => m.content && !metaOf(m).error)
            .slice(-8)
            .map((m) => ({ role: m.role, content: m.content }))
        : [];
      const res = await runAgent({
        task: action || (chat ? 'chat' : 'custom'),
        prompt,
        selection: selectionArg,
        content,
        mode: agentMode,
        projectId: api.projectId,
        activePath,
        compileLog: api.compileLog,
        llmConfig: api.llm.main,
        searchConfig: searchConfigFor(api.settings, api.llm.search),
        interaction: chat ? 'chat' : 'agent',
        history,
        reasoningEffort: api.settings.reasoningEffort,
        instructions: resolveInstructions(api.settings, personaId) || undefined
      });
      // the backend words AI failures as a reply; show them as errors, kept out of the history
      if (!res.ok) throw new Error(res.reply || 'The AI request failed.');
      const source = label || 'Assistant';
      let changes: PendingChange[] = [];
      if (!chat && res.patches?.length) {
        changes = await patchesToChanges(latest.current, res.patches, source);
      } else if (!chat && res.suggestion) {
        const [start, end] = selectionRange;
        const proposed = selectionArg && end > start ? editorValue.slice(0, start) + res.suggestion + editorValue.slice(end) : res.suggestion;
        changes = [{ filePath: activePath, original: editorValue, proposed, source }];
      }
      changes = changes.filter((c) => c.original !== c.proposed);
      const fallback = chat ? 'No reply.' : changes.length ? 'Suggested changes are ready to review.' : 'No changes were suggested.';
      append(
        base,
        msg('assistant', res.reply || fallback, changes.length ? { changes: changes.map(({ filePath, proposed }) => ({ filePath, proposed })) } : undefined)
      );
      if (changes.length) latest.current.proposeChanges(changes);
    } catch (err) {
      append(base, msg('assistant', `Request failed: ${errorText(err)}`, { error: true }));
    } finally {
      markBusy(base.id, false);
    }
  };

  const imageToLatex = async (file: File, visionMode: VisionMode) => {
    const extra = input.trim();
    const label = VISION_MODES.find(([v]) => v === visionMode)?.[1] || visionMode;
    setInput('');
    const base = append(threadRef.current, msg('user', `Image → LaTeX (${label}): ${file.name}${extra ? `\n\n${extra}` : ''}`));
    markBusy(base.id, true);
    try {
      const res = await visionToLatex({ projectId: api.projectId, file, mode: visionMode, prompt: extra || VISION_HINTS[visionMode], llmConfig: api.llm.vision });
      if (!res.ok) throw new Error(res.error || 'The image couldn’t be read.');
      const latex = (res.latex || '').trim();
      append(base, msg('assistant', `\`\`\`latex\n${latex}\n\`\`\``, { latex }));
      if (res.assetPath) await latest.current.refreshTree();
    } catch (err) {
      append(base, msg('assistant', `Couldn’t convert the image: ${errorText(err)}`, { error: true }));
    } finally {
      markBusy(base.id, false);
    }
  };

  const review = async (files: ProposedFile[]) => {
    const a = latest.current;
    const changes = await Promise.all(
      files.map(async (f) => ({ filePath: f.filePath, original: await a.ensureFileContent(f.filePath).catch(() => ''), proposed: f.proposed, source: 'Assistant' }))
    );
    const open = changes.filter((c) => c.original !== c.proposed);
    if (!open.length) a.notify('These changes are already in your files.');
    else a.proposeChanges(open, { open: true });
  };

  const send = (action?: QuickAction, language?: string) => {
    const text = input.trim();
    if (busy) return;
    if (mode === 'references') {
      if (text) sendReferences(text);
    } else if (text || action) {
      sendAssistant(text, action, language);
    }
  };

  const messages = thread?.messages || [];
  const placeholder = mode === 'references' ? 'Paste a DOI, link, arXiv ID or title' : 'Ask anything';
  // an Edit chat from before 2.0, whose suggested changes the agent workspace now looks after
  const editChat = mode === 'assistant' && messages.some((m) => metaOf(m).changes?.length);

  const renderReferences = (refs: ReferencesMeta, index: number) => {
    const bibName = refs.bibFile.split('/').pop()?.replace(/\.bib$/i, '') || 'references';
    const cited = refs.results.some((r) => r.status === 'added' || r.status === 'duplicate');
    return (
      <div className="ref-cards">
        {refs.results.map((r, ri) => (
          <div key={ri} className={`ref-card ${r.status}`}>
            {(r.status === 'added' || r.status === 'duplicate') && (
              <>
                <div className="ref-card-head">
                  <span className={`badge ${r.status === 'added' ? 'success' : ''}`}>{r.status === 'added' ? 'Added' : 'Already there'}</span>
                  <code className="ref-key">{r.key}</code>
                </div>
                {r.title && <div className="ref-title">{r.title}</div>}
                {authorLine(r.authors, r.year) && <div className="ref-meta">{authorLine(r.authors, r.year)}</div>}
                {r.status === 'duplicate' && (
                  <div className="ref-meta">
                    Already in {r.bibFile || refs.bibFile} as <code>{r.key}</code>
                  </div>
                )}
                {r.bibtex && (
                  <details className="ref-bibtex">
                    <summary>BibTeX</summary>
                    <pre>{r.bibtex}</pre>
                  </details>
                )}
                {r.key && (
                  <button className="btn small" onClick={() => insertCite(r.key!)}>
                    <Icon name="text.insert" /> Insert citation
                  </button>
                )}
              </>
            )}
            {r.status === 'choose' && (
              <>
                <div className="ref-meta">Several matches for “{r.input}”</div>
                {(r.candidates || []).map((c) => (
                  <div key={c.id} className="ref-candidate">
                    <div className="grow">
                      <div className="ref-title">{c.title}</div>
                      <div className="ref-meta">{authorLine(c.authors, c.year, c.venue)}</div>
                    </div>
                    <button className="btn small" disabled={busy} onClick={() => addCandidate(index, ri, c.id)}>Add</button>
                  </div>
                ))}
              </>
            )}
            {(r.status === 'not_found' || r.status === 'error') && (
              <div className="ref-meta">
                <Icon name="exclamationmark.triangle" /> {r.message || `No match found for “${r.input}”.`}
              </div>
            )}
          </div>
        ))}
        {cited && !refs.bibIncluded && (
          <div className="composer-hint">
            {refs.bibFile} isn’t included in {api.mainFile || 'the main file'} yet — add <code>{`\\bibliography{${bibName}}`}</code>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="composer-dock" hidden={!open}>
      <div className="composer">
        <div className="composer-head">
          <div className="segmented small" role="tablist">
            {(['assistant', 'references'] as ChatMode[]).map((m) => (
              <button key={m} role="tab" aria-selected={mode === m} className={`segment ${mode === m ? 'active' : ''}`} onClick={() => switchMode(m)}>
                {m === 'assistant' ? 'Assistant' : 'References'}
              </button>
            ))}
          </div>
          <span className="composer-title">{history ? 'History' : thread?.title}</span>
          <button
            className={`icon-btn ${history ? 'active' : ''}`}
            title="History"
            aria-label="History"
            aria-pressed={history}
            onClick={() => {
              setHistory((v) => !v);
              setHistoryFilter('');
            }}
          >
            <Icon name="clock.arrow.circlepath" />
          </button>
          <button className="icon-btn" title="New chat" aria-label="New chat" onClick={startNewChat} disabled={!messages.length && !history}>
            <Icon name="square.and.pencil" />
          </button>
          <button className="icon-btn" title="Close" aria-label="Close" onClick={() => onOpenChange(false)}>
            <Icon name="xmark" />
          </button>
        </div>

        {history && (
          <div className="composer-history">
            <label className="search-field">
              <Icon name="magnifyingglass" />
              <input
                autoFocus
                value={historyFilter}
                placeholder="Search chats"
                aria-label="Search chats"
                onChange={(e) => setHistoryFilter(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setHistory(false)}
              />
            </label>
            <ChatsList
              activeChatId={thread?.id ?? null}
              filter={historyFilter}
              onOpen={(id) => {
                setHistory(false);
                onChatIdChange(id);
              }}
              onNew={startNewChat}
              refreshSignal={0}
            />
          </div>
        )}

        <div className="composer-messages" ref={listRef} role="log" hidden={history}>
          {messages.length === 0 && (
            <div className="composer-welcome">
              {mode === 'assistant' ? (
                <>
                  <div className="composer-welcome-title">How can I help with your paper?</div>
                  <div>
                    Ask a question about the open file. Select text first to polish, rewrite or translate it. For changes across the project, open the
                    agent workspace. To add a citation, switch to References.
                  </div>
                </>
              ) : (
                <>
                  <div className="composer-welcome-title">Add a reference</div>
                  <div>
                    Paste a DOI, a link, an arXiv ID or a paper title — one per line for several. Each is looked up online and added to your .bib
                    with a key like Vaswani2017.
                  </div>
                </>
              )}
            </div>
          )}
          {messages.map((m, i) => {
            const meta = metaOf(m);
            return (
              <div key={i} className={`composer-msg ${m.role} ${meta.error ? 'error' : ''}`}>
                {m.role === 'user' ? <div className="composer-bubble">{m.content}</div> : <Markdown>{m.content}</Markdown>}
                {meta.references && renderReferences(meta.references, i)}
                {meta.latex && (
                  <button className="btn small" onClick={() => api.insertAtCursor(meta.latex!, { block: true })}>
                    <Icon name="text.insert" /> Insert at cursor
                  </button>
                )}
                {meta.changes && meta.changes.length > 0 && (
                  <button className="btn small" onClick={() => review(meta.changes!)}>
                    <Icon name="plus.forwardslash.minus" /> Review {plural(meta.changes.length, 'change')}
                  </button>
                )}
              </div>
            );
          })}
          {busy && (
            <div className="composer-msg assistant composer-thinking">
              <span className="spinner" /> {mode === 'references' ? 'Looking it up…' : 'Thinking…'}
            </div>
          )}
          {editChat && thread && (
            <div className="composer-hint row">
              <span className="grow">Edit now lives in the agent workspace as the Spectrum agent.</span>
              <button className="btn small" onClick={() => onContinueInAgent(thread.id)}>
                Continue there
              </button>
            </div>
          )}
        </div>

        {mode === 'assistant' && hasSelection && (
          <div className="composer-chips">
            {(Object.keys(ACTION_VERBS) as (keyof typeof ACTION_VERBS)[]).map((action) => (
              <button key={action} className="chip" disabled={busy} onClick={() => send(action)}>
                {ACTION_VERBS[action]}
              </button>
            ))}
            <MenuButton
              label="Translate"
              className="chip"
              disabled={busy}
              items={[
                ...LANGUAGES.map((language) => ({ label: language, onSelect: () => send('translate', language) })),
                { separator: true },
                { label: 'Scope', disabled: true },
                { label: 'Selection', checked: translateScope === 'selection', disabled: !hasSelection, onSelect: () => setScope('selection') },
                { label: 'Current file', checked: translateScope === 'file', onSelect: () => setScope('file') },
                { label: 'Whole project', checked: translateScope === 'project', onSelect: () => setScope('project') }
              ]}
            />
          </div>
        )}

        <textarea
          ref={inputRef}
          className="composer-input"
          rows={2}
          value={input}
          placeholder={placeholder}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            } else if (e.key === 'Escape') {
              onOpenChange(false);
            }
          }}
        />

        <div className="composer-bar">
          {mode === 'assistant' && (
            <>
              <MenuButton
                icon="plus"
                title="Attach"
                className="icon-btn composer-attach"
                disabled={busy}
                items={VISION_MODES.map(([value, label, icon]) => ({
                  label: `${label} from image…`,
                  icon,
                  onSelect: () => {
                    visionModeRef.current = value;
                    fileRef.current?.click();
                  }
                }))}
              />
              {hasSelection && (
                <button
                  className={`chip ${useSelection ? 'active' : ''}`}
                  title="Send the selected text with your message"
                  aria-pressed={useSelection}
                  onClick={() => setUseSelection((v) => !v)}
                >
                  <Icon name="text.cursor" /> Use selection
                </button>
              )}
              <PersonaPicker value={personaId} onChange={choosePersona} onManage={onManagePersonas} />
            </>
          )}
          <span className="grow" />
          {mode === 'assistant' && (
            <>
              <span id="composer-effort-label" hidden>
                Reasoning effort
              </span>
              <Select
                labelId="composer-effort-label"
                className="composer-effort"
                value={effortChoices.some(([value]) => value === api.settings.reasoningEffort) ? api.settings.reasoningEffort : 'default'}
                options={effortChoices.map(([value, label]): [string, string] => [value, `Thinking: ${label}`])}
                onChange={(value) => updateSettings({ reasoningEffort: value as typeof api.settings.reasoningEffort })}
                title="How long the model may think before answering"
              />
            </>
          )}
          <button className="composer-send" title="Send (↵)" aria-label="Send" disabled={busy || !input.trim()} onClick={() => send()}>
            {busy ? <span className="spinner" /> : <Icon name="arrow.up" />}
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) imageToLatex(file, visionModeRef.current);
          }}
        />
      </div>
    </div>
  );
}
