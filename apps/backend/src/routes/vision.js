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
    // the document's language: Typst, else LaTeX (Markdown takes LaTeX's maths and tables through pandoc)
    let typst = false;
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
        if (part.fieldname === 'kind') typst = part.value === 'typst';
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
    const userInstruction = visionInstruction(mode, typst, assetPath);
    const system = `You are a ${typst ? 'Typst' : 'LaTeX'} conversion engine. Return only ${typst ? 'Typst' : 'LaTeX'} or plain text without explanations.`;
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

/** What the vision model is asked for an image, in the document's language. assetPath: where a figure's image is kept. */
export function visionInstruction(mode, typst, assetPath = '') {
  if (typst) {
    switch (mode) {
      case 'table':
        return 'Convert the table in the image to a Typst table: #table(columns: …, table.header(…), …) with each cell in [ ], the header row in table.header. Output only the #table call (no #set rules, no extra text).';
      case 'figure':
        return `Write a Typst figure for the image file ${assetPath ? `"/${assetPath}"` : 'that was pasted'}: #figure(image("…", width: 80%, alt: "…"), caption: […]) <fig:…>, with alt text saying what the image shows. Output only the #figure call and its label (no extra text).`;
      case 'algorithm':
        return 'Convert the algorithm in the image to Typst: #figure(kind: "algorithm", supplement: [Algorithm], caption: […], align(left)[…]) with its steps as a numbered list (+) and code in `raw` where it is code. Output only the #figure call (no extra text).';
      case 'ocr':
        return 'Extract the text from the image as Typst markup: escape # $ * _ @ < ` and \\ with a backslash where they are meant literally, and write maths as $…$ in Typst maths. Output only the text.';
      default:
        return 'Convert the formula in the image to Typst maths: a block equation as $ … $ with a space inside each $, in Typst syntax (frac(a, b) or a/b, sqrt(x), sum_(i=1)^n, alpha, upright text in quotes). Output only the equation (no extra text).';
    }
  }
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
}
