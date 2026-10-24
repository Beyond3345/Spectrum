import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import FloatsTab from './tools/FloatsTab';

export type FloatCard = 'figure' | 'table' | 'diagram';

/**
 * Figures and tables, in the PDF's place: Insert figure, Insert diagram, Insert table and the other float tools. Each time the
 * top bar or Insert (+) asks for a card (signal counts the asks), it scrolls into view.
 */
export default function FloatsPanel({ card, signal, trailing }: { card: FloatCard | null; signal: number; trailing?: ReactNode }) {
  const bodyRef = useRef<HTMLDivElement>(null);

  // only the panel scrolls (scrollIntoView would also slide the columns sideways when a card is wider than the panel)
  useEffect(() => {
    const body = bodyRef.current;
    const target = card && body?.querySelector(`[data-card="${card}"]`);
    if (body && target) body.scrollTop += target.getBoundingClientRect().top - body.getBoundingClientRect().top;
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
