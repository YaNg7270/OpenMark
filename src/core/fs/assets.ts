import { mkdir } from '@tauri-apps/plugin-fs';
import { isDesktop, pathExists, writeBinaryFile } from './fileService';

/**
 * Image asset management.
 *
 * A pasted or dropped image has to end up somewhere the document can reference with a
 * relative path, because an absolute path breaks the moment the folder is moved and a `data:`
 * URI inside the markdown makes the file unreadable.
 *
 * ## Where assets go
 *
 * Into a sibling folder named after the document — `chapter-1.md` puts its pictures in
 * `chapter-1.assets/`. That is the convention long-form editors converge on, and it avoids
 * the collision a shared `assets/` folder would cause when a directory holds several
 * documents that each have a `figure-1.png`.
 *
 * ## Naming
 *
 * The original file name is kept when it is usable, because `screen-shot-of-the-error.png`
 * tells the reader far more than `image-1.png` ever will. Names are sanitised for characters
 * that break markdown links or Windows paths, and a numeric suffix is added rather than
 * overwriting an existing file — silently replacing a picture the author already referenced
 * would be data loss.
 */

/** Characters that break either a Windows path or a markdown link destination. */
const UNSAFE_IN_NAME = /[<>:"/\\|?*\u0000-\u001f]/g;

export interface ImageAsset {
  /** Path relative to the document, ready to place inside `![](...)`. */
  relativePath: string;
  /** Absolute path on disk, or null in the browser backend. */
  absolutePath: string | null;
  /** Byte size written. */
  size: number;
}

/** The directory that holds a document's images: `report.md` -> `report.assets`. */
export function assetDirectoryFor(documentPath: string): string {
  const separator = documentPath.includes('\\') ? '\\' : '/';
  const lastSeparator = documentPath.lastIndexOf(separator);
  const directory = lastSeparator >= 0 ? documentPath.slice(0, lastSeparator + 1) : '';
  const fileName = documentPath.slice(lastSeparator + 1);
  const stem = fileName.replace(/\.[^.]+$/, '') || 'document';
  return `${directory}${stem}.assets`;
}

/** Turns an arbitrary file name into one that is safe in a path and in a markdown link. */
export function sanitizeAssetName(name: string, fallbackExtension: string): string {
  const trimmed = name.trim().replace(UNSAFE_IN_NAME, '-').replace(/\s+/g, '-').replace(/-+/g, '-');
  // A leading dot would hide the file; a leading dash reads as an option to some tools.
  const cleaned = trimmed.replace(/^[.-]+/, '');
  if (cleaned === '') return `image-${Date.now()}.${fallbackExtension}`;
  return cleaned.includes('.') ? cleaned : `${cleaned}.${fallbackExtension}`;
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/avif': 'avif',
};

export function extensionForMime(mime: string): string {
  return EXTENSION_BY_MIME[mime.toLowerCase()] ?? 'png';
}

/**
 * Writes an image next to the document and returns the relative path to reference it by.
 *
 * Outside the desktop shell there is no filesystem to write to, so the caller receives a
 * `data:` URI instead. That keeps paste working in a browser — where the alternative is
 * silently discarding the reader's image — while the desktop path stays the real one.
 */
export async function saveImageAsset(documentPath: string, blob: Blob): Promise<ImageAsset> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const extension = extensionForMime(blob.type);
  const originalName = blob instanceof File ? blob.name : '';
  const baseName = sanitizeAssetName(originalName || `image-${Date.now()}`, extension);

  if (!isDesktop()) {
    return { relativePath: await toDataUri(blob), absolutePath: null, size: bytes.length };
  }

  const directory = assetDirectoryFor(documentPath);
  await mkdir(directory, { recursive: true });

  // Never overwrite: an existing picture may already be referenced from the document.
  let candidate = baseName;
  let counter = 1;
  while (await pathExists(`${directory}/${candidate}`)) {
    const dot = baseName.lastIndexOf('.');
    const stem = dot > 0 ? baseName.slice(0, dot) : baseName;
    const suffix = dot > 0 ? baseName.slice(dot) : '';
    candidate = `${stem}-${counter++}${suffix}`;
  }

  const absolutePath = `${directory}/${candidate}`;
  // The binary path, not the text one: an image must not be re-encoded as text.
  await writeBinaryFile(absolutePath, bytes);

  return {
    relativePath: `./${lastSegment(directory)}/${candidate}`,
    absolutePath,
    size: bytes.length,
  };
}

function lastSegment(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts.filter(Boolean).pop() ?? path;
}

async function toDataUri(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${blob.type || 'image/png'};base64,${btoa(binary)}`;
}

/**
 * Markdown for an image, with the alt text left empty.
 *
 * Alt text is the author's to write: inventing it from a file name produces worse
 * accessibility than an empty alt, which screen readers correctly skip.
 */
export function imageMarkdown(asset: ImageAsset, alt = ''): string {
  return `![${alt}](${asset.relativePath})`;
}
