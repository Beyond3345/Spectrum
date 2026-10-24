import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import Tabs from '../app/Tabs';
import { useEditor } from './EditorContext';
import VersionsTab from './tools/VersionsTab';
import LogsTab from './tools/LogsTab';
import ReviewTab from './tools/ReviewTab';

export type ToolsTab = 'versions' | 'logs' | 'review';

const LABELS: [ToolsTab, string][] = [
  ['versions', 'Checkpoints'],
  ['logs', 'Logs'],
  ['review', 'Review']
];

/** Right column when Tools is open. Tabs stay mounted once visited so results survive switching. */
/** `trailing` ends the header (Close and the view switcher). */
export default function ToolsPanel({ tab, onTabChange, trailing }: { tab: ToolsTab; onTabChange: (tab: ToolsTab) => void; trailing?: ReactNode }) {
  const { compileErrors } = useEditor();
  const visited = useRef(new Set<ToolsTab>());
  visited.current.add(tab);
  const headRef = useRef<HTMLDivElement>(null);

  // narrow columns scroll the tab strip; keep the chosen tab in view
  useEffect(() => {
    headRef.current?.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [tab]);

  const body = (key: ToolsTab) => {
    const active = key === tab;
    switch (key) {
      case 'versions':
        return <VersionsTab active={active} />;
      case 'logs':
        return <LogsTab />;
      case 'review':
        return <ReviewTab />;
    }
  };

  return (
    <div className="tools-panel">
      <div className="tools-head" ref={headRef}>
        <Tabs
          className="tools-tabs"
          value={tab}
          onChange={onTabChange}
          items={LABELS.map(([value, label]) => ({ value, label, badge: value === 'logs' && compileErrors.length ? compileErrors.length : undefined }))}
        />
        {trailing}
      </div>
      {LABELS.filter(([key]) => visited.current.has(key)).map(([key]) => (
        <div key={key} className="tools-body" role="tabpanel" hidden={key !== tab}>
          {body(key)}
        </div>
      ))}
    </div>
  );
}
