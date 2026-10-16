/**
 * Markdown editing commands as pure text transforms.
 *
 * Every command takes the document text (LF-normalised, as both editors hold it) and a
 * selection, and returns the edits to apply plus where the selection should land. Keeping
 * them free of CodeMirror and of the DOM is what lets the same command drive the source
 * editor and the instant-mode block textarea, and lets the node suite test them without a
 * browser.
 *
 * Edits are expressed in the coordinates of the *original* text, in ascending order and
 * non-overlapping — the shape CodeMirror's `changes` takes. `applyEdits` performs them for
 * callers (and tests) that hold a plain string.
 */

export interface TextEdit {
  from: number;
  to: number;
  insert: string;
}

export interface TextSelection {
  /** Lower bound, inclusive. */
  from: number;
  /** Upper bound, exclusive. Equal to `from` for a caret. */
  to: number;
}

export interface EditResult {
  changes: TextEdit[];
  /** Selection in the coordinates of the text *after* the edits. */
  selection: TextSelection;
}

/** Applies non-overlapping edits given in original-text coordinates. */
export function applyEdits(text: string, changes: readonly TextEdit[]): string {
  let out = '';
  let cursor = 0;
  for (const change of [...changes].sort((a, b) => a.from - b.from)) {
    out += text.slice(cursor, change.from) + change.insert;
    cursor = change.to;
  }
  return out + text.slice(cursor);
}

// ------------------------------------------------------------------- inline marks

/**
 * Wraps the selection in `before`/`after`, or removes them when they are already there.
 *
 * "Already there" is checked both just outside the selection (`**|word|**`, the state the
 * command itself leaves behind) and just inside it (`|**word**|`, a selection made by hand),
 * so pressing the shortcut twice always returns the original text.
 */
export function toggleWrap(text: string, sel: TextSelection, before: string, after = before): EditResult {
  const { from, to } = sel;
  const outside =
    from >= before.length &&
    text.slice(from - before.length, from) === before &&
    text.slice(to, to + after.length) === after;
  if (outside && !partOfLongerRun(text, from - before.length, to + after.length, before)) {
    return {
      changes: [
        { from: from - before.length, to: from, insert: '' },
        { from: to, to: to + after.length, insert: '' },
      ],
      selection: { from: from - before.length, to: to - before.length },
    };
  }

  const selected = text.slice(from, to);
  if (selected.length >= before.length + after.length && selected.startsWith(before) && selected.endsWith(after)) {
    const inner = selected.slice(before.length, selected.length - after.length);
    return {
      changes: [{ from, to, insert: inner }],
      selection: { from, to: from + inner.length },
    };
  }

  return {
    changes: [{ from, to, insert: `${before}${selected}${after}` }],
    selection: { from: from + before.length, to: to + before.length },
  };
}

/**
 * True when the markers found around the selection are only the inner part of a longer run of
 * the same character — the `*` of `**word**` seen by the italic command. Removing one star
 * there would turn bold into italic; wrapping instead gives `***word***`, bold italic.
 *
 * `open` is where the opening marker starts and `closeEnd` where the closing one ends.
 */
function partOfLongerRun(text: string, open: number, closeEnd: number, marker: string): boolean {
  // Only a single-character marker can be the inner half of a pair: `**` around `*`.
  const ch = marker[0];
  if (marker.length !== 1 || ch === undefined) return false;
  let left = 1;
  while (text[open - left] === ch) left++;
  let right = 1;
  while (text[closeEnd - 1 + right] === ch) right++;
  // A run of exactly two is bold. One (italic) or three (bold italic) has an italic star to remove.
  return left === 2 || right === 2;
}

/** `[text](url)`: the caret lands in the empty part, so the next keystroke fills it. */
export function insertLink(text: string, sel: TextSelection, image = false): EditResult {
  const label = text.slice(sel.from, sel.to);
  const bang = image ? '!' : '';
  const insert = `${bang}[${label}]()`;
  // With a label, the URL is what is missing; without one, the label is.
  const caret = label ? sel.from + insert.length - 1 : sel.from + bang.length + 1;
  return { changes: [{ from: sel.from, to: sel.to, insert }], selection: { from: caret, to: caret } };
}

// ---------------------------------------------------------------------- lines

interface LineSpan {
  from: number;
  to: number;
  text: string;
}

/** The full lines the selection touches. A selection ending at column 0 excludes that line. */
function touchedLines(text: string, sel: TextSelection): LineSpan[] {
  const start = text.lastIndexOf('\n', sel.from - 1) + 1;
  let endPos = sel.to;
  if (sel.to > sel.from && text[sel.to - 1] === '\n') endPos = sel.to - 1;
  const lines: LineSpan[] = [];
  let from = start;
  for (;;) {
    let to = text.indexOf('\n', from);
    if (to === -1) to = text.length;
    lines.push({ from, to, text: text.slice(from, to) });
    if (to >= endPos || to === text.length) break;
    from = to + 1;
  }
  return lines;
}

/**
 * Replaces each touched line through `map` and maps the selection through the edits.
 * Every edit is a whole-line replacement, so mapping a position is a matter of adding the
 * length deltas of the lines before it and clamping inside a changed line.
 */
function rewriteLines(text: string, sel: TextSelection, map: (line: string, index: number) => string): EditResult {
  const lines = touchedLines(text, sel);
  const changes: TextEdit[] = [];
  for (const [index, line] of lines.entries()) {
    const next = map(line.text, index);
    if (next !== line.text) changes.push({ from: line.from, to: line.to, insert: next });
  }
  const mapPos = (pos: number): number => {
    let delta = 0;
    for (const change of changes) {
      if (change.from > pos) break;
      if (change.to < pos) {
        delta += change.insert.length - (change.to - change.from);
        continue;
      }
      /*
       * Inside a rewritten line. The rewrite only changes a prefix, so the old and new lines
       * share a suffix (the body). A position in the body keeps its distance from the line end;
       * a position inside the old prefix lands at the start of the body, so a selection that
       * began at column 0 still starts at the text rather than inside the new marker.
       */
      const old = text.slice(change.from, change.to);
      const shared = sharedSuffixLength(old, change.insert);
      const oldPrefix = old.length - shared;
      const newPrefix = change.insert.length - shared;
      const column = pos - change.from;
      const mapped = column <= oldPrefix ? newPrefix : newPrefix + (column - oldPrefix);
      return change.from + delta + mapped;
    }
    return pos + delta;
  };
  return { changes, selection: { from: mapPos(sel.from), to: mapPos(sel.to) } };
}

function sharedSuffixLength(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  // The space after a marker belongs to the marker, not to the body.
  while (n > 0 && /[ \t]/.test(a[a.length - n] ?? '')) n--;
  return n;
}

const HEADING = /^(#{1,6})[ \t]+/;

/**
 * Makes every touched line a heading of `level` (0 = paragraph). Applying the level a line
 * already has turns it back into a paragraph, which is what a toggle on Ctrl+2 should do.
 */
export function setHeading(text: string, sel: TextSelection, level: number): EditResult {
  const lines = touchedLines(text, sel);
  const all = level > 0 && lines.every((line) => (HEADING.exec(line.text)?.[1]?.length ?? 0) === level);
  const target = all ? 0 : level;
  return rewriteLines(text, sel, (line) => {
    const body = line.replace(HEADING, '');
    return target === 0 ? body : `${'#'.repeat(target)} ${body}`;
  });
}

/**
 * Ctrl+= promotes (`delta = 1`), Ctrl+- demotes (`delta = -1`), as in Typora.
 *
 * Promoting moves towards h1 and stops there; a paragraph promotes to h6, the least important
 * heading. Demoting moves towards h6, and an h6 demotes back to a paragraph.
 */
export function shiftHeading(text: string, sel: TextSelection, delta: 1 | -1): EditResult {
  return rewriteLines(text, sel, (line) => {
    const current = HEADING.exec(line)?.[1]?.length ?? 0;
    let next: number;
    if (delta === 1) next = current === 0 ? 6 : Math.max(1, current - 1);
    else next = current === 0 || current === 6 ? 0 : current + 1;
    const body = line.replace(HEADING, '');
    return next === 0 ? body : `${'#'.repeat(next)} ${body}`;
  });
}

export type LinePrefixKind = 'quote' | 'bullet' | 'ordered' | 'task';

const LIST_MARKER = /^([ \t]*)(?:[-*+][ \t]+(?:\[[ xX]\][ \t]+)?|\d{1,9}[.)][ \t]+)/;
const QUOTE_MARKER = /^[ \t]*>[ \t]?/;

/**
 * Toggles a block prefix on every touched line. If every non-blank line already carries it,
 * it is removed; otherwise it is added, replacing any *other* list marker so switching a
 * bullet list to an ordered one is one keystroke.
 */
export function toggleLinePrefix(text: string, sel: TextSelection, kind: LinePrefixKind): EditResult {
  const lines = touchedLines(text, sel).filter((line) => line.text.trim() !== '');
  const has = (line: string): boolean => {
    switch (kind) {
      case 'quote':
        return QUOTE_MARKER.test(line);
      case 'bullet':
        return /^[ \t]*[-*+][ \t]+(?!\[[ xX]\])/.test(line);
      case 'ordered':
        return /^[ \t]*\d{1,9}[.)][ \t]+/.test(line);
      case 'task':
        return /^[ \t]*[-*+][ \t]+\[[ xX]\][ \t]+/.test(line);
    }
  };
  const remove = lines.length > 0 && lines.every((line) => has(line.text));
  let n = 0;
  return rewriteLines(text, sel, (line) => {
    if (line.trim() === '') return line;
    if (kind === 'quote') {
      return remove ? line.replace(QUOTE_MARKER, '') : `> ${line}`;
    }
    const indent = /^[ \t]*/.exec(line)?.[0] ?? '';
    const body = line.replace(LIST_MARKER, '').replace(/^[ \t]*/, '');
    if (remove) return `${indent}${body}`;
    n += 1;
    const marker = kind === 'bullet' ? '- ' : kind === 'task' ? '- [ ] ' : `${n}. `;
    return `${indent}${marker}${body}`;
  });
}

// --------------------------------------------------------------- code fences

const FENCE_OPEN = /^([ \t]{0,3})(`{3,}|~{3,})([^\n]*)/;

/**
 * The language of a fenced code block's source (its first info-string token), `''` when the
 * fence has none, or null when the text does not open with a fence (an indented code block).
 */
export function readFenceLanguage(block: string): string | null {
  const match = FENCE_OPEN.exec(block);
  if (!match) return null;
  return (match[3] ?? '').trim().split(/\s+/)[0] ?? '';
}

/**
 * Sets the language of a fenced code block, keeping the rest of the info string (`title=…`
 * and other meta) and every other byte of the block. Returns null when the block is not fenced.
 */
export function setFenceLanguage(block: string, lang: string): string | null {
  const match = FENCE_OPEN.exec(block);
  if (!match) return null;
  const [whole, indent = '', fence = '', info = ''] = match;
  const meta = info.trim().split(/\s+/).slice(1).join(' ');
  const cleaned = lang.trim().replace(/\s+/g, '');
  // A backtick fence's info string may not contain backticks.
  if (fence.startsWith('`') && cleaned.includes('`')) return null;
  const nextInfo = [cleaned, meta].filter(Boolean).join(' ');
  return `${indent}${fence}${nextInfo}${block.slice(whole.length)}`;
}

// --------------------------------------------------------------------- blocks

export type BlockKind = 'code' | 'math' | 'table';

/**
 * Inserts a block construct on lines of its own, separated from its neighbours by blank lines
 * (a fence glued to a paragraph is not a fence). The selection, if any, becomes the body.
 */
export function insertBlock(text: string, sel: TextSelection, kind: BlockKind): EditResult {
  const body = text.slice(sel.from, sel.to);
  let block: string;
  let caretOffset: number;
  switch (kind) {
    case 'code':
      block = `\`\`\`\n${body}\n\`\`\``;
      // After the opening fence, where the language name goes.
      caretOffset = 3;
      break;
    case 'math':
      block = `$$\n${body}\n$$`;
      caretOffset = 3 + body.length;
      break;
    case 'table':
      block = '|  |  |\n| --- | --- |\n|  |  |';
      caretOffset = 2;
      break;
  }

  const lineStart = text.lastIndexOf('\n', sel.from - 1) + 1;
  const before = text.slice(0, sel.from);
  let lead = '';
  if (sel.from > lineStart) lead = '\n\n';
  else if (lineStart > 0 && !/\n\s*\n$/.test(before) && before.trim() !== '') lead = '\n';

  const after = text.slice(sel.to);
  let trail = '';
  if (after.length > 0 && !after.startsWith('\n')) trail = '\n\n';
  else if (after.startsWith('\n') && !after.startsWith('\n\n') && after.trim() !== '') trail = '\n';

  const insert = `${lead}${block}${trail}`;
  const caret = sel.from + lead.length + caretOffset;
  return { changes: [{ from: sel.from, to: sel.to, insert }], selection: { from: caret, to: caret } };
}
