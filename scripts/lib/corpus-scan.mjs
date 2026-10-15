/**
 * The corpus scanner: derives the `expect` counters of
 * `tests/corpus/manifest.json` from a fixture's bytes.
 *
 * This module is deliberately dependency-free and pure so it can be reused by
 * `scripts/verify-corpus.mjs` (which re-checks every declared expectation on
 * `pnpm corpus:verify`) and by `node scripts/verify-corpus.mjs --print-counts <file>`
 * when a new fixture needs its manifest entry filled in.
 *
 * ## Counting rules (the contract the manifest is written against)
 *
 * - `headings`    ATX headings (`#{1,6}` in columns 0–3) plus setext headings (a line of
 *                 `=`/`-` immediately below a non-blank, non-table line). Headings inside
 *                 fenced code, HTML comments or YAML frontmatter do not count.
 * - `tables`      GFM tables, counted as delimiter rows: a line made only of `|`, `-`,
 *                 `:` and spaces that contains at least one `|`, preceded by a line that
 *                 also contains a `|`.
 * - `codeBlocks`  Fenced code blocks whose info string is not `math`/`mathjax`/`mermaid`/
 *                 `mmd`, plus indented (4-space) code blocks that start a block at the
 *                 top level — i.e. not a continuation of a list item or footnote.
 * - `math`        Every expression the delimiter tokenizer would recognise: `$$…$$`
 *                 (single-line or block), inline `$…$` obeying the whitespace/digit rules
 *                 in `src/core/markdown/math-plugin.ts`, `\(…\)`, `\[…\]`,
 *                 `\begin{env}…\end{env}` for every name in `MATH_ENVIRONMENTS`, and
 *                 ``` ```math ``` fences. A construct with no closer is *not* counted —
 *                 the tokenizer declines it and the diagnostics layer reports it instead.
 * - `images`      Markdown image syntax (`![alt](…)`, `![alt][ref]`) outside code spans
 *                 and fences. Raw HTML `<img>` is not markdown image syntax.
 * - `footnotes`   Footnote *definitions* (`[^id]: …`), not references.
 * - `taskLists`   Task-list items (`- [ ]`, `* [x]`, …) outside code.
 *
 * Anything that spans lines is counted once, at its closing delimiter.
 */

/** Mirrors `MATH_ENVIRONMENTS` in `src/core/markdown/math-plugin.ts`. */
export const MATH_ENVIRONMENTS = new Set([
  'math',
  'displaymath',
  'equation',
  'equation*',
  'align',
  'align*',
  'alignat',
  'alignat*',
  'gather',
  'gather*',
  'multline',
  'multline*',
  'eqnarray',
  'eqnarray*',
  'flalign',
  'flalign*',
  'cases',
  'rcases',
  'dcases',
  'dcases*',
  'drcases',
  'split',
  'array',
  'matrix',
  'pmatrix',
  'bmatrix',
  'Bmatrix',
  'vmatrix',
  'Vmatrix',
  'smallmatrix',
  'subequations',
]);

/** Mirrors the info-string classes in `src/core/markdown/engine.ts`. */
const MATH_FENCES = new Set(['math', 'mathjax']);
const MERMAID_FENCES = new Set(['mermaid', 'mmd']);

export const EXPECT_KEYS = ['headings', 'tables', 'codeBlocks', 'math', 'images', 'footnotes', 'taskLists'];

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const SETEXT_RE = /^ {0,3}(=+|-+)[ \t]*$/;
const ATX_RE = /^ {0,3}#{1,6}(?:[ \t]|$)/;
const TABLE_SEP_RE = /^[\s|:-]+$/;
const TASK_RE = /^ *[-*+] +\[[ xX]\]/;
const FOOTNOTE_DEF_RE = /^ {0,3}\[\^[^\]]+\]:/;
const LIST_ITEM_RE = /^ {0,3}(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/;
const QUOTE_PREFIX_RE = /^ {0,3}(?:>[ \t]?)+/;
const FRONTMATTER_RE = /^---[ \t]*\n[\s\S]*?\n---[ \t]*(?:\n|$)/;

/** Replaces inline code spans with spaces so their contents are never miscounted. */
export function stripInlineCode(line) {
  let out = '';
  let i = 0;
  while (i < line.length) {
    if (line[i] !== '`') {
      out += line[i];
      i++;
      continue;
    }
    let run = 0;
    while (line[i + run] === '`') run++;
    const open = '`'.repeat(run);
    const close = line.indexOf(open, i + run);
    if (close < 0) {
      out += ' '.repeat(run);
      i += run;
      continue;
    }
    out += ' '.repeat(close + run - i);
    i = close + run;
  }
  return out;
}

function isEscaped(text, index) {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) backslashes++;
  return backslashes % 2 === 1;
}

function isSpace(ch) {
  return ch === ' ' || ch === '\t';
}

function isDigit(ch) {
  return ch !== undefined && ch >= '0' && ch <= '9';
}

/**
 * Counts the math constructs on one line of already-stripped text, returning the new
 * multi-line state (or `null` when nothing is open).
 */
function countMathTokens(text, state, visit) {
  let i = 0;
  let open = state;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      // While a multi-line construct is already open, nothing inside it opens a second
      // one — an `align` block living inside a `$$` block is one expression, not two.
      if (text.startsWith('\\begin{', i)) {
        const close = text.indexOf('}', i + 7);
        if (!open && close > 0) {
          const env = text.slice(i + 7, close);
          if (MATH_ENVIRONMENTS.has(env)) {
            const endToken = `\\end{${env}}`;
            const end = text.indexOf(endToken, close + 1);
            if (end >= 0) visit();
            else open = { kind: 'env', env };
            i = close + 1;
            continue;
          }
        }
      }
      if (text.startsWith('\\end{', i)) {
        const close = text.indexOf('}', i + 5);
        if (close > 0 && open && open.kind === 'env' && open.env === text.slice(i + 5, close)) {
          visit();
          open = null;
          i = close + 1;
          continue;
        }
      }
      if (text[i + 1] === '[' && !open) {
        const end = text.indexOf('\\]', i + 2);
        if (end >= 0) visit();
        else open = { kind: 'parenBlock' };
        i = end >= 0 ? end + 2 : i + 2;
        continue;
      }
      if (text[i + 1] === ']') {
        if (open && open.kind === 'parenBlock') {
          visit();
          open = null;
        }
        i += 2;
        continue;
      }
      if (text[i + 1] === '(' && !open) {
        const end = text.indexOf('\\)', i + 2);
        if (end >= 0) visit();
        else open = { kind: 'parenInline' };
        i = end >= 0 ? end + 2 : i + 2;
        continue;
      }
      if (text[i + 1] === ')') {
        if (open && open.kind === 'parenInline') {
          visit();
          open = null;
        }
        i += 2;
        continue;
      }
      i += 2;
      continue;
    }
    if (ch === '$') {
      if (text[i + 1] === '$') {
        if (open && open.kind === 'dollarBlock') {
          visit();
          open = null;
          i += 2;
          continue;
        }
        const next = text.indexOf('$$', i + 2);
        if (next >= 0 && !isEscaped(text, next)) {
          visit();
          i = next + 2;
          continue;
        }
        if (text.slice(i + 2).trim() === '') {
          open = { kind: 'dollarBlock' };
          i = text.length;
          continue;
        }
        i += 2;
        continue;
      }
      // Inline `$…$`: rule (1) no whitespace after the opener.
      const after = text[i + 1];
      if (after === undefined || isSpace(after)) {
        i++;
        continue;
      }
      let j = i + 1;
      let closed = false;
      while (j < text.length) {
        if (text[j] === '$' && !isEscaped(text, j)) {
          const before = text[j - 1];
          const following = text[j + 1];
          // rule (2) no whitespace before the closer, rule (3) no digit after it.
          if (!isSpace(before) && !isDigit(following)) {
            visit();
            closed = true;
            i = j + 1;
            break;
          }
        }
        j++;
      }
      if (!closed) i++;
      continue;
    }
    i++;
  }
  return open;
}

/**
 * @param {string} source Raw file contents.
 * @returns {{counts: Record<string, number>, lines: number, bytes: number}}
 */
export function scanMarkdown(source) {
  const bytes = Buffer.byteLength(source, 'utf8');
  const counts = {
    headings: 0,
    tables: 0,
    codeBlocks: 0,
    math: 0,
    images: 0,
    footnotes: 0,
    taskLists: 0,
  };

  let body = source;
  const fm = FRONTMATTER_RE.exec(source);
  if (fm && fm.index === 0) body = source.slice(fm[0].length);

  const lines = body.split('\n');

  let fence = null;
  let inComment = false;
  let mathState = null;
  let containerOpen = false;
  let prevLineBlank = true;
  let prevNonBlank = null;
  let indentedRun = false;

  const addMath = () => {
    counts.math++;
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    // Blockquote content is the same block structure shifted right by its markers, so
    // every check below runs against the de-quoted text — a fence inside a `>` quote is
    // still a code block.
    const content = line.replace(QUOTE_PREFIX_RE, '');
    const isFreshLine = !QUOTE_PREFIX_RE.test(line);

    if (fence) {
      const close = new RegExp(`^ {0,3}\\${fence.char}{${fence.len},}[ \\t]*$`);
      if (close.test(content)) fence = null;
      prevLineBlank = true;
      continue;
    }

    if (inComment) {
      if (content.includes('-->')) inComment = false;
      prevLineBlank = true;
      continue;
    }

    const fenceOpen = FENCE_RE.exec(content);
    if (fenceOpen) {
      const info = fenceOpen[2].trim().split(/\s+/)[0] ?? '';
      if (MATH_FENCES.has(info)) counts.math++;
      else if (!MERMAID_FENCES.has(info)) counts.codeBlocks++;
      fence = { char: fenceOpen[1][0], len: fenceOpen[1].length };
      prevLineBlank = false;
      prevNonBlank = content;
      containerOpen = false;
      continue;
    }

    const commentAt = content.indexOf('<!--');
    if (commentAt >= 0 && !content.slice(commentAt).includes('-->')) {
      inComment = true;
      prevLineBlank = false;
      continue;
    }

    if (mathState) {
      mathState = countMathTokens(stripInlineCode(content), mathState, addMath);
      prevLineBlank = content.trim() === '';
      if (content.trim() !== '') prevNonBlank = content;
      continue;
    }

    if (content.trim() === '') {
      prevLineBlank = true;
      indentedRun = false;
      continue;
    }

    // --- indented code blocks (top level only) -----------------------------------
    if (
      isFreshLine &&
      /^(?:\t| {4,})/.test(line) &&
      !containerOpen &&
      (prevLineBlank || idx === 0) &&
      prevNonBlank !== null &&
      !LIST_ITEM_RE.test(prevNonBlank) &&
      !FOOTNOTE_DEF_RE.test(prevNonBlank) &&
      !/^[ \t]/.test(prevNonBlank)
    ) {
      if (!indentedRun) counts.codeBlocks++;
      indentedRun = true;
      prevLineBlank = false;
      prevNonBlank = line;
      continue;
    }

    // --- table delimiter row ------------------------------------------------------
    const isTableSep =
      content.includes('|') &&
      TABLE_SEP_RE.test(content) &&
      content.includes('-') &&
      prevNonBlank !== null &&
      prevNonBlank.includes('|');
    if (isTableSep) {
      counts.tables++;
    } else if (
      SETEXT_RE.test(content) &&
      !prevLineBlank &&
      prevNonBlank !== null &&
      !prevNonBlank.includes('|') &&
      !ATX_RE.test(prevNonBlank)
    ) {
      counts.headings++;
    }

    if (ATX_RE.test(content)) counts.headings++;
    if (TASK_RE.test(content)) counts.taskLists++;
    if (FOOTNOTE_DEF_RE.test(content)) {
      counts.footnotes++;
      containerOpen = true;
    } else if (LIST_ITEM_RE.test(content)) {
      containerOpen = true;
    } else if (!/^[ \t]/.test(content)) {
      containerOpen = false;
    }

    const visible = stripInlineCode(content);
    counts.images += (visible.match(/(^|[^\\!])!\[/g) ?? []).length;

    mathState = countMathTokens(visible, mathState, addMath);

    prevLineBlank = false;
    prevNonBlank = content;
    indentedRun = false;
  }

  return { counts, lines: body.split('\n').length - (body.endsWith('\n') ? 1 : 0), bytes };
}

/** Encoding/format checks shared by the validator. */
export function inspectFile(source) {
  return {
    hasBom: source.charCodeAt(0) === 0xfeff,
    hasCrlf: source.includes('\r\n'),
    hasLoneCr: /(?<!\r)\r/.test(source.replace(/\r\n/g, '')),
    endsWithNewline: source === '' ? false : source.endsWith('\n'),
    endsWithExactlyOneNewline: source === '' ? false : /[^\n]\n$/.test(source),
    bytes: Buffer.byteLength(source, 'utf8'),
  };
}
