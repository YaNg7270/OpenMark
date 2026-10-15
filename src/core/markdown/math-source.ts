import type { MathExpression } from './types';

/**
 * Rebuilds the source text for a math expression after its body has been edited.
 *
 * The original delimiters, indentation and line structure are preserved by splicing the new
 * body into the **original raw text** rather than reassembling it from a template. This
 * matters because a `$$` block written across three lines should not silently collapse to
 * one, and because the delimiters an author chose are part of how their document reads.
 *
 * ## Locating the body
 *
 * The body is found by searching **after the opening delimiter**, not from the start of the
 * raw text. Searching from zero is wrong in a way that is easy to miss: `\begin{cases}` ends
 * in `a`, so an expression whose body is `a` would have its delimiter rewritten instead of
 * its body — corrupting the author's file. The search is also required to leave the closing
 * delimiter intact, and the edit is refused if either check fails.
 *
 * ## The one case that cannot be spliced
 *
 * A ` ```math ` fence holds only its *contents* in `raw`, while its range covers the whole
 * block, so the fence has to be rebuilt — from the original block text, so backticks stay
 * backticks, tildes stay tildes and the indentation of a fence inside a list item survives.
 */

/** Delimiter widths, in UTF-16 code units. `latex-env` is computed from the environment name. */
const DELIMITER_WIDTHS: Record<string, { prefix: number; suffix: number }> = {
  dollar: { prefix: 1, suffix: 1 },
  'dollar-block': { prefix: 2, suffix: 2 },
  'paren-inline': { prefix: 2, suffix: 2 },
  'paren-block': { prefix: 2, suffix: 2 },
};

/**
 * Returns the replacement text for an expression's range, or `null` when the source cannot be
 * rebuilt safely. Callers must refuse the edit rather than guess: guessing here edits the
 * user's document in a way they did not ask for.
 */
export function rebuildMathSource(
  expr: Pick<MathExpression, 'raw' | 'tex' | 'delimiter' | 'environment'>,
  newTex: string,
  originalBlock: string,
): string | null {
  if (expr.delimiter === 'math-fence') {
    const opening = /^([ \t]*)(`{3,}|~{3,})[^\n]*\n/.exec(originalBlock);
    if (!opening) return null;
    const [, indent = '', marker = '```'] = opening;
    const body = newTex.replace(/\n+$/, '');
    return `${indent}${marker}math\n${body}\n${indent}${marker}`;
  }

  const widths =
    expr.delimiter === 'latex-env'
      ? latexEnvironmentWidths(expr.environment)
      : DELIMITER_WIDTHS[expr.delimiter];
  if (!widths) return null;

  const { prefix, suffix } = widths;
  const index = expr.raw.indexOf(expr.tex, prefix);
  // The body must sit strictly between the delimiters; anything else means the raw text and
  // the body disagree and rewriting would be a guess.
  if (index < prefix || index + expr.tex.length > expr.raw.length - suffix) return null;

  return expr.raw.slice(0, index) + newTex + expr.raw.slice(index + expr.tex.length);
}

function latexEnvironmentWidths(environment: string | undefined): { prefix: number; suffix: number } | null {
  if (!environment) return null;
  return { prefix: `\\begin{${environment}}`.length, suffix: `\\end{${environment}}`.length };
}
