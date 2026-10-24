import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import FloatsTab from './tools/FloatsTab';

export type FloatCard = 'figure' | 'table';

/**
 * Figures and tables, in the PDF's place: Insert figure, Insert table and the other float tools. Each time the
 * top bar or Insert (+) asks for a card (signal counts the asks), it scrolls into view.
 */
export default function FloatsPanel({ card, signal, trailing }: { card: FloatCard | null; signal: number; trailing?: ReactNode }) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (card) bodyRef.current?.querySelector(`[data-card="${card}"]`)?.scrollIntoView({ block: 'start' });
  }, [card, signal]);

  return (
    <div className="tools-panel">
      <div className="tools-head">
        <div className="panel-title">Figures and tables</div>
        {trailing}
      </div>
      <div className="tools-body" ref={bodyRef}>
        <FloatsTab />
      </div>
    </div>
  );
}
