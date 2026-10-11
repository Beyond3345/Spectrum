import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './app/App';
import { IS_DESKTOP } from './app/desktop';
import { applyTheme, loadSettings } from './app/settings';
import './styles/tokens.css';
import './styles/base.css';
import './styles/projects.css';
import './styles/editor.css';
import './styles/tools.css';

applyTheme(loadSettings().theme);
// lets the stylesheets leave room for the traffic lights in the macOS app
document.documentElement.classList.toggle('desktop', IS_DESKTOP);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
