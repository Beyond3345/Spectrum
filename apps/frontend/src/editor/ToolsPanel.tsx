import { useEffect, useRef } from 'react';
import Tabs from '../app/Tabs';
import { useEditor } from './EditorContext';
import ProjectInfoTab from './tools/ProjectInfoTab';
import VersionsTab from './tools/VersionsTab';
import LogsTab from './tools/LogsTab';
import ResearchTab from './tools/ResearchTab';
import ReviewTab from './tools/ReviewTab';
import FiguresTab from './tools/FiguresTab';

export type ToolsTab = 'info' | 'versions' | 'logs' | 'research' | 'review' | 'figures';

const LABELS: [ToolsTab, string][] = [
  ['info', 'Project info'],
  ['versions', 'Versions'],
  ['logs', 'Logs'],
  ['research', 'Research'],
  ['review', 'Review'],
  ['figures', 'Figures']
];

/** Right column when Tools is open. Tabs stay mounted once visited so results survive switching. */
/** Closed with the Close pill in the editor top bar. */
export default function ToolsPanel({ tab, onTabChange }: { tab: ToolsTab; onTabChange: (tab: ToolsTab) => void }) {
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
      case 'info':
        return <ProjectInfoTab active={active} />;
      case 'versions':
        return <VersionsTab active={active} />;
      case 'logs':
        return <LogsTab />;
      case 'research':
        return <ResearchTab />;
      case 'review':
        return <ReviewTab />;
      case 'figures':
        return <FiguresTab />;
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
      </div>
      {LABELS.filter(([key]) => visited.current.has(key)).map(([key]) => (
        <div key={key} className="tools-body" role="tabpanel" hidden={key !== tab}>
          {body(key)}
        </div>
      ))}
    </div>
  );
}
