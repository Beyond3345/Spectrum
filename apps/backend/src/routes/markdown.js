import { getProjectRoot } from '../services/projectService.js';
import { saveMermaid } from '../services/markdownService.js';

const SHA1 = /^[0-9a-f]{40}$/;
// a picture of one Mermaid block, as base64
const MAX_IMAGE = 20 * 1024 * 1024;

export function registerMarkdownRoutes(fastify) {
  // the editor's pictures of a Markdown document's ```mermaid blocks: images ({ sha1: base64 PNG }) saved, and which of
  // wanted (sha1s) still have none
  fastify.post('/api/projects/:id/mermaid', async (req, reply) => {
    const { wanted = [], images = {} } = req.body || {};
    const bad =
      !Array.isArray(wanted) || wanted.length > 500 || !wanted.every((h) => typeof h === 'string' && SHA1.test(h)) ||
      !images || typeof images !== 'object' || Array.isArray(images) ||
      !Object.entries(images).every(([h, png]) => SHA1.test(h) && typeof png === 'string' && png.length <= MAX_IMAGE);
    if (bad) return reply.code(400).send({ ok: false, error: 'Invalid Mermaid pictures.' });
    const root = await getProjectRoot(req.params.id);
    try {
      const missing = await saveMermaid(root, wanted, Object.fromEntries(Object.entries(images).map(([h, png]) => [h, Buffer.from(png, 'base64')])));
      return { ok: true, missing };
    } catch (err) {
      return reply.code(400).send({ ok: false, error: err.message });
    }
  });
}
