import { describe, expect, it } from 'vitest';
import { rebuildMathSource } from '@/core/markdown/math-source';
import { createEngine, parseDocument } from '@/core/markdown/engine';

/**
 * Formula source reconstruction.
 *
 * The formula editor replaces a formula's body while preserving how the author wrote its
 * delimiters. A mistake here edits the user's file in a way they did not ask for, so every
 * delimiter form is pinned, including the multi-line ones whose layout must survive.
 */

const engine = createEngine();

/** Parses a document and returns its first expression paired with the block it occupies. */
function firstExpression(source: string) {
  const parsed = parseDocument(source, engine);
  const expr = parsed.math[0];
  if (!expr) throw new Error(`no math found in fixture: ${source}`);
  const block = parsed.normalizedSource.slice(expr.range.start.offset, expr.range.end.offset);
  return { expr, block, parsed };
}

describe('rebuildMathSource', () => {
  it('keeps inline dollar delimiters', () => {
    const { expr, block } = firstExpression('texte $a+b$ suite\n');
    expect(rebuildMathSource(expr, 'c+d', block)).toBe('$c+d$');
  });

  it('keeps display dollar delimiters on one line', () => {
    const { expr, block } = firstExpression('$$x^2$$\n');
    expect(rebuildMathSource(expr, 'y^2', block)).toBe('$$y^2$$');
  });

  it('preserves the multi-line layout of a display block', () => {
    // Collapsing the author's line breaks would make an edited file show up as a large diff.
    const { expr, block } = firstExpression('$$\na = b\n$$\n');
    expect(rebuildMathSource(expr, 'c = d', block)).toBe('$$\nc = d\n$$');
  });

  it('preserves paren delimiters', () => {
    const inline = firstExpression('text \\(a\\) end\n');
    expect(rebuildMathSource(inline.expr, 'b', inline.block)).toBe('\\(b\\)');

    const block = firstExpression('\\[a\\]\n');
    expect(rebuildMathSource(block.expr, 'b', block.block)).toBe('\\[b\\]');
  });

  it('preserves a LaTeX environment and its name', () => {
    const { expr, block } = firstExpression('\\begin{align}\na &= b\n\\end{align}\n');
    const rebuilt = rebuildMathSource(expr, 'x &= y', block);
    expect(rebuilt).toBe('\\begin{align}\nx &= y\n\\end{align}');
    expect(expr.environment).toBe('align');
  });

  it('rebuilds a math fence from the original fence characters', () => {
    const backticks = firstExpression('```math\na = b\n```\n');
    expect(rebuildMathSource(backticks.expr, 'c = d', backticks.block)).toBe('```math\nc = d\n```');

    // Tildes must stay tildes: the author chose them, and changing them is a silent edit.
    const tildes = firstExpression('~~~math\na = b\n~~~\n');
    expect(rebuildMathSource(tildes.expr, 'c = d', tildes.block)).toBe('~~~math\nc = d\n~~~');
  });

  it('preserves a fence indented inside a list item', () => {
    const { expr, block } = firstExpression('- item\n\n  ```math\n  a = b\n  ```\n');
    const rebuilt = rebuildMathSource(expr, 'c = d', block);
    expect(rebuilt).toContain('```math');
    expect(rebuilt?.startsWith('  '), 'the fence indent was lost').toBe(true);
  });

  it('refuses rather than guessing when the body cannot be located', () => {
    // A hand-built expression whose `raw` does not contain `tex` must not be rewritten.
    const result = rebuildMathSource(
      { raw: '$$$$', tex: 'not-present', delimiter: 'dollar-block', environment: undefined },
      'x',
      '$$$$',
    );
    expect(result).toBeNull();
  });

  it('does not mistake a character inside the opening delimiter for the body', () => {
    /*
     * Regression test for a source-corruption bug.
     *
     * `\begin{cases}` ends in `a`, so locating the body with a plain `indexOf` from the start
     * of the raw text found the delimiter instead. Editing a one-character body would then
     * have rewritten `\begin{cases}` itself, destroying the environment.
     */
    const { expr, block } = firstExpression('\\begin{cases}\na\n\\end{cases}\n');
    expect(expr.tex).toBe('a');
    const rebuilt = rebuildMathSource(expr, 'b', block);
    expect(rebuilt).toBe('\\begin{cases}\nb\n\\end{cases}');
    expect(rebuilt, 'the opening delimiter was rewritten').toContain('\\begin{cases}');
  });

  it('handles a body that repeats inside an align environment name', () => {
    // The same hazard with a longer body: `align` contains `g`, `a`, `n`, `i`, `l`.
    const { expr, block } = firstExpression('\\begin{align}\na\n\\end{align}\n');
    expect(rebuildMathSource(expr, 'g', block)).toBe('\\begin{align}\ng\n\\end{align}');
  });

  it('produces source that re-parses to the same expression body', () => {
    // The strongest available check: an edited formula must round-trip through the parser.
    const cases: { source: string; next: string }[] = [
      { source: 'text $a$ more\n', next: 'b+c' },
      { source: '$$\nx = 1\n$$\n', next: 'y = 2' },
      { source: '```math\na\n```\n', next: 'b' },
      { source: '\\begin{cases}\na\n\\end{cases}\n', next: 'b' },
      { source: '\\[z\\]\n', next: 'w' },
    ];

    for (const testCase of cases) {
      const { expr, block, parsed } = firstExpression(testCase.source);
      const rebuilt = rebuildMathSource(expr, testCase.next, block);
      expect(rebuilt, `could not rebuild ${testCase.source}`).not.toBeNull();

      /*
       * The replacement is passed as a *function*, not a string. In a `String.replace`
       * replacement string `$$` means a literal `$`, so a `$$…$$` formula would silently
       * lose half its delimiter and the document would no longer contain any math at all.
       * The application never hits this because it splices by slicing, but the test would
       * have "proved" a failure that does not exist.
       */
      const next = parseDocument(parsed.normalizedSource.replace(block, () => rebuilt!), engine);
      expect(next.math[0]?.tex, `body lost for ${testCase.source}`).toBe(testCase.next);
      // The edit must not have created or destroyed expressions.
      expect(next.math, `expression count changed for ${testCase.source}`).toHaveLength(1);
    }
  });
});
