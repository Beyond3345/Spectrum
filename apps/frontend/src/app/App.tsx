import { Suspense, lazy, useEffect, useRef } from 'react';
import { Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
import type { NavigateFunction } from 'react-router-dom';
import { openFile } from '../api/client';
import type { DiagramLanguage } from '../diagram/types';
import { errorText } from '../editor/shared';
import EditorPage from './EditorPage';
import ProjectPage from './ProjectPage';
import { DialogHost } from './Dialogs';
import { IS_DESKTOP } from './desktop';
import { ToastHost, toast } from './Toast';

/** A file opened from Finder or Explorer, shown in its project (EditorPage opens ?file=). */
async function openPath(path: string, navigate: NavigateFunction, replace: boolean) {
  try {
    const { projectId, file } = await openFile(path);
    navigate(`/editor/${projectId}?file=${encodeURIComponent(file)}`, { replace });
  } catch (err) {
    toast(`Couldn’t open ${path.split(/[\\/]/).pop() || 'the file'}: ${errorText(err)}`, { tone: 'error' });
    if (replace) navigate('/projects', { replace });
  }
}

/** Where the desktop app starts when a double-clicked file launched it: /open?path=… */
function OpenFile() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // once, even when StrictMode runs the effect twice: adopting a folder twice at once would make two projects of it
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    openPath(params.get('path') || '', navigate, true);
  }, []);
  return null;
}

// its own chunk, so the canvas and Mermaid only load in the composer's window
const ComposerApp = lazy(() => import('../diagram/ComposerApp'));
const LANGUAGES: DiagramLanguage[] = ['tikz', 'typst', 'mermaid'];

/** The diagram composer's window (desktop.ts openDiagram): /diagram?project=…&file=…&lang=…, and &tool=… from the chooser */
function Diagram() {
  const [params] = useSearchParams();
  const lang = LANGUAGES.find((l) => l === params.get('lang'));
  return (
    <Suspense fallback={null}>
      <ComposerApp projectId={params.get('project') || ''} file={params.get('file') || undefined} lang={lang} tool={params.get('tool') || undefined} />
    </Suspense>
  );
}

export default function App() {
  const navigate = useNavigate();
  // the desktop shell (main.rs) calls this when a file is double-clicked while Spectrum is open
  useEffect(() => {
    if (!IS_DESKTOP) return;
    const hooks = window as Window & { __spectrumOpen?: (path: string) => void };
    hooks.__spectrumOpen = (path) => openPath(path, navigate, false);
    return () => {
      delete hooks.__spectrumOpen;
    };
  }, [navigate]);

  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/projects" element={<ProjectPage />} />
        {/* the app's own: a web page sending a browser here mustn't make a project of a folder */}
        <Route path="/open" element={IS_DESKTOP ? <OpenFile /> : <Navigate to="/projects" replace />} />
        <Route path="/editor/:projectId" element={<EditorPage />} />
        <Route path="/diagram" element={<Diagram />} />
        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Routes>
      <ToastHost />
      <DialogHost />
    </>
  );
}
