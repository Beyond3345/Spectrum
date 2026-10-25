import { readJson, writeJsonAtomic } from '../utils/fsUtils.js';
import { appPath, httpError, serialiser } from './projectService.js';

// A project's own settings (its compiler and the like) in .spectrum/settings.json, which goes with the project to
// the user's other computer. Not in project.json: 1.10.4 rewrites that through its own list of keys and would drop them.
const settingsPath = (root) => appPath(root, 'settings.json');
// ponytail: one lock for every project's settings, as for their metadata
const settingsLock = serialiser();

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

async function readSettingsFile(root) {
  try {
    const data = await readJson(settingsPath(root));
    if (!isObject(data)) throw new SyntaxError('settings.json isn’t an object');
    return data;
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

const UNREADABLE = 'This project’s settings file (.spectrum/settings.json) can’t be read, so it wasn’t changed.';

/** The project's settings, {} when it has none or (unless strict, which throws) they can't be read. */
export async function readProjectSettings(root, { strict = false } = {}) {
  return readSettingsFile(root).catch((err) => {
    if (strict) throw httpError(UNREADABLE, 409);
    return {};
  });
}

/** fn receives the current settings and returns the next ones. A file that can't be read is left alone rather than replaced. */
export function updateProjectSettings(root, fn) {
  return settingsLock(async () => {
    let settings;
    try {
      settings = await readSettingsFile(root);
    } catch {
      throw httpError(UNREADABLE, 409);
    }
    const next = await fn(settings);
    await writeJsonAtomic(settingsPath(root), next);
    return next;
  });
}
