import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { watchCompile } from '../api/client';
import { COMPILE_ENGINES } from '../app/settings';
import { compileStatus } from './compileStatus';

// ponytail: the start is let go past this, so a download count read from it would fall short; a compile's whole output
// is rarely half of it
const MAX_CHARS = 400_000;

const engineName = (engine: string) => COMPILE_ENGINES.find(([value]) => value === engine)?.[1].replace(' (built in)', '') ?? engine;

/**
 * A running compile's output over the PDF: what it's doing now, and the output as it comes, kept at the bottom unless
 * scrolled up. The engine is the one the compile says it runs (Auto's choice too), and `shows` says whether it's one
 * whose output the user wants to see (Settings › Engines); nothing shows until then, nor for a Typst compile.
 */
export default function LiveCompile({ compileId, shows }: { compileId: string; shows: (engine: string) => boolean }) {
  const [running, setRunning] = useState('');
  const [output, setOutput] = useState('');
  // Spectrum's own, while it downloads Biber for the compile
  const [status, setStatus] = useState('');
  const preRef = useRef<HTMLPreElement>(null);
  const atBottomRef = useRef(true);

  useEffect(() => {
    // gathered between frames, so a burst of output draws once
    let pending = '';
    let frame = 0;
    const close = watchCompile(compileId, {
      engine: setRunning,
      status: setStatus,
      output: (text) => {
        pending += text;
        frame ||= requestAnimationFrame(() => {
          const more = pending;
          pending = '';
          frame = 0;
          setOutput((shown) => (shown + more).slice(-MAX_CHARS));
        });
      }
    });
    return () => {
      close();
      cancelAnimationFrame(frame);
    };
  }, [compileId]);

  useLayoutEffect(() => {
    const pre = preRef.current;
    if (pre && atBottomRef.current) pre.scrollTop = pre.scrollHeight;
  }, [output]);

  if (!running || !shows(running)) return null;
  return (
    <div className="live-compile">
      <div className="live-compile-head">
        <span className="spinner" aria-hidden="true" />
        <h2>Compiling with {engineName(running)}</h2>
      </div>
      <div className="live-compile-status" role="status" aria-live="polite">
        {status || compileStatus(running, output)}
      </div>
      <pre
        ref={preRef}
        className="live-compile-output"
        tabIndex={0}
        aria-label={`${engineName(running)}’s output`}
        onScroll={(e) => {
          const pre = e.currentTarget;
          atBottomRef.current = pre.scrollHeight - pre.scrollTop - pre.clientHeight < 8;
        }}
      >
        {output}
      </pre>
    </div>
  );
}
