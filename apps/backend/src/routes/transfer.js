import crypto from 'crypto';
import path from 'path';
import { promises as fs } from 'fs';
import { buildTransferGraph } from '../services/transferAgent/graph.js';
import { buildPdfTransferGraph } from '../services/transferAgent/graphPdf.js';
import { resolveLLMConfig, missingKey, NO_API_KEY } from '../services/llmService.js';
import { PARSERS, resolveParserConfig, transferDir } from '../services/parsers/index.js';
import { readTemplateManifest, templatePath } from '../services/templateService.js';
import { createProject, getProjectRoot, readMeta, unregister } from '../services/projectService.js';
import { copyDir, ensureDir } from '../utils/fsUtils.js';

/** New project for a transfer: the target template's files, named after the source. */
async function createTargetProject(template, sourceProjectId, parentDir) {
  let sourceName = 'Untitled';
  if (sourceProjectId) {
    try {
      sourceName = (await readMeta(await getProjectRoot(sourceProjectId))).name;
    } catch { /* ignore */ }
  }
  const templateRoot = templatePath(template.id);
  const project = await createProject({
    // "CVPR (skeleton)" → "Paper (CVPR)", not "Paper (CVPR (skeleton))"
    name: `${sourceName} (${String(template.label || template.id).replace(/\s*\(.*\)$/, '')})`,
    parentDir,
    meta: template.mainFile ? { mainFile: template.mainFile } : {},
    populate: (root) => copyDir(templateRoot, root)
  });
  return project.id;
}

/**
 * A job that errored part-way leaves a project holding only template files and half a
 * conversion; remove it so it doesn't turn up in the list later. A 'failed' job (the
 * conversion ran but never compiled) keeps its project, which holds the converted text.
 */
async function discardTarget(job) {
  const id = job.state?.targetProjectId;
  if (!id || job.discarded) return;
  job.discarded = true;
  try {
    const root = await getProjectRoot(id);
    // moved since (Sync to): not this job's own folder any more
    if (root !== job.root) return;
    await unregister(id);
    await fs.rm(root, { recursive: true, force: true });
  } catch {
    // already gone
  }
}

// In-memory job store: jobId → { graph, state, status, progressLog, projectId, root }, projectId the new project's and
// root its folder when the job began
const jobs = new Map();
const FINISHED = new Set(['success', 'failed', 'error']);

/**
 * A transfer from or into the project hasn't finished: its steps keep the folder's path, so it mustn't move.
 * ponytail: one left waiting (its panel closed) counts until Spectrum restarts; time jobs out if that bites
 */
export const transferring = (projectId) =>
  [...jobs.values()].some((job) => !FINISHED.has(job.status) && (job.projectId === projectId || job.state?.sourceProjectId === projectId));

export function registerTransferRoutes(fastify) {

  /**
   * POST /api/transfer/start
   * Body: { sourceProjectId, sourceMainFile, targetTemplateId, targetMainFile,
   *         engine?, layoutCheck?, llmConfig? }
   * Creates a new project from the target template, then starts the transfer.
   * Returns: { jobId, newProjectId }
   */
  fastify.post('/api/transfer/start', async (request, reply) => {
    const {
      sourceProjectId, sourceMainFile,
      targetTemplateId, targetMainFile,
      engine = 'pdflatex',
      layoutCheck = false,
      llmConfig,
      visionLlmConfig,
      parentDir,
    } = request.body || {};

    if (!sourceProjectId || !sourceMainFile || !targetTemplateId || !targetMainFile) {
      return reply.code(400).send({ error: 'Missing required fields.' });
    }
    try {
      await getProjectRoot(sourceProjectId);
    } catch {
      return reply.code(400).send({ error: 'Unknown source project.' });
    }

    // Validate template exists
    const { templates } = await readTemplateManifest();
    const template = templates.find(t => t.id === targetTemplateId);
    if (!template) {
      return reply.code(400).send({ error: `Unknown template: ${targetTemplateId}` });
    }
    // check before anything is created, so a missing key leaves no stray project behind
    if (missingKey(resolveLLMConfig(llmConfig))) {
      return reply.code(400).send({ error: NO_API_KEY });
    }

    const newProjectId = await createTargetProject(template, sourceProjectId, parentDir);

    // Build transfer graph
    const jobId = crypto.randomUUID();
    const graph = buildTransferGraph();

    const initialState = {
      sourceProjectId,
      sourceMainFile,
      targetProjectId: newProjectId,
      targetMainFile,
      engine,
      layoutCheck,
      llmConfig: resolveLLMConfig(llmConfig),
      visionLlmConfig: resolveLLMConfig(visionLlmConfig || llmConfig),
      jobId,
    };

    jobs.set(jobId, {
      graph,
      state: initialState,
      status: 'pending',
      progressLog: [],
      hasStarted: false,
      iterator: null,
      projectId: newProjectId,
      root: await getProjectRoot(newProjectId),
    });

    return { jobId, newProjectId };
  });

  /**
   * POST /api/transfer/step
   * Body: { jobId }
   * Runs the graph one step forward.
   * Returns: { status, currentNode, progressLog }
   */
  fastify.post('/api/transfer/step', async (request, reply) => {
    const { jobId } = request.body || {};
    const job = jobs.get(jobId);
    if (!job) {
      return reply.code(404).send({ error: 'Job not found.' });
    }

    // If waiting for images, don't proceed
    if (job.status === 'waiting_images') {
      return { status: 'waiting_images', progressLog: job.progressLog };
    }

    // compile/fix and layout loops can exceed langgraph's default of 25 steps
    const runConfig = { configurable: { thread_id: jobId }, recursionLimit: 100 };
    try {
      job.status = 'running';
      const input = job.hasStarted ? null : job.state;
      const result = await job.graph.invoke(input, runConfig);
      job.hasStarted = true;
      job.state = result;
      job.progressLog = result.progressLog || [];
      job.status = result.status || 'running';

      return {
        status: job.status,
        progressLog: job.progressLog,
        // the frontend renders these pages to images for the VLM layout check
        pdf: job.status === 'waiting_images' ? (result.compileResult?.pdf || '') : undefined,
        newProjectId: job.state.targetProjectId,
      };
    } catch (err) {
      const msg = err?.message || String(err || 'Unknown error');
      job.status = 'error';
      job.error = msg;
      // show how far it got
      job.progressLog = (await job.graph.getState(runConfig).catch(() => null))?.values?.progressLog || job.progressLog;
      await discardTarget(job);
      return reply.code(500).send({
        error: msg,
        progressLog: job.progressLog,
      });
    }
  });

  /**
   * POST /api/transfer/submit-images
   * Body: { jobId, images: [{ page, base64, mime }] }
   * Frontend submits PDF page screenshots for VLM layout check.
   */
  fastify.post('/api/transfer/submit-images', async (request, reply) => {
    const { jobId, images } = request.body || {};
    const job = jobs.get(jobId);
    if (!job) {
      return reply.code(404).send({ error: 'Job not found.' });
    }

    if (job.status !== 'waiting_images') {
      return reply.code(400).send({ error: 'Job is not waiting for images.' });
    }

    // Inject images into checkpointed state so the next /step can resume from checkLayout.
    const updated = { pageImages: images || [], status: 'running' };
    try {
      if (job.hasStarted && typeof job.graph.updateState === 'function') {
        await job.graph.updateState(
          { configurable: { thread_id: jobId } },
          updated,
        );
      }
    } catch {
      // Fallback to in-memory state mutation if checkpoint update fails.
    }
    job.state = { ...job.state, ...updated };
    job.status = 'running';

    return { ok: true };
  });

  // the parser presets for Settings → Template transfer, without the request-building parts
  fastify.get('/api/transfer/parsers', async () => ({
    parsers: PARSERS.map(({ parse: _parse, maxMB: _maxMB, ...preset }) => preset)
  }));

  /**
   * POST /api/transfer/start-pdf
   * Body: { sourceProjectId?, sourceMainFile?, targetTemplateId, targetMainFile,
   *         engine?, layoutCheck?, llmConfig?, parser?: { id, protocol?, endpoint?, key?, appId? } }
   * PDF transfer: a parser turns the PDF into Markdown, which the model fills into the template.
   * If sourceProjectId is provided, compiles source to PDF first.
   * If not, expects PDF to be uploaded via /api/transfer/upload-pdf.
   * Returns: { jobId, newProjectId }
   */
  fastify.post('/api/transfer/start-pdf', async (request, reply) => {
    const {
      sourceProjectId, sourceMainFile,
      targetTemplateId, targetMainFile,
      engine = 'pdflatex',
      layoutCheck = false,
      llmConfig,
      visionLlmConfig,
      parser,
      parentDir,
    } = request.body || {};

    if (!targetTemplateId || !targetMainFile) {
      return reply.code(400).send({ error: 'Missing targetTemplateId or targetMainFile.' });
    }
    if (sourceProjectId) {
      try {
        await getProjectRoot(sourceProjectId);
      } catch {
        return reply.code(400).send({ error: 'Unknown source project.' });
      }
    }
    if (!!sourceProjectId !== !!sourceMainFile) {
      return reply.code(400).send({
        error: 'sourceProjectId and sourceMainFile must be provided together, or both omitted.',
      });
    }

    // Validate template
    const { templates } = await readTemplateManifest();
    const template = templates.find(t => t.id === targetTemplateId);
    if (!template) {
      return reply.code(400).send({ error: `Unknown template: ${targetTemplateId}` });
    }
    if (missingKey(resolveLLMConfig(llmConfig))) {
      return reply.code(400).send({ error: NO_API_KEY });
    }
    let parserConfig;
    try {
      parserConfig = resolveParserConfig(parser);
    } catch (err) {
      return reply.code(400).send({ error: err.message });
    }

    const newProjectId = await createTargetProject(template, sourceProjectId, parentDir);

    const jobId = crypto.randomUUID();
    const graph = buildPdfTransferGraph();

    const initialState = {
      sourceProjectId: sourceProjectId || '',
      sourceMainFile: sourceMainFile || '',
      targetProjectId: newProjectId,
      targetMainFile,
      engine,
      layoutCheck,
      llmConfig: resolveLLMConfig(llmConfig),
      visionLlmConfig: resolveLLMConfig(visionLlmConfig || llmConfig),
      parserConfig,
      transferMode: 'pdf',
      jobId,
    };

    jobs.set(jobId, {
      graph,
      state: initialState,
      status: 'pending',
      progressLog: [],
      hasStarted: false,
      iterator: null,
      projectId: newProjectId,
      root: await getProjectRoot(newProjectId),
    });

    return { jobId, newProjectId };
  });

  /**
   * POST /api/transfer/upload-pdf
   * Multipart: { jobId, pdf: File }
   * Upload a PDF for a PDF transfer (when no source project).
   */
  fastify.post('/api/transfer/upload-pdf', async (request, reply) => {
    const parts = request.parts();
    let jobId = '';
    let pdfBuffer = null;

    for await (const part of parts) {
      if (part.fieldname === 'jobId' && part.type === 'field') {
        jobId = part.value;
      } else if (part.fieldname === 'pdf' && part.type === 'file') {
        const chunks = [];
        for await (const chunk of part.file) {
          chunks.push(chunk);
        }
        pdfBuffer = Buffer.concat(chunks);
      }
    }

    if (!jobId) {
      return reply.code(400).send({ error: 'Missing jobId.' });
    }

    const job = jobs.get(jobId);
    if (!job) {
      return reply.code(404).send({ error: 'Job not found.' });
    }
    if (job.state?.transferMode !== 'pdf') {
      return reply.code(400).send({ error: 'Job is not a PDF transfer job.' });
    }

    if (!pdfBuffer) {
      return reply.code(400).send({ error: 'No PDF file uploaded.' });
    }

    // kept out of sight in the new project's .spectrum folder
    const dir = transferDir(await getProjectRoot(job.state.targetProjectId));
    await ensureDir(dir);
    const pdfPath = path.join(dir, 'source.pdf');
    await fs.writeFile(pdfPath, pdfBuffer);

    // Set sourcePdfPath in state so compileSource skips compilation
    job.state.sourcePdfPath = pdfPath;

    return { ok: true, pdfPath };
  });

} // end registerTransferRoutes
