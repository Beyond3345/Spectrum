import { download, pdfBlob, poll, relinkImages, result, saveImages, sendJson } from './common.js';

/**
 * Baidu AI Studio's PaddleOCR API v2 jobs: upload with the model's name, poll the job, then read
 * its JSONL result, where each page has markdown.text and markdown.images ({ path: url }).
 */
export async function parseWithPaddleOcr(pdf, config, outputDir) {
  const { name, endpoint, key } = config;
  const headers = { Authorization: `Bearer ${key}` };
  // replies are wrapped as { code, msg, data } ([unconfirmed] some say { errorCode, errorMsg, data }); a token
  // error comes back as HTTP 200 with a code, so it is thrown here rather than polled on for 10 minutes
  const unwrap = (reply) => {
    const code = reply.code || reply.errorCode;
    if (code) throw new Error(`${name} returned an error: ${reply.msg || reply.errorMsg || code}`);
    return reply.data || {};
  };
  const form = new FormData();
  form.append('file', pdfBlob(pdf), pdf.name);
  // 1.6 is newer, but only the SDK docs list it [unconfirmed]
  form.append('model', 'PaddleOCR-VL-1.5');
  const { jobId } = unwrap(await sendJson(name, `${endpoint}/api/v2/ocr/jobs`, { method: 'POST', headers, body: form }));
  if (!jobId) throw new Error(`${name} didn’t accept the PDF.`);

  const resultUrl = await poll(
    name,
    async () => {
      const job = unwrap(await sendJson(name, `${endpoint}/api/v2/ocr/jobs/${encodeURIComponent(jobId)}`, { headers }));
      if (job.state === 'failed') throw new Error(`${name} couldn’t read the PDF: ${job.errorMsg || 'no reason given'}.`);
      return job.state === 'done' ? job.resultUrl || {} : undefined;
    },
    config
  );
  if (!resultUrl.jsonUrl) throw new Error(`${name} finished but sent no results.`);
  // short-lived storage links, so no key
  const lines = (await download(name, resultUrl.jsonUrl)).toString('utf8').split('\n').filter((line) => line.trim());
  const pages = lines.flatMap((line) => JSON.parse(line).result?.layoutParsingResults || []);
  const taken = new Set();
  const images = [];
  const parts = [];
  for (const page of pages) {
    const items = [];
    for (const [from, url] of Object.entries(page.markdown?.images || {})) items.push({ from, data: await download(name, url) });
    const saved = await saveImages(outputDir, items, taken);
    images.push(...saved.images);
    parts.push(relinkImages(page.markdown?.text || '', saved.renames));
  }
  return result(name, parts.join('\n\n'), images);
}
