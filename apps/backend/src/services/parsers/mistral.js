import { fromBase64, relinkImages, result, saveImages, sendJson } from './common.js';

/**
 * api.mistral.ai v1/ocr: one synchronous request with the PDF as a base64 data URI. Each page comes
 * back as markdown linking ![img-0.jpeg](img-0.jpeg) to its images, sent as base64.
 */
export async function parseWithMistral(pdf, config, outputDir) {
  const { name, endpoint, key } = config;
  const reply = await sendJson(name, `${endpoint}/ocr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'mistral-ocr-latest',
      document: { type: 'document_url', document_url: `data:application/pdf;base64,${pdf.buffer.toString('base64')}` },
      include_image_base64: true
    })
  });
  if (!Array.isArray(reply.pages)) throw new Error(`${name} sent no pages.`);
  // [unconfirmed] that maths comes as $…$; the docs only name an equation block
  const taken = new Set();
  const images = [];
  const pages = [];
  // image IDs are only promised to be unique on their page, so each page is relinked on its own
  for (const page of reply.pages) {
    const items = (page.images || []).filter((img) => img.image_base64).map((img) => ({ from: img.id, ...fromBase64(img.image_base64) }));
    const saved = await saveImages(outputDir, items, taken);
    images.push(...saved.images);
    pages.push(relinkImages(page.markdown || '', saved.renames));
  }
  return result(name, pages.join('\n\n'), images);
}
