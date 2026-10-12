import { download, pdfBlob, poll, readZip, sendJson } from './common.js';

/**
 * api.mathpix.com v3/pdf: upload the PDF asking for md.zip, poll the PDF and then that conversion,
 * and download the zip (Markdown plus images/, like MinerU's). Keys go in app_id and app_key headers.
 */
export async function parseWithMathpix(pdf, config, outputDir) {
  const { name, endpoint, key, appId } = config;
  const headers = { app_id: appId, app_key: key };
  const form = new FormData();
  form.append('file', pdfBlob(pdf), pdf.name);
  form.append(
    'options_json',
    JSON.stringify({
      conversion_formats: { 'md.zip': true },
      // [unconfirmed] the docs only promise these for text output, so dollarMaths() also converts \( \[
      math_inline_delimiters: ['$', '$'],
      math_display_delimiters: ['$$', '$$']
    })
  );
  const sent = await sendJson(name, `${endpoint}/v3/pdf`, { method: 'POST', headers, body: form });
  if (!sent.pdf_id) throw new Error(`${name} didn’t accept the PDF: ${sent.error_info?.message || sent.error || 'no PDF ID'}.`);
  const id = encodeURIComponent(sent.pdf_id);

  await poll(
    name,
    async () => {
      const job = await sendJson(name, `${endpoint}/v3/pdf/${id}`, { headers });
      if (job.status === 'error') throw new Error(`${name} couldn’t read the PDF: ${job.error_info?.message || job.error || 'no reason given'}.`);
      if (job.status !== 'completed') return undefined;
      // the PDF is read first, then converted to each format asked for
      const zip = (await sendJson(name, `${endpoint}/v3/converter/${id}`, { headers })).conversion_status?.['md.zip'];
      if (zip?.status === 'error') throw new Error(`${name} couldn’t convert the PDF to Markdown: ${zip.error_info?.message || 'no reason given'}.`);
      return zip?.status === 'completed' ? true : undefined;
    },
    config
  );
  return readZip(name, await download(name, `${endpoint}/v3/pdf/${id}.md.zip`, headers), outputDir);
}
