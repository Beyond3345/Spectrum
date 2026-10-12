import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './app/App';
import { followAppearance } from './app/appearance';
import { IS_DESKTOP, followFullscreen } from './app/desktop';
import { applyTheme, loadSettings } from './app/settings';
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

applyTheme(loadSettings().theme);
followEditorTheme();
followAppearance();
// lets the stylesheets leave room for the traffic lights in the macOS app
document.documentElement.classList.toggle('desktop', IS_DESKTOP);
followFullscreen();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
