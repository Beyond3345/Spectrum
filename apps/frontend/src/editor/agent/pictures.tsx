// Pictures for the agents: those pasted or dropped into the message box, a page of the PDF sent to the agent, and the
// pages and figures the Spectrum agent looked at. What is sent is at most MAX_SIDE pixels on its long side (what the
// providers take without shrinking); the thread keeps a small copy of each to show.
import Icon from '../../app/Icon';
import { openDiagram } from '../../app/desktop';
import { useEditor } from '../EditorContext';
import { errorText } from '../shared';

/** A picture to send: its type and base64 bytes, a name, and the small copy the thread keeps (a data URL). */
export type Picture = { type: string; data: string; name: string; thumb: string };
export const MAX_PICTURES = 4;
const MAX_SIDE = 1568;
const THUMB_SIDE = 160;

/** source drawn on white at most `side` pixels on its long side. */
function drawn(source: CanvasImageSource, width: number, height: number, side: number) {
  const k = Math.min(1, side / Math.max(width, height, 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * k));
  canvas.height = Math.max(1, Math.round(height * k));
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

/** A canvas as a picture: a PNG, or a JPEG when that is much smaller (a photo). */
export function canvasPicture(canvas: HTMLCanvasElement, name: string): Picture {
  const big = drawn(canvas, canvas.width, canvas.height, MAX_SIDE);
  const png = big.toDataURL('image/png');
  const jpeg = big.toDataURL('image/jpeg', 0.9);
  const url = jpeg.length < png.length * 0.6 ? jpeg : png;
  return { type: url.slice(5, url.indexOf(';')), data: url.slice(url.indexOf(',') + 1), name, thumb: drawn(canvas, canvas.width, canvas.height, THUMB_SIDE).toDataURL('image/jpeg', 0.8) };
}

/** An image file (pasted or dropped) as a picture; null for a file that is not one the browser can draw. */
export async function filePicture(file: File): Promise<Picture | null> {
  if (!/^image\/(?:png|jpeg|webp|gif|bmp)$/.test(file.type)) return null;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return null;
  try {
    return canvasPicture(drawn(bitmap, bitmap.width, bitmap.height, MAX_SIDE), file.name || 'Pasted picture');
  } finally {
    bitmap.close();
  }
}

/** The images among pasted or dropped files, as pictures, up to `room` of them. */
export async function picturesOf(files: FileList | File[] | null | undefined, room: number) {
  const out: Picture[] = [];
  for (const file of Array.from(files || [])) {
    if (out.length >= room) break;
    const picture = await filePicture(file);
    if (picture) out.push(picture);
  }
  return out;
}

/** The message box's pictures as chips, each with its small copy and a way to take it off. */
export function PictureChips({ pictures, onRemove }: { pictures: Picture[]; onRemove(index: number): void }) {
  return (
    <>
      {pictures.map((p, i) => (
        <span key={`${i}-${p.name}`} className="chip active agent-picture-chip" title={`${p.name}: sent with the message to a model that reads images`}>
          <img src={p.thumb} alt="" />
          <span className="truncate">{p.name}</span>
          <button className="chip-remove" aria-label={`Don’t send ${p.name}`} onClick={() => onRemove(i)}>
            <Icon name="xmark" />
          </button>
        </span>
      ))}
    </>
  );
}

/** The small copies of the pictures a message was sent with, under its words. */
export function PictureStrip({ pictures }: { pictures?: string[] }) {
  if (!pictures?.length) return null;
  return (
    <div className="agent-picture-strip">
      {pictures.map((url, i) => (
        <img key={i} src={url} alt={`Picture ${i + 1} sent with the message`} />
      ))}
    </div>
  );
}

// a figure the composer opens: a diagram it saved (figures/ before 2.1)
const DIAGRAM = /^(?:diagrams|figures)\/[^/]+\.(?:tex|typ)$/;

/** A page or figure the agent looked at, on its step's card; a composer's diagram with Open in composer. */
export function ToolPicture({ url, file }: { url: string; file?: string }) {
  const api = useEditor();
  const diagram = file && DIAGRAM.test(file) ? file : '';
  return (
    <div className="agent-tool-picture">
      <img src={url} alt={diagram ? `The figure ${diagram} as the agent saw it` : 'The page as the agent saw it'} />
      {diagram && (
        <button className="btn small" onClick={() => openDiagram(api.projectId, diagram, /\.typ$/i.test(diagram) ? 'typst' : 'tikz').catch((err) => api.notify(`Couldn’t open the diagram composer: ${errorText(err)}`, 'error'))}>
          <Icon name="pencil.and.ruler" /> Open in composer
        </button>
      )}
    </div>
  );
}
