import type { Diagnostic, MathExpression, MermaidDiagram, CodeBlock, PreservedBlock, DocRange } from './types';
import type { LineIndex } from './line-index';

/**
 * Accumulates everything the parser discovers, in document order.
 *
 * A single collector instance belongs to exactly one `render()` call. Ordering is
 * significant: ids are assigned sequentially as constructs are encountered, which is
 * what makes them stable and therefore cacheable by the editor.
 */
export class RenderCollector {
  readonly math: MathExpression[] = [];
  readonly mermaid: MermaidDiagram[] = [];
  readonly code: CodeBlock[] = [];
  readonly preserved: PreservedBlock[] = [];
  readonly diagnostics: Diagnostic[] = [];

  private mathSeq = 0;
  private mermaidSeq = 0;
  private codeSeq = 0;
  private preservedSeq = 0;

  constructor(readonly index: LineIndex) {}

  addMath(input: Omit<MathExpression, 'id' | 'order'> & { order: number }): MathExpression {
    const expr: MathExpression = { ...input, id: `math-${this.mathSeq++}` };
    this.math.push(expr);
    return expr;
  }

  addMermaid(input: Omit<MermaidDiagram, 'id'>): MermaidDiagram {
    const diagram: MermaidDiagram = { ...input, id: `mermaid-${this.mermaidSeq++}` };
    this.mermaid.push(diagram);
    return diagram;
  }

  addCode(input: Omit<CodeBlock, 'id'>): CodeBlock {
    const block: CodeBlock = { ...input, id: `code-${this.codeSeq++}` };
    this.code.push(block);
    return block;
  }

  addPreserved(input: Omit<PreservedBlock, 'id'>): PreservedBlock {
    const block: PreservedBlock = { ...input, id: `env-${this.preservedSeq++}` };
    this.preserved.push(block);
    return block;
  }

  addDiagnostic(diagnostic: Diagnostic): void {
    this.diagnostics.push(diagnostic);
  }

  /** Convenience for the common "something looks wrong at this range" case. */
  report(
    code: Diagnostic['code'],
    severity: Diagnostic['severity'],
    message: string,
    range: DocRange,
    extra?: Partial<Pick<Diagnostic, 'detail' | 'source' | 'mathId' | 'excerpt'>>,
  ): void {
    this.addDiagnostic({
      code,
      severity,
      message,
      range,
      source: extra?.source ?? 'markdown',
      ...(extra?.detail !== undefined ? { detail: extra.detail } : {}),
      ...(extra?.mathId !== undefined ? { mathId: extra.mathId } : {}),
      ...(extra?.excerpt !== undefined ? { excerpt: extra.excerpt } : {}),
    });
  }
}

/** Truncates an excerpt for panel display without splitting surrogate pairs. */
export function excerpt(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  // Avoid cutting in the middle of a surrogate pair.
  let end = max;
  const code = flat.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end -= 1;
  return flat.slice(0, end) + '…';
}
