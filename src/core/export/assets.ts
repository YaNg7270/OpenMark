/**
 * Image handling for export.
 *
 * The reader points `<img>` at whatever the document authored. An exported file has to
 * survive being emailed, so every local image becomes a `data:` URI.
 *
 * A remote image is deliberately **not** fetched and **not** rewritten: downloading it
 * would be a network request the user did not ask for, and would silently bake someone
 * else's content into their file. It stays an absolute URL and is reported, so the UI can
 * tell the author that the export is not fully self-contained.
 */

import type { AssetReader, ExportAsset, ExportReport } from './types';
import { exportInvoke } from './ipc';

/** What can be done with one `src` value. */
export type ImageSourceKind =
  /** Nothing to do: absent, or an in-document fragment. */
  | 'none'
  /** Already self-contained (`data:`); leave untouched. */
  | 'inline'
  /** An absolute reference we will not fetch; report it. */
  | 'remote'
  /** A path relative to the document; read it and inline it. */
  | 'local';

/** Classifies an `img` source without touching the network. */
export function classifyImageSource(src: string | null | undefined): ImageSourceKind {
  const value = (src ?? '').trim();
  if (!value || value.startsWith('#')) return 'none';
  if (/^data:/i.test(value)) return 'inline';
  // Protocol-relative (`//host/x.png`) and any real scheme is an absolute reference.
  if (value.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(value)) return 'remote';
  return 'local';
}

interface ExportAssetWire {
  path: string;
  relative_path: string;
  mime: string;
  size: number;
  base64: string;
}

/**
 * Reads an image through the desktop backend (`read_export_asset`).
 *
 * Throws when the shell is absent or the file cannot be read; the caller records the reason
 * in the report rather than failing the whole export, because one missing figure must not
 * cost the author their document.
 */
export const desktopAssetReader: AssetReader = async (documentPath, relativePath) => {
  const invoke = exportInvoke();
  if (!invoke) {
    throw new Error(`cannot read "${relativePath}": not running in the desktop app`);
  }
  const payload = await invoke<ExportAssetWire>('read_export_asset', {
    documentPath,
    relativePath,
  });
  return {
    path: payload.path,
    relativePath: payload.relative_path,
    mime: payload.mime,
    size: payload.size,
    base64: payload.base64,
  };
};

/** Builds the `data:` URI for an asset. */
export function toDataUri(asset: ExportAsset): string {
  return `data:${asset.mime};base64,${asset.base64}`;
}

export interface InlineImagesOptions {
  /** Absolute path of the `.md` file the images are relative to. */
  documentPath: string;
  readAsset: AssetReader;
  report: ExportReport;
}

/**
 * Rewrites every image in `root` to a `data:` URI where possible, and reports what happened.
 *
 * Runs sequentially and in document order: the report then reads like the document does,
 * which matters when a figure is missing and the author has to find it.
 */
export async function inlineImages(root: ParentNode, options: InlineImagesOptions): Promise<void> {
  const { documentPath, readAsset, report } = options;

  for (const image of Array.from(root.querySelectorAll('img'))) {
    const src = image.getAttribute('src');
    const kind = classifyImageSource(src);

    if (kind === 'remote' && src) {
      recordRemote(report, src);
      continue;
    }
    if (kind !== 'local' || !src) continue;

    try {
      const asset = await readAsset(documentPath, src);
      image.setAttribute('src', toDataUri(asset));
      image.removeAttribute('data-om-missing');
      report.inlinedImages.push({
        relativePath: src,
        mime: asset.mime,
        size: asset.size,
      });
    } catch (error) {
      // The image keeps its authored path so the file still shows what the author wrote,
      // and the report says precisely which one is broken.
      const message = error instanceof Error ? error.message : String(error);
      image.setAttribute('data-om-missing', 'true');
      report.missingImages.push({ relativePath: src, error: message });
      report.warnings.push(`missing image: ${src} (${message})`);
    }
  }

  // `srcset` cannot be inlined entry by entry without re-encoding each variant, and leaving
  // it would let the viewer pick a path that is not in the file. Removing it keeps the one
  // source we did inline authoritative.
  for (const image of Array.from(root.querySelectorAll('img[srcset]'))) {
    const srcset = image.getAttribute('srcset') ?? '';
    if (classifyImageSrcSet(srcset) === 'remote') continue;
    image.removeAttribute('srcset');
    report.warnings.push('removed a srcset that could not be inlined');
  }
}

function classifyImageSrcSet(srcset: string): 'remote' | 'local' {
  for (const candidate of srcset.split(',')) {
    const url = candidate.trim().split(/\s+/)[0] ?? '';
    if (classifyImageSource(url) === 'local') return 'local';
  }
  return 'remote';
}

function recordRemote(report: ExportReport, src: string): void {
  if (report.remoteImages.includes(src)) return;
  report.remoteImages.push(src);
  report.warnings.push(`remote image left as a URL: ${src}`);
}
