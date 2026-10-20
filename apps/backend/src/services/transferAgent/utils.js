import { promises as fs } from 'fs';
import path from 'path';
import { ensureDir } from '../../utils/fsUtils.js';
import { safeJoin } from '../../utils/pathUtils.js';
import { extractJSON } from '../../utils/jsonUtils.js';
export { extractJSON, stripCodeFences } from '../../utils/jsonUtils.js';

// ---------------------------------------------------------------------------
// Retryable LLM JSON call
// ---------------------------------------------------------------------------

/**
 * Invoke an LLM and parse the response as JSON, with retry + schema validation.
 *
 * @param {object}   llm        - client from createLLM()
 * @param {Array}    messages   - Messages to send
 * @param {object}   opts
 * @param {import('zod').ZodType} [opts.schema] - Schema to validate against (optional)
 * @param {number}   [opts.maxRetries] - Max retry attempts (default 2)
 * @returns {{ parsed: object|null, raw: string, retries: number }}
 */
export async function invokeLLMForJSON(llm, messages, opts = {}) {
  const { schema, maxRetries = 2 } = opts;
  let lastRaw = '';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await llm.invoke(messages);
    lastRaw = typeof response.content === 'string' ? response.content : '';

    let parsed = extractJSON(lastRaw);
    if (parsed === null) {
      // JSON extraction failed — build a retry prompt
      if (attempt < maxRetries) {
        messages = [
          ...messages,
          { role: 'assistant', content: lastRaw },
          { role: 'user', content:
            'Your previous response could not be parsed as valid JSON. '
            + 'Please output ONLY a valid JSON object with no extra text.' },
        ];
        continue;
      }
      break;
    }

    if (schema) {
      const checked = schema.safeParse(parsed);
      if (!checked.success) {
        if (attempt < maxRetries) messages = [
          ...messages,
          { role: 'assistant', content: lastRaw },
          { role: 'user', content: `The JSON has schema issues: ${checked.error.message}. Please fix it and output only the corrected JSON.` }
        ];
        continue;
      }
      parsed = checked.data;
    }

    return { parsed, raw: lastRaw, retries: attempt };
  }

  return { parsed: null, raw: lastRaw, retries: maxRetries };
}

/**
 * Write file with snapshot backup.
 * Saves old content to .spectrum/agent-runs/<jobId>/ before overwriting.
 */
export async function writeFileWithSnapshot(projectRoot, relPath, content, jobId) {
  const absPath = safeJoin(projectRoot, relPath);

  // Save snapshot of old content if file exists
  if (jobId) {
    try {
      const old = await fs.readFile(absPath, 'utf8');
      const snapshotDir = path.join(projectRoot, '.spectrum', 'agent-runs', jobId);
      await ensureDir(snapshotDir);
      const ts = Date.now();
      const snapshotPath = path.join(snapshotDir, `${relPath.replace(/\//g, '_')}.${ts}.bak`);
      await fs.writeFile(snapshotPath, old, 'utf8');
    } catch {
      // File doesn't exist yet, no snapshot needed
    }
  }

  await ensureDir(path.dirname(absPath));
  await fs.writeFile(absPath, content, 'utf8');
}
