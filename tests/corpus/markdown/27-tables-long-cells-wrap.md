# Tables With Long Cells

Some tables carry prose rather than short labels, and a renderer that
wraps long content inside a bounded column width is easier to read than
one that forces a horizontal scrollbar across the whole document.

| Description | Owner | Status |
| --- | --- | --- |
| This migration replaces the legacy scheduler with a queue driven worker pool that retries failed jobs with exponential backoff, records every attempt in the audit log, emits metrics for each retry decision, and finally moves permanently failing jobs into a dead letter table so that operators can inspect and replay them without touching production traffic, all before the next release window closes, keeping the public interface unchanged, the configuration schema stable, and the rollback path short enough to run during a routine maintenance slot. | platform | draft |
| Adds a read through cache | api | done |
| Rewrites the docs pipeline | docs | review |

The long cell above holds more than sixty words on a single source
line. Renderers are free to wrap it visually, but the parser must treat
the whole run as one cell and never as several columns. Whitespace
inside the cell is preserved as ordinary text.

A useful check is to count columns on the first and last data row. Both
must equal three, regardless of how wide the rendered first column
becomes. Width is a presentation concern; cell boundaries are a
parsing concern.

Wrapping is not the only strategy. Some tools truncate and add an
ellipsis, but that hides data, so wrapping remains the safer default
for reference material where every word may matter.

Column widths can also be derived from the longest cell in the whole
table. Doing so keeps the layout predictable and avoids the jumpy
reflow that appears when a renderer measures only the first row.

If a single cell grows even longer, it is usually a sign that the text
belongs in a paragraph rather than in a table at all.

The remaining cells in this fixture are intentionally terse, so that
the contrast between a short cell and a very long one is obvious at a
glance and easy to assert programmatically.

Two short rows follow the long one, which also proves that a wide cell
does not force the following rows to change shape.

A single long line is enough to exercise the wrapping path in a renderer.
