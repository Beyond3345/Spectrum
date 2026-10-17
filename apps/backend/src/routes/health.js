import { promises as fs } from 'fs';
import {
  addTemplateToManifest,
  closeTemplateDraft,
  deleteTemplate,
  editTemplate,
  readTemplateManifest,
  restoreTemplate,
  saveAsTemplate,
  saveTemplateDraft,
  syncTemplates,
  templatePath
} from '../services/templateService.js';
import { detectMainFile } from '../services/projectService.js';
import { TEMPLATE_DIR } from '../config/constants.js';
import { ensureDir, extractZip } from '../utils/fsUtils.js';

const EXISTS = 'A template with that name already exists.';

export function registerHealthRoutes(fastify) {
  fastify.get('/api/health', async () => ({ ok: true, app: 'spectrum' }));

  fastify.get('/api/templates', async (req) => {
    // the gallery shows templates saved on the user's other computers too
    await syncTemplates().catch((err) => req.log.error(err));
    const { templates, categories } = await readTemplateManifest();
    return { templates, categories };
  });

  // a new template from a project: { projectId, label, category, description }
  fastify.post('/api/templates', async (req) => ({ ok: true, template: await saveAsTemplate(String(req.body?.projectId || ''), req.body || {}) }));

  // a working copy of the template to edit, as a project kept out of the list
  fastify.post('/api/templates/:id/edit', async (req) => ({ ok: true, ...(await editTemplate(req.params.id)) }));

  fastify.post('/api/templates/:id/restore', async (req) => ({ ok: true, template: await restoreTemplate(req.params.id) }));

  fastify.delete('/api/templates/:id', async (req) => {
    await deleteTemplate(req.params.id);
    return { ok: true };
  });

  // a working copy's files into its template
  fastify.post('/api/projects/:id/save-template', async (req) => ({ ok: true, template: await saveTemplateDraft(req.params.id) }));

  // done with a working copy; a 409 says it has changes not saved to the template, unless discard is set
  fastify.post('/api/projects/:id/close-template', async (req) => {
    await closeTemplateDraft(req.params.id, !!req.body?.discard);
    return { ok: true };
  });

  // Extracted like a project zip (Finder litter skipped, a single top-level folder unwrapped)
  // into a new folder; an upload never merges into or relabels an existing template.
  fastify.post('/api/templates/upload', async (req, reply) => {
    await ensureDir(TEMPLATE_DIR);
    let templateId = '';
    let templateLabel = '';
    let templateRoot = '';

    try {
      for await (const part of req.parts()) {
        if (part.type === 'field' && part.fieldname === 'templateId') {
          templateId = String(part.value || '').trim();
          continue;
        }
        if (part.type === 'field' && part.fieldname === 'templateLabel') {
          templateLabel = String(part.value || '').trim();
          continue;
        }
        if (part.type !== 'file') continue;
        if (templateRoot) {
          part.file.resume();
          continue;
        }
        if (!templateId) {
          part.file.resume();
          return reply.code(400).send({ ok: false, error: 'templateId must come before the file.' });
        }
        const root = templatePath(templateId);
        const { templates } = await readTemplateManifest();
        if (templates.some((t) => String(t.id).toLowerCase() === templateId.toLowerCase())) {
          part.file.resume();
          return reply.code(409).send({ ok: false, error: EXISTS });
        }
        try {
          await fs.mkdir(root);
        } catch (err) {
          part.file.resume();
          if (err.code === 'EEXIST') return reply.code(409).send({ ok: false, error: EXISTS });
          throw err;
        }
        templateRoot = root;
        await extractZip(part.file, templateRoot);
      }
    } catch (err) {
      if (templateRoot) await fs.rm(templateRoot, { recursive: true, force: true });
      const notZip = /signature|central directory|zip/i.test(err.message);
      return reply.code(notZip ? 400 : err.statusCode || 500).send({ ok: false, error: notZip ? 'That file isn’t a valid .zip archive.' : err.message });
    }

    if (!templateRoot) {
      return reply.code(400).send({ ok: false, error: 'Missing templateId or zip file.' });
    }

    await addTemplateToManifest({
      id: templateId,
      label: templateLabel || templateId,
      mainFile: (await detectMainFile(templateRoot)) || 'main.tex',
      category: 'academic',
      description: templateLabel || templateId,
      tags: [],
      author: 'User',
      featured: false,
    });

    return { ok: true, templateId };
  });
}
