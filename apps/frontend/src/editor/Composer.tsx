import { useEffect, useRef, useState } from 'react';
import { docLanguage, translatePrompt } from '../../../backend/src/utils/docLanguage.js';
import { addReference, commitReference, getAgentInstructions, getChat, resolveReferences, runAgent } from '../api/client';
import type { ChatMessage, ChatMode, ChatThread, ReferenceDraft, ReferenceResult } from '../api/client';
import Icon from '../app/Icon';
import { MenuButton } from '../app/Menu';
import { presetOf, searchConfigFor, useLivePreset, useProviders } from '../app/settings';
import { useEditor } from './EditorContext';
import type { PendingChange } from './EditorContext';
import { Markdown, bibIncludeLine, changeStat, citationText, docKind, errorText, isDocument, patchesToChanges, reloadBib } from './shared';
import type { ChangeStat, Locator } from './shared';
import { ZOTERO_CITE } from './zotero';
import { assistantSaid, chatMessage, isEditChat, useChatThread } from './chatThread';
import { resolveInstructions } from './personas';
import { PersonaPicker } from './agent/parts';
import { INSTRUCTIONS_FILE } from './agent/instructions';
import AgentTuning, { LOGO } from './agent/AgentTuning';
import type { ConfigOption } from './agent/AgentTuning';
import { holdsSend, turnChoice } from './agent/usage';
import { ModelOffNotice } from './agent/AgentHeader';
import type { TurnChoice } from './agent/usage';
import ChatsList from './ChatsList';
import ReferenceDraftCard, { sourceBadge } from './ReferenceDraftCard';

type QuickAction = 'polish' | 'rewrite' | 'structure' | 'translate';
type TranslateScope = 'selection' | 'file' | 'project';
/** status: applied from its card, so the Spectrum agent doesn't offer it again */
type ProposedFile = { filePath: string; proposed: string; status?: 'applied' };
type ReferencesMeta = { results: ReferenceResult[]; bibFile: string; bibIncluded: boolean; biblatex?: boolean; legacyUrls?: boolean };
/** what we keep in ChatMessage.meta */
type MessageMeta = {
  changes?: ProposedFile[]; quick?: boolean; action?: QuickAction; stat?: ChangeStat; references?: ReferencesMeta;
  error?: boolean; /** the answer stopped at the model's output limit */ cut?: boolean
};

const LANGUAGES = ['English', 'Chinese', 'Japanese', 'Korean', 'French', 'German', 'Spanish'];
const ACTION_VERBS: Record<Exclude<QuickAction, 'translate'>, string> = { polish: 'Polish', rewrite: 'Rewrite', structure: 'Restructure' };
/** each quick action's icon and colour, along the logo's spectrum */
const ACTION_LOOKS: Record<QuickAction, [icon: string, colour: string]> = {
  polish: ['sparkle', LOGO[1]], rewrite: ['pencil', LOGO[4]], structure: ['list.bullet', 'var(--green)'], translate: ['globe', LOGO[5]]
};
const SUGGESTED: Record<QuickAction, string> = { polish: 'polish', rewrite: 'rewrite', structure: 'restructure', translate: 'translation' };

/** the inputs the References tab can be tried with, as its empty chat offers them */
const SAMPLES: [label: string, input: string | null][] = [
  ['ISBN book', 'ISBN 978-0-262-04630-5'],
  ['Formatted APA citation', 'Goodfellow, I., Bengio, Y., & Courville, A. (2016). Deep learning. MIT Press.'],
  ['Hardware manual (@manual)', null],
  ['Pasted BibTeX', '@inbook{Knuth1997,\n  author    = {Knuth, Donald E.},\n  title     = {Fundamental Algorithms},\n  booktitle = {The Art of Computer Programming},\n  chapter   = {2},\n  publisher = {Addison-Wesley},\n  year      = {1997}\n}']
];

const msg = (role: ChatMessage['role'], content: string, meta?: MessageMeta) => chatMessage(role, content, meta);
const metaOf = (m: ChatMessage) => (m.meta || {}) as MessageMeta;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function summariseReferences(results: ReferenceResult[], bibFile: string) {
  const count = (...statuses: ReferenceResult['status'][]) => results.filter((r) => statuses.includes(r.status)).length;
  const drafts = count('draft');
  const added = count('added');
  const dup = count('duplicate');
  const choose = count('choose');
  const failed = count('not_found', 'error');
  return [
    drafts && (drafts === 1 ? 'Check the entry, then add it.' : `Check the ${drafts} entries, then add them.`),
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
 * rewrites a selection for review); "References" turns DOIs, ISBNs, links, arXiv IDs, titles, formatted citations and
 * pasted BibTeX or RIS into entries to check before they go in the .bib. Work on the project's files is the agent
 * workspace's.
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
  // a chat not started yet keeps its model and effort here; a chat keeps its own, as a Spectrum agent thread does
  const [newChoice, setNewChoice] = useState<TurnChoice>({});
  const { thread, threadRef, show, append, update } = useChatThread({
    projectId: api.projectId,
    notify: api.notify,
    fresh: () => ({ mode, ...(newPersona && { persona: newPersona }), ...newChoice }),
    onCreate: onChatIdChange
  });
  const choice = turnChoice(preset, api.settings, thread ? { model: thread.model, effort: thread.effort } : newChoice);
  const tuning: ConfigOption[] = choice.models.length ? [
    { id: 'model', name: 'Model', category: 'model', currentValue: choice.model, options: choice.models.map(([value, name]) => ({ value, name })) },
    ...(choice.efforts.length > 1 ? [{ id: 'effort', name: 'Thinking', category: 'thought_level', currentValue: choice.effort, options: choice.efforts.map(([value, name]) => ({ value, name })) }] : [])
  ] : [];
  const choose = (c: TurnChoice) => (thread ? update(thread, (chat) => ({ ...chat, ...c })) : setNewChoice((old) => ({ ...old, ...c })));
  // the chat's model switched off in Settings › Models: it keeps the model, a notice says so, and sending waits until
  // another is chosen or it is switched back on, as in the Spectrum agent's tab
  const held = holdsSend(choice, mode);
  const [menuOpened, setMenuOpened] = useState(0);
  // the project's citation keys as the last look-up gave them, which a draft's key is checked against
  const keysRef = useRef(new Set<string>());
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

  const busy = !!thread && busyChats.includes(thread.id);
  const hasSelection = Boolean(api.selectionText);
  const translateScope: TranslateScope = scope === 'selection' && !hasSelection ? 'file' : scope;
  const personaId = thread ? thread.persona : newPersona;
  // whether the project's AGENTS.md is approved, so every request here is given it: read as the panel opens and after
  // each request (the approval itself lives in the Spectrum agent tab)
  const [rulesOn, setRulesOn] = useState(false);
  useEffect(() => {
    if (open && !busy) void getAgentInstructions(api.projectId).then((s) => setRulesOn(s.approved), () => setRulesOn(false));
  }, [api.projectId, open, busy]);

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

  const insertCite = async (key: string, locator?: Locator | null) => {
    const a = latest.current;
    if (!isDocument(a.activePath)) {
      a.notify('Open a document to insert the citation.');
      return;
    }
    a.insertAtCursor(await citationText(a, [key], locator), { afterSelection: true });
  };

  const afterReferences = (results: ReferenceResult[], bibFile: string) => reloadBib(latest.current, results, bibFile);

  /** Cites a single reference added or already there at the cursor, but only where the user has put it (and without taking focus from here). */
  const autoCite = async (results: ReferenceResult[]) => {
    const [only] = results;
    const a = latest.current;
    if (!a.settings.autoInsertCite || results.length !== 1 || !only.key || (only.status !== 'added' && only.status !== 'duplicate')) return;
    const cite = await citationText(a, [only.key]);
    const line = isDocument(a.activePath) ? a.insertAtCursor(cite, { afterSelection: true, focus: false, placedOnly: true }) : null;
    a.notify(line ? `Inserted ${cite} in ${a.activePath.split('/').pop()}, line ${line}.` : `Click where ${cite} should go, then choose Insert citation.`);
  };

  const markBusy = (chatId: string, on: boolean) => setBusyChats((prev) => (on ? [...prev, chatId] : prev.filter((id) => id !== chatId)));

  const sendReferences = async (text: string) => {
    setInput('');
    const base = append(threadRef.current, msg('user', text));
    markBusy(base.id, true);
    try {
      // drafts: nothing is written until a card's Add
      const res = await resolveReferences({ projectId: api.projectId, input: text, llmConfig: api.llm.quick,
        searchConfig: searchConfigFor(api.settings, api.llm.search), preview: true });
      if (!res.ok) throw new Error(res.error || 'The lookup failed.');
      keysRef.current = new Set(res.keys || []);
      const references: ReferencesMeta = { results: res.results, bibFile: res.bibFile, bibIncluded: res.bibIncluded, biblatex: res.biblatex, legacyUrls: res.legacyUrls };
      append(base, msg('assistant', summariseReferences(res.results, res.bibFile) || 'Nothing to add.', { references }));
      await autoCite(res.results);
    } catch (err) {
      append(base, msg('assistant', `Couldn’t look that up: ${errorText(err)}`, { error: true }));
    } finally {
      markBusy(base.id, false);
    }
  };

  /** A blank draft to fill in (of type, for the manual sample) */
  const newEntry = async (type?: string) => {
    if (mode !== 'references') switchMode('references');
    const base = append(threadRef.current?.mode === 'references' ? threadRef.current : null, msg('user', type ? `New @${type} entry` : 'New entry'));
    markBusy(base.id, true);
    try {
      const res = await resolveReferences({ projectId: api.projectId, manual: true });
      if (!res.ok) throw new Error(res.error || 'Couldn’t start an entry.');
      keysRef.current = new Set(res.keys || []);
      const results = type ? res.results.map((r) => ({ ...r, draft: { ...r.draft!, type } })) : res.results;
      append(base, msg('assistant', 'Fill in the entry, then add it.', { references: { results, bibFile: res.bibFile, bibIncluded: res.bibIncluded, biblatex: res.biblatex, legacyUrls: res.legacyUrls } }));
    } catch (err) {
      append(base, msg('assistant', `Couldn’t start an entry: ${errorText(err)}`, { error: true }));
    } finally {
      markBusy(base.id, false);
    }
  };

  /** One result of a References message replaced, as a look-up or an add gave it */
  const replaceResult = (owner: ChatThread, index: number, resultIndex: number, next: ReferenceResult, extra: Partial<ReferencesMeta> = {}) => {
    const message = owner.messages[index];
    const refs = metaOf(message).references!;
    const results = refs.results.map((r, i) => (i === resultIndex ? { ...next, input: r.input } : r));
    updateMeta(owner, index, { ...metaOf(message), references: { ...refs, ...extra, results } });
  };

  const addCandidate = async (index: number, resultIndex: number, candidateId: string, work?: string) => {
    const owner = threadRef.current;
    const message = owner?.messages[index];
    const refs = message && metaOf(message).references;
    if (!owner || !refs) return;
    markBusy(owner.id, true);
    try {
      const res = await addReference({ projectId: api.projectId, candidateId, bibFile: refs.bibFile,
        searchConfig: searchConfigFor(api.settings, api.llm.search), preview: true });
      if (!res.ok) throw new Error(res.error || 'The reference couldn’t be looked up.');
      if (res.keys) keysRef.current = new Set(res.keys);
      replaceResult(owner, index, resultIndex, { ...res.result, ...(work && !res.result.work && res.result.status === 'draft' && { work }) }, { bibFile: res.bibFile, bibIncluded: res.bibIncluded, biblatex: res.biblatex, legacyUrls: res.legacyUrls });
      autoCite([res.result]);
    } catch (err) {
      latest.current.notify(errorText(err), 'error');
    } finally {
      markBusy(owner.id, false);
    }
  };

  /** A checked draft written to the .bib, and cited at the cursor with its locator when insert says so */
  const addDraft = async (index: number, resultIndex: number, draft: ReferenceDraft, insert: { locator: Locator | null } | null) => {
    const owner = threadRef.current;
    const message = owner?.messages[index];
    const refs = message && metaOf(message).references;
    if (!owner || !refs) return;
    markBusy(owner.id, true);
    try {
      const res = await commitReference({ projectId: api.projectId, draft, bibFile: refs.bibFile, input: refs.results[resultIndex]?.input });
      if (!res.ok) throw new Error(res.error || 'The reference couldn’t be added.');
      replaceResult(owner, index, resultIndex, res.result, { bibFile: res.bibFile, bibIncluded: res.bibIncluded });
      if (res.result.key) keysRef.current.add(res.result.key.toLowerCase());
      await afterReferences([res.result], res.bibFile);
      if (insert && res.result.key && (res.result.status === 'added' || res.result.status === 'duplicate')) await insertCite(res.result.key, insert.locator);
      // Add alone cites it too when Settings › Editor asks for that after adding a reference
      else if (!insert) await autoCite([res.result]);
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
    // what was typed stays in the box
    if (held) return;
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
        // in the words of the document's own language: the open file's, or else the main file's
        prompt = translatePrompt(translateScope, language, docLanguage(activePath, api.mainFile), text);
        if (translateScope === 'project') {
          agentMode = 'tools';
          selectionArg = '';
          content = '';
        } else if (translateScope === 'file') {
          selectionArg = '';
        }
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
        // the chat's own model and effort, chosen in its message box
        llmConfig: { ...api.llm.main, model: choice.model || api.llm.main.model },
        searchConfig: searchConfigFor(api.settings, api.llm.search),
        interaction: chat ? 'chat' : 'agent',
        history,
        reasoningEffort: choice.effort,
        instructions: resolveInstructions(api.settings, personaId) || undefined
      });
      // the backend words AI failures as a reply; show them as errors, kept out of the history. A whole-project run
      // that failed part-way still hands back the changes it had prepared, which stay reviewable
      if (!res.ok && !res.patches?.length) throw new Error(res.reply || 'The AI request failed.');
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
      const said = assistantSaid(res, chat, changes.length > 0);
      const meta: MessageMeta = {
        ...(changes.length && { changes: changes.map(({ filePath, proposed }) => ({ filePath, proposed })), quick: true, stat: changeStat(changes), ...(action && { action }) }),
        ...(!res.ok && { error: true }),
        ...(res.incomplete === 'cut' && { cut: true })
      };
      append(base, msg('assistant', said, Object.keys(meta).length ? meta : undefined));
      if (changes.length) latest.current.proposeChanges(changes);
    } catch (err) {
      append(base, msg('assistant', `Request failed: ${errorText(err)}`, { error: true }));
    } finally {
      markBusy(base.id, false);
    }
  };

  /** A suggestion's changes against the files as they are now, those that would still change something */
  const openChangesOf = async (files: ProposedFile[]) => {
    const a = latest.current;
    const changes = await Promise.all(
      files.filter((f) => !f.status).map(async (f) => ({ filePath: f.filePath, original: await a.ensureFileContent(f.filePath).catch(() => ''), proposed: f.proposed, source: 'Assistant' }))
    );
    const open = changes.filter((c) => c.original !== c.proposed);
    if (!open.length) a.notify('These changes are already in your files.');
    return open;
  };

  const review = async (files: ProposedFile[]) => {
    const open = await openChangesOf(files);
    if (open.length) latest.current.proposeChanges(open, { open: true });
  };

  /** Apply change on a suggestion's card: written after the "Before AI changes" checkpoint, as Review's Accept writes it */
  const applySuggestion = async (index: number) => {
    const owner = threadRef.current;
    const message = owner?.messages[index];
    const meta = message && metaOf(message);
    if (!owner || !meta?.changes) return;
    try {
      const open = await openChangesOf(meta.changes);
      const { applied } = open.length ? await latest.current.applyChanges(open) : { applied: [] };
      const done = new Set(applied.map((c) => c.filePath));
      if (done.size || !open.length) updateMeta(owner, index, { ...meta, changes: meta.changes.map((c) => (done.has(c.filePath) || !open.length ? { ...c, status: 'applied' as const } : c)) });
    } catch (err) {
      latest.current.notify(`Couldn’t apply the change: ${errorText(err)}`, 'error');
    }
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
  const placeholder = mode === 'references' ? 'Paste a DOI, ISBN, link, arXiv ID, title, citation or BibTeX' : `Ask about ${api.activePath.split('/').pop() || 'your paper'}, or pick a quick action above`;
  // an Edit chat from before 2.0, whose suggested changes the agent workspace now looks after
  const editChat = mode === 'assistant' && isEditChat(messages);
  const selectionLines = hasSelection ? api.selectionText.replace(/\n$/, '').split('\n').length : 0;
  const lastDraft = [...messages].reverse().flatMap((m) => metaOf(m).references?.results.filter((r) => r.status === 'draft') || [])[0];
  const badge = mode === 'references'
    ? lastDraft && sourceBadge(lastDraft)
    : hasSelection ? { text: `${api.activePath.split('/').pop()} · ${plural(selectionLines, 'line')} selected`, tone: 'accent' } : null;
  const cite = (key: string, locator: Locator | null) => citationText(latest.current, [key], locator);

  const renderReferences = (refs: ReferencesMeta, index: number) => {
    const cited = refs.results.some((r) => r.status === 'added' || r.status === 'duplicate');
    return (
      <div className="ref-cards">
        {refs.results.map((r, ri) =>
          r.status === 'draft' ? (
            <ReferenceDraftCard
              key={`${index}-${ri}`}
              result={r}
              bibFile={refs.bibFile}
              biblatex={!!refs.biblatex}
              legacyUrls={!!refs.legacyUrls}
              keys={keysRef.current}
              busy={busy}
              cite={cite}
              onAdd={(draft, insert) => void addDraft(index, ri, draft, insert)}
            />
          ) : (
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
                    <button className="btn small outline" onClick={() => insertCite(r.key!)}>
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
                      <button className="btn small outline" disabled={busy} onClick={() => addCandidate(index, ri, c.id, c.work)}>Choose</button>
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
          )
        )}
        {cited && !refs.bibIncluded && (
          <div className="composer-hint">
            {docKind(api.mainFile) === 'markdown' ? (
              // a front matter that names a bibliography gets pandoc no other .bib, and a second bibliography: line is an error
              <>{refs.bibFile} isn’t in the front matter’s bibliography list in {api.mainFile} yet — add it to that list, as in <code>bibliography: [refs.bib, {refs.bibFile}]</code></>
            ) : (
              <>{refs.bibFile} isn’t included in {api.mainFile || 'the main file'} yet — add <code>{bibIncludeLine(api.mainFile, refs.bibFile)}</code></>
            )}
          </div>
        )}
      </div>
    );
  };

  /** A suggested edit, in the card a reference draft has: what changed and where, Apply, Review diff, and the agent */
  const renderSuggestion = (meta: MessageMeta, content: string, index: number) => {
    const files = meta.changes!;
    const applied = files.every((f) => f.status);
    const [icon, colour] = ACTION_LOOKS[meta.action || 'polish'];
    const only = files.length === 1 ? files[0].filePath.split('/').pop() : '';
    const where = only ? `${only}${meta.stat?.from ? `:${meta.stat.from}${meta.stat.to > meta.stat.from ? `–${meta.stat.to}` : ''}` : ''}` : plural(files.length, 'file');
    return (
      <div className="draft-card suggestion-card">
        <div className="dc-bar">
          <span className="dc-title">
            <Icon name={icon} style={{ color: colour }} />
            Suggested {meta.action ? SUGGESTED[meta.action] : 'changes'} · <code>{where}</code>
          </span>
          {applied ? <span className="badge success">Applied</span> : meta.stat && <span className="badge success">+{meta.stat.added} / −{meta.stat.removed} lines</span>}
        </div>
        {content && (
          <div className="dc-body">
            <Markdown>{content}</Markdown>
          </div>
        )}
        <div className="dc-actions">
          <button className="btn small outline" disabled={!thread} onClick={() => thread && onContinueInAgent(thread.id)}>
            <Icon name="paperplane" style={{ color: LOGO[4] }} /> Continue in Spectrum agent
          </button>
          <div className="dc-buttons">
            <button className="btn small outline" disabled={applied} onClick={() => review(files)}>Review diff</button>
            <button className="btn small primary" disabled={applied || busy} onClick={() => void applySuggestion(index)}>
              <Icon name="checkmark" /> Apply change
            </button>
          </div>
        </div>
      </div>
    );
  };

  const quickChip = (action: QuickAction, onClick?: () => void) => {
    const [icon, colour] = ACTION_LOOKS[action];
    const label = action === 'translate' ? 'Translate' : ACTION_VERBS[action];
    return (
      <button key={action} className="chip" disabled={busy || !api.activePath} onClick={onClick}>
        <Icon name={icon} style={{ color: colour }} /> {label}
      </button>
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
          {badge && !history && <span className={`badge ${badge.tone} composer-badge`}>{badge.text}</span>}
          <span className="composer-title">{history ? 'History' : thread?.title}</span>
          {mode === 'references' && !history && (
            <>
              <button className="btn small outline" disabled={busy} title="New entry: a blank one to fill in yourself" aria-label="New entry" onClick={() => void newEntry()}>
                <Icon name="plus" /> <span className="btn-label">New entry</span>
              </button>
              <button className="btn small outline" aria-label="Cite from Zotero" title="Pick references from your Zotero library and cite them at the cursor" onClick={() => window.dispatchEvent(new Event(ZOTERO_CITE))}>
                <Icon name="quote.opening" /> <span className="btn-label">Zotero</span>
              </button>
            </>
          )}
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

        {!history && mode === 'assistant' && (
          <div className="composer-presets">
            <span className="composer-presets-label">Quick actions:</span>
            {(Object.keys(ACTION_VERBS) as (keyof typeof ACTION_VERBS)[]).map((action) => quickChip(action, () => send(action)))}
            <MenuButton
              label={
                <>
                  <Icon name={ACTION_LOOKS.translate[0]} style={{ color: ACTION_LOOKS.translate[1] }} /> Translate
                </>
              }
              className="chip"
              disabled={busy || !api.activePath}
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
        {!history && mode === 'references' && messages.length === 0 && (
          <div className="composer-presets">
            <span className="composer-presets-label">Try input:</span>
            {SAMPLES.map(([label, sample]) => (
              <button
                key={label}
                className={`chip ${sample !== null && input === sample ? 'on' : ''}`}
                disabled={busy}
                onClick={() => {
                  if (sample === null) void newEntry('manual');
                  else {
                    setInput(sample);
                    inputRef.current?.focus();
                  }
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="composer-messages" ref={listRef} role="log" hidden={history}>
          {messages.length === 0 && (
            <div className="composer-welcome">
              {mode === 'assistant' ? (
                <>
                  <div className="composer-welcome-title">How can I help with your paper?</div>
                  <div>
                    Ask a question about the open file. A quick action works on the selection, or on the whole file when nothing is selected. For changes
                    across the project, open the agent workspace. To add a citation, switch to References.
                  </div>
                </>
              ) : (
                <>
                  <div className="composer-welcome-title">Add a reference</div>
                  <div>
                    Paste a DOI, an ISBN, a link, an arXiv ID, a title or a formatted citation, one per line for several, or BibTeX or RIS whole. Each is
                    looked up and shown as an entry to check before it goes in your .bib, with a key like Vaswani2017.
                  </div>
                </>
              )}
            </div>
          )}
          {messages.map((m, i) => {
            const meta = metaOf(m);
            const suggestion = m.role === 'assistant' && !!meta.changes?.length;
            return (
              <div key={i} className={`composer-msg ${m.role} ${meta.error ? 'error' : ''}`}>
                {m.role === 'user' ? <div className="composer-bubble">{m.content}</div> : !suggestion && m.content && <Markdown>{m.content}</Markdown>}
                {meta.references && renderReferences(meta.references, i)}
                {suggestion && renderSuggestion(meta, m.content, i)}
              </div>
            );
          })}
          {!busy && messages.length > 0 && metaOf(messages[messages.length - 1]).cut && (
            <div className="composer-hint row">
              <span className="grow">The answer was cut off by the model’s output limit.</span>
              <button className="btn small" onClick={() => void sendAssistant('Continue from where your last answer stopped, without repeating it.')}>
                Continue
              </button>
            </div>
          )}
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

        {mode === 'references' ? (
          <div className="composer-resolve">
            <textarea
              ref={inputRef}
              className="composer-input"
              rows={2}
              value={input}
              placeholder={placeholder}
              aria-label="References to look up"
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
            <button className="btn primary composer-resolve-btn" disabled={busy || !input.trim()} onClick={() => send()}>
              {busy ? <span className="spinner" /> : 'Resolve'}
            </button>
          </div>
        ) : (
          <>
          <ModelOffNotice choice={choice} onChoose={() => setMenuOpened((n) => n + 1)} />
          <div className="composer-box">
            <textarea
              ref={inputRef}
              className="composer-input"
              rows={2}
              value={input}
              placeholder={placeholder}
              aria-label="Message"
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
            {/* the first row wraps; the second never does, so Send is never pushed out */}
            <div className="composer-context">
              {hasSelection && (
                <button
                  className={`chip ${useSelection ? 'on' : ''}`}
                  title="Send the selected text with your message"
                  aria-pressed={useSelection}
                  onClick={() => setUseSelection((v) => !v)}
                >
                  <Icon name="text.cursor" /> Selection · {plural(selectionLines, 'line')}
                </button>
              )}
              <PersonaPicker value={personaId} onChange={choosePersona} onManage={onManagePersonas} />
              {rulesOn && (
                <button
                  className="chip on"
                  title={`Every request here is given your ${INSTRUCTIONS_FILE} as your standing instructions for this project, with what Spectrum remembers for it. Click to open it.`}
                  onClick={() => void api.openFile(INSTRUCTIONS_FILE)}
                >
                  <Icon name="list.clipboard" /> {INSTRUCTIONS_FILE}
                </button>
              )}
            </div>
            <div className="composer-bar">
              <span className="grow" />
              <AgentTuning options={tuning} modes={null} disabled={busy} opened={menuOpened} onChange={(id, value) => choose(id === 'model' ? { model: value } : { effort: value as TurnChoice['effort'] })} more={{ label: 'Manage models…', onSelect: () => api.openSettings('models') }} />
              <button className="composer-send" title="Send (↵)" aria-label="Send" disabled={busy || !input.trim() || held} onClick={() => send()}>
                {busy ? <span className="spinner" /> : <Icon name="arrow.up" />}
              </button>
            </div>
          </div>
          </>
        )}
      </div>
    </div>
  );
}
