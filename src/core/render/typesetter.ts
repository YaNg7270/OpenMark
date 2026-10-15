import type { CodeBlock, Diagnostic, MathExpression, MathRenderError, MermaidDiagram } from '../markdown/types';
import { renderExpression, resetMathDocument, setEquationNumbering, needsNumbering } from '../math/mathjax';
import { renderDiagram } from './mermaid';
import { highlightCode } from './highlighter';
import { describeDiagram, nameFormula } from './accessible';

/**
 * Fills the parser's placeholders with real content.
 *
 * Everything expensive is deferred until a node approaches the viewport. That is what
 * keeps a multi-megabyte textbook responsive: the parser builds the full DOM in one
 * synchronous pass, and typesetting, diagram rendering and syntax highlighting only
 * happen where the reader is actually looking. A root margin one viewport tall means
 * content is ready before it scrolls in, so there is no visible pop-in.
 *
 * Two constraints shape the design:
 *
 *  - **Equation numbering forces document order.** AMS tags are assigned as expressions
 *    are converted, so a lazily-rendered subset would take numbers in viewport order.
 *    A document that uses `\label`/`\tag`/numbered environments is therefore typeset
 *    eagerly and sequentially instead.
 *  - **Work must be cancellable.** Opening another file aborts the run so a stale render
 *    cannot write into the new document.
 */

/** One viewport of look-ahead in every direction. */
const LAZY_MARGIN = '150% 0px';

/** Bounds concurrent work so a page of 200 formulas cannot monopolise the main thread. */
const MAX_CONCURRENCY = 6;

export interface TypesetCallbacks {
  onMathError?: (expr: MathExpression, error: MathRenderError) => void;
  onMermaidError?: (diagram: MermaidDiagram, message: string) => void;
  onDiagnostic?: (diagnostic: Diagnostic) => void;
}

export interface TypesetOptions extends TypesetCallbacks {
  /** The element containing the rendered markdown. */
  root: HTMLElement;
  /** The scrolling ancestor; used as the IntersectionObserver root. */
  scrollRoot?: HTMLElement | null;
  math: readonly MathExpression[];
  mermaid: readonly MermaidDiagram[];
  code: readonly CodeBlock[];
  dark: boolean;
  /** When set, aborts all pending work. */
  signal?: AbortSignal;
  /** Render everything immediately. Implied for documents with equation numbering. */
  eager?: boolean;
}

/** Resolves to the number of placeholders that were filled. */
export async function typesetPlaceholders(options: TypesetOptions): Promise<number> {
  const { root, signal } = options;

  const mathById = new Map(options.math.map((m) => [m.id, m]));
  const mermaidById = new Map(options.mermaid.map((m) => [m.id, m]));
  const codeById = new Map(options.code.map((c) => [c.id, c]));

  const targets: { node: HTMLElement; fill: () => Promise<void> }[] = [];

  for (const node of queryAll(root, 'data-om-math')) {
    const expr = mathById.get(node.dataset['omMath'] ?? '');
    if (expr) targets.push({ node, fill: () => fillMath(node, expr, options) });
  }
  for (const node of queryAll(root, 'data-om-mermaid')) {
    const diagram = mermaidById.get(node.dataset['omMermaid'] ?? '');
    if (diagram) targets.push({ node, fill: () => fillMermaid(node, diagram, options) });
  }
  for (const node of queryAll(root, 'data-om-code')) {
    const block = codeById.get(node.dataset['omCode'] ?? '');
    if (block) targets.push({ node, fill: () => fillCode(node, block) });
  }

  if (targets.length === 0) return 0;

  // Numbering and eager mode both require strict document order, which the lazy path
  // cannot guarantee.
  if (options.eager || needsNumbering(options.math.map((m) => m.tex))) {
    setEquationNumbering(true);
    resetMathDocument();
    let filled = 0;
    for (const target of targets) {
      if (signal?.aborted) break;
      await target.fill();
      filled++;
    }
    return filled;
  }

  setEquationNumbering(false);
  return scheduleLazily(targets, options);
}

/** Observes each placeholder and fills it as it approaches the viewport. */
function scheduleLazily(
  targets: readonly { node: HTMLElement; fill: () => Promise<void> }[],
  options: TypesetOptions,
): Promise<number> {
  const queue = new WorkQueue(MAX_CONCURRENCY);
  // Node → task, so an intersection is an O(1) lookup. A linear scan here would make a
  // document with thousands of placeholders quadratic.
  const byNode = new Map<Element, () => Promise<void>>(targets.map((t) => [t.node, t.fill]));

  return new Promise<number>((resolve) => {
    let settled = 0;
    let filled = 0;
    const total = targets.length;

    const finish = (observer: IntersectionObserver | null) => {
      observer?.disconnect();
      resolve(filled);
    };

    if (typeof IntersectionObserver === 'undefined') {
      // No observer (older engine or a test DOM): render everything rather than nothing.
      void queue
        .runAll(
          targets.map((t) => async () => {
            await t.fill();
            filled++;
          }),
        )
        .then(() => resolve(filled));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const node = entry.target as HTMLElement;
          observer.unobserve(node);
          const fill = byNode.get(node);
          if (!fill) continue;
          queue.add(async () => {
            if (options.signal?.aborted) return;
            await fill();
            filled++;
          });
          settled++;
          // Every node is now queued; finish once the queue drains.
          if (settled === total) void queue.drain().then(() => finish(observer));
        }
      },
      {
        root: options.scrollRoot ?? null,
        rootMargin: LAZY_MARGIN,
        threshold: 0,
      },
    );

    for (const target of targets) observer.observe(target.node);

    options.signal?.addEventListener('abort', () => finish(observer), { once: true });
  });
}

function queryAll(root: HTMLElement, attribute: string): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(`[${attribute}]`));
}

async function fillMath(node: HTMLElement, expr: MathExpression, options: TypesetOptions): Promise<void> {
  if (node.dataset['omFilled'] === '1') return;
  node.dataset['omFilled'] = '1';

  const width = node.parentElement?.clientWidth || options.root.clientWidth || 640;
  const outcome = await renderExpression(expr.tex, { display: expr.display, containerWidth: width });

  if (outcome.ok) {
    node.innerHTML = outcome.html;
    node.dataset['omState'] = 'ok';
    /*
     * MathJax's SVG carries `role="img"`, and an image role with no name is announced as an
     * unlabelled graphic — worse than the raw source, because the reader is told nothing.
     * The LaTeX is the honest label: it is not spoken mathematics, but it is information the
     * reader can act on, and it matches what the edit dialog shows for the same expression.
     */
    nameFormula(node, expr.tex);
    return;
  }

  // A failed formula keeps its source visible and offers an edit affordance: the
  // requirement is that a render failure never makes the LaTeX disappear.
  node.dataset['omState'] = 'error';
  node.classList.add('om-math--error');
  node.innerHTML = outcome.html || `<span class="om-math__source">${escapeHtml(expr.raw)}</span>`;
  node.title = outcome.error.message;
  options.onMathError?.(expr, outcome.error);
  options.onDiagnostic?.({
    /*
     * An undefined macro gets its own code because it is the one maths failure with an
     * obvious fix: the message names the macro and the remedy is almost always to correct a
     * spelling or load the package that defines it. Everything else stays generic.
     */
    code: /undefined control sequence|undefined macro/i.test(outcome.error.message)
      ? 'math-unknown-macro'
      : 'math-render-error',
    severity: 'error',
    message: outcome.error.message,
    detail: `公式源码：${expr.tex}`,
    range: expr.range,
    source: 'math',
    mathId: expr.id,
    excerpt: expr.raw.slice(0, 160),
  });
}

async function fillMermaid(node: HTMLElement, diagram: MermaidDiagram, options: TypesetOptions): Promise<void> {
  if (node.dataset['omFilled'] === '1') return;
  node.dataset['omFilled'] = '1';
  const canvas = node.querySelector<HTMLElement>('.om-mermaid__canvas') ?? node;

  const outcome = await renderDiagram(diagram, options.dark);
  if (outcome.ok) {
    canvas.innerHTML = outcome.svg;
    const svg = canvas.querySelector('svg');
    if (svg) {
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', describeDiagram(diagram));
    }
    return;
  }

  node.classList.add('om-mermaid--error');
  canvas.innerHTML = `<pre class="om-mermaid__source"><code>${escapeHtml(diagram.code)}</code></pre>`;
  options.onMermaidError?.(diagram, outcome.error ?? 'Unknown Mermaid error');
  options.onDiagnostic?.({
    code: 'mermaid-parse-error',
    severity: 'error',
    message: outcome.error ?? 'Mermaid diagram failed to render',
    detail: '图表源码已保留，修正后重新渲染。',
    range: diagram.range,
    source: 'mermaid',
    excerpt: diagram.code.slice(0, 160),
  });
}

async function fillCode(node: HTMLElement, block: CodeBlock): Promise<void> {
  if (node.dataset['omFilled'] === '1') return;
  node.dataset['omFilled'] = '1';

  const lang = node.dataset['omLang'] ?? '';
  const { html } = await highlightCode(block.code, lang);
  const codeEl = node.querySelector<HTMLElement>('.om-code__code');
  const preEl = node.querySelector<HTMLElement>('.om-code__pre');
  if (!codeEl) return;

  codeEl.innerHTML = html;
  // Shiki returns its own <pre> with the theme variables on it; hoist that onto our
  // <code> so the surrounding chrome (toolbar, border, radius) stays ours.
  const inner = codeEl.querySelector('pre');
  if (inner) {
    codeEl.innerHTML = inner.innerHTML;
    if (inner.className) codeEl.className = `om-code__code ${inner.className}`;
    if (inner.getAttribute('style')) codeEl.setAttribute('style', inner.getAttribute('style') ?? '');
  }
  if (lang && preEl) preEl.dataset['omLangLabel'] = lang;

  const toolbar = node.querySelector<HTMLElement>('.om-code__toolbar');
  if (toolbar) {
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'om-code__copy';
    copy.textContent = '复制';
    copy.addEventListener('click', () => {
      void navigator.clipboard.writeText(block.code).then(
        () => {
          copy.textContent = '已复制';
          window.setTimeout(() => {
            copy.textContent = '复制';
          }, 1400);
        },
        () => {
          copy.textContent = '复制失败';
        },
      );
    });
    toolbar.appendChild(copy);
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Minimal concurrency-limited task queue.
 *
 * Tasks are independent, idempotent and small; a semaphore is enough, and its only job is
 * to stop a document with hundreds of formulas from monopolising the main thread in one
 * burst.
 */
class WorkQueue {
  private active = 0;
  private readonly pending: (() => Promise<void>)[] = [];
  private drainWaiters: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  add(task: () => Promise<void>): void {
    this.pending.push(task);
    this.pump();
  }

  /** Runs every task to completion with the same concurrency limit. */
  async runAll(tasks: readonly (() => Promise<void>)[]): Promise<void> {
    for (const task of tasks) this.add(task);
    await this.drain();
  }

  private pump(): void {
    while (this.active < this.limit && this.pending.length > 0) {
      const task = this.pending.shift()!;
      this.active++;
      void task()
        .catch(() => undefined)
        .finally(() => {
          this.active--;
          if (this.active === 0 && this.pending.length === 0) this.releaseWaiters();
          else this.pump();
        });
    }
    if (this.active === 0 && this.pending.length === 0) this.releaseWaiters();
  }

  private releaseWaiters(): void {
    for (const resolve of this.drainWaiters.splice(0)) resolve();
  }

  /** Resolves when every queued task has settled. */
  drain(): Promise<void> {
    if (this.active === 0 && this.pending.length === 0) return Promise.resolve();
    return new Promise<void>((resolve) => this.drainWaiters.push(resolve));
  }
}
