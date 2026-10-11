import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
// nodehun and Harper's engine (built by scripts/native.mjs), and the spell-check dictionaries
export const NATIVE_DIR = process.env.SPECTRUM_NATIVE_DIR || path.join(REPO_ROOT, 'native');
export const DICT_DIR = process.env.SPECTRUM_DICT_DIR || path.join(REPO_ROOT, 'dictionaries');
export const FRONTEND_DIST = process.env.SPECTRUM_FRONTEND_DIST || path.join(REPO_ROOT, 'apps', 'frontend', 'dist');
export const PORT = Number(process.env.PORT || 8787);
export const HOST = process.env.SPECTRUM_HOST || '127.0.0.1';
// Default parent folder for new and imported projects.
export const PROJECTS_DIR = path.resolve(process.env.SPECTRUM_PROJECTS_DIR || path.join(os.homedir(), 'Documents', 'Spectrum'));

// MinerU API
export const MINERU_API_BASE = 'https://mineru.net/api/v4';
export const MINERU_POLL_INTERVAL_MS = 3000;
export const MINERU_MAX_POLL_ATTEMPTS = 200;
