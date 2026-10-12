// Self-check for the order the window turns see-through and back. Run (it imports React, so bundle it first):
// npx esbuild apps/frontend/src/app/desktop.check.ts --bundle --platform=node --log-level=warning | node

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

// what the shell was asked to do, in order; an opaque window (main.rs) with a clear background shows black
let calls: string[] = [];
const invoke = async (cmd: string, args: Record<string, any> = {}) => {
  if (cmd === 'plugin:event|emit') calls.push(`${args.event} ${args.payload}`);
  if (cmd === 'plugin:window|set_effects') calls.push(args.value ? 'effects on' : 'effects off');
  if (cmd === 'plugin:window|set_background_color') calls.push(args.value[3] ? 'solid' : 'clear');
};
const media = { matches: false, addEventListener() {}, removeEventListener() {} };
Object.assign(globalThis, { window: { __TAURI_INTERNALS__: { invoke }, matchMedia: () => media } });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

(async () => {
  // after the fake window exists, which IS_DESKTOP reads as the module loads
  const { setNativeGlass, setNativeTheme } = await import('./desktop');
  setNativeTheme('light');
  eq(calls, ['solid'], 'the theme paints the window solid');

  calls = [];
  setNativeGlass(true);
  await settle();
  eq(calls, ['glass true', 'effects on', 'clear'], 'see-through before the clear paint');

  calls = [];
  setNativeGlass(false);
  await settle();
  eq(calls, ['effects off', 'solid', 'glass false'], 'opaque after the solid paint');

  calls = [];
  setNativeGlass(true);
  setNativeGlass(false);
  await settle();
  eq(calls, ['glass true', 'effects off', 'solid', 'glass false'], 'glass turned off at once never paints clear');

  setNativeGlass(true);
  await settle();
  calls = [];
  setNativeGlass(false);
  setNativeGlass(true);
  await settle();
  eq(calls, ['effects off', 'solid', 'glass true', 'effects on', 'clear'], 'glass turned on again at once never goes opaque');

  console.log('desktop.check: ok');
})();
