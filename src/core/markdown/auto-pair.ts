/**
 * Typing-time auto-pairing for Markdown inline delimiters.
 *
 * Type an opening delimiter and its closing half appears after the caret, with the caret left
 * between the two:
 *
 *   `*`     → `*|*`
 *   `**`    → `**|**`     (the second `*` lengthens the pair instead of nesting a new one)
 *   `***`   → `***|***`   (bold italic)
 *   `~~`    → `~~|~~`     (a lone `~` means nothing in Markdown, so it does not open)
 *   `` ` `` → `` `|` ``
 *   `$`     → `$|$`
 *
 * Everything here is a pure function of (text, selection, typed character). It is deliberately
 * free of CodeMirror and of the DOM so one set of rules drives the source editor and the
 * instant-mode block textarea, and so the rules can be tested exhaustively on plain strings —
 * the failure modes (a doubled delimiter, a stranded caret, a pair closed inside a word) are
 * exact-text properties, not visual ones.
 *
 * ## Pairs are measured by run length, not counted per keystroke
 *
 * The run of identical characters at the caret is measured and made symmetric, which is what
 * makes `*` `*` `*` produce `***|***` rather than three nested pairs. A run that is already
 * asymmetric is treated as text being edited and left alone, rather than "repaired" into
 * something the user did not ask for.
 *
 * ## The start of a line belongs to block syntax
 *
 * A single delimiter that begins a line is never paired: `*` there is a bullet list marker,
 * `` ` `` a code fence and `$` display math. Pairing them would make `*` + space produce an
 * italic pair instead of a list, which is the more common intent by a wide margin. Two
 * characters still pair there — `**` and `~~` cannot be block syntax — so bold and
 * strikethrough work at the start of a line.
 *
 * ## What is only paired where it is safe
 *
 * `*` and `~~` are refused strictly inside a word, where `snake_case` and `2*3` live and where
 * a closing half has to be deleted by hand. `` ` `` and `$` are allowed there, because inline
 * code and inline math are routinely written tight against text (`价格为$a+b$元`).
 *
 * Brackets and quotes are not paired at all: `[` also opens a reference definition, a footnote
 * and a task list, and a stray `]` in prose costs a keystroke to remove.
 */

import type { EditResult } from './edit-commands';

interface DelimiterRule {
  /** Shortest run that means anything, and therefore the shortest closing half. */
  min: number;
  /** Longest run still treated as inline emphasis, rather than syntax a pair would corrupt. */
  max: number;
  /**
   * Whether the emphasis restrictions apply: refuse strictly inside a word (`snake_case`,
   * `2*3`) and refuse immediately before whitespace, where Markdown would not emphasise
   * anything anyway and the pair is only noise.
   *
   * Off for `` ` `` and `$`, because inline code and inline math are routinely written tight
   * against text and punctuation (`价格为$a+b$元`, ``use `foo` here``).
   */
  emphasis: boolean;
}

/**
 * The delimiters that can pair, keyed by the character typed.
 *
 * A table rather than a branch per character, so the difference that actually matters between
 * them — how many characters are meaningful — is stated once and readable at a glance.
 */
const RULES: Readonly<Record<string, DelimiterRule>> = {
  '*': { min: 1, max: 3, emphasis: true },
  '~': { min: 2, max: 2, emphasis: true },
  '`': { min: 1, max: 1, emphasis: false },
  $: { min: 1, max: 1, emphasis: false },
};

/** True when a single typed character is one this module can pair. */
export function isPairDelimiter(insert: string): boolean {
  return insert.length === 1 && RULES[insert] !== undefined;
}

export interface AutoPairInput {
  /**
   * The text the caret is in, before the typed character lands.
   *
   * Callers editing a very large document may pass a window around the caret instead of the
   * whole text, as long as it reaches back past the start of the caret's paragraph and forward
   * past the closing run. Nothing here looks further than that, which is what keeps the cost
   * off the keystroke path for a multi-megabyte file.
   */
  text: string;
  /** Selection start, an offset within `text`. */
  from: number;
  /** Selection end, an offset within `text`. Equal to `from` for a caret. */
  to: number;
  /** Exactly what is about to be inserted. Anything but one delimiter is ignored. */
  insert: string;
}

/** How many `char` sit immediately before `at`. */
function runBefore(text: string, at: number, char: string): number {
  let n = 0;
  while (at - n - 1 >= 0 && text[at - n - 1] === char) n++;
  return n;
}

/** How many `char` sit immediately at and after `at`. */
function runAfter(text: string, at: number, char: string): number {
  let n = 0;
  while (at + n < text.length && text[at + n] === char) n++;
  return n;
}

/** True when only indentation precedes `at` on its line. */
function atLineStart(text: string, at: number): boolean {
  return /^[ \t]*$/.test(text.slice(text.lastIndexOf('\n', at - 1) + 1, at));
}

/**
 * How many `char` sit in the caret's paragraph, excluding the run immediately before the caret.
 *
 * Scans backwards from `from` and stops at the nearest blank line — the paragraph boundary —
 * rather than slicing the text and iterating a substring. Emphasis may span a soft line break
 * (`*a\nb*` is italic) but never a blank line, so the paragraph is the right scope, and stopping
 * there means the cost is bounded by the paragraph rather than by the document.
 *
 * The run immediately before the caret is skipped: that is the pair being extended, and counting
 * it would make the length of an existing run veto its own continuation.
 */
function openersInParagraph(text: string, from: number, char: string, skipRun: number): number {
  let count = 0;
  let i = from - skipRun - 1;
  // Walk back over the paragraph, one character at a time.
  while (i >= 0) {
    // A blank line ends the paragraph. The caret sits after the newline that closes its own
    // line, so a `\n` followed by nothing but spaces/tabs going back to a `\n` is a boundary.
    if (text[i] === '\n') {
      let j = i - 1;
      while (j >= 0 && (text[j] === ' ' || text[j] === '\t')) j--;
      if (j < 0 || text[j] === '\n') return count;
      i = j;
      continue;
    }
    if (text[i] === char) count++;
    i--;
  }
  return count;
}

/** A letter, digit or underscore: a character an opening `*` should not split. */
const WORD = /[\p{L}\p{N}_]/u;

/**
 * The edit that turns a typed delimiter into a balanced pair, or `null` to let the keystroke
 * through untouched.
 *
 * `null` is the common case and must stay cheap — this runs on every character typed.
 */
export function autoPairEdit({ text, from, to, insert }: AutoPairInput): EditResult | null {
  if (insert.length !== 1 || from > to) return null;
  const char = insert;
  const rule = RULES[char];
  if (!rule) return null;

  const min = char.repeat(rule.min);

  // ---- a selection is wrapped, never replaced
  //
  // Typing over a selection normally deletes it, so a stray `*` would destroy a paragraph.
  // Wrapping is also the gesture users reach for: select, type `*`, get italics.
  if (to > from) {
    return {
      changes: [
        { from, to: from, insert: min },
        { from: to, to, insert: min },
      ],
      selection: { from: from + min.length, to: to + min.length },
    };
  }

  const before = runBefore(text, from, char);
  const after = runAfter(text, to, char);
  /** The opening run once the typed character lands. */
  const run = before + 1;

  // ---- lengthen a symmetric pair: `**|**` + `*` → `***|***`
  if (before > 0 && before === after && run <= rule.max) {
    return {
      changes: [
        { from, to, insert: char },
        { from: to + after, to: to + after, insert: char },
      ],
      selection: { from: from + 1, to: from + 1 },
    };
  }

  // ---- step over a closing run: `*word|*` + `*` → `*word*|`
  //
  // Only with an empty run before the caret. Otherwise the caret is inside content, where a
  // delimiter is just a character.
  if (before === 0 && after > 0) {
    if (after > rule.max) return null;
    return {
      changes: [{ from, to: to + after, insert: char.repeat(after) }],
      selection: { from: from + after, to: from + after },
    };
  }

  // An asymmetric run with characters still ahead: existing content, not an opening.
  if (after > 0) return null;

  // ---- is the caret already inside an open delimiter?
  //
  // If the line has an unmatched opener of this character, typing it again means "close", not
  // "open another". Without this, typing `*` at the end of `*text` would produce `*text**`.
  //
  // Scoped to the paragraph, because emphasis may span a soft line break (`*a\nb*` is italic)
  // but never a blank line. Scoping to the line instead would let a multi-line italic be
  // reopened in its middle.
  //
  // The count excludes the run immediately before the caret, which is the pair being extended,
  // and is then read in units of `min`: for `*` a lone earlier `*` blocks, while for `~~` it
  // takes a whole earlier `~~` to block, so a half-typed `~~text~` can still be closed.
  const openersBefore = openersInParagraph(text, from, char, before);
  if (openersBefore > 0 && Math.floor(openersBefore / rule.min) % 2 === 1) return null;

  // ---- open a fresh pair
  if (run < rule.min || run > rule.max) return null;
  // The start of a line is block syntax (bullet, fence, display math).
  if (run === 1 && atLineStart(text, from)) return null;

  const next = to < text.length ? text[to] : undefined;
  const prev = from > 0 ? text[from - 1] : undefined;
  if (rule.emphasis) {
    // Emphasis cannot open immediately before a space or tab: the pair would render as nothing.
    // A newline is *not* whitespace for this purpose — the end of a line is where trailing
    // emphasis is most often typed, and `*word*` there is perfectly valid.
    if (next !== undefined && /[ \t]/.test(next)) return null;
    // ...nor strictly inside a word, which is where `snake_case` and `2*3` live.
    if (prev !== undefined && next !== undefined && WORD.test(prev) && WORD.test(next)) return null;
  }

  // The typed character is the last of the opening run, so the closing half matches its length:
  // that is what turns a second `~` into `~~|~~` rather than `~~|~`.
  return {
    changes: [{ from, to, insert: char + char.repeat(run) }],
    selection: { from: from + 1, to: from + 1 },
  };
}
