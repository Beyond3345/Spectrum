import { createUniverseProject, universeIndex, universeTemplates } from '../services/universeService.js';

export function registerUniverseRoutes(fastify) {
  // ?typst=<version>: the Typst a new project compiles with, which hides templates that need a newer one
  fastify.get('/api/universe/templates', async (req) => {
    const typst = /^\d+\.\d+\.\d+$/.test(req.query?.typst || '') ? req.query.typst : undefined;
    const { packages, fetchedAt, offline } = await universeIndex();
    return { templates: universeTemplates(packages, typst), fetchedAt, offline };
  });

  // { name, template, version, parentDir }
  fastify.post('/api/universe/projects', (req) => createUniverseProject(req.body || {}));
}
