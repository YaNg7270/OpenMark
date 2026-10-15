/**
 * PDF export.
 *
 * The document is printed by WebView2 itself (`ICoreWebView2_7::PrintToPdf`) from a hidden
 * webview, in Rust — see `src-tauri/src/export.rs`. Nothing here renders anything: this
 * module is the typed, error-reporting face of that command, so a caller never has to know
 * about COM or about the `String` error Tauri flattens.
 *
 * The command prints the HTML it is given, so the input is expected to be the output of
 * [`exportStandaloneHtml`](./html.ts) — one file, no scripts, no network references. That is
 * also what makes the print offline: there is nothing left to fetch.
 */

import { exportInvoke } from './ipc';
import { ExportError, asExportError, type ExportOutcome, type PdfExport } from './types';

/** Wire shape of `PdfReport` in `export.rs`; the Rust side serialises snake_case. */
interface PdfReportWire {
  path: string;
  size: number;
  page_count: number | null;
}

async function printToPdf(html: string, outputPath: string): Promise<PdfExport> {
  if (html.trim() === '') {
    throw new ExportError('nothing-to-export', 'there is no HTML to print');
  }
  const invoke = exportInvoke();
  if (!invoke) {
    throw new ExportError('pdf-unavailable', 'PDF export needs the desktop app (WebView2)');
  }

  let report: PdfReportWire;
  try {
    report = await invoke<PdfReportWire>('export_pdf', { html, outputPath });
  } catch (error) {
    throw new ExportError(
      'pdf-failed',
      error instanceof Error ? error.message : String(error),
      error,
    );
  }

  return {
    path: report.path,
    size: report.size,
    pageCount: report.page_count ?? null,
  };
}

/** Explicit success/failure result. */
export function tryExportPdf(html: string, outputPath: string): Promise<ExportOutcome<PdfExport>> {
  return printToPdf(html, outputPath).then(
    (result) => ({ ok: true as const, result }),
    (error: unknown) => ({ ok: false as const, error: asExportError(error) }),
  );
}

/** Prints `html` to `outputPath`. Rejects with an [`ExportError`] when it cannot. */
export async function exportPdf(html: string, outputPath: string): Promise<PdfExport> {
  return printToPdf(html, outputPath);
}
