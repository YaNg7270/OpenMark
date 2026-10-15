/**
 * Contracts for the export subsystem.
 *
 * Everything here is deliberately serialisable: an export report is what the UI shows after
 * an export ("3 images inlined, 1 remote image left as a URL, 2 pages"), so it must survive
 * being put in the store without holding on to DOM nodes.
 */

import type { RenderResult } from '../markdown/types';

export type ExportTheme = 'light' | 'dark';

/** A local image the desktop backend read and base64-encoded. */
export interface ExportAsset {
  /** Absolute, symlink-resolved path that was read. */
  path: string;
  /** The path as the document authored it. */
  relativePath: string;
  mime: string;
  size: number;
  base64: string;
}

/**
 * Loads one image referenced by the document, relative to `documentPath`.
 *
 * Throws when it cannot be read, so the reason survives into the export report. Injectable
 * because the desktop backend does not exist in a plain browser, and because a test harness
 * needs to feed real bytes in.
 */
export type AssetReader = (documentPath: string, relativePath: string) => Promise<ExportAsset>;

/** How each construct in the document reached the export. */
export interface ExportSourceCounts {
  math: number;
  mermaid: number;
  code: number;
}

/** Result of the exporter's own check over the file it just produced. */
export interface SelfContainedCheck {
  /** Must be 0: a self-contained document has no behaviour to run. */
  scriptTags: number;
  /** Every external URL that remains, i.e. every possible network request. */
  externalUrls: string[];
  /**
   * `xmlns="http://www.w3.org/2000/svg"`-style declarations. They look like `http://` to a
   * naive grep but are namespace identifiers, not requests.
   */
  namespaceDeclarations: number;
  /** No scripts, and every remaining URL is a remote image the source itself referenced. */
  selfContained: boolean;
}

export interface ExportReport {
  title: string;
  theme: ExportTheme;
  /** Constructs taken from the live reading DOM, which is what the reader sees. */
  reusedFromLiveDom: ExportSourceCounts;
  /** Constructs typeset/diagrammed/highlighted by the exporter itself. */
  renderedDuringExport: ExportSourceCounts;
  inlinedImages: { relativePath: string; mime: string; size: number }[];
  /** Absolute URLs left in place, because fetching them would be a surprise request. */
  remoteImages: string[];
  missingImages: { relativePath: string; error: string }[];
  mathErrors: { id: string; message: string }[];
  mermaidErrors: { id: string; message: string }[];
  /** Script tags the exporter removed defensively. Always 0 for sanitised input. */
  strippedScripts: number;
  warnings: string[];
  verification: SelfContainedCheck;
}

/** One exported `.html` file, in memory. */
export interface HtmlExport {
  html: string;
  report: ExportReport;
}

/** One exported `.html` file, written to disk. */
export interface HtmlFileExport {
  path: string;
  size: number;
  report: ExportReport;
}

/** One exported `.pdf` file. */
export interface PdfExport {
  path: string;
  size: number;
  /** Pages counted from the PDF itself; `null` when it could not be parsed. */
  pageCount: number | null;
}

export type ExportErrorCode =
  /** No DOM: the exporter needs one to build and serialise HTML. */
  | 'no-dom'
  /** The render result has no HTML to export (nothing parsed yet). */
  | 'nothing-to-export'
  /** A local image could not be read while the caller asked for strictness. */
  | 'asset-read-failed'
  /** The output would not be self-contained and the caller asked for strictness. */
  | 'not-self-contained'
  /** The PDF command is unavailable (no desktop backend, or not Windows). */
  | 'pdf-unavailable'
  /** The desktop backend reported a failure. */
  | 'pdf-failed';

/** Every failure the export subsystem reports, with a stable code. */
export class ExportError extends Error {
  readonly code: ExportErrorCode;
  /** Underlying failure, when there was one. */
  readonly cause?: unknown;

  constructor(code: ExportErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'ExportError';
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

/** Explicit success/failure result — nothing in this subsystem has to throw to be handled. */
export type ExportOutcome<T> = { ok: true; result: T } | { ok: false; error: ExportError };

/** Normalises anything thrown into an [`ExportError`]. */
export function asExportError(error: unknown): ExportError {
  if (error instanceof ExportError) return error;
  return new ExportError(
    'nothing-to-export',
    error instanceof Error ? error.message : String(error),
    error,
  );
}

/** Options shared by the HTML entry points. */
export interface StandaloneHtmlOptions {
  /** The parsed document, as the reading pipeline produced it. */
  result: RenderResult;
  /** Absolute path of the `.md` file; relative images are resolved against its directory. */
  sourcePath: string;
  /**
   * The live reading DOM (`article.om-doc`).
   *
   * When given, already-typeset MathJax/Mermaid/Shiki output is copied out of it, so the
   * export is pixel-identical to what the reader sees. Whatever has not been typeset yet
   * (lazy rendering leaves off-screen formulas empty) is filled by the exporter.
   */
  liveRoot?: HTMLElement | null;
  /** Palette for the exported file. Defaults to `light`, which is what print wants. */
  theme?: ExportTheme;
  /** Overrides the title taken from frontmatter or the first heading. */
  title?: string;
  /** `lang` attribute of the exported document. Defaults to `zh-CN`, the app's UI language. */
  lang?: string;
  /** Overrides the desktop asset reader. */
  readAsset?: AssetReader;
}
