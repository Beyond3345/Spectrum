import { fromBase64, hostOf, pdfBlob, poll, relinkImages, result, saveImages, sendJson } from './common.js';

/**
 * www.datalab.to/api/v1/convert (Marker, and Chandra in accurate mode): upload, then poll the
 * request_check_url until the markdown and its images ({ filename: base64 }) are ready.
 */
export async function parseWithDatalab(pdf, config, outputDir) {
  const { name, endpoint, key } = config;
  const headers = { 'X-API-Key': key };
  const form = new FormData();
  form.append('file', pdfBlob(pdf), pdf.name);
  form.append('output_format', 'markdown');
  form.append('mode', 'accurate');
  const sent = await sendJson(name, `${endpoint}/convert`, { method: 'POST', headers, body: form });
  if (sent.success === false || !sent.request_id) throw new Error(`${name} didn’t accept the PDF: ${sent.error || 'no request ID'}.`);
  // the key only goes back to the host it was entered for
  const checkUrl = hostOf(sent.request_check_url) === hostOf(endpoint) ? sent.request_check_url : `${endpoint}/convert/${encodeURIComponent(sent.request_id)}`;

  const done = await poll(
    name,
    async () => {
      const job = await sendJson(name, checkUrl, { headers });
      if (job.status === 'failed' || (job.status === 'complete' && job.success === false)) {
        throw new Error(`${name} couldn’t read the PDF: ${job.error || 'no reason given'}.`);
      }
      return job.status === 'complete' ? job : undefined;
    },
    config
  );
  const items = Object.entries(done.images || {}).map(([file, data]) => ({ from: file, ...fromBase64(data) }));
  const { images, renames } = await saveImages(outputDir, items);
  return result(name, relinkImages(done.markdown || '', renames), images);
}
