import type { Diagnostic, ImageReference } from '../markdown/types';

/**
 * Document health checks for image references.
 *
 * These cannot live in the parser: deciding whether `./img/figure-1.png` exists requires
 * knowing the document's location on disk, and doing I/O inside a synchronous parse would
 * either block the UI or force the whole pipeline to be async. The parser therefore records
 * every reference, and this module turns a batch of resolved statuses into diagnostics.
 *
 * The split also keeps the checks testable: the corpus suite supplies a resolver rooted at
 * the fixture directory, while the application supplies the real filesystem.
 */

export type AssetStatus =
  /** The target exists. */
  | 'ok'
  /** The path is well formed but nothing is there. */
  | 'missing'
  /** The reference climbs out of the document's directory. */
  | 'escapes'
  /** An absolute http(s) URL, which cannot be loaded offline. */
  | 'remote'
  /** Anything else with a scheme we do not fetch (`data:`, `file:`, `asset:`). */
  | 'external'
  /** The reference could not be resolved at all. */
  | 'unknown';

/**
 * Classifies an image reference as absolute, ordinary-relative, or an upward traversal.
 *
 * ## Why one level up is allowed and two is not
 *
 * `../assets/logo.png` is how documents are organised: a `docs/` folder next to an `assets/`
 * folder. Refusing it would break ordinary files. `../../../../etc/passwd`, on the other hand,
 * has left the document's neighbourhood entirely, and in a self-contained document folder that
 * is almost always either a mistake or a deliberate attempt to read something the reader did
 * not intend to share. The check therefore refuses a *net* climb of two or more levels while
 * permitting one.
 *
 * The depth is tracked *along the path*, not summed, so `images/up/../../logo.png` — which
 * only ever reaches the document's own directory — is correctly treated as ordinary.
 *
 * Percent-encoded traversal (`..%2F..%2Fsecrets.txt`) is decoded first, because a reference
 * that means to climb out should not be able to hide behind an encoding.
 *
 * This is a safety check rather than a sandbox: the webview would refuse an unreadable path in
 * any case. Its value is telling the reader *why* a picture is blank instead of leaving them
 * with a broken image and no explanation.
 */
export function classifyRelativePath(rawPath: string): 'relative' | 'escapes' | 'absolute' {
  const trimmed = decodeReference(rawPath.trim().replace(/^<|>$/g, ''));
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return 'absolute';
  if (trimmed.startsWith('/') || trimmed.startsWith('\\') || /^[a-z]:[\\/]/i.test(trimmed)) return 'absolute';

  let depth = 0;
  for (const segment of trimmed.replace(/\\/g, '/').split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      depth -= 1;
      if (depth < -1) return 'escapes';
      continue;
    }
    depth += 1;
  }
  return 'relative';
}

/** Decodes percent-escapes, leaving a malformed reference untouched rather than throwing. */
function decodeReference(value: string): string {
  if (!value.includes('%')) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Builds diagnostics for a document's image references.
 *
 * `resolve` is called once per distinct path; callers that have to do I/O should pre-resolve
 * into a map and pass a lookup, because the same image is often referenced many times.
 */
export function assetDiagnostics(
  images: readonly ImageReference[],
  resolve: (path: string) => AssetStatus,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const cache = new Map<string, AssetStatus>();
  const reported = new Set<string>();

  for (const image of images) {
    // Remote references are already reported by the parser as `image-remote`; repeating them
    // here would double every entry in the panel.
    if (/^https?:/i.test(image.path)) continue;

    let status = cache.get(image.path);
    if (status === undefined) {
      status = resolve(image.path);
      cache.set(image.path, status);
    }

    // One diagnostic per distinct problem, reported at its first occurrence.
    const key = `${image.path}:${status}`;
    if (reported.has(key)) continue;
    reported.add(key);

    switch (status) {
      case 'escapes':
        diagnostics.push({
          code: 'image-path-escapes-root',
          severity: 'warning',
          message: `Image path leaves the document directory`,
          detail: `\`${image.path}\` 指向文档目录之外，出于安全考虑不会加载。`,
          range: image.range,
          source: 'asset',
          excerpt: image.path,
        });
        break;
      case 'missing':
        diagnostics.push({
          code: 'image-missing',
          severity: 'warning',
          message: `Image not found: ${image.path}`,
          detail: '相对路径未找到对应文件。请检查图片是否随文档一起复制，或修正路径。',
          range: image.range,
          source: 'asset',
          excerpt: image.alt ? `${image.alt} → ${image.path}` : image.path,
        });
        break;
      default:
        break;
    }
  }

  return diagnostics;
}
