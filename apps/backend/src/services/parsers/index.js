// PDF parsers for template transfer, written from each parser's API docs in October 2026.
// Each turns a PDF into { markdownContent with $…$/$$…$$ maths, images: [{ name, localPath }] }, with the
// markdown linking the images by those basenames. keyName is what the parser calls its key.
import { promises as fs } from 'fs';
import path from 'path';
import { ensureDir } from '../../utils/fsUtils.js';
import { appPath } from '../projectService.js';
import { hostOf } from './common.js';
import { parseWithDatalab } from './datalab.js';
import { parseWithDocling } from './docling.js';
import { parseWithLlamaParse } from './llamaparse.js';
import { parseWithMathpix } from './mathpix.js';
import { parseWithMineru } from './mineru.js';
import { parseWithMistral } from './mistral.js';
import { parseWithPaddleOcr } from './paddleocr.js';

export const PARSERS = [
  {
    id: 'mineru',
    name: 'MinerU',
    endpoint: 'https://mineru.net/api/v4',
    keyUrl: 'https://mineru.net/apiManage/token',
    note: 'Free, with 1,000 priority pages a day. Strong on formulas and tables.',
    keyName: 'token',
    maxMB: 200,
    parse: parseWithMineru
  },
  {
    id: 'mathpix',
    name: 'Mathpix',
    endpoint: 'https://api.mathpix.com',
    keyUrl: 'https://console.mathpix.com',
    note: 'The long-standing choice for maths to LaTeX. Paid per page, after a one-off activation fee.',
    keyName: 'app key',
    appId: true,
    maxMB: 1024,
    parse: parseWithMathpix
  },
  {
    id: 'mistral',
    name: 'Mistral OCR',
    endpoint: 'https://api.mistral.ai/v1',
    keyUrl: 'https://console.mistral.ai/api-keys',
    note: 'Quick and cheap: one request per PDF, about US$4 per 1,000 pages.',
    keyName: 'API key',
    maxMB: 512,
    parse: parseWithMistral
  },
  {
    id: 'datalab',
    name: 'Datalab (Marker)',
    endpoint: 'https://www.datalab.to/api/v1',
    keyUrl: 'https://www.datalab.to/app/keys',
    note: 'Runs in accurate mode, which tops the olmOCR benchmark. Comes with a free monthly allowance.',
    keyName: 'API key',
    maxMB: 200,
    parse: parseWithDatalab
  },
  {
    id: 'llamaparse',
    name: 'LlamaParse',
    endpoint: 'https://api.cloud.llamaindex.ai',
    regions: [{ label: 'Europe', endpoint: 'https://api.cloud.eu.llamaindex.ai' }],
    keyUrl: 'https://cloud.llamaindex.ai/api-key',
    note: 'Uses the agentic tier, which writes equations as LaTeX. 10,000 free credits a month.',
    keyName: 'API key',
    maxMB: 512,
    parse: parseWithLlamaParse
  },
  {
    id: 'paddleocr',
    name: 'PaddleOCR-VL',
    endpoint: 'https://paddleocr.aistudio-app.com',
    keyUrl: 'https://aistudio.baidu.com/account/accessToken',
    note: 'The most accurate on OmniDocBench, with 3,000 free pages a day. Needs a Baidu AI Studio account, and PDFs up to 50 MB.',
    keyName: 'access token',
    maxMB: 50,
    parse: parseWithPaddleOcr
  },
  {
    id: 'docling',
    name: 'Docling',
    endpoint: 'http://localhost:5001',
    keyUrl: '',
    note: 'Free and private: runs on your own computer with docling-serve (docker run -p 5001:5001 quay.io/docling-project/docling-serve). Weaker on maths than the services above.',
    keyName: 'API key',
    keyOptional: true,
    parse: parseWithDocling
  }
];

/** Where a transfer keeps the parser's input PDF and raw output: hidden, so the new project's files stay tidy. */
export const transferDir = (projectRoot) => appPath(projectRoot, 'transfer');

/**
 * What a transfer sends where. raw: { id, protocol? (for 'custom'), endpoint?, key?, appId? } from Settings.
 * A key typed in Settings goes with the endpoint it was entered for (the preset's when none was typed);
 * the .env MinerU token only goes to the .env (or default) MinerU host. Throws a message for the user
 * when the parser is unknown, the address isn't http(s), or a key is needed and missing.
 */
export function resolveParserConfig(raw) {
  const { id = 'mineru', protocol, endpoint: typed, key: typedKey, appId } = raw || {};
  const custom = id === 'custom';
  const preset = PARSERS.find((p) => p.id === (custom ? protocol : id));
  if (!preset) throw new Error(`Unknown parser: ${custom ? protocol : id}.`);
  const name = custom ? `${preset.name} (custom)` : preset.name;
  const key = String(typedKey || '').trim();
  const envBase = preset.id === 'mineru' ? String(process.env.SPECTRUM_MINERU_API_BASE || '').trim() : '';
  const endpoint = String(typed || '').trim() || (custom ? '' : (!key && envBase) || preset.endpoint);
  if (!endpoint) throw new Error('Add the parser’s address in Settings → Template transfer first.');
  let scheme = '';
  try {
    scheme = new URL(endpoint).protocol;
  } catch {
    // not a URL
  }
  if (scheme !== 'http:' && scheme !== 'https:') throw new Error(`The address for ${name} must start with http:// or https://.`);
  const envKey = preset.id === 'mineru' && hostOf(endpoint) === hostOf(envBase || preset.endpoint) ? String(process.env.SPECTRUM_MINERU_TOKEN || '').trim() : '';
  const config = {
    id: custom ? 'custom' : preset.id,
    protocol: preset.id,
    name,
    endpoint: endpoint.replace(/\/+$/, ''),
    key: key || envKey,
    appId: preset.appId ? String(appId || '').trim() : ''
  };
  // a self-hosted server may run without a key
  if (!custom && !preset.keyOptional && (!config.key || (preset.appId && !config.appId))) {
    throw new Error(`Add your ${preset.name} ${preset.appId ? 'app ID and app key' : preset.keyName} in Settings → Template transfer first.`);
  }
  return config;
}

/** Reads the PDF with the resolved parser, into outputDir (emptied first). */
export async function parsePdf(pdfPath, config, outputDir, onProgress) {
  const preset = PARSERS.find((p) => p.id === config.protocol);
  const { size } = await fs.stat(pdfPath);
  // a custom server sets its own limit
  if (config.id !== 'custom' && preset.maxMB && size > preset.maxMB * 1048576) {
    throw new Error(`The PDF is too large for ${config.name} (${Math.round(size / 1048576)} MB; the limit is ${preset.maxMB} MB).`);
  }
  await fs.rm(outputDir, { recursive: true, force: true });
  await ensureDir(outputDir);
  return preset.parse({ name: path.basename(pdfPath), buffer: await fs.readFile(pdfPath) }, { ...config, onProgress }, outputDir);
}
