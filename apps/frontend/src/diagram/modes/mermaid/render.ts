// Mermaid, loaded the first time a Mermaid diagram is drawn: rendering to SVG, and the SVG to a PNG for a document.

let library: Promise<typeof import('mermaid').default> | null = null;
let count = 0;

/** The diagram as SVG. strict: Mermaid sanitises labels and runs no script or link; no HTML labels, so it rasterises. */
export async function renderMermaid(code: string, dark = false) {
  library ??= import('mermaid').then((m) => m.default);
  const mermaid = await library;
  // an error comes back as a rejection, not as Mermaid's own error picture
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false, suppressErrorRendering: true, theme: dark ? 'dark' : 'default' });
  count += 1;
  const { svg } = await mermaid.render(`spectrum-mermaid-${count}`, code);
  return svg;
}

/** A Mermaid SVG drawn at `scale` × its own size, as a PNG on white. */
export async function svgToPng(svg: string, scale = 3): Promise<Blob> {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  const [, , width, height] = (root.getAttribute('viewBox') || '0 0 800 600').split(/[\s,]+/).map(Number);
  // Mermaid sizes it to its container (width 100%); an image needs its own size
  root.setAttribute('width', String(width));
  root.setAttribute('height', String(height));
  root.removeAttribute('style');
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(doc)], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No canvas');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The image couldn’t be made.'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
