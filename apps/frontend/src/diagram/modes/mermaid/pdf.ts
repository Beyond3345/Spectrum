// Keep the high-resolution PNG at the SVG's CSS size (96 px per inch, 72 PDF points per inch).
export async function pngToPdf(png: Uint8Array, rasterScale: number) {
  if (!Number.isFinite(rasterScale) || rasterScale <= 0) throw new RangeError('The image scale must be positive.');
  const { PDFDocument } = await import('pdf-lib');
  const document = await PDFDocument.create();
  const image = await document.embedPng(png);
  const width = image.width / rasterScale * 72 / 96;
  const height = image.height / rasterScale * 72 / 96;
  const page = document.addPage([width, height]);
  page.drawImage(image, { x: 0, y: 0, width, height });
  return (await document.save()).slice();
}
