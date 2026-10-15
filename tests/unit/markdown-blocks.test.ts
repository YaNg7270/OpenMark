import { describe, expect, it } from 'vitest';
import { createEngine, parseDocument } from '@/core/markdown/engine';
import { applyEol } from '@/core/fs/encoding';

/**
 * Source-block tests.
 *
 * Instant rendering edits a block by splicing its text back into the document at the range
 * the parser reported. If a range is off by even one character the user's file is corrupted,
 * so these tests attack that invariant directly rather than checking that blocks merely
 * exist.
 *
 * Block ranges are expressed against the LF-normalised source, so the tests normalise before
 * comparing and also exercise a CRLF document through the same path the editor takes.
 */

const engine = createEngine();

function parse(source: string) {
  return parseDocument(source, engine);
}

describe('block decomposition', () => {
  const DOC = [
    '---',
    'title: 测试',
    '---',
    '',
    '# 标题一',
    '',
    '段落一。',
    '',
    '- 项目 A',
    '- 项目 B',
    '',
    '> 引用',
    '',
    '| A | B |',
    '| - | - |',
    '| 1 | 2 |',
    '',
    '```js',
    'const x = 1;',
    '```',
    '',
    '$$',
    'a = b',
    '$$',
    '',
    '---',
    '',
    '结尾段落。',
  ].join('\n');

  it('classifies each top-level construct', () => {
    const { blocks } = parse(DOC);
    expect(blocks.map((b) => b.kind)).toEqual([
      'frontmatter',
      'heading',
      'paragraph',
      'list',
      'blockquote',
      'table',
      'code',
      'math',
      'rule',
      'paragraph',
    ]);
  });

  it('reports a source range that slices back to the block text exactly', () => {
    const source = DOC;
    const { blocks } = parse(source);
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      const sliced = source.slice(block.range.start.offset, block.range.end.offset);
      expect(sliced, `block ${block.index} (${block.kind}) range does not match its text`).toBe(block.source);
    }
  });

  it('gives every block a non-empty source', () => {
    const { blocks } = parse(DOC);
    for (const block of blocks) {
      expect(block.source.trim().length, `block ${block.index} (${block.kind}) is empty`).toBeGreaterThan(0);
    }
  });

  it('covers the whole document with no gaps or overlaps', () => {
    const { blocks } = parse(DOC);
    const ordered = [...blocks].sort((a, b) => a.range.start.offset - b.range.start.offset);
    for (let i = 1; i < ordered.length; i++) {
      const previous = ordered[i - 1]!;
      const current = ordered[i]!;
      expect(
        current.range.start.offset,
        `block ${current.index} overlaps block ${previous.index}`,
      ).toBeGreaterThanOrEqual(previous.range.end.offset);
    }
    expect(ordered[0]!.range.start.offset).toBe(0);
  });

  it('carries per-block HTML that contains the same placeholder ids as the whole document', () => {
    const { html, blocks, math } = parse('文字 $x^2$ 与\n\n$$a=b$$\n');
    expect(math).toHaveLength(2);
    const blockHtml = blocks.map((b) => b.html).join('');
    for (const expr of math) {
      expect(blockHtml, `missing ${expr.id} in block HTML`).toContain(`data-om-math="${expr.id}"`);
      expect(html).toContain(`data-om-math="${expr.id}"`);
    }
  });

  it('keeps line numbers consistent with the original document', () => {
    const { blocks } = parse(DOC);
    const heading = blocks.find((b) => b.kind === 'heading');
    expect(heading?.range.start.line).toBe(5);
    const closing = blocks[blocks.length - 1]!;
    expect(closing.source).toBe('结尾段落。');
  });

  it('reports positions against the normalised source for a CRLF document', () => {
    // The editor normalises before splicing, then restores the file's own line endings.
    const crlfSource = '# 标题\r\n\r\n正文。\r\n';
    const normalized = crlfSource.replace(/\r\n/g, '\n');
    const { blocks } = parse(crlfSource);
    for (const block of blocks) {
      expect(normalized.slice(block.range.start.offset, block.range.end.offset)).toBe(block.source);
    }
    // And the round-trip back to CRLF is byte-exact for the untouched parts.
    expect(applyEol(normalized, 'crlf')).toBe(crlfSource);
  });
});

describe('editing a block by splicing its range', () => {
  /**
   * The exact operation the instant editor performs. These are the tests that would catch a
   * range regression turning into data loss in a user's file.
   */
  function splice(source: string, blockIndex: number, replacement: string, eol: 'lf' | 'crlf' = 'lf'): string {
    const normalized = source.replace(/\r\n/g, '\n');
    const parsed = parse(normalized);
    const block = parsed.blocks[blockIndex];
    if (!block) throw new Error(`no block ${blockIndex}`);
    const next = normalized.slice(0, block.range.start.offset) + replacement + normalized.slice(block.range.end.offset);
    return applyEol(next, eol);
  }

  it('replaces only the targeted paragraph', () => {
    const source = '# 标题\n\n第一段。\n\n第二段。\n';
    const next = splice(source, 2, '第二段已修改。');
    expect(next).toBe('# 标题\n\n第一段。\n\n第二段已修改。\n');
  });

  it('leaves every other block byte-identical', () => {
    const source = ['# 标题', '', '段落', '', '- a', '- b', '', '```js', 'x()', '```', ''].join('\n');
    const before = parse(source).blocks;
    // Locate by kind rather than by index so the test cannot rot when classification changes.
    const paragraphIndex = before.findIndex((b) => b.kind === 'paragraph');
    expect(paragraphIndex).toBeGreaterThanOrEqual(0);

    const next = splice(source, paragraphIndex, '已替换的内容');
    const after = parse(next).blocks;
    expect(after[paragraphIndex]!.source).toBe('已替换的内容');

    for (let i = 0; i < before.length; i++) {
      if (i === paragraphIndex) continue;
      expect(after[i]?.source, `block ${i} (${before[i]!.kind}) changed`).toBe(before[i]!.source);
    }
  });

  it('preserves a CRLF file when a block is edited', () => {
    const source = '# 标题\r\n\r\n第一段。\r\n';
    // Blocks: 0 = heading, 1 = paragraph.
    const next = splice(source, 1, '新的段落。', 'crlf');
    expect(next).toBe('# 标题\r\n\r\n新的段落。\r\n');
    expect(next).toContain('\r\n');
    expect(/[^\r]\n/.test(next), 'a bare LF leaked into a CRLF file').toBe(false);
  });

  it('can grow a block from one line into several', () => {
    const source = '# 标题\n\n短。\n';
    // Blocks: 0 = heading, 1 = paragraph.
    const next = splice(source, 1, '第一行。\n\n第二行。');
    expect(next).toBe('# 标题\n\n第一行。\n\n第二行。\n');
    // The second line is now a block of its own.
    expect(parse(next).blocks.filter((b) => b.kind === 'paragraph')).toHaveLength(2);
  });

  it('can replace a code fence without disturbing its neighbours', () => {
    const source = 'before\n\n```js\nold();\n```\n\nafter\n';
    const next = splice(source, 1, '```python\nnew()\n```');
    expect(next).toBe('before\n\n```python\nnew()\n```\n\nafter\n');
    const kinds = parse(next).blocks.map((b) => b.kind);
    expect(kinds).toEqual(['paragraph', 'code', 'paragraph']);
  });

  it('reports a heading line number that survives an edit above it', () => {
    const source = '第一段。\n\n# 标题\n';
    expect(parse(source).blocks.find((b) => b.kind === 'heading')!.range.start.line).toBe(3);
    const next = splice(source, 0, '第一段。\n\n新插入的段落。');
    expect(parse(next).blocks.find((b) => b.kind === 'heading')!.range.start.line).toBe(5);
  });
});
