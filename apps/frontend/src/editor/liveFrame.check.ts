// Self-check for the Live view's frame: it says why when the window won't show Tinymist's page, and stays quiet when
// it does. Run: npx esbuild apps/frontend/src/editor/liveFrame.check.ts --bundle --platform=node --log-level=warning | node
import { watchLiveFrame } from './liveFrame';

const src = 'http://localhost:50369/?spectrum-live';
// a frame still on about:blank (the shell cancelled its load), or on Tinymist's page, which another address can't read
const blank = { src, contentWindow: { location: { href: 'about:blank' } } };
const tinymist = {
  src,
  contentWindow: {
    get location(): { href: string } {
      throw new Error('SecurityError: Blocked a frame from accessing a cross-origin frame.');
    }
  }
};
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const violation = (blockedURI: string) => Object.assign(new Event('securitypolicyviolation'), { blockedURI });

const said: string[] = [];
watchLiveFrame(blank, (why) => said.push(why), 20, new EventTarget());
watchLiveFrame(tinymist, (why) => said.push(`shown: ${why}`), 20, new EventTarget());
await wait(60);
if (said.length !== 1 || !/didn’t open/.test(said[0])) throw new Error(`a blank frame is named, a shown one isn't: ${JSON.stringify(said)}`);

// the page's policy refusing the frame is said at once, and once; another address's refusal isn't this frame's
const events = new EventTarget();
const refused: string[] = [];
watchLiveFrame(tinymist, (why) => refused.push(why), 20, events);
events.dispatchEvent(violation('http://localhost:9999/'));
if (refused.length) throw new Error('another address’s refusal was taken as the frame’s');
events.dispatchEvent(violation('http://localhost:50369/'));
events.dispatchEvent(violation('http://localhost:50369/'));
await wait(60);
if (refused.length !== 1 || !/refused/.test(refused[0])) throw new Error(`refused once: ${JSON.stringify(refused)}`);

// stopped (Live off, another document) before the time: nothing said
const quiet: string[] = [];
watchLiveFrame(blank, (why) => quiet.push(why), 20, new EventTarget())();
await wait(60);
if (quiet.length) throw new Error('a stopped watch still spoke');

console.log('liveFrame.check: ok');
