import { describe, expect, it } from 'vitest';
import { applyEol, contentHash, decodeText, encodeText } from '@/core/fs/encoding';

/**
 * Encoding tests.
 *
 * These guard the promise that opening a file and saving it does not change a single byte
 * other than the edit the author made. Every case here is a real way a Windows machine
 * produces a markdown file.
 */

function bytes(...values: number[]): Uint8Array {
  return Uint8Array.from(values);
}

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('decodeText', () => {
  it('reads plain UTF-8 with no BOM and reports the line ending', () => {
    const decoded = decodeText(utf8('# 标题\r\n\r\n正文。\r\n'));
    expect(decoded.bom).toBe(false);
    expect(decoded.eol).toBe('crlf');
    expect(decoded.mixedEol).toBe(false);
    expect(decoded.lossy).toBe(false);
    // Line endings are preserved: the parser normalises, the writer restores.
    expect(decoded.text).toBe('# 标题\r\n\r\n正文。\r\n');
  });

  it('strips a UTF-8 BOM but records that it was there', () => {
    const decoded = decodeText(bytes(0xef, 0xbb, 0xbf, 0x23, 0x20, 0x41)); // BOM + "# A"
    expect(decoded.bom).toBe(true);
    expect(decoded.text).toBe('# A');
  });

  it('converts UTF-16LE, which Windows editors still emit', () => {
    // BOM + "# A" as little-endian code units.
    const decoded = decodeText(bytes(0xff, 0xfe, 0x23, 0x00, 0x20, 0x00, 0x41, 0x00));
    expect(decoded.text).toBe('# A');
    // A UTF-16 BOM is an encoding marker, not a byte-order-preserving artefact, and the
    // writer always emits UTF-8 — so there is no BOM to restore.
    expect(decoded.bom).toBe(false);
  });

  it('converts UTF-16BE, including a non-BMP character', () => {
    const decoded = decodeText(bytes(0xfe, 0xff, 0xd8, 0x3d, 0xde, 0x00));
    expect(decoded.text).toBe('\u{1F600}');
  });

  it('flags mixed line endings without normalising them', () => {
    const decoded = decodeText(utf8('a\r\nb\nc\n'));
    expect(decoded.mixedEol).toBe(true);
    expect(decoded.eol).toBe('lf'); // two LF against one CRLF: LF wins
    expect(decoded.text).toBe('a\r\nb\nc\n');
  });

  it('falls back to a lossy decode rather than throwing on invalid UTF-8', () => {
    // 0xFF is never valid in UTF-8.
    const decoded = decodeText(bytes(0x41, 0xff, 0x42));
    expect(decoded.lossy).toBe(true);
    expect(decoded.text.startsWith('A')).toBe(true);
    expect(decoded.text.endsWith('B')).toBe(true);
  });

  it('treats an empty file as empty rather than erroring', () => {
    const decoded = decodeText(new Uint8Array(0));
    expect(decoded.text).toBe('');
    expect(decoded.bom).toBe(false);
    expect(decoded.lossy).toBe(false);
  });
});

describe('encodeText / decodeText round-trip', () => {
  const SAMPLES: { name: string; text: string; bom: boolean; eol: 'lf' | 'crlf' | 'cr' }[] = [
    { name: 'LF without BOM', text: '# A\n\n正文\n', bom: false, eol: 'lf' },
    { name: 'CRLF without BOM', text: '# A\r\n\r\n正文\r\n', bom: false, eol: 'crlf' },
    { name: 'CR without BOM', text: 'a\rb\r', bom: false, eol: 'cr' },
    { name: 'LF with BOM', text: '# A\n', bom: true, eol: 'lf' },
    { name: 'CRLF with BOM', text: '# 中文\r\n内容\r\n', bom: true, eol: 'crlf' },
    { name: 'no trailing newline', text: 'abc', bom: false, eol: 'lf' },
    { name: 'astral plane and combining marks', text: '😀 é 中文\u0301\n', bom: false, eol: 'lf' },
    { name: 'CRLF inside a fenced block', text: '```\r\na\r\n```\r\n', bom: false, eol: 'crlf' },
  ];

  for (const sample of SAMPLES) {
    it(`preserves ${sample.name} exactly`, () => {
      const encoded = encodeText(sample.text, { bom: sample.bom, eol: sample.eol });
      const decoded = decodeText(encoded);
      expect(decoded.bom).toBe(sample.bom);
      expect(decoded.eol).toBe(sample.eol);
      // The strongest statement available: the bytes decode back to the same string.
      expect(decoded.text).toBe(sample.text);
    });
  }

  it('normalises stray line endings to the requested style', () => {
    // A file with mixed endings must come back single-style, not hybrid.
    expect(applyEol('a\nb\r\nc', 'crlf')).toBe('a\r\nb\r\nc');
    expect(applyEol('a\r\nb\rc', 'lf')).toBe('a\nb\nc');
  });
});

describe('contentHash', () => {
  it('distinguishes texts that differ only in length', () => {
    // Guards the terminator mix-in: without it these two would collide.
    expect(contentHash('ab')).not.toBe(contentHash('ab\u0000'));
  });

  it('changes for a single-character edit', () => {
    expect(contentHash('# Heading')).not.toBe(contentHash('# headinG'));
  });

  it('is stable across calls', () => {
    expect(contentHash('same input')).toBe(contentHash('same input'));
  });

  it('handles the empty string', () => {
    expect(contentHash('')).toMatch(/^[0-9a-f]{8}$/);
  });
});
