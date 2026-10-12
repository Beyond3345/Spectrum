import { fromBase64, pdfBlob, poll, relinkImages, result, saveImages, sendJson } from './common.js';

/**
 * docling-serve v1, usually self-hosted: an async convert (the sync one gives up after 120 s, and
 * formula enrichment is slow), poll the task, then fetch the markdown with its images embedded.
 */
export async function parseWithDocling(pdf, config, outputDir) {
  const { name, endpoint, key } = config;
  // only needed when the server sets DOCLING_SERVE_API_KEY
  const headers = key ? { 'X-Api-Key': key } : {};
  const form = new FormData();
  form.append('files', pdfBlob(pdf), pdf.name);
  form.append('to_formats', 'md');
  form.append('image_export_mode', 'embedded');
  // without it formulas come out as images or plain text
  form.append('do_formula_enrichment', 'true');
  const sent = await sendJson(name, `${endpoint}/v1/convert/file/async`, { method: 'POST', headers, body: form });
  if (!sent.task_id) throw new Error(`${name} didn’t accept the PDF.`);
  const task = encodeURIComponent(sent.task_id);

  await poll(
    name,
    async () => {
      const status = (await sendJson(name, `${endpoint}/v1/status/poll/${task}`, { headers })).task_status;
      if (status === 'failure') throw new Error(`${name} couldn’t read the PDF.`);
      return status === 'success' ? true : undefined;
    },
    config
  );
  const done = await sendJson(name, `${endpoint}/v1/result/${task}`, { headers });
  if (done.status === 'failure') throw new Error(`${name} couldn’t read the PDF: ${done.errors?.map((e) => e.error_message || e).join('; ') || 'no reason given'}.`);
  // [unconfirmed] that formulas come out as $$…$$; dollarMaths() covers \[ \] too
  const markdown = done.document?.md_content || '';
  const uris = [...new Set(markdown.match(/data:image\/[\w.+-]+;base64,[A-Za-z0-9+/=]+/g) || [])];
  const { images, renames } = await saveImages(outputDir, uris.map((uri, i) => ({ from: uri, name: `image-${i + 1}`, ...fromBase64(uri) })));
  return result(name, relinkImages(markdown, renames), images);
}
