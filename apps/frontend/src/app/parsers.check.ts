// Self-check for where a PDF parser's requests and keys go. Run (it imports React, so bundle it first):
// npx esbuild apps/frontend/src/app/parsers.check.ts --bundle --platform=node --log-level=warning | node
import { DEFAULT_SETTINGS } from './settings';
import type { AppSettings } from './settings';
import type { ParserPreset } from '../api/client';
import { parserConfigFor, parserEndpointPatch, parserPreset, parserWarning } from './parsers';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

const preset = (id: string, endpoint: string, extra: Partial<ParserPreset> = {}): ParserPreset => ({ id, name: id, endpoint, keyUrl: '', note: '', keyName: 'API key', ...extra });
const MINERU = preset('mineru', 'https://mineru.net/api/v4', { name: 'MinerU', keyName: 'token' });
const MATHPIX = preset('mathpix', 'https://api.mathpix.com', { name: 'Mathpix', appId: true });
const LLAMA = preset('llamaparse', 'https://api.cloud.llamaindex.ai', { regions: [{ label: 'Europe', endpoint: 'https://api.cloud.eu.llamaindex.ai' }] });
const DOCLING = preset('docling', 'http://localhost:5001', { keyOptional: true });
const parsers = [MINERU, MATHPIX, LLAMA, DOCLING];
const with_ = (patch: Partial<AppSettings>): AppSettings => ({ ...DEFAULT_SETTINGS, ...patch });

// the key stays while the address stays on its host, and is left behind when it moves
const llama = with_({ parser: 'llamaparse', parserSaved: { llamaparse: { endpoint: '', key: 'us-key' } } });
eq(parserEndpointPatch(llama, LLAMA, 'llamaparse', 'https://api.cloud.llamaindex.ai/').parserSaved?.llamaparse, { endpoint: 'https://api.cloud.llamaindex.ai/', key: 'us-key' }, 'same host keeps the key');
eq(parserEndpointPatch(llama, LLAMA, 'llamaparse', 'https://api.cloud.eu.llamaindex.ai').parserSaved?.llamaparse, { endpoint: 'https://api.cloud.eu.llamaindex.ai', key: '' }, 'another region drops it');
const mathpix = with_({ parser: 'mathpix', parserSaved: { mathpix: { endpoint: 'https://proxy.example', key: 'k', appId: 'id' } } });
eq(parserEndpointPatch(mathpix, MATHPIX, 'mathpix', '').parserSaved?.mathpix, { endpoint: '', key: '' }, 'back to the preset’s own host drops the app ID and key too');
eq(parserEndpointPatch(mathpix, MATHPIX, 'mathpix', 'http://proxy.example').parserSaved?.mathpix, { endpoint: 'http://proxy.example', key: '' }, 'https to http on the same host drops them');
const typo = with_({ parser: 'mathpix', parserSaved: { mathpix: { endpoint: 'api.mathpix.com', key: 'K2', appId: 'ID2' } } });
eq(parserEndpointPatch(typo, MATHPIX, 'mathpix', 'https://other-host.example').parserSaved?.mathpix, { endpoint: 'https://other-host.example', key: '' }, 'from an address that isn’t a URL to another host drops them');
// Other: a key typed before any address goes with the first one
const other = with_({ parser: 'custom', parserProtocol: 'docling', parserSaved: { custom: { endpoint: '', key: 'k' } } });
eq(parserEndpointPatch(other, DOCLING, 'custom', 'http://gpu.local:5001').parserSaved?.custom, { endpoint: 'http://gpu.local:5001', key: 'k' }, 'first address keeps the key');
eq(parserEndpointPatch(other, DOCLING, 'mineru', 'x').parserSaved?.custom, { endpoint: '', key: 'k' }, 'other parsers’ entries are untouched');

// what a transfer sends
eq(parserConfigFor(with_({}), parserPreset(parsers, with_({}))), { id: 'mineru' }, 'nothing typed: the preset and the .env file decide');
eq(parserConfigFor(mathpix, MATHPIX), { id: 'mathpix', endpoint: 'https://proxy.example', key: 'k', appId: 'id' }, 'Mathpix with its app ID');
eq(parserConfigFor(other, parserPreset(parsers, other)), { id: 'custom', protocol: 'docling', key: 'k' }, 'Other says which API it speaks');
eq(parserPreset(parsers, with_({ parser: 'gone' }))?.id, 'mineru', 'an unknown parser falls back to MinerU');

// warnings name the parser
eq(parserWarning(with_({}), MINERU), 'Needs your MinerU token above, or one in the .env file.', 'MinerU');
eq(parserWarning(with_({ parser: 'mathpix', parserSaved: { mathpix: { endpoint: '', key: 'k' } } }), MATHPIX), 'Needs your Mathpix app ID and app key above.', 'Mathpix needs both');
eq(parserWarning(mathpix, MATHPIX), '', 'Mathpix with both');
eq(parserWarning(with_({ parser: 'docling' }), DOCLING), '', 'Docling may need no key');
eq(parserWarning(with_({ parser: 'custom', parserProtocol: 'docling' }), DOCLING), 'Needs the parser’s address in Settings → Template transfer.', 'Other needs an address');

console.log('parsers.check: ok');
