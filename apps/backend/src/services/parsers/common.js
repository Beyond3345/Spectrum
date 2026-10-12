// What every parser adapter shares: requests whose errors name the parser, polling, saving images,
// unzipping, and the one result shape the transfer graph reads.
import { promises as fs } from 'fs';
import path from 'path';
import { PARSER_POLL_INTERVAL_MS, PARSER_TIMEOUT_MS } from '../../config/constants.js';
import { ensureDir } from '../../utils/fsUtils.js';
import { safeJoin } from '../../utils/pathUtils.js';

const snippet = (text) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200);

export const hostOf = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
};

/** Scheme, host and port: a key only goes back to the origin it was entered for, never over http instead of https. */
export const originOf = (url) => {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
};

/**
 * fetch, with errors that say which parser failed, its HTTP status and the start of its reply.
 * Redirects are followed here, as fetch only drops Authorization on another origin, not app_key or X-API-Key.
 */
export async function send(name, url, init = {}, hops = 5) {
  let res;
  try {
    res = await fetch(url, { ...init, redirect: 'manual' });
  } catch (err) {
    throw new Error(`Couldn’t reach ${name} at ${hostOf(url)} (${err.cause?.message || err.message}).`);
  }
  const location = res.status >= 300 && res.status < 400 && res.headers.get('location');
  if (location && hops > 0) {
    res.body?.cancel().catch(() => {});
    const next = new URL(location, url);
    const { method, body, headers, ...rest } = init;
    // as fetch does: 303, or 301/302 after a POST, becomes a GET with no body
    const asGet = res.status === 303 || (res.status <= 302 && method === 'POST');
    return send(name, next.href, { ...rest, ...(!asGet && { method, body }), ...(next.origin === originOf(url) && { headers }) }, hops - 1);
  }
  if (!res.ok) {
    const body = snippet(await res.text().catch(() => ''));
    throw new Error(`${name} returned HTTP ${res.status}${body ? `: ${body}` : '.'}`);
  }
  return res;
}

export async function sendJson(name, url, init) {
  const text = await (await send(name, url, init)).text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${name} sent a reply that isn’t JSON: ${snippet(text)}`);
  }
}

/** A file's bytes. Pass headers only when the URL is on the host the key was entered for. */
export const download = async (name, url, headers) => Buffer.from(await (await send(name, url, { headers })).arrayBuffer());

export const pdfBlob = (pdf) => new Blob([pdf.buffer], { type: 'application/pdf' });

/** Calls check() until it returns something; it throws when the job failed. */
export async function poll(name, check, { pollMs = PARSER_POLL_INTERVAL_MS, onProgress } = {}) {
  const started = Date.now();
  for (;;) {
    const done = await check();
    if (done !== undefined) return done;
    if (Date.now() - started > PARSER_TIMEOUT_MS) throw new Error(`${name} took more than ${PARSER_TIMEOUT_MS / 60000} minutes to read the PDF.`);
    onProgress?.({ parser: name, waitedMs: Date.now() - started });
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

const EXTENSIONS = { jpeg: 'jpg', 'svg+xml': 'svg' };

/** Base64 image data, bare or as a data URI, with the extension its type implies. */
export function fromBase64(value) {
  const match = /^data:image\/([\w.+-]+);base64,/.exec(value);
  const type = match?.[1].toLowerCase() || '';
  return { data: Buffer.from(match ? value.slice(match[0].length) : value, 'base64'), ext: EXTENSIONS[type] || type };
}

/** wanted, or wanted-2, -3… before the extension: one basename per image, as they're copied flat into images/. */
function uniqueName(taken, wanted) {
  let name = wanted;
  for (let n = 2; taken.has(name.toLowerCase()); n += 1) name = wanted.replace(/(\.\w+)?$/, `-${n}$1`);
  taken.add(name.toLowerCase());
  return name;
}

/**
 * Writes images into dir under unique basenames. items: [{ from, data, ext?, name? }], where from is
 * how the markdown refers to the image. Returns the images and each `from`'s new name for relinkImages.
 */
export async function saveImages(dir, items, taken = new Set()) {
  const images = [];
  const renames = new Map();
  for (const item of items) {
    const base = (item.name || path.posix.basename(String(item.from).split(/[?#]/)[0])).replace(/[^\w.-]+/g, '_') || 'image';
    const name = uniqueName(taken, /\.\w+$/.test(base) || !item.ext ? base : `${base}.${item.ext}`);
    const localPath = path.join(dir, name);
    await fs.writeFile(localPath, item.data);
    images.push({ name, localPath });
    renames.set(item.from, name);
  }
  return { images, renames };
}

/** Points the markdown's image links, ![](…) and <img src="…">, at the saved names. */
export function relinkImages(markdown, renames) {
  const byBase = new Map([...renames].map(([from, name]) => [path.posix.basename(from), name]));
  const find = (target) => {
    const clean = target.replace(/^\.\//, '');
    return renames.get(target) ?? renames.get(clean) ?? (target.startsWith('data:') ? undefined : byBase.get(path.posix.basename(clean))) ?? target;
  };
  return markdown
    .replace(/(!\[[^\]]*\]\()([^)\s]+)/g, (_, open, target) => open + find(target))
    .replace(/(<img\b[^>]*?\bsrc\s*=\s*["'])([^"']+)/gi, (_, open, target) => open + find(target));
}

// \[1\] is a citation with its brackets escaped, not display maths
const citation = /^\s*\d[\d\s,;–-]*$/;
const convert = (text) =>
  text
    .replace(/(?<!\\)\\\[([\s\S]+?)(?<!\\)\\\]/g, (all, maths) => (citation.test(maths) ? all : `$$${maths}$$`))
    .replace(/(?<!\\)\\\(([\s\S]+?)(?<!\\)\\\)/g, (all, maths) => (citation.test(maths) ? all : `$${maths.trim()}$`));

/**
 * \(…\) and \[…\] as $…$ and $$…$$, the delimiters the transfer prompt expects. \\[2pt] stays a line break,
 * and code (fenced or `inline`) stays as it is, so r"\(\d+\)" isn't turned into maths.
 */
export const dollarMaths = (markdown) =>
  markdown
    .split(/(```[\s\S]*?```|`[^`\n]*`)/)
    .map((part, i) => (i % 2 ? part : convert(part)))
    .join('');

/** The shape the transfer graph reads: markdown with $ maths, and the images it links to by basename. */
export function result(name, markdown, images) {
  const markdownContent = dollarMaths(String(markdown || ''));
  if (!markdownContent.trim()) throw new Error(`${name} found no text in the PDF.`);
  return { markdownContent, images };
}

/** Unzips a parser's results into dir and returns the top Markdown file with every image in the zip. */
export async function readZip(name, buffer, dir) {
  const { default: unzipper } = await import('unzipper');
  const zip = await unzipper.Open.buffer(buffer);
  for (const file of zip.files) {
    if (file.type === 'Directory') continue;
    let abs;
    try {
      abs = safeJoin(dir, file.path.replace(/\\/g, '/'));
    } catch {
      throw new Error(`${name} sent a zip with an unsafe path: ${file.path}`);
    }
    await ensureDir(path.dirname(abs));
    await fs.writeFile(abs, await file.buffer());
  }
  const files = (await fs.readdir(dir, { recursive: true })).map((f) => f.split(path.sep).join('/'));
  const markdownFile = files.filter((f) => /\.md$/i.test(f)).sort((a, b) => a.split('/').length - b.split('/').length)[0];
  if (!markdownFile) throw new Error(`${name} sent no Markdown file.`);
  const taken = new Set();
  const renames = new Map();
  const images = [];
  for (const f of files.filter((f) => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(f))) {
    const imageName = uniqueName(taken, path.posix.basename(f));
    images.push({ name: imageName, localPath: path.join(dir, f) });
    renames.set(path.posix.relative(path.posix.dirname(markdownFile), f), imageName);
  }
  const markdown = await fs.readFile(path.join(dir, markdownFile), 'utf8');
  return result(name, relinkImages(markdown, renames), images);
}
