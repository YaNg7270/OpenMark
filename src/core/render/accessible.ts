import type { MathExpression, MermaidDiagram } from '../markdown/types';

/**
 * Accessible naming for the two rendered outputs that carry `role="img"`.
 *
 * Both are graphics as far as assistive technology is concerned, and an image role with no name
 * is announced as an unlabelled graphic — the reader is told nothing at all. This is a direct
 * consequence of disabling MathJax's semantic enrichment (see `core/math/mathjax.ts`), which is
 * what would otherwise supply the name.
 *
 * Shared rather than private to the typesetter because the formula dialog renders its preview
 * through `renderExpression` directly and never passes through the typesetter; the first version
 * of this labelling lived in the typesetter and the dialog's own preview therefore stayed
 * unlabelled.
 */

/** Names a typeset formula, using its LaTeX source as the label. */
export function nameFormula(node: HTMLElement, tex: string): void {
  /*
   * With the experimental speech setting on, MathJax's spoken description ("E equals m c
   * squared") is a far better name than the LaTeX source; it is on the outermost semantic node.
   */
  const spoken = node.querySelector('[data-semantic-speech-none]')?.getAttribute('data-semantic-speech-none');
  const label = spoken || tex;
  // The `<svg>` is the element MathJax gives `role="img"`, so it is the one that needs the name.
  const svg = node.querySelector('svg');
  if (svg) svg.setAttribute('aria-label', label);
  const container = node.querySelector('mjx-container');
  if (container) container.setAttribute('aria-label', label);
  // `role="math"` on a placeholder already says what this is; the label says which formula.
  node.setAttribute('aria-label', label);
}

/** Names a formula placeholder in place, for callers that only have the rendered element. */
export function nameFormulaNode(node: HTMLElement, expr: MathExpression): void {
  nameFormula(node, expr.tex);
}

/**
 * A short spoken description of a Mermaid diagram, derived from its own source.
 *
 * The labels the diagram draws are the only description available, and a truncated one beats
 * silence. `maxLabels` keeps the announcement short enough to be usable.
 */
export function describeDiagram(diagram: Pick<MermaidDiagram, 'code' | 'kind'>, maxLabels = 8): string {
  const labels = Array.from(diagram.code.matchAll(/[[\]{(]([^\]\n{}()|]{1,40})[\]})]/g))
    .map((match) => match[1]!.trim())
    .filter((label) => label.length > 0);
  const unique = [...new Set(labels)].slice(0, maxLabels);
  const head = `${diagram.kind} 图表`;
  return unique.length > 0 ? `${head}：${unique.join('、')}` : head;
}
