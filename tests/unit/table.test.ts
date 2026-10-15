import { describe, expect, it } from 'vitest';
import {
  addColumn,
  addRow,
  displayWidth,
  parseTable,
  removeColumn,
  removeRow,
  serializeTable,
  splitRow,
  tablesEqual,
} from '@/core/markdown/table';

/**
 * Table model tests.
 *
 * Table editing writes back into the author's file, so the parse/serialise pair has to be
 * exact in both directions: a cell lost on parse or a column lost on serialise corrupts the
 * document. The round-trip property is asserted directly rather than case by case.
 */

describe('splitRow', () => {
  it('splits a plain row', () => {
    expect(splitRow('| a | b |')).toEqual([' a ', ' b ']);
  });

  it('handles a row without leading or trailing pipes', () => {
    expect(splitRow('a | b')).toEqual(['a ', ' b']);
  });

  it('unescapes a pipe inside a cell', () => {
    // The model holds the semantic value; serialising re-escapes it.
    expect(splitRow('| a \\| b | c |')).toEqual([' a | b ', ' c ']);
  });

  it('distinguishes an escaped pipe from an escaped backslash before a pipe', () => {
    // `\\|` is a literal backslash followed by a real separator, so this is two cells.
    expect(splitRow('| a \\\\| b |')).toEqual([' a \\', ' b ']);
  });

  it('returns a single empty cell for a row of two pipes', () => {
    // `||` is one empty cell, not zero: treating it as zero would drop a column.
    expect(splitRow('||')).toEqual(['']);
    expect(splitRow('')).toEqual([]);
  });
});

describe('displayWidth', () => {
  it('counts CJK as two columns', () => {
    expect(displayWidth('中文')).toBe(4);
    expect(displayWidth('ab')).toBe(2);
  });

  it('counts an emoji as two columns', () => {
    // `String.length` reports 2 for one emoji by accident, and 2 for one CJK glyph by accident
    // as well — neither is the rendered width, so the padding has to be computed properly.
    expect(displayWidth('😀')).toBe(2);
    expect(displayWidth('\u{1F600}\u{1F600}')).toBe(4);
  });

  it('mixes scripts correctly', () => {
    expect(displayWidth('a中b')).toBe(4);
  });
});

describe('parseTable', () => {
  it('reads headers, rows and alignment', () => {
    const model = parseTable(['| A | B | C |', '| :-- | :-: | --: |', '| 1 | 2 | 3 |'].join('\n'));
    expect(model).not.toBeNull();
    expect(model!.headers).toEqual(['A', 'B', 'C']);
    expect(model!.alignments).toEqual(['left', 'center', 'right']);
    expect(model!.rows).toEqual([['1', '2', '3']]);
  });

  it('accepts a table with no body rows', () => {
    const model = parseTable(['| A | B |', '| - | - |'].join('\n'));
    expect(model!.rows).toEqual([]);
  });

  it('pads short rows to the declared column count', () => {
    // GFM pads missing cells; a model that did not would lose a column on the next edit.
    const model = parseTable(['| A | B | C |', '| - | - | - |', '| 1 |'].join('\n'));
    expect(model!.rows[0]).toEqual(['1', '', '']);
  });

  it('truncates overlong rows to the declared column count', () => {
    const model = parseTable(['| A | B |', '| - | - |', '| 1 | 2 | 3 |'].join('\n'));
    expect(model!.rows[0]).toEqual(['1', '2']);
  });

  it('rejects a table whose delimiter row has no dashes', () => {
    expect(parseTable(['| A | B |', '| x | y |'].join('\n'))).toBeNull();
  });

  it('rejects a single line', () => {
    expect(parseTable('| A | B |')).toBeNull();
  });

  it('takes the column count from the delimiter row, not the header', () => {
    const model = parseTable(['| A |', '| - | - |', '| 1 | 2 |'].join('\n'));
    expect(model!.headers).toEqual(['A', '']);
    expect(model!.alignments).toHaveLength(2);
  });
});

describe('serializeTable', () => {
  it('produces a valid GFM table', () => {
    const text = serializeTable({
      headers: ['A', 'B'],
      rows: [['1', '2']],
      alignments: ['none', 'none'],
    });
    expect(text.split('\n')).toEqual(['| A   | B   |', '| --- | --- |', '| 1   | 2   |']);
  });

  it('writes the alignment markers', () => {
    const text = serializeTable({
      headers: ['L', 'C', 'R'],
      rows: [],
      alignments: ['left', 'center', 'right'],
    });
    expect(text.split('\n')[1]).toBe('| :-- | :-: | --: |');
  });

  it('escapes a pipe inside a cell', () => {
    const text = serializeTable({ headers: ['A'], rows: [['x | y']], alignments: ['none'] });
    // Escaped, so it survives the next parse as one cell rather than becoming two.
    expect(text).toContain('x \\| y');
    // Round-trips: the parsed cell holds the semantic value again.
    expect(parseTable(text)!.rows[0]).toEqual(['x | y']);
  });

  it('accepts CJK headers without misaligning', () => {
    const text = serializeTable({ headers: ['名称', '值'], rows: [['甲', '1']], alignments: ['none', 'none'] });
    const lines = text.split('\n');
    // Every line must have the same rendered width for the source to look like a table.
    const widths = lines.map(displayWidth);
    expect(new Set(widths).size, `ragged table:\n${text}`).toBe(1);
  });

  it('gives every column at least three dashes', () => {
    const text = serializeTable({ headers: ['A'], rows: [], alignments: ['none'] });
    expect(text.split('\n')[1]).toBe('| --- |');
  });

  it('returns an empty string for a table with no columns', () => {
    expect(serializeTable({ headers: [], rows: [], alignments: [] })).toBe('');
  });
});

describe('round trip', () => {
  const CASES = [
    '| A | B |\n| --- | --- |\n| 1 | 2 |',
    '| Name | Value |\n| :--- | ---: |\n| x | 1 |\n| y | 2 |',
    '| 名称 | 数量 |\n| --- | :-: |\n| 苹果 | 3 |',
    '| 中文表头 | b |\n| --- | --- |\n| 值 | 2 |',
    '| A |\n| --- |\n| a \\| b |',
    '| Left | Center | Right |\n| :-- | :-: | --: |\n| 1 | 2 | 3 |',
    '| A | B |\n| --- | --- |',
  ];

  for (const source of CASES) {
    it(`is stable for ${JSON.stringify(source.slice(0, 30))}`, () => {
      const first = parseTable(source);
      expect(first).not.toBeNull();

      const text = serializeTable(first!);
      const second = parseTable(text);
      expect(second, 'serialised output did not parse').not.toBeNull();
      expect(tablesEqual(first!, second!), `model changed:\n${source}\n->\n${text}`).toBe(true);

      // And serialising the re-parsed model must be byte-identical: a fixed point, so an
      // edit followed by a no-op edit cannot churn the file.
      expect(serializeTable(second!)).toBe(text);
    });
  }

  it('detects that a re-parsed table is unchanged, which is what suppresses needless writes', () => {
    const source = '| A | B |\n| --- | --- |\n| 1 | 2 |';
    const before = parseTable(source)!;
    const after = parseTable(serializeTable(before))!;
    expect(tablesEqual(before, after)).toBe(true);
  });

  it('detects a real change', () => {
    const before = parseTable('| A |\n| --- |\n| 1 |')!;
    const after = parseTable('| A |\n| --- |\n| 2 |')!;
    expect(tablesEqual(before, after)).toBe(false);
  });
});

describe('structural edits', () => {
  const base = parseTable('| A | B |\n| :-: | --- |\n| 1 | 2 |')!;

  it('adds a row at the end', () => {
    const next = addRow(base);
    expect(next.rows).toHaveLength(2);
    expect(next.rows[1]).toEqual(['', '']);
    // The original must not be mutated: React state depends on it being immutable.
    expect(base.rows).toHaveLength(1);
  });

  it('adds a column and keeps every row the same width', () => {
    const next = addColumn(base);
    expect(next.headers).toHaveLength(3);
    expect(next.alignments).toHaveLength(3);
    for (const row of next.rows) expect(row).toHaveLength(3);
    expect(parseTable(serializeTable(next))!.headers).toHaveLength(3);
  });

  it('removes a row', () => {
    expect(removeRow(addRow(base), 0).rows).toHaveLength(1);
  });

  it('refuses to remove the last row', () => {
    // A GFM table needs a delimiter row but no body; an empty body is legal, yet keeping one
    // row is friendlier than producing a table the reader cannot click back into.
    expect(removeRow(base, 0).rows).toHaveLength(1);
  });

  it('refuses to remove the last column', () => {
    const single = parseTable('| A |\n| --- |\n| 1 |')!;
    expect(removeColumn(single, 0).headers).toHaveLength(1);
  });

  it('removes a column from headers, rows and alignments together', () => {
    const next = removeColumn(base, 0);
    expect(next.headers).toEqual(['B']);
    expect(next.alignments).toEqual(['none']);
    expect(next.rows).toEqual([['2']]);
  });
});
