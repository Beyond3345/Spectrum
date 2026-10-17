import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './app/App';
import { followAppearance } from './app/appearance';
import { IS_DESKTOP, followFullscreen } from './app/desktop';
import { IS_WINDOWS } from './app/platform';
import { applyTheme, followSharedSettings, loadSettings, updateSettings } from './app/settings';
import { followEditorTheme } from './editor/editorThemes';
// the bundled editor fonts, latin only (the plain 400.css would bundle every script)
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-400-italic.css';
import '@fontsource/fira-code/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-400-italic.css';
import '@fontsource/source-code-pro/latin-400.css';
import '@fontsource/source-code-pro/latin-400-italic.css';
import './styles/tokens.css';
import './styles/editor-theme.css';
import './styles/base.css';
import './styles/projects.css';
import './styles/editor.css';
import './styles/tools.css';
// after every sheet that sets the surfaces (tokens.css, editor-theme.css)
import './styles/glass.css';

// 1.1 kept "Dark pages in dark mode" in the editor layout. Off, it becomes White pages in dark mode, unless
// the page colour has been changed since. Done once, before Settings or a PDF can show the old value
try {
  const layout = JSON.parse(localStorage.getItem('spectrum-editor-layout') || '{}');
  if ('darkPages' in layout) {
    if (layout.darkPages === false && loadSettings().pdfPageDark === 'dark') updateSettings({ pdfPageDark: 'white' });
    delete layout.darkPages;
    localStorage.setItem('spectrum-editor-layout', JSON.stringify(layout));
  }
} catch {
  // no storage, or no layout: nothing to move
}

applyTheme(loadSettings().theme);
followEditorTheme();
followAppearance();
followSharedSettings();
// lets the stylesheets leave room for the traffic lights in the macOS app (Windows has its title bar above the page)
document.documentElement.classList.toggle('desktop', IS_DESKTOP && !IS_WINDOWS);
document.documentElement.classList.toggle('windows', IS_WINDOWS);
followFullscreen();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
