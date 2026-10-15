/**
 * GFM table model.
 *
 * The editor works on a parsed model rather than on the raw text, because cell boundaries in a
 * markdown table depend on escaped pipes and on the delimiter row's column count — details a
 * text field cannot enforce.
 *
 * ## The round-trip rule
 *
 * Serialising always produces a clean, space-padded table. That is a change, so the editor
 * compares the model before and after and **writes nothing when they are equal**. Opening a
 * table and closing it again leaves the author's file byte-identical, which matters because a
 * document's table styling is often deliberate. Only an actual edit rewrites the block, and
 * then normalisation is expected — every editor that offers a grid does this.
 */

export type ColumnAlignment = 'none' | 'left' | 'center' | 'right';

export interface TableModel {
  /** Column headers, one entry per column. */
  headers: string[];
  /** Body rows. Always the same width as `headers`. */
  rows: string[][];
  /** Per-column alignment, taken from the delimiter row. */
  alignments: ColumnAlignment[];
}

/** Column count is the delimiter row's, which is the authority in GFM. */
export function parseTable(source: string): TableModel | null {
  const lines = source.split('\n').filter((line) => line.trim() !== '');
  if (lines.length < 2) return null;

  const headerCells = splitRow(lines[0]!);
  const delimiters = splitRow(lines[1]!);
  if (!delimiters.every((cell) => /^:?-+:?$/.test(cell.trim()))) return null;

  const columns = delimiters.length;
  const alignments = delimiters.map<ColumnAlignment>((cell) => {
    const trimmed = cell.trim();
    const left = trimmed.startsWith(':');
    const right = trimmed.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return 'none';
  });

  // GFM pads or truncates every row to the delimiter row's width, so the model does too —
  // otherwise adding a column would silently produce an invalid table.
  const fit = (cells: string[]): string[] =>
    Array.from({ length: columns }, (_, index) => cells[index]?.trim() ?? '');

  return {
    headers: fit(headerCells),
    rows: lines.slice(2).map((line) => fit(splitRow(line))),
    alignments,
  };
}

/**
 * Splits a table row into cells, unescaping each cell's content.
 *
 * The model holds the cell's **semantic** text, not its source spelling: `a \| b` is one cell
 * whose value is `a | b`, and serialising re-escapes it. Keeping the backslash in the model
 * instead would make escaping non-idempotent — `escapeCell` would turn an already-escaped pipe
 * into an escaped *backslash* followed by a real separator, splitting the cell in two.
 *
 * Backslashes are consumed in pairs so that `\\|` is a literal backslash followed by a
 * separator, while `\|` is a literal pipe inside the cell.
 */
export function splitRow(line: string): string[] {
  const trimmed = line.trim();
  if (trimmed === '') return [];

  const body = trimmed.startsWith('|') ? trimmed.slice(1) : trimmed;
  const withoutTrailing = endsWithUnescapedPipe(body) ? body.slice(0, -1) : body;

  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < withoutTrailing.length; i++) {
    const char = withoutTrailing[i]!;
    if (char === '\\') {
      const next = withoutTrailing[i + 1];
      if (next === '\\') {
        // An escaped backslash: emit one, and let the character after it be read normally, so
        // a following pipe is a real separator.
        current += '\\';
        i++;
        continue;
      }
      if (next === '|') {
        current += '|';
        i++;
        continue;
      }
      current += char;
      continue;
    }
    if (char === '|') {
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

/** True when the body ends in a pipe that is not escaped by an odd run of backslashes. */
function endsWithUnescapedPipe(body: string): boolean {
  if (!body.endsWith('|')) return false;
  let backslashes = 0;
  for (let i = body.length - 2; i >= 0 && body[i] === '\\'; i--) backslashes++;
  return backslashes % 2 === 0;
}

/** Escapes a cell for serialising: a literal pipe must stay inside its cell. */
function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
}

/**
 * Renders the model as a GFM table with aligned columns.
 *
 * Padding is by display width, counted in code points rather than UTF-16 units, so a CJK
 * header — two columns wide per glyph in a monospace font — does not misalign the source.
 */
export function serializeTable(model: TableModel): string {
  const columns = model.headers.length;
  if (columns === 0) return '';

  const widths = Array.from({ length: columns }, (_, index) => {
    const candidates = [model.headers[index] ?? '', ...model.rows.map((row) => row[index] ?? '')];
    // The delimiter cell is at least three characters (`---`), so the column must be too.
    return Math.max(3, ...candidates.map(displayWidth));
  });

  const pad = (value: string, index: number): string =>
    value + ' '.repeat(Math.max(0, widths[index]! - displayWidth(value)));

  const headerLine = `| ${model.headers.map((cell, i) => pad(escapeCell(cell), i)).join(' | ')} |`;
  const delimiterLine = `| ${model.alignments
    .map((alignment, i) => {
      const width = widths[i]!;
      if (alignment === 'center') return `:${'-'.repeat(width - 2)}:`;
      if (alignment === 'right') return `${'-'.repeat(width - 1)}:`;
      if (alignment === 'left') return `:${'-'.repeat(width - 1)}`;
      return '-'.repeat(width);
    })
    .join(' | ')} |`;
  const bodyLines = model.rows.map((row) => `| ${row.map((cell, i) => pad(escapeCell(cell), i)).join(' | ')} |`);

  return [headerLine, delimiterLine, ...bodyLines].join('\n');
}

/**
 * Counts rendered characters, treating astral-plane characters as one and CJK as two.
 *
 * A `String.length` comparison would misalign every table containing an emoji or a Chinese
 * header, which is most of them in this project's corpus.
 */
export function displayWidth(value: string): number {
  let width = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    width += isWide(code) ? 2 : 1;
  }
  return width;
}

function isWide(code: number): boolean {
  return (
    // Emoji and pictographs render two columns wide in a monospace font, so a table containing
    // one would be ragged if they counted as a single character.
    (code >= 0x1f300 && code <= 0x1faff) ||
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x20000 && code <= 0x3fffd)
  );
}

/** Structural equality, so the editor can tell "opened and closed" from "changed". */
export function tablesEqual(a: TableModel, b: TableModel): boolean {
  if (a.headers.length !== b.headers.length) return false;
  if (a.rows.length !== b.rows.length) return false;
  if (a.headers.some((cell, index) => cell !== b.headers[index])) return false;
  if (a.alignments.some((alignment, index) => alignment !== b.alignments[index])) return false;
  return a.rows.every((row, rowIndex) => row.every((cell, index) => cell === b.rows[rowIndex]?.[index]));
}

export function addRow(model: TableModel, at?: number): TableModel {
  const rows = [...model.rows];
  rows.splice(at ?? rows.length, 0, Array.from({ length: model.headers.length }, () => ''));
  return { ...model, rows };
}

export function addColumn(model: TableModel, at?: number): TableModel {
  const index = at ?? model.headers.length;
  const headers = [...model.headers];
  headers.splice(index, 0, '');
  const alignments = [...model.alignments];
  alignments.splice(index, 0, 'none');
  const rows = model.rows.map((row) => {
    const next = [...row];
    next.splice(index, 0, '');
    return next;
  });
  return { headers, rows, alignments };
}

export function removeRow(model: TableModel, at: number): TableModel {
  if (model.rows.length <= 1) return model;
  const rows = [...model.rows];
  rows.splice(at, 1);
  return { ...model, rows };
}

export function removeColumn(model: TableModel, at: number): TableModel {
  if (model.headers.length <= 1) return model;
  return {
    headers: model.headers.filter((_, index) => index !== at),
    rows: model.rows.map((row) => row.filter((_, index) => index !== at)),
    alignments: model.alignments.filter((_, index) => index !== at),
  };
}
