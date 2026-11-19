// Applies a forced light or dark theme and the chosen accent before the first paint (main.tsx does the rest).
try {
  var theme = JSON.parse(localStorage.getItem('spectrum-settings-v1') || '{}').theme;
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  // the accent and its text colour, as appearance.ts last applied them
  var accent = (localStorage.getItem('spectrum-accent') || '').split(' ');
  if (accent[1]) {
    document.documentElement.style.setProperty('--accent', accent[0]);
    document.documentElement.style.setProperty('--accent-text', accent[1]);
  }
} catch (e) {}
