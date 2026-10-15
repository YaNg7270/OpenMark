import type { MarkdownIt, StateBlock } from 'markdown-it';

/**
 * Frontmatter capture.
 *
 * Frontmatter is *recognised but never interpreted destructively*: the token keeps the
 * raw text verbatim (closing fence included), and the YAML is parsed only to populate
 * metadata (title, author, theme hints). A file whose frontmatter is malformed still
 * round-trips byte-for-byte, because the writer works from the original source rather
 * than from the parse tree.
 *
 * Only a `---` fence on the **first line** counts, matching Jekyll/GitHub/Typora and
 * avoiding stealing thematic breaks later in a document. `...` is accepted as a closer
 * because that is the YAML document-end marker.
 */
export interface FrontmatterInfo {
  /** Text between the fences, fences excluded. */
  body: string;
  /** Fences plus body, byte-for-byte as authored. */
  raw: string;
  /** Which marker closed the block. */
  closer: '---' | '...';
}

export const FRONTMATTER_META = 'omFrontmatter' as const;

function frontmatterRule(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  if (startLine !== 0) return false;
  const src = state.src;
  const firstLineStart = state.bMarks[0]! + state.tShift[0]!;
  const firstLineEnd = state.eMarks[0]!;

  const opening = src.slice(firstLineStart, firstLineEnd).trimEnd();
  if (opening !== '---') return false;

  for (let line = 1; line < endLine; line++) {
    const lineStart = state.bMarks[line]! + state.tShift[line]!;
    const lineEnd = state.eMarks[line]!;
    const text = src.slice(lineStart, lineEnd).trimEnd();
    if (text !== '---' && text !== '...') continue;

    if (silent) return true;

    const bodyStart = firstLineEnd + 1; // step over the newline after the opening fence
    const token = state.push('om_frontmatter', 'div', 0);
    token.block = true;
    token.map = [0, line + 1];
    token.content = src.slice(bodyStart, lineStart);
    token.markup = opening;
    token.meta = {
      [FRONTMATTER_META]: {
        body: src.slice(bodyStart, lineStart),
        raw: src.slice(firstLineStart, lineEnd),
        closer: text as '---' | '...',
      } satisfies FrontmatterInfo,
    };
    state.line = line + 1;
    return true;
  }
  return false;
}

export function frontmatterPlugin(md: MarkdownIt): void {
  md.block.ruler.before('table', 'om_frontmatter', frontmatterRule, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });

  /*
   * Frontmatter is collapsed but present. Hiding it entirely (as Typora's preview does)
   * makes the metadata undiscoverable; showing it inline would push the title of every
   * blog post off screen. A collapsed `<details>` is neither, and it makes the
   * "nothing was dropped" guarantee visible to the reader.
   *
   * The body is escaped rather than injected: YAML is document content, not markup.
   */
  md.renderer.rules['om_frontmatter'] = (tokens, idx): string => {
    const info = (tokens[idx]!.meta as Record<string, unknown> | null)?.[FRONTMATTER_META] as
      | FrontmatterInfo
      | undefined;
    const body = info?.body ?? tokens[idx]!.content;
    const escaped = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return (
      '<details class="om-frontmatter" data-om-frontmatter="1">' +
      '<summary>YAML</summary>' +
      `<pre class="om-frontmatter__body">${escaped}</pre>` +
      '</details>'
    );
  };
}
