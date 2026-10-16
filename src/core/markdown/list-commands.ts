import type { EditResult, TextSelection } from './edit-commands';

/**
 * List editing: nesting, un-nesting and continuing list items, with ordered lists renumbered
 * after every change.
 *
 * Same contract as `edit-commands.ts`: pure transforms over LF-normalised text, returning the
 * edits in original coordinates. Each command emits a single replacement covering the list it
 * touched, so the change is one undo step in either editor.
 */

const LIST_ITEM = /^([ \t]*)(?:([-*+])|(\d{1,9})([.)]))([ \t]+)(\[[ xX]\][ \t]+)?/;

interface ListItemLine {
  indent: string;
  /** `-`, `*` or `+`; null for an ordered item. */
  bullet: string | null;
  number: number | null;
  delimiter: string;
  /** Length of everything before the item's content: indent, marker, spacing and task box. */
  markerLength: number;
  task: boolean;
}

function readListItem(line: string): ListItemLine | null {
  const match = LIST_ITEM.exec(line);
  if (!match) return null;
  return {
    indent: match[1] ?? '',
    bullet: match[2] ?? null,
    number: match[3] !== undefined ? Number(match[3]) : null,
    delimiter: match[4] ?? '',
    markerLength: match[0].length,
    task: match[6] !== undefined,
  };
}

function leadingWhitespace(line: string): string {
  return /^[ \t]*/.exec(line)?.[0] ?? '';
}

/** Indentation width with tabs counted to the next multiple of four, as CommonMark does. */
function width(indent: string): number {
  let n = 0;
  for (const ch of indent) n += ch === '\t' ? 4 - (n % 4) : 1;
  return n;
}

/**
 * Renumbers every ordered list in `lines[start..end)` in place.
 *
 * Each run of ordered items at one depth counts up from its first item's number, so a list that
 * deliberately starts at 5 keeps doing so. A bullet item at the same depth, or unindented text,
 * ends the run.
 */
export function renumberLines(lines: string[], start = 0, end = lines.length): void {
  const counters = new Map<number, number>();
  for (let i = start; i < end; i++) {
    const line = lines[i]!;
    if (line.trim() === '') continue;
    const item = readListItem(line);
    const depth = width(item ? item.indent : leadingWhitespace(line));
    for (const level of [...counters.keys()]) if (level > depth) counters.delete(level);
    if (!item) {
      if (depth === 0) counters.clear();
      continue;
    }
    if (item.number === null) {
      counters.delete(depth);
      continue;
    }
    const previous = counters.get(depth);
    const next = previous === undefined ? item.number : previous + 1;
    counters.set(depth, next);
    if (next !== item.number) lines[i] = line.replace(/^([ \t]*)\d{1,9}/, `$1${next}`);
  }
}

function isListContent(line: string): boolean {
  return readListItem(line) !== null || /^[ \t]+\S/.test(line);
}

/** The list block around lines `[first, last]`: contiguous list content, inner blank lines included. */
function listBlock(lines: readonly string[], first: number, last: number): [number, number] {
  let start = first;
  for (;;) {
    const above = lines[start - 1];
    if (above === undefined) break;
    if (isListContent(above)) start--;
    else if (above.trim() === '' && lines[start - 2] !== undefined && isListContent(lines[start - 2]!)) start--;
    else break;
  }
  let end = last + 1;
  for (;;) {
    const below = lines[end];
    if (below === undefined) break;
    if (isListContent(below)) end++;
    else if (below.trim() === '' && lines[end + 1] !== undefined && isListContent(lines[end + 1]!)) end++;
    else break;
  }
  return [start, end];
}

function lineOffsets(lines: readonly string[]): number[] {
  const offsets: number[] = [];
  let at = 0;
  for (const line of lines) {
    offsets.push(at);
    at += line.length + 1;
  }
  return offsets;
}

function lineIndexAt(offsets: readonly number[], pos: number): number {
  let index = 0;
  while (index + 1 < offsets.length && offsets[index + 1]! <= pos) index++;
  return index;
}

/** The previous item, or null when unindented non-list text comes first. */
function previousItem(lines: readonly string[], index: number): ListItemLine | null {
  for (let i = index - 1; i >= 0; i--) {
    const line = lines[i]!;
    const item = readListItem(line);
    if (item) return item;
    if (line.trim() !== '' && !/^[ \t]/.test(line)) return null;
  }
  return null;
}

/** The nearest item above that is shallower than `depth`: the item `index` is nested under. */
function parentItem(lines: readonly string[], index: number, depth: number): ListItemLine | null {
  for (let i = index - 1; i >= 0; i--) {
    const line = lines[i]!;
    const item = readListItem(line);
    if (item && width(item.indent) < depth) return item;
    if (!item && line.trim() !== '' && !/^[ \t]/.test(line)) return null;
  }
  return null;
}

/**
 * Replaces lines `[start, end)` of `before` with the same range of `after` (which may hold one
 * more line, for `continueList`), as a single edit.
 */
function blockEdit(text: string, before: readonly string[], after: readonly string[], start: number, end: number, added: number) {
  const offsets = lineOffsets(before);
  const oldEnd = end - added;
  const from = offsets[start]!;
  const to = oldEnd < before.length ? offsets[oldEnd]! - 1 : text.length;
  return { from, to, insert: after.slice(start, end).join('\n') };
}

/** Offset of `column` on line `index` of `lines`, measured from the start of line `start`. */
function offsetIn(lines: readonly string[], start: number, index: number, column: number): number {
  let at = 0;
  for (let i = start; i < index; i++) at += lines[i]!.length + 1;
  return at + Math.max(0, Math.min(column, lines[index]!.length));
}

/**
 * Tab / Shift+Tab on list items: nests the touched items one level under the item above (or
 * lifts them out one level) and renumbers the list. `1. 2. 3.` with the second item nested
 * becomes `1.`, `   1.`, `2.`.
 *
 * Returns null when the selection does not start on a list item, so the caller can fall back to
 * ordinary indentation.
 */
export function shiftListItems(text: string, sel: TextSelection, direction: 1 | -1): EditResult | null {
  const lines = text.split('\n');
  const offsets = lineOffsets(lines);
  const first = lineIndexAt(offsets, sel.from);
  const endPos = sel.to > sel.from && text[sel.to - 1] === '\n' ? sel.to - 1 : sel.to;
  const last = lineIndexAt(offsets, endPos);
  if (!readListItem(lines[first]!)) return null;

  const next = [...lines];
  const shift = new Array<number>(lines.length).fill(0);
  for (let i = first; i <= last; i++) {
    const line = next[i]!;
    if (line.trim() === '') continue;
    if (direction === 1) {
      // Nest under the parent's content column, which is as wide as the item above's marker.
      const above = previousItem(next, i);
      if (!above) continue; // the first item of a list has nothing to nest under
      const unit = above.markerLength - above.indent.length - (above.task ? 4 : 0);
      next[i] = ' '.repeat(unit) + line;
      shift[i] = unit;
    } else {
      const indent = leadingWhitespace(line);
      if (indent.length === 0) continue;
      const parent = parentItem(next, i, width(indent));
      const unit = Math.min(indent.length, parent ? parent.markerLength - parent.indent.length - (parent.task ? 4 : 0) : indent.length);
      next[i] = line.slice(unit);
      shift[i] = -unit;
    }
  }
  if (shift.every((n) => n === 0)) return { changes: [], selection: sel };

  // An item that has just become the first child of the item above starts a new list at 1;
  // otherwise renumbering would keep its old position (`2.`) as a deliberate start number.
  for (let i = first; i <= last; i++) {
    if (shift[i]! <= 0) continue;
    const item = readListItem(next[i]!);
    if (!item || item.number === null) continue;
    let above = i - 1;
    while (above >= 0 && next[above]!.trim() === '') above--;
    const aboveLine = next[above];
    if (aboveLine !== undefined && width(leadingWhitespace(aboveLine)) < width(item.indent)) {
      next[i] = next[i]!.replace(/^([ \t]*)\d{1,9}/, '$11');
    }
  }

  const [start, end] = listBlock(next, first, last);
  renumberLines(next, start, end);
  const change = blockEdit(text, lines, next, start, end, 0);

  const mapPos = (pos: number): number => {
    const index = lineIndexAt(offsets, pos);
    const column = pos - offsets[index]!;
    const oldItem = readListItem(lines[index]!);
    const newItem = readListItem(next[index]!);
    let newColumn = column + shift[index]!;
    if (oldItem && newItem) {
      // Measured from the content, which is what does not move when the marker changes width.
      newColumn = newItem.markerLength + Math.max(0, column - oldItem.markerLength);
    }
    return change.from + offsetIn(next, start, index, newColumn);
  };
  return { changes: [change], selection: { from: mapPos(sel.from), to: mapPos(sel.to) } };
}

/**
 * Enter inside a list item, for editors without CodeMirror's own continuation (the instant-mode
 * textarea).
 *
 * - On an item with content, a new item follows with the next number (the same bullet, and an
 *   unchecked box for a task), and the items below are renumbered.
 * - On an empty item, the marker is removed, ending the list — the usual way out of a list.
 *
 * Returns null when the caret is not inside an item's content, or the selection is a range.
 */
export function continueList(text: string, sel: TextSelection): EditResult | null {
  if (sel.from !== sel.to) return null;
  const lines = text.split('\n');
  const offsets = lineOffsets(lines);
  const index = lineIndexAt(offsets, sel.from);
  const line = lines[index]!;
  const column = sel.from - offsets[index]!;
  const item = readListItem(line);
  if (!item || column < item.markerLength) return null;

  if (line.slice(item.markerLength).trim() === '') {
    const from = offsets[index]!;
    return { changes: [{ from, to: from + line.length, insert: '' }], selection: { from, to: from } };
  }

  const marker = item.bullet !== null ? `${item.bullet} ` : `${(item.number ?? 0) + 1}${item.delimiter} `;
  const prefix = `${item.indent}${marker}${item.task ? '[ ] ' : ''}`;
  const next = [...lines.slice(0, index), line.slice(0, column), `${prefix}${line.slice(column)}`, ...lines.slice(index + 1)];
  const [start, end] = listBlock(next, index, index + 1);
  renumberLines(next, start, end);
  const change = blockEdit(text, lines, next, start, end, 1);

  const created = readListItem(next[index + 1]!);
  const caret = change.from + offsetIn(next, start, index + 1, created ? created.markerLength : prefix.length);
  return { changes: [change], selection: { from: caret, to: caret } };
}
