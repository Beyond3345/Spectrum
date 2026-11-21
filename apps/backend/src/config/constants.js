import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
// the app's version, which the release sets in the root package.json; the desktop bundle carries it inline
import pkg from '../../../../package.json' with { type: 'json' };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const APP_VERSION = pkg.version;

export const REPO_ROOT = process.env.SPECTRUM_REPO_ROOT || path.resolve(__dirname, '..', '..', '..', '..');

// The README has always promised a root .env file; actually load it.
try {
  process.loadEnvFile(path.join(REPO_ROOT, '.env'));
} catch {
  // no .env, that's fine
}

export const DATA_DIR = path.resolve(process.env.SPECTRUM_DATA_DIR || path.join(REPO_ROOT, 'data'));
export const TEMPLATE_DIR = process.env.SPECTRUM_TEMPLATE_DIR || path.join(REPO_ROOT, 'templates');
// Read-only template set shipped with the desktop app; copied into TEMPLATE_DIR on startup.
export const TEMPLATE_SEED_DIR = process.env.SPECTRUM_TEMPLATE_SEED_DIR || '';
export const TEMPLATE_MANIFEST = path.join(TEMPLATE_DIR, 'manifest.json');
// Read-only skills shipped with the app (the repo's skills/ folder, the desktop app's resources), copied into the
// data folder when the app's version changes
export const SKILLS_SEED_DIR = process.env.SPECTRUM_SKILLS_SEED_DIR || path.join(REPO_ROOT, 'skills');
// the Hunspell binding and Harper's engine (built by scripts/native.mjs), and the spell-check dictionaries
export const NATIVE_DIR = process.env.SPECTRUM_NATIVE_DIR || path.join(REPO_ROOT, 'native');
export const DICT_DIR = process.env.SPECTRUM_DICT_DIR || path.join(REPO_ROOT, 'dictionaries');
// TeX packages Spectrum ships (xjyutping), and the CJK fonts it bundles (node scripts/desktop.mjs fonts fetches them)
export const TEX_DIR = process.env.SPECTRUM_TEX_DIR || path.join(REPO_ROOT, 'vendor');
export const CJK_FONTS_DIR = process.env.SPECTRUM_FONTS_DIR || path.join(REPO_ROOT, 'src-tauri', 'resources', 'fonts', 'cjk');
export const FRONTEND_DIST = process.env.SPECTRUM_FRONTEND_DIST || path.join(REPO_ROOT, 'apps', 'frontend', 'dist');
export const PORT = Number(process.env.PORT || 8787);
export const HOST = process.env.SPECTRUM_HOST || '127.0.0.1';

// The app's pages run only the app's own script files (none inline, no eval), draw images only from the app itself
// (its own files, data: and blob:) and talk only to this server, so nothing a reply, a search result or a document
// puts on a page runs there or is fetched from elsewhere, taking the project's text with it. Styles may be inline
// (the editor, Mermaid and React write them); a PDF is read and shown from a blob:; workers are the app's own files. ipc: is
// how a page calls the desktop shell (http://ipc.localhost in WebView2). A frame may show Tinymist's preview page, which
// Tinymist serves on a port of its own and the Live view loads as localhost (services/tinymistService.js). No other
// page may frame these.
// ponytail: any localhost port may be framed, as Tinymist's is chosen after the page loads; a page of its own address
// per preview would need Tinymist's page served through this server
export const PAGE_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' blob: ipc:${process.platform === 'win32' ? ' http://ipc.localhost' : ''}`,
  "worker-src 'self' blob:",
  "object-src 'self' blob:",
  "frame-src 'self' blob: http://localhost:*",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'"
].join('; ');

// Default parent folder for new and imported projects; index.js moves it out of a sync app's folder at start
export let PROJECTS_DIR = path.resolve(process.env.SPECTRUM_PROJECTS_DIR || path.join(os.homedir(), 'Documents', 'Spectrum'));
export const setProjectsDir = (dir) => (PROJECTS_DIR = path.resolve(dir));

// GitHub: the Spectrum OAuth app's client id for the device sign-in ('' until one is registered: then only a pasted
// token signs in; there is never a client secret), and where GitHub's API and site are (a test's stand-ins)
// Spectrum's GitHub OAuth app (device flow, no secret); an empty SPECTRUM_GITHUB_CLIENT_ID turns one-click sign-in off
export const GITHUB_CLIENT_ID = process.env.SPECTRUM_GITHUB_CLIENT_ID ?? 'Ov23lictk8ESvCDcCwyF';
export const GITHUB_API = (process.env.SPECTRUM_GITHUB_API || 'https://api.github.com').replace(/\/$/, '');
export const GITHUB_WEB = (process.env.SPECTRUM_GITHUB_WEB || 'https://github.com').replace(/\/$/, '');

// PDF parsers for template transfer: how often to ask whether a job is done, and for how long
export const PARSER_POLL_INTERVAL_MS = 3000;
export const PARSER_TIMEOUT_MS = 10 * 60 * 1000;
