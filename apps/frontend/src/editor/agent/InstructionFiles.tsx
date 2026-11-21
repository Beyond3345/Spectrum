import { useEffect, useState } from 'react';
import { chooseInstructionFiles, getInstructionFiles } from '../../api/client';
import type { InstructionFile, LocalAgent } from '../../api/client';
import { useEditor } from '../EditorContext';
import { errorText } from '../shared';
import { instructionCard } from './instructionCard';

/**
 * The project's instruction files the user hasn't allowed (instructionCard.ts), above the Local agents tab's message
 * box: open to choose while any is new, folded to one line once each is chosen. Leaving out needs no click: a task
 * goes without them. refresh: changes when the list may have (the tab shown, the files, a task ended).
 */
export default function InstructionFiles({ mode, agents, refresh }: { mode: 'review' | 'direct'; agents: LocalAgent[]; refresh: unknown }) {
  const api = useEditor();
  const [files, setFiles] = useState<InstructionFile[]>([]);
  const [busy, setBusy] = useState(false);
  const load = () => getInstructionFiles(api.projectId).then((r) => setFiles(r.files), () => undefined);
  useEffect(() => void load(), [api.projectId, refresh]);

  const card = instructionCard(files, mode, (id) => agents.find((a) => a.id === id)?.name || id);
  if (!card) return null;
  const choose = async (choice: 'allow' | 'leave', list: InstructionFile[]) => {
    setBusy(true);
    try {
      setFiles((await chooseInstructionFiles(api.projectId, choice, list)).files);
    } catch (err) {
      // changed since it was shown (a pull): shown again as it is
      api.notify(`Couldn’t ${choice === 'allow' ? 'allow' : 'leave out'} ${list.length === 1 ? list[0].path : 'the files'}: ${errorText(err)}`, 'error');
      await load();
    } finally {
      setBusy(false);
    }
  };
  const isolated = mode === 'review';
  return (
    // opens again when a new file asks
    <details className="agent-instr" open={card.asking.length > 0} key={card.asking.map((f) => f.path + f.hash).join('|')} onToggle={(e) => e.currentTarget.open && void load()}>
      <summary>{card.summary}</summary>
      <p className="field-hint">{card.note}</p>
      <ul className="agent-instr-list">
        {card.rows.map((f) => (
          <li key={f.path}>
            <span className="agent-instr-name">
              <button className="agent-instr-path" title={`Open ${f.path} in the editor`} onClick={() => api.openFile(f.path).catch((err) => api.notify(`Couldn’t open ${f.path}: ${errorText(err)}`, 'error'))}>
                {f.path}
              </button>
              <span className="agent-instr-by">
                {isolated && f.state === 'left' ? 'Left out · ' : ''}
                {f.by}
              </span>
            </span>
            <span className="agent-instr-actions">
              <button className="btn small" disabled={busy} title="Let it into local agents’ copies of this project, as it is now. It asks again if the file changes." onClick={() => void choose('allow', [f])}>
                Allow
              </button>
              {isolated && f.state === 'ask' && (
                <button className="btn small ghost" disabled={busy} title="Keep it out of the agent’s copy and stop asking until it changes" onClick={() => void choose('leave', [f])}>
                  Leave out
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {card.rows.length > 1 && (
        <div className="row agent-instr-all">
          <button className="btn small" disabled={busy} onClick={() => void choose('allow', card.rows)}>
            Allow all for this project
          </button>
          {isolated && card.asking.length > 0 && (
            <button className="btn small ghost" disabled={busy} onClick={() => void choose('leave', card.asking)}>
              Leave all out
            </button>
          )}
        </div>
      )}
    </details>
  );
}
