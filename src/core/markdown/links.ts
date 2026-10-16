import { headingSlugBase } from './engine';

/**
 * Where a link in a document points, decided without touching the filesystem.
 *
 * - `fragment`: a place in this document (`#section`).
 * - `external`: a web or mail address, handed to the system browser.
 * - `document`: another Markdown file, opened inside the app (with an optional fragment).
 * - `file`: any other local path. Never opened: a link in a document someone sent you must not
 *   be able to launch a program, so the reader is told where it points instead.
 * - `unsupported`: a scheme the app does not follow.
 */
export type LinkTarget =
  | { kind: 'fragment'; fragment: string }
  | { kind: 'external'; url: string }
  | { kind: 'document'; path: string; fragment: string | null }
  | { kind: 'file'; path: string }
  | { kind: 'unsupported'; href: string };

const MARKDOWN_EXTENSION = /\.(?:md|markdown)$/i;

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Resolves `href` as authored in the document at `documentPath`.
 *
 * Relative paths are joined against the document's folder and `.`/`..` segments are folded, in
 * the separator style the document path already uses, so the result matches the path a tab for
 * that file would hold. Without a document path (an unsaved document) there is nothing to
 * resolve a relative path against.
 */
export function resolveLink(documentPath: string | null, href: string): LinkTarget {
  const trimmed = href.trim();
  if (trimmed.startsWith('#')) return { kind: 'fragment', fragment: safeDecode(trimmed.slice(1)) };
  if (/^(?:https?|mailto):/i.test(trimmed)) return { kind: 'external', url: trimmed };

  const isWindowsAbsolute = /^[a-z]:[\\/]/i.test(trimmed);
  if (!isWindowsAbsolute && /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return { kind: 'unsupported', href: trimmed };

  const hashAt = trimmed.indexOf('#');
  const pathPart = (hashAt === -1 ? trimmed : trimmed.slice(0, hashAt)).replace(/\?.*$/, '');
  const fragment = hashAt === -1 ? null : safeDecode(trimmed.slice(hashAt + 1)) || null;
  const decoded = safeDecode(pathPart);
  if (!decoded) return fragment ? { kind: 'fragment', fragment } : { kind: 'unsupported', href: trimmed };

  const separator = documentPath?.includes('\\') && !documentPath.includes('/') ? '\\' : '/';
  let joined: string;
  if (isWindowsAbsolute || decoded.startsWith('/') || decoded.startsWith('\\')) {
    joined = decoded;
  } else if (documentPath) {
    const slash = Math.max(documentPath.lastIndexOf('/'), documentPath.lastIndexOf('\\'));
    joined = `${slash === -1 ? '' : documentPath.slice(0, slash + 1)}${decoded}`;
  } else {
    return { kind: 'unsupported', href: trimmed };
  }

  const path = normalizePath(joined, separator);
  return MARKDOWN_EXTENSION.test(path) ? { kind: 'document', path, fragment } : { kind: 'file', path };
}

/** Folds `.` and `..` segments, keeping a leading root (`/`, `C:`) and the chosen separator. */
function normalizePath(path: string, separator: string): string {
  const parts = path.split(/[\\/]/);
  const out: string[] = [];
  for (const [i, part] of parts.entries()) {
    if (part === '.' || (part === '' && i > 0 && i < parts.length - 1)) continue;
    if (part === '..') {
      if (out.length > 1 || (out.length === 1 && out[0] !== '' && !/^[a-z]:$/i.test(out[0]!))) out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join(separator);
}

/**
 * The element ids a fragment may refer to, most specific first.
 *
 * Headings here carry `om-h-<slug>` ids, while authors write GitHub-style fragments: the bare
 * slug (`#installation`) or the heading text itself (`#安装 步骤`). Footnotes and explicit ids
 * use the fragment as written.
 */
export function fragmentCandidates(fragment: string): string[] {
  const candidates = [fragment, `om-h-${fragment}`, `om-h-${headingSlugBase(fragment)}`];
  return [...new Set(candidates.filter(Boolean))];
}
