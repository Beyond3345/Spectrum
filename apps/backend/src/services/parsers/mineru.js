import { download, poll, readZip, send, sendJson } from './common.js';

/**
 * mineru.net v4 batch API: ask for an upload link, PUT the PDF there, poll the batch, then
 * download the zip of full.md and images/. Replies are wrapped as { code: 0, msg, data }.
 * [unconfirmed] in the docs that maths comes as $…$ and $$…$$, though it does in practice.
 */
export async function parseWithMineru(pdf, config, outputDir) {
  const { name, endpoint, key } = config;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
  const unwrap = (reply) => {
    if (reply.code !== 0) throw new Error(`${name} returned an error: ${reply.msg || JSON.stringify(reply).slice(0, 200)}`);
    return reply.data || {};
  };

  const { batch_id: batchId, file_urls: [uploadUrl] = [] } = unwrap(
    await sendJson(name, `${endpoint}/file-urls/batch`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ files: [{ name: pdf.name }], model_version: 'vlm', enable_formula: true, enable_table: true })
    })
  );
  if (!batchId || !uploadUrl) throw new Error(`${name} didn’t return an upload link.`);
  // a presigned storage link: the raw bytes, no key and no Content-Type
  await send(name, uploadUrl, { method: 'PUT', body: pdf.buffer });

  const zipUrl = await poll(
    name,
    async () => {
      const job = unwrap(await sendJson(name, `${endpoint}/extract-results/batch/${batchId}`, { headers })).extract_result?.[0];
      if (job?.state === 'failed') throw new Error(`${name} couldn’t read the PDF: ${job.err_msg || 'no reason given'}.`);
      if (job?.state !== 'done') return undefined; // waiting-file, pending, running, converting
      if (!job.full_zip_url) throw new Error(`${name} finished but sent no results.`);
      return job.full_zip_url;
    },
    config
  );
  return readZip(name, await download(name, zipUrl), outputDir);
}
