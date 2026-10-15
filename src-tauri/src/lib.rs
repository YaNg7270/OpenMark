//! OpenMark desktop shell.
//!
//! The React frontend in `../src` owns rendering; this crate owns the window,
//! the plugin set and the filesystem commands the UI calls over IPC.

mod commands;
mod export;

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager};

/// Event the frontend listens on to open a document.
///
/// Payload is a plain `string`: the absolute path of the file to open.
pub const OPEN_FILE_EVENT: &str = "openmark://open-file";

/// Files handed to us by Windows ("Open with", "Send to", a shortcut) that the
/// webview could not possibly have been listening for yet: the process starts,
/// but the JS bridge only exists after the first page load. The setup hook
/// parks them here and [`frontend_ready`] replays them as [`OPEN_FILE_EVENT`]s.
#[derive(Default)]
pub struct PendingOpenFiles(Mutex<Vec<String>>);

/// True when the path looks like a Markdown document we should auto-open.
fn is_markdown(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown"))
}

/// Extracts Markdown paths from a raw argv (Windows 'Open with' hands the
/// document to us as the first non-flag argument).
fn markdown_paths<I, S>(args: I) -> Vec<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter()
        .skip(1) // argv[0] is the executable itself
        .map(|arg| arg.as_ref().to_string())
        .filter(|arg| !arg.starts_with('-') && is_markdown(arg))
        .map(|arg| absolutize(&arg))
        .collect()
}

/// Absolute, symlink-free path when it exists, else at least absolute, so the
/// frontend never has to guess at the process working directory.
fn absolutize(path: &str) -> String {
    let candidate = PathBuf::from(path);
    let absolute = if candidate.is_absolute() {
        candidate
    } else {
        std::env::current_dir()
            .map(|cwd| cwd.join(&candidate))
            .unwrap_or(candidate)
    };
    let resolved = std::fs::canonicalize(&absolute).unwrap_or(absolute);
    resolved.to_string_lossy().into_owned()
}

/// Reveals the main window.
///
/// The window is created with `visible: false` and a themed
/// `backgroundColor` so the user never sees WebView2's blank surface; this is
/// called from `setup`, from the second-instance handler, and is exposed to the
/// frontend as `show_main_window`.
fn reveal_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Signals that the frontend has registered its `openmark://open-file`
/// listener. Flushes files the app was launched with and returns how many were
/// replayed.
#[tauri::command]
fn frontend_ready(app: AppHandle) -> usize {
    let pending = app
        .state::<PendingOpenFiles>()
        .0
        .lock()
        .map(|mut guard| std::mem::take(&mut *guard))
        .unwrap_or_default();

    for path in &pending {
        let _ = app.emit(OPEN_FILE_EVENT, path.clone());
    }
    pending.len()
}

/// Lets the frontend reveal the window itself (e.g. after restoring scroll
/// position) instead of relying on the `setup` hook.
#[tauri::command]
fn show_main_window(app: AppHandle) {
    reveal_main_window(&app);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // The single-instance plugin must be registered before anything that can
    // spawn a window, otherwise a second launch could create a second window
    // before the guard is installed.
    builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
        reveal_main_window(app);
        // The first instance is already running its frontend, so its listener
        // is guaranteed to be attached — emit straight away, no buffering.
        for path in markdown_paths(argv) {
            let _ = app.emit(OPEN_FILE_EVENT, path);
        }
    }));

    builder = builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_os::init())
        // Persists the fs/asset scopes the user grants through a dialog, so
        // "reopen last document" survives a restart without re-prompting.
        .plugin(tauri_plugin_persisted_scope::init());

    // WebDriverIO desktop E2E only; never registered — and therefore never
    // reachable — in a release build.
    #[cfg(debug_assertions)]
    {
        builder = builder.plugin(tauri_plugin_wdio::init());
    }

    builder
        .invoke_handler(tauri::generate_handler![
            commands::read_text_file,
            commands::write_text_file_atomic,
            commands::stat_file,
            commands::list_dir,
            commands::resolve_asset_url,
            commands::path_exists,
            commands::default_documents_dir,
            commands::app_version,
            export::read_export_asset,
            export::export_pdf,
            frontend_ready,
            show_main_window,
        ])
        .setup(|app| {
            let args: Vec<String> = std::env::args().collect();
            let pending = markdown_paths(&args);
            app.manage(PendingOpenFiles(Mutex::new(pending)));

            // `visible: false` in tauri.conf.json keeps the blank WebView2
            // surface off-screen; the window's `backgroundColor` matches the
            // document background so the first frame is indistinguishable.
            reveal_main_window(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running OpenMark");
}
