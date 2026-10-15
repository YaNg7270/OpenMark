/**
 * Placeholder HTML emitted by the parser for constructs that need a second pass
 * (math typesetting, Mermaid rendering, syntax highlighting).
 *
 * Placeholders are deliberately **empty and side-effect free**: they carry only a
 * stable id and a CSS hook. The registry produced alongside the HTML holds the real
 * payload. That separation is what allows a 3 MB document to produce its HTML
 * synchronously and defer all expensive work to what is actually visible.
 *
 * Ids are `math-<n>`, `mermaid-<n>`, `code-<n>`, `env-<n>` and are assigned in
 * document order, which makes them stable for a given source document — the editor
 * can therefore key its decoration cache on them.
 */

/** Escapes text for use in an HTML attribute value (double-quoted). */
function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function mathPlaceholder(id: string, display: boolean): string {
  const cls = display ? 'om-math om-math--display' : 'om-math om-math--inline';
  return `<span class="${cls}" data-om-math="${escapeAttr(id)}" role="math"></span>`;
}

export function mermaidPlaceholder(id: string, kind: string): string {
  return (
    `<figure class="om-mermaid" data-om-mermaid="${escapeAttr(id)}" data-om-kind="${escapeAttr(kind)}">` +
    `<div class="om-mermaid__canvas" role="img"></div>` +
    `</figure>`
  );
}

export function codePlaceholder(id: string, lang: string): string {
  const langAttr = lang ? ` data-om-lang="${escapeAttr(lang)}"` : '';
  return (
    `<div class="om-code" data-om-code="${escapeAttr(id)}"${langAttr}>` +
    `<div class="om-code__toolbar" aria-hidden="true"></div>` +
    `<pre class="om-code__pre"><code class="om-code__code"></code></pre>` +
    `</div>`
  );
}

/**
 * Raw source that we refuse to interpret is re-emitted inside a `<pre>` so the
 * author can always see and recover exactly what they wrote. This is the concrete
 * implementation of "never silently drop source".
 */
export function preservedPlaceholder(id: string, kind: string): string {
  return (
    `<div class="om-preserved om-preserved--${escapeAttr(kind)}" data-om-preserved="${escapeAttr(id)}">` +
    `<pre class="om-preserved__pre"></pre>` +
    `</div>`
  );
}
