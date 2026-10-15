import type { MarkdownIt, StateBlock, StateInline } from 'markdown-it';
import type { MathDelimiter } from './types';

/**
 * Math delimiter tokenizer for markdown-it.
 *
 * ## Why a hand-written rule instead of `markdown-it-texmath` / `remark-math`
 *
 * OpenMark has to report **which** formula failed and **where in the file** it lives,
 * and it must never lose the authored source. That requires the tokenizer to own the
 * exact byte range of every expression, which no off-the-shelf plugin exposes. This
 * rule therefore records `raw` (delimiters included) and `tex` (body) verbatim.
 *
 * ## Ambiguity rules
 *
 * Inline `$` is the only genuinely ambiguous delimiter, because it is also a currency
 * symbol. We apply the convention shared by KaTeX auto-render and markdown-it-katex:
 *
 * 1. an opening `$` must not be followed by whitespace;
 * 2. a closing `$` must not be preceded by whitespace;
 * 3. a closing `$` must not be followed by a digit;
 * 4. neither `$…$` nor `$$…$$` may span a line break.
 *
 * Together (1)+(2) reject `Price: $5, $10`; (3) rejects `$10,$20`. Rule (4) stops a
 * stray `$` from swallowing the rest of the document. `\(…\)` and `\[…\]` need none of
 * this: they are unambiguous, so they are accepted verbatim and may span lines — and
 * when no closer exists the rule declines, letting markdown-it's escape rule treat the
 * backslash normally.
 *
 * Code spans and fenced/indented code are handled *before* inline rules run, so a `$`
 * inside them can never reach this tokenizer. That falls out of markdown-it's design
 * rather than being a special case here.
 */

/**
 * Environments accepted as a bare, top-level math block (`\begin{align}…\end{align}`).
 * Exported so the diagnostics layer can distinguish "unsupported env" from "bad syntax"
 * and so the editor can offer the right autocomplete set.
 */
export const MATH_ENVIRONMENTS: Record<string, true> = {
  math: true,
  displaymath: true,
  equation: true,
  'equation*': true,
  align: true,
  'align*': true,
  alignat: true,
  'alignat*': true,
  gather: true,
  'gather*': true,
  multline: true,
  'multline*': true,
  eqnarray: true,
  'eqnarray*': true,
  flalign: true,
  'flalign*': true,
  cases: true,
  rcases: true,
  dcases: true,
  'dcases*': true,
  drcases: true,
  split: true,
  array: true,
  matrix: true,
  pmatrix: true,
  bmatrix: true,
  Bmatrix: true,
  vmatrix: true,
  Vmatrix: true,
  smallmatrix: true,
  subequations: true,
};

export interface MathSource {
  tex: string;
  raw: string;
  display: boolean;
  delimiter: MathDelimiter;
  environment?: string;
}

/** Marker placed on tokens; consumed by the position-resolution core rule. */
export const MATH_META_KEY = 'omMath' as const;

/**
 * Token metadata shape. Carries an index signature so it can be stored in markdown-it's
 * `Record<string, unknown>` meta bag without a cast at every assignment.
 */
export interface MathTokenMeta extends Record<string, unknown> {
  [MATH_META_KEY]: MathSource;
  omId?: string;
}

function isWhitespaceCode(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;
}

/**
 * `indexOf` that ignores matches preceded by an odd number of backslashes, so
 * `\$$` and `\\$$` are distinguished correctly.
 * Returns -1 when not found within `[from, to)`.
 */
function indexOfUnescaped(src: string, needle: string, from: number, to: number): number {
  let idx = src.indexOf(needle, from);
  while (idx >= 0 && idx + needle.length <= to) {
    let backslashes = 0;
    for (let i = idx - 1; i >= 0 && src.charCodeAt(i) === 0x5c; i--) backslashes++;
    if (backslashes % 2 === 0) return idx;
    idx = src.indexOf(needle, idx + 1);
  }
  return -1;
}

/** Trims only the newlines/padding `$$` blocks conventionally carry, not inner content. */
function trimBlockFiller(content: string): string {
  return content.replace(/^[ \t]*\n?/, '').replace(/\n?[ \t]*$/, '');
}

/**
 * Locates the matching `\end{<env>}` for a `\begin{<env>}` starting at `from`,
 * counting nested same-name environments (e.g. `align` inside `align`).
 */
function findEnvironmentEnd(src: string, env: string, from: number, to: number): number {
  const beginToken = `\\begin{${env}}`;
  const endToken = `\\end{${env}}`;
  let depth = 1;
  let cursor = from;
  while (cursor < to) {
    const nextBegin = src.indexOf(beginToken, cursor);
    const nextEnd = src.indexOf(endToken, cursor);
    if (nextEnd < 0 || nextEnd >= to) return -1;
    if (nextBegin >= 0 && nextBegin < nextEnd) {
      depth++;
      cursor = nextBegin + beginToken.length;
      continue;
    }
    depth--;
    if (depth === 0) return nextEnd;
    cursor = nextEnd + endToken.length;
  }
  return -1;
}

interface BlockOpen {
  openLen: number;
  closeToken: string;
  display: boolean;
  delimiter: MathDelimiter;
  environment?: string;
}

/** Recognises a math block opener at `pos`; returns null when this is not math. */
function matchBlockOpener(src: string, pos: number): BlockOpen | null {
  const c = src.charCodeAt(pos);
  if (c === 0x24 /* $ */ && src.charCodeAt(pos + 1) === 0x24) {
    return { openLen: 2, closeToken: '$$', display: true, delimiter: 'dollar-block' };
  }
  if (c === 0x5c /* \ */) {
    const next = src.charCodeAt(pos + 1);
    if (next === 0x5b /* [ */) {
      return { openLen: 2, closeToken: '\\]', display: true, delimiter: 'paren-block' };
    }
    if (src.startsWith('\\begin{', pos)) {
      const close = src.indexOf('}', pos + 7);
      if (close < 0 || close - (pos + 7) > 32) return null;
      const env = src.slice(pos + 7, close);
      if (MATH_ENVIRONMENTS[env] !== true) return null;
      return {
        openLen: close + 1 - pos,
        closeToken: `\\end{${env}}`,
        display: true,
        delimiter: 'latex-env',
        environment: env,
      };
    }
  }
  return null;
}

function mathBlockRule(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  const pos = state.bMarks[startLine]! + state.tShift[startLine]!;
  const max = state.eMarks[startLine]!;
  if (pos >= max) return false;
  // Four-space indent means indented code block, which must win.
  if (state.sCount[startLine]! - state.blkIndent >= 4) return false;

  const src = state.src;
  const opener = matchBlockOpener(src, pos);
  if (!opener) return false;

  const scopeEnd = state.eMarks[endLine - 1] ?? src.length;

  let closeIdx: number;
  if (opener.delimiter === 'latex-env') {
    closeIdx = findEnvironmentEnd(src, opener.environment!, pos + opener.openLen, scopeEnd);
  } else {
    closeIdx = indexOfUnescaped(src, opener.closeToken, pos + opener.openLen, scopeEnd);
  }
  if (closeIdx < 0) return false;

  const contentEnd = closeIdx;
  const tex = trimBlockFiller(src.slice(pos + opener.openLen, contentEnd));
  // `$$` with nothing between it and its closer is not math; let paragraph handle it.
  if (!/\S/.test(tex)) return false;

  // Map the closer offset back to a line so the block parser can resume after it.
  let endLineNo = startLine;
  const blockEnd = closeIdx + opener.closeToken.length;
  for (let line = startLine; line < endLine; line++) {
    if (blockEnd <= state.eMarks[line]!) {
      endLineNo = line + 1;
      break;
    }
  }

  if (silent) return true;

  const token = state.push('math_block', 'math', 0);
  token.block = true;
  token.map = [startLine, endLineNo];
  token.content = tex;
  token.markup = opener.closeToken;
  const meta: MathTokenMeta = {
    [MATH_META_KEY]: {
      tex,
      raw: src.slice(pos, blockEnd),
      display: opener.display,
      delimiter: opener.delimiter,
      ...(opener.environment ? { environment: opener.environment } : {}),
    },
  };
  token.meta = meta;

  state.line = endLineNo;
  return true;
}

function mathInlineRule(state: StateInline, silent: boolean): boolean {
  const start = state.pos;
  const src = state.src;
  const c = src.charCodeAt(start);
  if (c !== 0x24 /* $ */ && c !== 0x5c /* \ */) return false;

  let openLen: number;
  let closeToken: string;
  let display: boolean;
  let delimiter: MathDelimiter;

  if (c === 0x24) {
    const next = src.charCodeAt(start + 1);
    if (next === 0x24) {
      openLen = 2;
      closeToken = '$$';
      display = true;
      delimiter = 'dollar-block';
    } else {
      // Rule (1): `$` immediately followed by whitespace is never an opener.
      if (start + 1 >= state.posMax || isWhitespaceCode(next)) return false;
      openLen = 1;
      closeToken = '$';
      display = false;
      delimiter = 'dollar';
    }
  } else {
    const next = src.charCodeAt(start + 1);
    if (next === 0x28 /* ( */) {
      openLen = 2;
      closeToken = '\\)';
      display = false;
      delimiter = 'paren-inline';
    } else if (next === 0x5b /* [ */) {
      openLen = 2;
      closeToken = '\\]';
      display = true;
      delimiter = 'paren-block';
    } else {
      return false;
    }
  }

  const bodyStart = start + openLen;
  let cursor = bodyStart;
  let found = -1;

  while (cursor < state.posMax) {
    const ch = src.charCodeAt(cursor);

    if (ch === 0x5c /* \ */) {
      if (closeToken.charCodeAt(0) === 0x5c && src.startsWith(closeToken, cursor)) {
        found = cursor;
        break;
      }
      cursor += 2; // an escaped char can never open or close math
      continue;
    }

    // Rule (4): inline math never spans a line break.
    if (ch === 0x0a) return false;

    if (ch === 0x24 /* $ */) {
      if (closeToken === '$') {
        const prev = src.charCodeAt(cursor - 1);
        const next = src.charCodeAt(cursor + 1);
        // Rules (2) and (3).
        if (!isWhitespaceCode(prev) && !(next >= 0x30 && next <= 0x39)) {
          found = cursor;
          break;
        }
      } else if (closeToken === '$$' && src.charCodeAt(cursor + 1) === 0x24) {
        found = cursor;
        break;
      }
    }

    cursor++;
  }

  if (found < 0) return false;

  const tex = src.slice(bodyStart, found);
  if (!/\S/.test(tex)) return false;

  if (!silent) {
    const token = state.push('math_inline', 'math', 0);
    token.markup = closeToken;
    token.content = tex;
    const meta: MathTokenMeta = {
      [MATH_META_KEY]: {
        tex,
        raw: src.slice(start, found + closeToken.length),
        display,
        delimiter,
      },
    };
    token.meta = meta;
  }

  state.pos = found + closeToken.length;
  return true;
}

export interface MathPluginOptions {
  /** Render hook: produce the placeholder HTML for one expression. */
  renderPlaceholder: (id: string, display: boolean) => string;
}

/**
 * Registers the math block + inline rules and their renderers.
 *
 * Registration order matters: the inline rule goes **before** `escape` so that a real
 * `\(…\)` pair beats markdown-it's backslash-escape interpretation, while an unmatched
 * `\(` still falls through to `escape` and renders as a literal `(` — which is what
 * makes the rule safe to enable on ordinary prose.
 */
export function mathPlugin(md: MarkdownIt, opts: MathPluginOptions): void {
  md.block.ruler.before('fence', 'math_block', mathBlockRule, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });
  md.inline.ruler.before('escape', 'math_inline', mathInlineRule);

  md.renderer.rules['math_block'] = (tokens, idx): string => {
    const meta = tokens[idx]!.meta as MathTokenMeta | null;
    const id = meta?.omId;
    // An unresolved id means the position pass did not run; degrade to a visible
    // marker rather than emitting an empty box the user cannot act on.
    if (!id) return `<div class="om-math om-math--orphan">${tokens[idx]!.content}</div>`;
    return opts.renderPlaceholder(id, true);
  };

  md.renderer.rules['math_inline'] = (tokens, idx): string => {
    const meta = tokens[idx]!.meta as MathTokenMeta | null;
    const id = meta?.omId;
    const display = meta?.[MATH_META_KEY]?.display ?? false;
    if (!id) return `<span class="om-math om-math--orphan">${tokens[idx]!.content}</span>`;
    return opts.renderPlaceholder(id, display);
  };
}
