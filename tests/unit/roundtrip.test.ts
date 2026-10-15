/**
 * Data-preservation round-trips.
 *
 * OpenMark treats the bytes on disk as authoritative: a document's BOM and line-ending style
 * are recorded when it is read and restored exactly when it is written, and an edit is a splice
 * into the LF-normalised source followed by re-applying the file's own EOL. These tests attack
 * that chain directly with every corpus fixture, because a one-character drift here is silent
 * corruption of a user's file.
 *
 * The splice performed by `spliceAt` is exactly the operation in `src/app/store.ts`
 * (`applyBlockEdit`): normalise → splice at the parser-reported offset → `applyEol`.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyEol, decodeText, encodeText, normalizeEol, type EolStyle } from '@/core/fs/encoding';
import { createEngine, parseDocument } from '@/core/markdown/engine';
import { fixtures } from './helpers/corpus';

const engine = createEngine();
const INSERT = '字';

describe('identity round-trip (decode → encode → decode)', () => {
  const variants: { label: string; bom: boolean; eol: EolStyle }[] = [
    { label: 'LF', bom: false, eol: 'lf' },
    { label: 'CRLF', bom: false, eol: 'crlf' },
    { label: 'CR', bom: false, eol: 'cr' },
    { label: 'BOM+LF', bom: true, eol: 'lf' },
    { label: 'BOM+CRLF', bom: true, eol: 'crlf' },
  ];

  it('re-encoding the decoded text reproduces the original bytes', () => {
    for (const fixture of fixtures) {
      for (const variant of variants) {
        const bytes = encodeText(fixture.source, { bom: variant.bom, eol: variant.eol });
        const decoded = decodeText(bytes);
        const reEncoded = encodeText(decoded.text, { bom: decoded.bom, eol: decoded.eol });
        expect(
          Buffer.from(reEncoded).equals(Buffer.from(bytes)),
          `${fixture.entry.file} ${variant.label}`,
        ).toBe(true);
      }
    }
  });
});

/** Offset in `variant` (which uses `eol`) for a character offset in the LF-normalised text. */
function variantOffset(normalized: string, offset: number, eol: EolStyle): number {
  if (eol === 'lf') return offset;
  const eolLength = eol === 'crlf' ? 2 : 1;
  let wide = offset;
  for (let i = 0; i < offset; i++) if (normalized[i] === '\n') wide += eolLength - 1;
  return wide;
}

describe('edit round-trip (single-character insertion)', () => {
  it('inserts exactly one character and touches nothing else, at 10 offsets, for LF and CRLF', () => {
    for (const fixture of fixtures) {
      for (const eol of ['lf', 'crlf'] as const) {
        const variant = applyEol(fixture.source, eol);
        const normalized = normalizeEol(variant);
        const offsets = [
          ...new Set(Array.from({ length: 10 }, (_, i) => Math.floor((normalized.length * i) / 10))),
        ];
        for (const offset of offsets) {
          const result = applyEol(
            normalized.slice(0, offset) + INSERT + normalized.slice(offset),
            eol,
          );
          const at = variantOffset(normalized, offset, eol);
          const expected = variant.slice(0, at) + INSERT + variant.slice(at);
          const label = `${fixture.entry.file} ${eol}@${offset}`;
          // The result is the original file with the character inserted — nothing else moved.
          expect(result, label).toBe(expected);
          expect(result.length, `${label} length`).toBe(variant.length + INSERT.length);
          expect(result.slice(0, at), `${label} prefix`).toBe(variant.slice(0, at));
          expect(result.slice(at + INSERT.length), `${label} suffix`).toBe(variant.slice(at));
        }
      }
    }
  });
});

describe('block-edit round-trip', () => {
  it('replacing every block with its own source is a byte-identical no-op', () => {
    for (const fixture of fixtures) {
      for (const eol of ['lf', 'crlf'] as const) {
        const variant = applyEol(fixture.source, eol);
        const parsed = parseDocument(variant, engine);
        for (const block of parsed.blocks) {
          const restored = applyEol(
            parsed.normalizedSource.slice(0, block.range.start.offset) +
              block.source +
              parsed.normalizedSource.slice(block.range.end.offset),
            eol,
          );
          expect(
            restored,
            `${fixture.entry.file} ${eol} block ${block.index} (${block.kind})`,
          ).toBe(variant);
        }
      }
    }
  });
});

/** Fragments mixed and concatenated by fast-check; every markdown construct the parser classifies. */
const FRAGMENTS = [
  '# Heading',
  '## Sub heading',
  'Paragraph with **bold** and *italic* text.',
  '- item one\n- item two',
  '- [ ] todo\n- [x] done',
  '1. first\n2. second',
  '> quoted line',
  '| a | b |\n| - | - |\n| 1 | 2 |',
  '```js\nconst x = 1;\n```',
  '```mermaid\ngraph TD;\nA-->B;\n```',
  '$$a^2 + b^2 = c^2$$',
  'Inline $x$ math.',
  '中文段落，包含 CJK 文本与标点。',
  '',
  '---',
  '[^1]: a footnote definition',
  'text with footnote[^1]',
  'CRLF line one\r\nCRLF line two',
];

describe('generated documents (fast-check)', () => {
  it('holds the no-op-edit invariant for arbitrary markdown-ish documents', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...FRAGMENTS), { maxLength: 40 }), (parts) => {
        const source = parts.join('\n');
        const parsed = parseDocument(source, engine);
        for (const block of parsed.blocks) {
          expect(
            parsed.normalizedSource.slice(block.range.start.offset, block.range.end.offset),
          ).toBe(block.source);
          const spliced =
            parsed.normalizedSource.slice(0, block.range.start.offset) +
            block.source +
            parsed.normalizedSource.slice(block.range.end.offset);
          expect(spliced).toBe(parsed.normalizedSource);
        }
      }),
      { seed: 0xc0ffee, numRuns: 200 },
    );
  });
});
