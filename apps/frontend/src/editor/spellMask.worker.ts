// The spelling mask off the editor's thread: 40 to 70 ms for a 1 MB document after each pause in typing
import { maskForSpelling } from './spellMask';

self.onmessage = (e: MessageEvent) => {
  const { id, source, kind } = e.data;
  self.postMessage({ id, masked: maskForSpelling(source, kind) });
};
