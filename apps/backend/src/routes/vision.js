import path from 'path';
import { safeJoin, sanitizeUploadPath } from '../utils/pathUtils.js';
import { freePath, writeNewFile } from '../utils/fsUtils.js';
import { resolveLLMConfig, callOpenAICompatible } from '../services/llmService.js';
import { getProjectRoot } from '../services/projectService.js';

export function registerVisionRoutes(fastify) {
  fastify.post('/api/vision/latex', async (req) => {
    const parts = req.parts();
    let projectId = '';
    let mode = 'equation';
    let prompt = '';
    let llmConfig = null;
    let imageBuffer = null;
    let imageName = 'upload.png';
    let imageType = 'image/png';

    for await (const part of parts) {
      if (part.type === 'file') {
        imageName = part.filename || imageName;
        imageType = part.mimetype || imageType;
        const chunks = [];
        for await (const chunk of part.file) {
          chunks.push(chunk);
        }
        imageBuffer = Buffer.concat(chunks);
        continue;
      }
      if (part.type === 'field') {
        if (part.fieldname === 'projectId') projectId = String(part.value || '');
        if (part.fieldname === 'mode') mode = String(part.value || mode);
        if (part.fieldname === 'prompt') prompt = String(part.value || '');
        if (part.fieldname === 'llmConfig') {
          try {
            llmConfig = JSON.parse(String(part.value || '{}'));
          } catch {
            llmConfig = null;
          }
        }
      }
    }

    if (!imageBuffer) return { ok: false, error: 'Missing image.' };

    // Only a figure keeps the image, under a name nothing uses yet (every pasted image is
    // "image.png"), and only once the model has answered.
    let assetPath = '';
    let projectRoot = '';
    if (projectId && mode === 'figure') {
      try {
        projectRoot = await getProjectRoot(projectId);
        const safeName = path.basename(sanitizeUploadPath(imageName)) || `image-${Date.now()}.png`;
        const abs = await freePath(safeJoin(projectRoot, path.join('assets', safeName)));
        assetPath = path.relative(projectRoot, abs).split(path.sep).join('/');
      } catch {
        assetPath = '';
      }
    }

    const resolved = resolveLLMConfig(llmConfig);
    const imageBase64 = imageBuffer.toString('base64');
    const userInstruction = (() => {
      switch (mode) {
        case 'table':
          return 'Convert the table in the image to LaTeX tabular/table. Output only the table environment (no document, no preamble, no extra text).';
        case 'figure':
          return `Generate a LaTeX figure environment using ${assetPath || 'the image file'} with caption and label. Output only the figure environment (no document, no extra text).`;
        case 'algorithm':
          return 'Convert the algorithm in the image to LaTeX algorithm/algorithmic. Output only the algorithm environment (no document, no extra text).';
        case 'ocr':
          return 'Extract the text from the image and return clean LaTeX-safe text. Output only text.';
        default:
          return 'Convert the formula in the image to LaTeX equation environment. Output only the equation environment (no document, no extra text).';
      }
    })();

    const system = 'You are a LaTeX conversion engine. Return only LaTeX or plain text without explanations.';
    const messages = [
      { role: 'system', content: system },
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt ? `${userInstruction}\n\nUser note: ${prompt}` : userInstruction },
          { type: 'image_url', image_url: { url: `data:${imageType};base64,${imageBase64}` } }
        ]
      }
    ];

    const result = await callOpenAICompatible({
      messages,
      model: resolved.model,
      endpoint: resolved.endpoint,
      apiKey: resolved.apiKey
    });

    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    let latex = result.content;
    if (assetPath) {
      try {
        const written = await writeNewFile(safeJoin(projectRoot, assetPath), imageBuffer);
        const rel = path.relative(projectRoot, written).split(path.sep).join('/');
        // another image took the name while the model was busy
        if (rel !== assetPath) latex = latex.split(assetPath).join(rel);
        assetPath = rel;
      } catch {
        assetPath = '';
      }
    }
    return { ok: true, latex, ...(mode === 'figure' && { assetPath }) };
  });
}
