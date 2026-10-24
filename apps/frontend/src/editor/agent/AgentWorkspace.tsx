import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Tabs from '../../app/Tabs';
import type { Section } from '../../app/SettingsSheet';
import type { TodosState } from '../TodosList';
import LocalAgentTab from './LocalAgentTab';
import type { AgentStatus } from './LocalAgentTab';
import SpectrumAgentTab from './SpectrumAgentTab';

type Tab = 'spectrum' | 'local';

export const STATUS_TEXT: Record<Exclude<AgentStatus, null>, string> = {
  running: 'Agent working',
  waiting: 'The agent is waiting for you',
  changes: 'Agent changes to review'
};

const dot = (status: AgentStatus) => status && <span className={`agent-dot ${status}`} title={STATUS_TEXT[status]} />;

/**
 * The agent workspace, in the PDF's place: the Spectrum agent and the local ACP agents, each kept running while the
 * workspace is closed or the other tab shows. status: the most pressing of the two, for the Agent button's dot.
 */
export default function AgentWorkspace({
  active,
  trailing,
  todos,
  openThread,
  onStatus,
  onOpenSettings
}: {
  active: boolean;
  trailing: ReactNode;
  todos: TodosState;
  openThread: { id: string; n: number } | null;
  onStatus(status: AgentStatus): void;
  onOpenSettings(section: Section): void;
}) {
  const [tab, setTab] = useState<Tab>(() => {
    try {
      return localStorage.getItem('spectrum-agent-tab') === 'local' ? 'local' : 'spectrum';
    } catch {
      return 'spectrum';
    }
  });
  const [status, setStatus] = useState<Record<Tab, AgentStatus>>({ spectrum: null, local: null });
  const headRef = useRef<HTMLDivElement>(null);
  // narrow columns scroll the tab strip; keep the chosen tab in view, as Tools does
  useEffect(() => {
    headRef.current?.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [tab]);
  const choose = (next: Tab) => {
    setTab(next);
    try {
      localStorage.setItem('spectrum-agent-tab', next);
    } catch {
      // only the remembered tab is lost
    }
  };

  useEffect(() => {
    if (openThread) setTab('spectrum');
  }, [openThread?.n]);

  const overall = (['waiting', 'running', 'changes'] as const).find((s) => status.spectrum === s || status.local === s) ?? null;
  useEffect(() => onStatus(overall), [overall]);

  return (
    <div className="tools-panel agent-workspace">
      <div className="tools-head" ref={headRef}>
        <Tabs
          className="tools-tabs"
          value={tab}
          onChange={choose}
          items={[
            { value: 'spectrum', label: <>Spectrum agent{tab !== 'spectrum' && dot(status.spectrum)}</> },
            { value: 'local', label: <>Local agents{tab !== 'local' && dot(status.local)}</> }
          ]}
        />
        {trailing}
      </div>
      <SpectrumAgentTab
        hidden={tab !== 'spectrum'}
        active={active}
        todos={todos}
        openThread={openThread}
        onStatus={(s) => setStatus((old) => ({ ...old, spectrum: s }))}
        onOpenSettings={onOpenSettings}
      />
      <LocalAgentTab hidden={tab !== 'local'} active={active} todos={todos} onStatus={(s) => setStatus((old) => ({ ...old, local: s }))} onOpenSettings={onOpenSettings} />
    </div>
  );
}
