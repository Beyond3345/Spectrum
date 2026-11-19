// A diagram's own %%{init}%% line or front matter cannot turn HTML labels back on or bring in CSS of its own.
import mermaid from 'mermaid';
import { mermaidConfig } from './render';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

const asks = { securityLevel: 'loose', htmlLabels: true, flowchart: { htmlLabels: true, curve: 'linear' }, themeCSS: '.node rect { fill: red }', fontFamily: 'serif; color: red', altFontFamily: 'serif' };
const directive = `%%{init: ${JSON.stringify(asks)}}%%\nflowchart LR\n  A --> B`;
const frontMatter = `---\nconfig:\n${Object.entries(asks).map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`).join('\n')}\n---\nflowchart LR\n  A --> B`;

(async () => {
  for (const [name, code] of [['directive', directive], ['front matter', frontMatter]]) {
    mermaid.initialize(mermaidConfig(false));
    // without a DOM the parse stops at DOMPurify, after the diagram's settings are merged
    await mermaid.parse(code).catch(() => undefined);
    const config = mermaid.mermaidAPI.getConfig() as Record<string, any>;
    eq(config.securityLevel, 'strict', `${name}: security level`);
    eq(config.htmlLabels, false, `${name}: HTML labels`);
    eq(config.flowchart?.htmlLabels ?? null, null, `${name}: flowchart HTML labels`);
    eq(config.flowchart?.curve, 'linear', `${name}: other settings still apply`);
    eq([config.themeCSS, config.altFontFamily], [undefined, undefined], `${name}: no CSS of its own`);
    eq(String(config.fontFamily).includes('red'), false, `${name}: no font family CSS`);
  }
  console.log('mermaid/render.check: ok');
})().catch((error) => { setTimeout(() => { throw error; }); });
