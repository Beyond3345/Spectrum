// Self-check for the accent and glass maths. Run:
// npx esbuild apps/frontend/src/app/appearance.check.ts --bundle --platform=node --log-level=warning | node
import { ACCENTS, accentColour, accentText, glassMix } from './appearance';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

const WHITE = '#ffffff';
const DARK = '#0d0d0d';
eq(accentText('#ffc600'), DARK, 'yellow takes dark text');
eq(accentText('#ffffff'), DARK, 'white takes dark text');
eq(accentText('#a0e0ff'), DARK, 'a pastel takes dark text');
eq(accentText('#000000'), WHITE, 'black takes white text');
for (const [value, label, colour] of ACCENTS) {
  if (colour && value !== 'yellow') eq(accentText(colour), WHITE, `${label} takes white text, as in macOS`);
}
eq(accentColour({ accent: 'system', accentCustom: '#123456' }), '', 'Follow macOS sets nothing');
eq(accentColour({ accent: 'purple', accentCustom: '#123456' }), '#a550a7', 'a named accent');
eq(accentColour({ accent: 'custom', accentCustom: '#123456' }), '#123456', 'Custom uses its colour');

eq(glassMix(0), { '--glass-chrome': '80%', '--glass-panel': '88%', '--glass-reading': '94%' }, 'least see-through');
eq(glassMix(100), { '--glass-chrome': '15%', '--glass-panel': '40%', '--glass-reading': '55%' }, 'clearest');
eq(glassMix(50), { '--glass-chrome': '48%', '--glass-panel': '64%', '--glass-reading': '75%' }, 'halfway');
eq(glassMix(250), glassMix(100), 'clarity above 100 is 100');
eq(glassMix(-5), glassMix(0), 'clarity below 0 is 0');
for (let clarity = 0; clarity <= 100; clarity += 5) {
  const mix = glassMix(clarity);
  const [chrome, panel, reading] = [mix['--glass-chrome'], mix['--glass-panel'], mix['--glass-reading']].map(parseFloat);
  if (!(chrome < panel && panel < reading)) throw new Error(`at ${clarity} the chrome should be clearest, then the panel, then the text`);
  if (reading < 55) throw new Error(`at ${clarity} the editor and PDF drop below 55%`);
}
console.log('appearance.check: ok');
