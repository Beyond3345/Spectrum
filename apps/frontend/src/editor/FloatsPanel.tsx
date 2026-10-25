import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import FloatsTab from './tools/FloatsTab';

export type FloatCard = 'figure' | 'table' | 'diagram';

const TITLES: Record<FloatCard, string> = { figure: 'Figures', table: 'Tables', diagram: 'Diagrams' };

/**
 * Figures, tables or diagrams, in the PDF's place: only the cards for the kind asked for. Each time Insert (+), a drop
 * or the composer asks (signal counts the asks), the panel starts at its top.
 */
export default function FloatsPanel({ card, signal, trailing }: { card: FloatCard | null; signal: number; trailing?: ReactNode }) {
  const bodyRef = useRef<HTMLDivElement>(null);

  const shown = card ?? 'figure';

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [card, signal]);

  return (
    <div className="tools-panel">
      <div className="tools-head">
        <div className="panel-title">{TITLES[shown]}</div>
        {trailing}
      </div>
      <div className="tools-body" ref={bodyRef}>
        <FloatsTab show={shown} />
      </div>
    </div>
  );
}
