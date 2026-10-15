/**
 * Shared contracts for the markdown reading pipeline.
 *
 * Everything the pipeline emits that a *later* stage has to finish (math, diagrams,
 * syntax highlighting) is emitted as an **empty placeholder element plus a registry
 * entry**. That indirection is what makes incremental rendering possible: the HTML
 * for a 3 MB document is produced synchronously, while the expensive work is done
 * only for nodes that scroll into view.
 */

/** A single point in the original markdown source. Lines and columns are 1-based. */
export interface DocPosition {
  /** 1-based line number. */
  line: number;
  /** 1-based column, in UTF-16 code units. */
  column: number;
  /** 0-based offset into the source string. */
  offset: number;
}

export interface DocRange {
  start: DocPosition;
  end: DocPosition;
}

export type Severity = 'error' | 'warning' | 'info';

/**
 * A problem found while reading a document. Every diagnostic must be actionable:
 * it carries a source range so the UI can jump to it, and a stable `code` so tests
 * can assert on categories rather than on prose.
 */
export interface Diagnostic {
  code: DiagnosticCode;
  severity: Severity;
  message: string;
  /** Longer explanation / suggested fix, shown in the diagnostics panel. */
  detail?: string;
  range: DocRange;
  /** Which subsystem found it. */
  source: 'markdown' | 'math' | 'mermaid' | 'asset' | 'encoding';
  /** Set when the diagnostic points at a math expression in the registry. */
  mathId?: string;
  /** The offending source text, already truncated for display. */
  excerpt?: string;
}

export type DiagnosticCode =
  // --- markdown structure ---
  | 'unclosed-fence'
  | 'unclosed-math'
  | 'unclosed-html-comment'
  | 'invalid-frontmatter'
  | 'tab-indent-in-list'
  | 'inconsistent-list-marker'
  | 'dangling-reference-link'
  | 'duplicate-footnote'
  | 'duplicate-heading-anchor'
  | 'setext-heading-ambiguity'
  // --- math ---
  | 'math-render-error'
  | 'math-unknown-macro'
  | 'math-unbalanced-braces'
  | 'math-unbalanced-environment'
  | 'math-unsupported-environment'
  | 'math-display-in-inline'
  | 'math-suspicious-delimiter'
  // --- assets ---
  | 'image-missing'
  | 'image-path-escapes-root'
  | 'image-remote'
  | 'link-remote'
  // --- safety ---
  | 'html-sanitized'
  | 'script-removed'
  // --- mermaid ---
  | 'mermaid-parse-error'
  // --- encoding ---
  | 'bom-detected'
  | 'crlf-detected'
  | 'mixed-line-endings'
  | 'invalid-utf8'
  | 'non-utf8-encoding';

export type MathDelimiter =
  | 'dollar' //        $...$
  | 'dollar-block' //  $$...$$  (own line or inline)
  | 'paren-inline' //  \(...\)
  | 'paren-block' //   \[...\]
  | 'latex-env' //     \begin{equation}...\end{equation}
  | 'math-fence'; //   ```math

/** Per-expression MathJax failure, surfaced instead of silently dropping the formula. */
export interface MathRenderError {
  name: string;
  message: string;
  /** Extra context MathJax provides, e.g. the macro that is undefined. */
  detail?: string;
}

export interface MathExpression {
  /** Stable id, unique within one render: `math-<n>`. */
  id: string;
  /** UTF-16 offset of the raw expression in the source; the ordering key. */
  order: number;
  /** Exact LaTeX body, delimiters stripped. */
  tex: string;
  /** Exact source text including delimiters, byte-for-byte as authored. */
  raw: string;
  display: boolean;
  delimiter: MathDelimiter;
  range: DocRange;
  /** `\begin{align}`-style environment name, when the source used one. */
  environment?: string;
  /** Populated by the typesetter when MathJax reports a failure. */
  error?: MathRenderError;
}

export interface MermaidDiagram {
  id: string;
  order: number;
  code: string;
  /** `flowchart`, `sequenceDiagram`, `classDiagram`, … */
  kind: string;
  range: DocRange;
}

export interface CodeBlock {
  id: string;
  order: number;
  code: string;
  /** Normalized language id; empty string when the fence had no info string. */
  lang: string;
  /** The fence's full info string, verbatim (may contain meta like `title=...`). */
  info: string;
  range: DocRange;
  /** True when Shiki has no grammar for `lang`; render as plain text. */
  plain: boolean;
}

/** A heading used to build the outline/sidebar and the reading progress model. */
export interface OutlineEntry {
  id: string;
  level: number;
  text: string;
  /** Plain text with inline markdown stripped, for search. */
  plainText: string;
  range: DocRange;
  /** Nested children, ordered. */
  children: OutlineEntry[];
}

export interface HeadingNumbering {
  /** e.g. `1.2.3` */
  label: string;
  entryId: string;
}

/**
 * A block of the source that the pipeline refused to interpret.
 * These are re-emitted verbatim so nothing is ever silently dropped.
 */
export interface PreservedBlock {
  id: string;
  kind: 'frontmatter' | 'html-comment' | 'raw-html' | 'unknown-fence';
  raw: string;
  range: DocRange;
}

/**
 * One top-level block of the source, with everything needed to edit it in place.
 *
 * This is what makes Typora-style instant rendering possible without a second
 * representation of the document: a block carries its **exact source text**, the offset
 * range that text occupies, and the HTML that text renders to. Editing a block means
 * splicing `source` into the authoritative document at `range`, so fidelity is guaranteed
 * by construction — there is no serialiser that could normalise anything.
 *
 * `range` is expressed against the LF-normalised source; the editor converts back to the
 * file's own line-ending style when it splices.
 */
export interface SourceBlock {
  /** Stable within one render: `block-<index>`. */
  id: string;
  /** 0-based position in the document. */
  index: number;
  range: DocRange;
  /** Exact source text of the block, byte-for-byte as authored. */
  source: string;
  /** Coarse classification, used for editor affordances and diagnostics. */
  kind: SourceBlockKind;
  /** HTML for this block alone, with the same placeholder ids as the full document. */
  html: string;
}

export type SourceBlockKind =
  | 'frontmatter'
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'blockquote'
  | 'table'
  | 'code'
  | 'diagram'
  | 'math'
  | 'rule'
  | 'html'
  | 'footnotes'
  | 'other';

export interface RenderStats {
  sourceBytes: number;
  sourceLines: number;
  /** Wall-clock milliseconds spent parsing. */
  parseMs: number;
  mathCount: number;
  mermaidCount: number;
  codeCount: number;
  headingCount: number;
  wordCount: number;
  /** Estimated reading time in minutes (CJK-aware). */
  readingMinutes: number;
}

/**
 * The complete, serialisable result of reading a markdown document.
 *
 * `html` is *sanitised* and safe to inject. Every construct that needs a second
 * pass has a registry entry keyed by the placeholder's `data-om-*` attribute.
 */
export interface RenderResult {
  html: string;
  /** Top-level blocks, each with its own source range and HTML, for in-place editing. */
  blocks: SourceBlock[];
  math: MathExpression[];
  mermaid: MermaidDiagram[];
  code: CodeBlock[];
  outline: OutlineEntry[];
  preserved: PreservedBlock[];
  diagnostics: Diagnostic[];
  stats: RenderStats;
  /** YAML frontmatter parsed into a plain object, when present and valid. */
  frontmatter: Record<string, unknown> | null;
}

/**
 * A parsed document: the render result plus the normalised source its offsets refer to.
 *
 * Lives here rather than beside the parser because three other modules — the reading view,
 * the instant editor and the export layer — all consume it, and none of them should have to
 * reach into the parser's internals.
 */
export interface ParsedDocument extends RenderResult {
  /** LF-normalised source. Every offset in this result is an offset into this string. */
  normalizedSource: string;
}

export function emptyStats(): RenderStats {
  return {
    sourceBytes: 0,
    sourceLines: 0,
    parseMs: 0,
    mathCount: 0,
    mermaidCount: 0,
    codeCount: 0,
    headingCount: 0,
    wordCount: 0,
    readingMinutes: 0,
  };
}
