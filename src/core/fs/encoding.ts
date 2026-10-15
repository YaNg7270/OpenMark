/**
 * Text encoding and line-ending handling.
 *
 * OpenMark treats the bytes on disk as authoritative: a document's BOM and line-ending
 * style are recorded when it is read and restored exactly when it is written. Without
 * this, opening a Windows file and saving it would silently rewrite every line ending,
 * which shows up as a whole-file diff in git and is exactly the kind of data loss the
 * project must not have.
 *
 * The parser, by contrast, works on LF-normalised text. Line counts are identical under
 * that transform, so line/column diagnostics stay valid for the on-disk file.
 */

export type EolStyle = 'lf' | 'crlf' | 'cr';

/**
 * Normalises line endings to `\n`.
 *
 * Markdown-it does exactly this in its own `normalize` core rule, which means every offset
 * the parser reports is an offset into the *normalised* string. Callers that splice text by
 * parser-reported offsets must do it in this space and then restore the file's own style with
 * `applyEol` — otherwise editing one paragraph of a CRLF file silently rewrites every other
 * line ending.
 *
 * Line counts and ordering are preserved, so line/column diagnostics remain valid for the
 * on-disk file.
 */
export function normalizeEol(src: string): string {
  // Fast path: nothing to rewrite, which is the common case for authored markdown.
  if (!src.includes('\r')) return src;
  return src.replace(/\r\n?/g, '\n');
}

export interface DecodedText {
  /** Text with the BOM removed, line endings untouched. */
  text: string;
  /** True when a UTF-8 BOM was present. */
  bom: boolean;
  /** Dominant line ending. `mixed` is reported via `mixedEol`. */
  eol: EolStyle;
  /** True when more than one line-ending style occurs in the file. */
  mixedEol: boolean;
  /** True when the bytes were not valid UTF-8 and a fallback decode was used. */
  lossy: boolean;
}

const BOM_UTF8 = [0xef, 0xbb, 0xbf];
const BOM_UTF16LE = [0xff, 0xfe];
const BOM_UTF16BE = [0xfe, 0xff];

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  if (bytes.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) if (bytes[i] !== prefix[i]) return false;
  return true;
}

function countEol(text: string): { lf: number; crlf: number; cr: number } {
  let lf = 0;
  let crlf = 0;
  let cr = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x0a) lf++;
    else if (c === 0x0d) {
      if (text.charCodeAt(i + 1) === 0x0a) {
        crlf++;
        i++;
      } else cr++;
    }
  }
  return { lf, crlf, cr };
}

/** Chooses the dominant EOL; ties resolve to LF, the markdown convention. */
function dominantEol(counts: { lf: number; crlf: number; cr: number }): { eol: EolStyle; mixed: boolean } {
  const distinct = [counts.lf > 0, counts.crlf > 0, counts.cr > 0].filter(Boolean).length;
  if (counts.crlf > counts.lf && counts.crlf >= counts.cr) return { eol: 'crlf', mixed: distinct > 1 };
  if (counts.cr > counts.lf && counts.cr > counts.crlf) return { eol: 'cr', mixed: distinct > 1 };
  return { eol: 'lf', mixed: distinct > 1 };
}

/**
 * Decodes file bytes, detecting BOM and line-ending style.
 *
 * UTF-16 is detected and converted because Windows editors still emit it, and treating a
 * UTF-16 file as UTF-8 would produce a document full of NUL bytes. Anything that is not
 * valid UTF-8 falls back to a lossy decode with the damage reported, rather than throwing.
 */
export function decodeText(bytes: Uint8Array): DecodedText {
  if (startsWith(bytes, BOM_UTF16LE) || startsWith(bytes, BOM_UTF16BE)) {
    const littleEndian = startsWith(bytes, BOM_UTF16LE);
    const body = bytes.subarray(2);
    let text = '';
    for (let i = 0; i + 1 < body.length; i += 2) {
      const unit = littleEndian ? body[i]! | (body[i + 1]! << 8) : (body[i]! << 8) | body[i + 1]!;
      text += String.fromCharCode(unit);
    }
    const counts = countEol(text);
    const { eol, mixed } = dominantEol(counts);
    return { text, bom: false, eol, mixedEol: mixed, lossy: false };
  }

  const bom = startsWith(bytes, BOM_UTF8);
  const body = bom ? bytes.subarray(3) : bytes;

  let text: string;
  let lossy = false;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    // Not valid UTF-8. Windows-1252/GBK files are common in the wild; a replacement-
    // character decode at least shows the user what is there and is flagged as lossy.
    text = new TextDecoder('utf-8', { fatal: false }).decode(body);
    lossy = true;
  }

  const counts = countEol(text);
  const { eol, mixed } = dominantEol(counts);
  return { text, bom, eol, mixedEol: mixed, lossy };
}

/** Applies a line-ending style to text, normalising first so the result is consistent. */
export function applyEol(text: string, eol: EolStyle): string {
  const normalized = normalizeEol(text);
  if (eol === 'lf') return normalized;
  const replacement = eol === 'crlf' ? '\r\n' : '\r';
  return normalized.replace(/\n/g, replacement);
}

/**
 * Re-encodes text for writing, restoring the BOM and line endings the file had.
 * The inverse of `decodeText` for every file the app is willing to save.
 */
export function encodeText(text: string, options: { bom: boolean; eol: EolStyle }): Uint8Array {
  const withEol = applyEol(text, options.eol);
  const encoded = new TextEncoder().encode(withEol);
  if (!options.bom) return encoded;
  const out = new Uint8Array(encoded.length + 3);
  out.set(BOM_UTF8, 0);
  out.set(encoded, 3);
  return out;
}

/**
 * A stable content hash used for external-change detection and dirty tracking.
 * FNV-1a over UTF-16 code units: fast, allocation-free, and good enough to notice that
 * a file changed on disk — it is not a security primitive.
 */
export function contentHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Second pass over the length mixes in a terminator, so "ab" and "ab\0" differ.
  hash ^= text.length;
  hash = Math.imul(hash, 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
