import type { DocPosition, DocRange } from './types';

/**
 * Normalises line endings to `\n`.
 *
 * Markdown-it does exactly this in its own `normalize` core rule, which means every
 * offset the parser hands back is an offset into the *normalised* string. We build
 * our index over the same string so offsets agree. Line **counts and ordering are
 * preserved** by this transform, so line/column diagnostics remain valid for the
 * on-disk file — and the original bytes are never touched (the file service owns
 * round-trip fidelity, not the reader).
 */
export function normalizeEol(src: string): string {
  // Fast path: nothing to rewrite, which is the common case for authored markdown.
  if (!src.includes('\r')) return src;
  return src.replace(/\r\n?/g, '\n');
}

/**
 * Offset ⇄ line/column conversion for a source string.
 *
 * Backed by a sorted array of line-start offsets plus binary search, so a document
 * with 50k lines costs O(log n) per lookup and O(n) to build.
 */
export class LineIndex {
  /** Offset of the first character of each line. Always starts with 0. */
  readonly lineStarts: readonly number[];
  readonly text: string;
  /** Offsets just past the last character of each line (excludes the newline). */
  private readonly lineEnds: readonly number[];

  constructor(text: string) {
    const starts: number[] = [0];
    const ends: number[] = [];
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) === 0x0a /* \n */) {
        ends.push(i);
        starts.push(i + 1);
      }
    }
    ends.push(text.length);
    this.text = text;
    this.lineStarts = starts;
    this.lineEnds = ends;
  }

  get lineCount(): number {
    return this.lineStarts.length;
  }

  /** 1-based line number containing `offset`. Clamped into range. */
  lineAt(offset: number): number {
    const off = clamp(offset, 0, this.text.length);
    let lo = 0;
    let hi = this.lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.lineStarts[mid]! <= off) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  }

  /** 1-based column of `offset` within its line. */
  columnAt(offset: number): number {
    const off = clamp(offset, 0, this.text.length);
    const line = this.lineAt(off) - 1;
    return off - this.lineStarts[line]! + 1;
  }

  positionAt(offset: number): DocPosition {
    const off = clamp(offset, 0, this.text.length);
    const line = this.lineAt(off) - 1;
    return { line: line + 1, column: off - this.lineStarts[line]! + 1, offset: off };
  }

  /** 0-based `line` → offset of its first character. */
  lineStart(line0: number): number {
    const l = clamp(line0, 0, this.lineStarts.length - 1);
    return this.lineStarts[l]!;
  }

  /**
   * 0-based `line` → offset just past its last character, excluding the newline.
   * Note this is a *content* end, so `lineEnd(l) - lineStart(l)` is the line length.
   */
  lineEnd(line0: number): number {
    const l = clamp(line0, 0, this.lineEnds.length - 1);
    return this.lineEnds[l]!;
  }

  /** 0-based `line` → the line's text, without its newline. */
  lineText(line0: number): string {
    return this.text.slice(this.lineStart(line0), this.lineEnd(line0));
  }

  /** Inclusive offset bounds covering 0-based lines `startLine`..`endLine`. */
  spanForLines(startLine: number, endLine: number): { from: number; to: number } {
    const s = clamp(startLine, 0, this.lineStarts.length - 1);
    // `endLine` from markdown-it is exclusive, but callers may pass inclusive ends;
    // clamping to the last line keeps both readings safe.
    const e = clamp(endLine, s, this.lineEnds.length - 1);
    return { from: this.lineStarts[s]!, to: this.lineEnds[e]! };
  }

  range(startOffset: number, endOffset: number): DocRange {
    return { start: this.positionAt(startOffset), end: this.positionAt(Math.max(startOffset, endOffset)) };
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Resolves source positions for constructs discovered by markdown-it.
 *
 * markdown-it does not expose document offsets for inline tokens, and a block token
 * only carries a line range. Rather than re-implement its scanner, we re-locate each
 * construct in the document with a **forward-only cursor**: constructs are emitted
 * in document order, so an `indexOf` that never rewinds finds the correct occurrence
 * even when the document repeats the same formula several times.
 *
 * The cursor is additionally clamped to the owning token's line span, which keeps it
 * correct when an identical string also appears inside a code block or link target.
 */
export class SourceLocator {
  private cursor = 0;

  constructor(
    private readonly index: LineIndex,
    private readonly source: string,
  ) {}

  /** Resets the cursor; callers that process a document twice must reset between passes. */
  reset(offset = 0): void {
    this.cursor = offset;
  }

  get position(): number {
    return this.cursor;
  }

  /**
   * Finds `needle` at or after the cursor, optionally bounded to
   * [from, to]. Returns `null` when the text cannot be re-located, which callers
   * treat as "position unknown" rather than as an error.
   */
  locate(needle: string, bounds?: { from: number; to: number }): { offset: number; range: DocRange } | null {
    if (needle.length === 0) return null;
    const searchFrom = bounds ? Math.max(this.cursor, bounds.from) : this.cursor;
    const searchTo = bounds ? bounds.to : this.source.length;
    if (searchFrom > searchTo) return null;

    const idx = this.source.indexOf(needle, searchFrom);
    if (idx < 0 || idx + needle.length > searchTo) {
      // Fall back to an unbounded forward search: the bounded window can miss a
      // construct whose block map is approximate (e.g. lazy continuation lines).
      const loose = this.source.indexOf(needle, this.cursor);
      if (loose < 0) return null;
      this.cursor = loose + needle.length;
      return { offset: loose, range: this.index.range(loose, loose + needle.length) };
    }
    this.cursor = idx + needle.length;
    return { offset: idx, range: this.index.range(idx, idx + needle.length) };
  }

  /**
   * Advances the cursor past `text` without recording a construct. Used to skip
   * literal regions (code blocks, raw HTML) so they cannot satisfy a later search.
   */
  skip(text: string): void {
    if (text.length === 0) return;
    const idx = this.source.indexOf(text, this.cursor);
    if (idx >= 0) this.cursor = idx + text.length;
  }

  /** Moves the cursor forward to at least `offset`. */

  advanceTo(offset: number): void {
    if (offset > this.cursor) this.cursor = offset;
  }
}
