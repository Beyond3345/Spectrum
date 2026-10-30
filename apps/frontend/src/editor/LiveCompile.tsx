import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { watchCompile } from '../api/client';
import { tectonicStatus } from './tectonicStatus';

// ponytail: the start is let go past this, so a download count read from it would fall short; Tectonic's whole output
// is rarely half of it
const MAX_CHARS = 400_000;

/**
 * A running compile's output over the PDF, for Tectonic, which can spend minutes downloading its packages: what it's
 * doing now, and the output as it comes, kept at the bottom unless scrolled up. `engine` is the one asked for; Auto's
 * choice comes from the compile itself. Shows nothing for the other engines.
 */
export default function LiveCompile({ compileId, engine }: { compileId: string; engine: string }) {
  const [running, setRunning] = useState(engine);
  const [output, setOutput] = useState('');
  const preRef = useRef<HTMLPreElement>(null);
  const atBottomRef = useRef(true);

  useEffect(() => {
    // gathered between frames, so a burst of output draws once
    let pending = '';
    let frame = 0;
    const close = watchCompile(compileId, {
      engine: setRunning,
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

  if (running !== 'tectonic') return null;
  return (
    <div className="live-compile">
      <div className="live-compile-head">
        <span className="spinner" aria-hidden="true" />
        <h2>Compiling with Tectonic</h2>
      </div>
      <div className="live-compile-status" role="status" aria-live="polite">
        {tectonicStatus(output)}
      </div>
      <pre
        ref={preRef}
        className="live-compile-output"
        tabIndex={0}
        aria-label="Tectonic’s output"
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
