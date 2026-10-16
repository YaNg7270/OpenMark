//! Export subsystem.
//!
//! Two things the frontend cannot do itself:
//!
//! - **Read a local image next to the document and hand it back as base64**, so the
//!   self-contained HTML exporter can inline it as a `data:` URI. An exported document must
//!   not depend on the `asset:` protocol, which only exists inside this app. Only images
//!   within the document's folder (or one level up) are read — see `read_export_asset`.
//! - **Print the exported document to PDF, silently, offline.** `ICoreWebView2_7::PrintToPdf`
//!   is the only API on this platform that does it without a dialog, and it can only be
//!   reached through COM interop from inside the webview (`Webview::with_webview`). Tauri's
//!   own `WebviewWindow::print()` degrades to `window.print()`, which opens the WebView2
//!   print preview and needs a user click.
//!
//! ## Why a second, hidden webview
//!
//! `PrintToPdf` prints *the document the webview is currently showing*. Printing the
//! reader's own webview would mean throwing away the open document, or racing the user's
//! scroll position, so an export opens a hidden window, loads the exported file, prints it
//! and closes again.
//!
//! ## Why the page is loaded from a URL instead of `NavigateToString`
//!
//! `NavigateToString` takes the markup as a string with a 2 MB ceiling, and an exported
//! document with inlined images passes that trivially. A temporary `.html` file next to the
//! output has no such limit and is deleted on the way out, including on the error paths.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

/// A local asset resolved for the HTML exporter, already base64-encoded.
///
/// Base64 rather than raw bytes because the only consumer is a `data:` URI: encoding in
/// Rust avoids materialising a multi-megabyte byte array *and* a string in the webview.
#[derive(Debug, Serialize)]
pub struct ExportAsset {
    /// Absolute, symlink-resolved path that was read.
    pub path: String,
    /// The path as the document authored it, echoed back so a report can name it.
    pub relative_path: String,
    /// Magic-byte sniffed MIME type, falling back to the extension.
    pub mime: String,
    pub size: u64,
    pub base64: String,
}

/// Outcome of a PDF export.
#[derive(Debug, Serialize)]
pub struct PdfReport {
    /// Absolute path of the produced PDF.
    pub path: String,
    pub size: u64,
    /// Pages counted from the PDF's page objects, when the file could be parsed.
    pub page_count: Option<u32>,
}

// ------------------------------------------------------------------- assets

/// Reads an image referenced by the document and returns it ready to inline.
///
/// `relative_path` is resolved against the *document's* directory, which is the base the
/// Markdown reader uses for `![](./fig-1.png)`. Absolute paths and URLs are rejected: a
/// remote image must stay a remote URL in the export — so the reader can tell the user the
/// file is not self-contained — and must never be fetched here.
#[tauri::command]
pub fn read_export_asset(document_path: String, relative_path: String) -> Result<ExportAsset, String> {
    let relative = relative_path.trim();
    if relative.is_empty() {
        return Err("image path is empty".to_string());
    }
    if has_uri_scheme(relative) || relative.starts_with("//") {
        return Err(format!("not a local path: {relative}"));
    }
    if Path::new(relative).is_absolute() {
        return Err(format!("absolute paths are not inlined: {relative}"));
    }

    let document = PathBuf::from(&document_path);
    let directory = match document.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent.to_path_buf(),
        _ => return Err(format!("document path has no directory: {document_path}")),
    };

    // Windows accepts `/` as a separator, so the authored path is joined verbatim; that
    // keeps `figures/../fig-1.png` resolving exactly as the reader resolves it.
    let candidate = directory.join(relative);
    let resolved = fs::canonicalize(&candidate).map_err(|err| {
        format!(
            "cannot resolve {} (from {}): {err}",
            candidate.display(),
            document_path
        )
    })?;
    /*
     * Containment, checked on the canonical path so `..`, symlinks and junctions are already
     * resolved. The boundary is the reader's rule (`classifyRelativePath`): a net climb of one
     * level is how documents are organised (`../assets/logo.png`), two or more has left the
     * document's neighbourhood. Without this, a received document could reference any file the
     * user can read and the export would bake it into a file they then send to someone else.
     */
    let boundary = directory.parent().filter(|p| !p.as_os_str().is_empty()).unwrap_or(&directory);
    let boundary = fs::canonicalize(boundary)
        .map_err(|err| format!("cannot resolve {}: {err}", boundary.display()))?;
    if !resolved.starts_with(&boundary) {
        return Err(format!(
            "outside the document's folder: {relative} (resolves to {})",
            resolved.display()
        ));
    }
    if !resolved.is_file() {
        return Err(format!("not a file: {}", resolved.display()));
    }

    let bytes =
        fs::read(&resolved).map_err(|err| format!("cannot read {}: {err}", resolved.display()))?;
    let mime = sniff_mime(&resolved, &bytes);
    // Only pictures are inlined: anything else referenced as an image would be shipped as an
    // opaque `data:` URI the recipient can decode but the author never sees.
    if !mime.starts_with("image/") {
        return Err(format!("not an image: {relative} ({mime})"));
    }
    Ok(ExportAsset {
        path: display_path(&resolved)?,
        relative_path,
        mime,
        size: bytes.len() as u64,
        base64: base64_encode(&bytes),
    })
}

fn display_path(path: &Path) -> Result<String, String> {
    path.to_str()
        .map(str::to_string)
        .ok_or_else(|| format!("path is not valid UTF-8: {path:?}"))
}

/// True when the value starts with a URI scheme (`http:`, `data:`, `asset:`, …).
fn has_uri_scheme(value: &str) -> bool {
    let mut chars = value.chars();
    match chars.next() {
        Some(first) if first.is_ascii_alphabetic() => {}
        _ => return false,
    }
    for ch in chars {
        match ch {
            ':' => return true,
            c if c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.') => continue,
            _ => return false,
        }
    }
    false
}

/// Magic bytes first (a wrong extension cannot fool them), extension second.
fn sniff_mime(path: &Path, bytes: &[u8]) -> String {
    const SIGNATURES: &[(&[u8], &str)] = &[
        (b"\x89PNG\r\n\x1a\n", "image/png"),
        (b"\xff\xd8\xff", "image/jpeg"),
        (b"GIF87a", "image/gif"),
        (b"GIF89a", "image/gif"),
        (b"\x00\x00\x01\x00", "image/x-icon"),
        (b"\x00\x00\x02\x00", "image/x-icon"),
        (b"BM", "image/bmp"),
    ];
    for (signature, mime) in SIGNATURES {
        if bytes.starts_with(signature) {
            return (*mime).to_string();
        }
    }
    if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        return "image/webp".to_string();
    }
    // SVG is text; the XML declaration or the root element is the only reliable marker.
    let head = String::from_utf8_lossy(&bytes[..bytes.len().min(1024)]).to_ascii_lowercase();
    if head.contains("<svg") {
        return "image/svg+xml".to_string();
    }

    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg" | "jpeg" | "jpe" | "jfif") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("bmp") => "image/bmp",
        Some("ico") => "image/x-icon",
        Some("svg") => "image/svg+xml",
        Some("avif") => "image/avif",
        Some("tif" | "tiff") => "image/tiff",
        Some(_) | None => "application/octet-stream",
    }
    .to_string()
}

/// Standard base64 with padding.
///
/// Hand-rolled rather than added as a dependency: the whole requirement is one encode call
/// on a byte slice, and the alphabet plus three shifts is less code than a dependency entry.
fn base64_encode(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b0 = u32::from(chunk[0]);
        let b1 = u32::from(chunk.get(1).copied().unwrap_or(0));
        let b2 = u32::from(chunk.get(2).copied().unwrap_or(0));
        let triple = (b0 << 16) | (b1 << 8) | b2;

        out.push(char::from(ALPHABET[(triple >> 18) as usize & 0x3f]));
        out.push(char::from(ALPHABET[(triple >> 12) as usize & 0x3f]));
        out.push(if chunk.len() > 1 {
            char::from(ALPHABET[(triple >> 6) as usize & 0x3f])
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            char::from(ALPHABET[triple as usize & 0x3f])
        } else {
            '='
        });
    }
    out
}

// --------------------------------------------------------------------- pdf

/// Prints `html` to a PDF at `output_path`, silently and offline.
///
/// `html` is expected to be the output of the standalone HTML exporter: a single file with
/// no scripts and no network references.
#[tauri::command]
pub async fn export_pdf(
    app: tauri::AppHandle,
    html: String,
    output_path: String,
) -> Result<PdfReport, String> {
    #[cfg(target_os = "windows")]
    {
        print_html_to_pdf(app, html, output_path).await
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, html, output_path);
        Err("PDF export is implemented for Windows (WebView2) only".to_string())
    }
}

/// How long the local export page is given to load before the attempt is abandoned.
#[cfg(target_os = "windows")]
const LOAD_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(60);

/// Generous, because a long document with hundreds of formulas takes real work to lay out.
#[cfg(target_os = "windows")]
const PRINT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(300);

/// 8.5 × 11 in at 96 dpi. The print pass paginates from the *settings* page size; a
/// sensibly sized controller only avoids a reflow when printing starts.
#[cfg(target_os = "windows")]
const PAGE_PIXELS: (f64, f64) = (816.0, 1056.0);

#[cfg(target_os = "windows")]
async fn print_html_to_pdf(
    app: tauri::AppHandle,
    html: String,
    output_path: String,
) -> Result<PdfReport, String> {
    let target = PathBuf::from(&output_path);
    let directory = target
        .parent()
        .filter(|dir| !dir.as_os_str().is_empty())
        .map(PathBuf::from)
        .ok_or_else(|| format!("export path has no directory: {output_path}"))?;
    if !directory.is_dir() {
        return Err(format!("directory does not exist: {}", directory.display()));
    }

    let stamp = unique_stamp();
    // The PDF is written to a hidden sibling first and renamed over the target once it
    // exists, so a failed or partial print cannot destroy the previous export.
    let print_path = directory.join(format!(".openmark-print-{stamp}.pdf"));
    let source = directory.join(format!(".openmark-export-{stamp}.html"));
    let _ = fs::remove_file(&print_path);
    fs::write(&source, html.as_bytes())
        .map_err(|err| format!("cannot write the export page {}: {err}", source.display()))?;

    let outcome = print_loaded_page(&app, &source, &print_path).await;
    // The temporary page goes away on every path, including the failures.
    let _ = fs::remove_file(&source);

    if let Err(message) = outcome {
        let _ = fs::remove_file(&print_path);
        return Err(message);
    }

    if let Err(err) = replace_file(&print_path, &target) {
        let _ = fs::remove_file(&print_path);
        return Err(err);
    }

    let size = fs::metadata(&target)
        .map_err(|err| format!("cannot stat {}: {err}", target.display()))?
        .len();
    let page_count = fs::read(&target).ok().and_then(|bytes| pdf_page_count(&bytes));

    Ok(PdfReport {
        path: display_path(&target)?,
        size,
        page_count,
    })
}

/// Creates the hidden export webview, waits for the page, prints it, then closes it.
#[cfg(target_os = "windows")]
async fn print_loaded_page(
    app: &tauri::AppHandle,
    source: &Path,
    print_path: &Path,
) -> Result<(), String> {
    use std::sync::{mpsc, Mutex};

    use tauri::webview::PageLoadEvent;
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    let url = tauri::Url::from_file_path(source)
        .map_err(|_| format!("cannot build a file URL for {}", source.display()))?;
    let label = format!("openmark-export-{}", unique_stamp());

    // `on_page_load` must be `Send + Sync`; a channel sender is only `Send`, so it is
    // locked. The lock is never contended: the handler fires from the UI thread.
    let (load_tx, load_rx) = mpsc::channel::<()>();
    let load_tx = Mutex::new(load_tx);

    let window = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(url))
        .title("OpenMark — PDF export")
        .visible(false)
        .skip_taskbar(true)
        .inner_size(PAGE_PIXELS.0, PAGE_PIXELS.1)
        .on_page_load(move |_window, payload| {
            if matches!(payload.event(), PageLoadEvent::Finished) {
                if let Ok(tx) = load_tx.lock() {
                    let _ = tx.send(());
                }
            }
        })
        .build()
        .map_err(|err| format!("cannot create the export webview: {err}"))?;

    // Everything past this point closes the window, so a failed export cannot leave a
    // stray window (or a stray WebView2 process) behind.
    let outcome = drive_print(&window, print_path, load_rx).await;
    let _ = window.close();
    outcome
}

/// Waits for the page load, starts the print, waits for it to finish.
#[cfg(target_os = "windows")]
async fn drive_print(
    window: &tauri::WebviewWindow,
    print_path: &Path,
    load_rx: std::sync::mpsc::Receiver<()>,
) -> Result<(), String> {
    use std::sync::mpsc::{self, RecvTimeoutError};

    use tauri::async_runtime::spawn_blocking;

    // 1. The page has to exist before printing it.
    spawn_blocking(move || load_rx.recv_timeout(LOAD_TIMEOUT))
        .await
        .map_err(|err| format!("export webview task failed: {err}"))?
        .map_err(|err| match err {
            RecvTimeoutError::Timeout => {
                "timed out waiting for the exported page to load".to_string()
            }
            RecvTimeoutError::Disconnected => {
                "the export webview closed before the page loaded".to_string()
            }
        })?;

    // 2. Printing itself runs on the UI thread, so this must not block it: the closure
    //    only *starts* the print, and the completion handler signals on its own.
    let (done_tx, done_rx) = mpsc::channel::<Result<(), String>>();
    let sync_err = done_tx.clone();
    let path = print_path.to_path_buf();
    window
        .with_webview(move |webview| {
            if let Err(message) =
                start_print(&webview.controller(), &webview.environment(), &path, done_tx)
            {
                let _ = sync_err.send(Err(message));
            }
        })
        .map_err(|err| format!("cannot reach the export webview: {err}"))?;

    spawn_blocking(move || done_rx.recv_timeout(PRINT_TIMEOUT))
        .await
        .map_err(|err| format!("PDF export task failed: {err}"))?
        .map_err(|err| match err {
            RecvTimeoutError::Timeout => "timed out waiting for the PDF to be written".to_string(),
            RecvTimeoutError::Disconnected => {
                "the export webview closed before printing finished".to_string()
            }
        })?
}

/// Starts `PrintToPdf`; the outcome arrives through `done` when WebView2 finishes.
#[cfg(target_os = "windows")]
fn start_print(
    controller: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Controller,
    environment: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Environment,
    path: &Path,
    done: std::sync::mpsc::Sender<Result<(), String>>,
) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;

    use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2Environment6, ICoreWebView2_7};
    use webview2_com::PrintToPdfCompletedHandler;
    use windows::core::{Interface, PCWSTR};

    let wide: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    // SAFETY: every call below is a COM call on interfaces we hold for the duration of the
    // call. The completion handler is owned by WebView2 until it fires, which is what keeps
    // the captured sender alive.
    unsafe {
        let core = controller
            .CoreWebView2()
            .map_err(|err| format!("the export webview has no core view: {err}"))?;
        let printable: ICoreWebView2_7 = core
            .cast()
            .map_err(|err| format!("this WebView2 runtime cannot export PDFs silently: {err}"))?;

        let settings = environment
            .cast::<ICoreWebView2Environment6>()
            .map_err(|err| format!("this WebView2 runtime has no print settings: {err}"))?
            .CreatePrintSettings()
            .map_err(|err| format!("cannot create print settings: {err}"))?;
        // Without backgrounds, code blocks, table headers and diagram canvases print as
        // blank paper.
        settings
            .SetShouldPrintBackgrounds(true)
            .map_err(|err| format!("cannot enable printed backgrounds: {err}"))?;
        settings
            .SetShouldPrintHeaderAndFooter(false)
            .map_err(|err| format!("cannot disable the print header: {err}"))?;

        let handler = PrintToPdfCompletedHandler::create(Box::new(move |error, succeeded| {
            let outcome = match error {
                Ok(()) if succeeded => Ok(()),
                Ok(()) => Err("WebView2 reported that no PDF was written".to_string()),
                Err(err) => Err(format!("PrintToPdf failed: {err}")),
            };
            let _ = done.send(outcome);
            Ok(())
        }));

        printable
            .PrintToPdf(PCWSTR(wide.as_ptr()), &settings, &handler)
            .map_err(|err| format!("cannot start the PDF export: {err}"))?;
    }
    Ok(())
}

/// Renames over the target, clearing the way first: on Windows `rename` fails when the
/// destination exists.
fn replace_file(from: &Path, to: &Path) -> Result<(), String> {
    if to.exists() {
        fs::remove_file(to).map_err(|err| format!("cannot replace {}: {err}", to.display()))?;
    }
    fs::rename(from, to).map_err(|err| format!("cannot move the exported PDF into place: {err}"))
}

/// Nanoseconds since the epoch plus the process id — unique across concurrent exports.
fn unique_stamp() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    format!("{}-{nanos}", std::process::id())
}

/// Pages in a PDF, counted structurally.
///
/// A PDF's page *objects* are plain text in the file (`/Type /Page`); only their content
/// streams are compressed, so counting them is reliable. `/Count` — the number the page
/// tree advertises — is the cross-check and the fallback.
fn pdf_page_count(bytes: &[u8]) -> Option<u32> {
    let pages = count_page_objects(bytes);
    match (pages, max_count_value(bytes)) {
        (0, None) => None,
        (0, Some(advertised)) => Some(advertised),
        (pages, _) => Some(pages as u32),
    }
}

/// Occurrences of `/Type /Page` that are not the `/Type /Pages` node.
fn count_page_objects(bytes: &[u8]) -> usize {
    const NEEDLE: &[u8] = b"/Type /Page";
    let mut count = 0;
    let mut start = 0;
    while let Some(offset) = find(&bytes[start..], NEEDLE) {
        let end = start + offset + NEEDLE.len();
        let next = bytes.get(end).copied().unwrap_or(b' ');
        if !next.is_ascii_alphanumeric() {
            count += 1;
        }
        start = end;
    }
    count
}

/// The largest `/Count <n>` in the file: interior page-tree nodes carry subtree counts and
/// the root carries the total.
fn max_count_value(bytes: &[u8]) -> Option<u32> {
    const NEEDLE: &[u8] = b"/Count";
    let mut best: Option<u32> = None;
    let mut start = 0;
    while let Some(offset) = find(&bytes[start..], NEEDLE) {
        let mut cursor = start + offset + NEEDLE.len();
        start = cursor;
        while matches!(bytes.get(cursor), Some(b' ' | b'\t' | b'\r' | b'\n')) {
            cursor += 1;
        }
        let digits_start = cursor;
        let mut value: u64 = 0;
        while let Some(digit @ b'0'..=b'9') = bytes.get(cursor).copied() {
            value = value * 10 + u64::from(digit - b'0');
            cursor += 1;
        }
        // A `/Count` inside binary data can be followed by anything; only a short, sane
        // decimal is a page count.
        if cursor == digits_start || value > 100_000 {
            continue;
        }
        let value = value as u32;
        best = Some(best.map_or(value, |current| current.max(value)));
    }
    best
}

fn find(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

#[cfg(test)]
mod tests {
    use super::{base64_encode, pdf_page_count, read_export_asset, sniff_mime, ExportAsset, PdfReport};
    use std::fs;
    use std::path::{Path, PathBuf};

    /// A scratch tree: `<root>/a/docs/notes.md`, `<root>/a/assets/logo.png` (one level up from
    /// the document, which is ordinary) and `<root>/secret.png` (two levels up, which is not).
    fn scratch_tree(name: &str) -> (PathBuf, String) {
        let root = std::env::temp_dir().join(format!("openmark-export-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("a").join("docs")).expect("docs directory");
        fs::create_dir_all(root.join("a").join("assets")).expect("assets directory");
        let png = b"\x89PNG\r\n\x1a\nrest";
        fs::write(root.join("a").join("assets").join("logo.png"), png).expect("logo");
        fs::write(root.join("secret.png"), png).expect("secret");
        fs::write(root.join("a").join("docs").join("notes.txt"), b"private notes").expect("notes");
        let document = root.join("a").join("docs").join("notes.md");
        fs::write(&document, b"# notes").expect("document");
        (root, document.to_str().expect("utf-8 path").to_string())
    }

    /*
     * The export reads files on the document's behalf and bakes them into a file the user then
     * sends to other people. It used to accept any relative path, so a received document holding
     * `![](../../../../Users/me/.ssh/id_rsa)` exported that key as base64 — while the reading view
     * refused the same reference. The export must apply the reader's rule: one level up is how
     * documents are organised, two is leaving the neighbourhood.
     */
    #[test]
    fn read_export_asset_refuses_a_reference_that_climbs_two_levels() {
        let (_root, document) = scratch_tree("climb");
        let err = read_export_asset(document, "../../secret.png".into())
            .expect_err("a reference two levels up must not be inlined");
        assert!(err.contains("outside"), "unexpected error: {err}");
    }

    #[test]
    fn read_export_asset_still_inlines_a_sibling_folder_one_level_up() {
        let (_root, document) = scratch_tree("sibling");
        let asset = read_export_asset(document, "../assets/logo.png".into())
            .expect("`../assets/` is an ordinary layout");
        assert_eq!(asset.mime, "image/png");
    }

    #[test]
    fn read_export_asset_refuses_a_file_that_is_not_an_image() {
        let (_root, document) = scratch_tree("not-image");
        let err = read_export_asset(document, "notes.txt".into())
            .expect_err("only images are inlined");
        assert!(err.contains("not an image"), "unexpected error: {err}");
    }

    /// Serialises a value to a JSON object and returns its keys, sorted.
    fn keys<T: serde::Serialize>(value: &T) -> Vec<String> {
        let json = serde_json::to_value(value).expect("serialisable");
        let mut names: Vec<String> = json
            .as_object()
            .expect("an IPC response is always a JSON object")
            .keys()
            .cloned()
            .collect();
        names.sort();
        names
    }

    /*
     * These two responses are the deliberate exception to the camelCase rule used by
     * `commands.rs`: the TypeScript interfaces in `src/core/export/assets.ts` and
     * `src/core/export/pdf.ts` declare `relative_path` and `page_count`, so the Rust field names
     * go over the wire unchanged. It happens to be consistent, and that is exactly why it is
     * worth pinning — `commands.rs` carried the opposite mistake (`mtime_ms` sent where the
     * frontend read `mtimeMs`) for the whole of development, and nothing caught it.
     */
    #[test]
    fn export_asset_matches_the_typescript_interface() {
        let asset = ExportAsset {
            path: "C:/docs/a.png".into(),
            relative_path: "img/a.png".into(),
            mime: "image/png".into(),
            size: 3,
            base64: "AAAA".into(),
        };
        assert_eq!(
            keys(&asset),
            vec!["base64", "mime", "path", "relative_path", "size"]
        );
    }

    #[test]
    fn pdf_report_matches_the_typescript_interface() {
        let report = PdfReport {
            path: "C:/docs/a.pdf".into(),
            size: 3,
            page_count: Some(2),
        };
        assert_eq!(keys(&report), vec!["page_count", "path", "size"]);

        // An unparseable page count must still be a key, or the frontend reads `undefined`
        // where it expects `null` and cannot tell "unknown" from "missing field".
        let unknown = PdfReport { page_count: None, ..report };
        assert_eq!(keys(&unknown), vec!["page_count", "path", "size"]);
    }

    #[test]
    fn base64_matches_the_standard_alphabet() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
        assert_eq!(base64_encode(b"foob"), "Zm9vYg==");
        assert_eq!(base64_encode(b"fooba"), "Zm9vYmE=");
        assert_eq!(base64_encode(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn mime_comes_from_the_bytes_not_the_name() {
        let png = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
        assert_eq!(sniff_mime(Path::new("lying.jpg"), &png), "image/png");
        assert_eq!(
            sniff_mime(Path::new("photo.JPEG"), b"\xff\xd8\xff\xe0"),
            "image/jpeg"
        );
        assert_eq!(
            sniff_mime(Path::new("art.svg"), b"<svg xmlns=\"http://www.w3.org/2000/svg\">"),
            "image/svg+xml"
        );
        assert_eq!(
            sniff_mime(Path::new("blob.bin"), &[0x00, 0x01, 0x02]),
            "application/octet-stream"
        );
    }

    #[test]
    fn page_count_reads_the_page_objects() {
        let pdf: &[u8] = b"%PDF-1.7\n1 0 obj\n<< /Type /Pages /Count 3 >>\nendobj\n\
             2 0 obj\n<< /Type /Page /Parent 1 0 R >>\nendobj\n\
             3 0 obj\n<< /Type /Page /Parent 1 0 R >>\nendobj\n\
             4 0 obj\n<< /Type /Page /Parent 1 0 R >>\nendobj\n";
        assert_eq!(pdf_page_count(pdf), Some(3));
    }
}
