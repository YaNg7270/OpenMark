/**
 * Export subsystem.
 *
 * Two products, both offline:
 *
 * - **One self-contained `.html` file** — `exportStandaloneHtml` (string) and
 *   `exportStandaloneHtmlToFile` (written to disk). Math is the same MathJax SVG the reader
 *   shows, diagrams are inline SVG, code carries one concrete theme, local images are
 *   `data:` URIs, and the file contains no script and no network reference.
 * - **A PDF** — `exportPdf`, printed from that same HTML by WebView2 in Rust.
 *
 * Every entry point has an explicit-error twin (`tryExport…`) returning a discriminated
 * result, and a report describing what happened to each image, formula and diagram, so a
 * caller can show the user what an export could not carry over.
 */

export { exportStandaloneHtml, exportStandaloneHtmlToFile, tryExportStandaloneHtml } from './html';
export { exportPdf, tryExportPdf } from './pdf';
export { desktopAssetReader, classifyImageSource, toDataUri, inlineImages } from './assets';
export { exportInvoke } from './ipc';
export { exportStylesheet } from './styles';
export { resolveCodeTheme } from './code';
export { ExportError, asExportError } from './types';
export type {
  AssetReader,
  ExportAsset,
  ExportErrorCode,
  ExportOutcome,
  ExportReport,
  ExportSourceCounts,
  ExportTheme,
  HtmlExport,
  HtmlFileExport,
  PdfExport,
  SelfContainedCheck,
  StandaloneHtmlOptions,
} from './types';
