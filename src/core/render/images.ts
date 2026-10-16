import { isDesktop, resolveAssetUrl } from '../fs/fileService';
import { classifyRelativePath } from '../diagnostics/assets';

/**
 * Rewrites relative `<img>` sources into URLs the webview can actually load.
 *
 * A markdown document references its pictures by relative path — `![](./img/figure-1.png)` —
 * because that is what keeps the folder portable. The webview, however, is not a file browser:
 * it cannot resolve a path relative to a document it never sees. Without this pass every local
 * image renders as a broken icon, which is exactly what happened until a review caught the
 * resolver sitting unused.
 *
 * Absolute URLs are left alone: rewriting a remote image would break it, and fetching it is a
 * decision the document already made.
 *
 * Images that cannot be resolved are marked with `data-om-missing`, which the stylesheet turns
 * into a visible placeholder. A silently blank space tells the reader nothing; a marked one
 * tells them the figure is missing from the folder.
 */

export interface ImageRewriteReport {
  rewritten: number;
  missing: number;
  /** Resolved paths, for the diagnostics panel to explain. */
  missingPaths: string[];
}

export async function resolveLocalImages(root: HTMLElement, documentPath: string | null): Promise<ImageRewriteReport> {
  const report: ImageRewriteReport = { rewritten: 0, missing: 0, missingPaths: [] };
  const images = Array.from(root.querySelectorAll<HTMLImageElement>('img[src]'));
  if (images.length === 0) return report;

  for (const image of images) {
    const source = image.getAttribute('src') ?? '';
    if (source === '') continue;

    // Absolute URLs, data URIs and the asset scheme are already loadable.
    if (/^(?:https?|data|asset|blob):/i.test(source)) continue;

    if (!documentPath || !isDesktop()) {
      // Outside the desktop shell there is no filesystem to resolve against. Declared images
      // in the browser backend are inlined by the export path, not here.
      continue;
    }

    // `decodeURI` throws on an escape that is not valid UTF-8 (`%FF.png`); such a reference
    // cannot name a file on disk, so it is missing — not a reason to abandon the whole pass.
    const decoded = safeDecodeURI(source);

    // Refused before the filesystem is touched, matching the health check's rule.
    if (decoded === null || classifyRelativePath(decoded) === 'escapes') {
      image.dataset['omMissing'] = 'true';
      image.alt = image.alt || source;
      report.missing++;
      report.missingPaths.push(source);
      continue;
    }

    try {
      const resolved = await resolveAssetUrl(documentPath, decoded);
      if (resolved) {
        image.src = resolved;
        report.rewritten++;
      }
    } catch {
      image.dataset['omMissing'] = 'true';
      image.alt = image.alt || source;
      report.missing++;
      report.missingPaths.push(source);
    }
  }

  return report;
}

function safeDecodeURI(value: string): string | null {
  try {
    return decodeURI(value);
  } catch {
    return null;
  }
}
