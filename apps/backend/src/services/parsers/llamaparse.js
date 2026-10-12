import { download, pdfBlob, poll, relinkImages, result, saveImages, sendJson } from './common.js';

/**
 * LlamaParse API v2 on api.cloud.llamaindex.ai (or the EU host): upload with a configuration, poll
 * the job, then fetch the full markdown and presigned links to the images it saved.
 */
export async function parseWithLlamaParse(pdf, config, outputDir) {
  const { name, endpoint, key } = config;
  const headers = { Authorization: `Bearer ${key}` };
  const form = new FormData();
  form.append('file', pdfBlob(pdf), pdf.name);
  // the agentic tier writes equations as LaTeX, [unconfirmed] with which delimiters (dollarMaths() covers \( \[);
  // also [unconfirmed]: where images_to_save sits in v2's configuration
  form.append('configuration', JSON.stringify({ tier: 'agentic', version: 'latest', output_options: { images_to_save: ['embedded'] } }));
  const sent = await sendJson(name, `${endpoint}/api/v2/parse/upload`, { method: 'POST', headers, body: form });
  const id = sent.id || sent.job?.id;
  if (!id) throw new Error(`${name} didn’t accept the PDF: ${sent.detail || sent.error_message || 'no job ID'}.`);
  const jobUrl = `${endpoint}/api/v2/parse/${encodeURIComponent(id)}`;

  await poll(
    name,
    async () => {
      const job = (await sendJson(name, jobUrl, { headers })).job || {};
      const status = String(job.status || '').toUpperCase();
      if (status === 'FAILED' || status === 'CANCELLED') throw new Error(`${name} couldn’t read the PDF: ${job.error_message || status.toLowerCase()}.`);
      return status === 'COMPLETED' ? true : undefined;
    },
    config
  );
  // [unconfirmed] the exact shape of markdown_full and images_content_metadata in the reply
  const done = await sendJson(name, `${jobUrl}?expand=markdown_full,images_content_metadata`, { headers });
  const markdown = typeof done.markdown_full === 'string' ? done.markdown_full : done.markdown_full?.markdown || '';
  const listed = done.images_content_metadata?.images || [];
  const items = [];
  for (const img of listed.filter((i) => i.presigned_url)) {
    // presigned storage links carry their own access, so no key
    items.push({ from: img.filename || img.presigned_url, data: await download(name, img.presigned_url) });
  }
  const { images, renames } = await saveImages(outputDir, items);
  return result(name, relinkImages(markdown, renames), images);
}
