//! Filesystem commands exposed to the webview.
//!
//! Contract notes for the frontend:
//! - `read_text_file` returns **raw bytes**, not a string: the JS layer owns
//!   BOM/EOL/encoding detection.
//! - `write_text_file_atomic` writes a temp file in the *same* directory,
//!   fsyncs it and renames it over the target, so a crash mid-save can never
//!   leave a truncated document.
//! - Every command returns `Result<_, String>`; the typed errors in
//!   [`AppError`] are flattened at this boundary so the JS side has one shape
//!   to deal with.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, SystemTimeError, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Manager};

/// Directory (sibling to the edited file) that holds rotating backups.
pub const BACKUP_DIR_NAME: &str = ".openmark-backups";
/// How many backups to keep per document before the oldest are pruned.
const BACKUP_KEEP: usize = 20;

/// Typed errors for the file layer. Converted to `String` at the command
/// boundary (see `impl From<AppError> for String`).
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("i/o error: {0}")]
    Io(#[from] std::io::Error),
    #[error("clock error: {0}")]
    Time(#[from] SystemTimeError),
    #[error("path is not valid UTF-8: {0:?}")]
    NonUtf8Path(PathBuf),
}

impl From<AppError> for String {
    fn from(err: AppError) -> Self {
        err.to_string()
    }
}

/// A document as it exists on disk, before any decoding.
#[derive(Debug, Serialize)]
pub struct FilePayload {
    /// Raw file contents. Always serialised as a JSON array of numbers.
    pub bytes: Vec<u8>,
    /// Absolute path that was read.
    pub path: String,
    pub size: u64,
    /// Last modification time in milliseconds since the Unix epoch.
    pub mtime_ms: i64,
}

/// Result of a successful atomic save.
#[derive(Debug, Serialize)]
pub struct WriteResult {
    pub path: String,
    pub size: u64,
    pub mtime_ms: i64,
    /// Where the pre-save copy landed, when `make_backup` was true and the
    /// target already existed.
    pub backup_path: Option<String>,
}

/// Cheap change-detection probe for external modification checks.
#[derive(Debug, Serialize)]
pub struct FileStat {
    pub exists: bool,
    pub size: u64,
    /// Milliseconds since the Unix epoch; `0` when the file does not exist.
    pub mtime_ms: i64,
    pub is_dir: bool,
}

/// One entry of [`list_dir`].
#[derive(Debug, Serialize)]
pub struct DirEntryInfo {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub mtime_ms: i64,
}

// ------------------------------------------------------------------ helpers

fn mtime_ms(meta: &fs::Metadata) -> Result<i64, AppError> {
    let modified = meta.modified()?;
    let since_epoch = modified.duration_since(UNIX_EPOCH).unwrap_or_default();
    Ok(since_epoch.as_millis() as i64)
}

/// Paths cross the IPC boundary as UTF-8 strings; Windows paths that are not
/// valid Unicode cannot be represented and are reported as an error instead of
/// being silently lossy-converted (which would break the asset protocol).
fn to_display_string(path: &Path) -> Result<String, AppError> {
    path.to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| AppError::NonUtf8Path(path.to_path_buf()))
}

/// Unique-enough temp name inside `dir`; `create_new` is what actually
/// guarantees we never clobber a concurrent editor's temp file.
fn temp_path_in(dir: &Path, stem: &str) -> PathBuf {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    dir.join(format!(".{stem}.openmark-{}-{nanos}-{n}.tmp", std::process::id()))
}

fn create_temp_file(dir: &Path, stem: &str) -> Result<(fs::File, PathBuf), AppError> {
    for _ in 0..16 {
        let candidate = temp_path_in(dir, stem);
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(file) => return Ok((file, candidate)),
            Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(err) => return Err(AppError::Io(err)),
        }
    }
    Err(AppError::Io(std::io::Error::new(
        std::io::ErrorKind::AlreadyExists,
        "could not allocate a temporary file name",
    )))
}

/// Copy `target` into `<parent>/.openmark-backups/<name>.<utc>.bak` and prune
/// the directory down to the newest [`BACKUP_KEEP`] copies of that name.
fn create_backup(target: &Path) -> Result<Option<String>, AppError> {
    let parent = target.parent().unwrap_or_else(|| Path::new("."));
    let file_name = target
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "document.md".to_string());

    let backup_dir = parent.join(BACKUP_DIR_NAME);
    fs::create_dir_all(&backup_dir)?;

    let stamp = chrono::Utc::now().format("%Y%m%d-%H%M%S%.3f");
    let backup_path = backup_dir.join(format!("{file_name}.{stamp}.bak"));
    fs::copy(target, &backup_path)?;

    prune_backups(&backup_dir, &file_name)?;
    to_display_string(&backup_path).map(Some)
}

fn prune_backups(backup_dir: &Path, file_name: &str) -> Result<(), AppError> {
    let prefix = format!("{file_name}.");
    let mut copies: Vec<PathBuf> = fs::read_dir(backup_dir)?
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with(&prefix) && n.ends_with(".bak"))
        })
        .collect();

    if copies.len() <= BACKUP_KEEP {
        return Ok(());
    }
    // Timestamped names sort chronologically, so lexicographic order is enough.
    copies.sort();
    let excess = copies.len() - BACKUP_KEEP;
    for path in copies.into_iter().take(excess) {
        let _ = fs::remove_file(path);
    }
    Ok(())
}

// ----------------------------------------------------------------- commands

/// Reads a file as raw bytes plus its metadata.
#[tauri::command]
pub fn read_text_file(path: String) -> Result<FilePayload, String> {
    let path = PathBuf::from(path);
    let bytes = fs::read(&path).map_err(AppError::from)?;
    let meta = fs::metadata(&path).map_err(AppError::from)?;
    Ok(FilePayload {
        size: meta.len(),
        mtime_ms: mtime_ms(&meta)?,
        bytes,
        path: to_display_string(&path)?,
    })
}

/// Atomically replaces `path` with `bytes`.
///
/// `makeBackup: true` copies the *existing* file into a sibling
/// `.openmark-backups/` directory first (see [`BACKUP_DIR_NAME`]).
///
/// The backup flag is read from the raw invoke payload rather than a renamed
/// parameter so that both `makeBackup` (Tauri's camelCase default) and
/// `make_backup` are accepted — the flag is optional and defaults to `false`.
#[tauri::command]
pub fn write_text_file_atomic(
    path: String,
    bytes: Vec<u8>,
    request: tauri::ipc::Request<'_>,
) -> Result<WriteResult, String> {
    let make_backup = backup_flag(&request);
    let target = PathBuf::from(path);
    let dir = target
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    if !dir.is_dir() {
        return Err(format!("directory does not exist: {}", dir.display()));
    }
    let stem = target
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "document".to_string());

    let backup_path = if make_backup && target.is_file() {
        create_backup(&target)?
    } else {
        None
    };

    let (mut file, temp) = create_temp_file(&dir, &stem)?;
    // Any early return past this point must not leave the temp file behind.
    let write_result = (|| -> Result<(), AppError> {
        file.write_all(&bytes)?;
        file.flush()?;
        // Durability: without the fsync the rename can be visible before the
        // data is, which is exactly the corruption window we are closing.
        file.sync_all()?;
        Ok(())
    })();
    drop(file);
    if let Err(err) = write_result {
        let _ = fs::remove_file(&temp);
        return Err(err.into());
    }

    if let Err(err) = fs::rename(&temp, &target) {
        let _ = fs::remove_file(&temp);
        return Err(AppError::Io(err).into());
    }

    let meta = fs::metadata(&target).map_err(AppError::from)?;
    Ok(WriteResult {
        path: to_display_string(&target)?,
        size: meta.len(),
        mtime_ms: mtime_ms(&meta)?,
        backup_path,
    })
}

/// Reads the optional `makeBackup` / `make_backup` boolean out of the invoke
/// payload without deserialising the (potentially large) `bytes` array twice.
fn backup_flag(request: &tauri::ipc::Request<'_>) -> bool {
    match request.body() {
        tauri::ipc::InvokeBody::Json(value) => value
            .get("makeBackup")
            .or_else(|| value.get("make_backup"))
            .and_then(|flag| flag.as_bool())
            .unwrap_or(false),
        // A raw (non-JSON) payload carries no named arguments.
        tauri::ipc::InvokeBody::Raw(_) => false,
    }
}

/// `None` when the path does not exist — that is a normal answer here, not an
/// error, because callers poll it to detect external modifications/deletes.
#[tauri::command]
pub fn stat_file(path: String) -> Result<Option<FileStat>, String> {
    let path = PathBuf::from(path);
    match fs::metadata(&path) {
        Ok(meta) => Ok(Some(FileStat {
            exists: true,
            size: meta.len(),
            mtime_ms: mtime_ms(&meta)?,
            is_dir: meta.is_dir(),
        })),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(AppError::Io(err).into()),
    }
}

/// Lists a directory, directories first, then case-insensitively by name.
/// Entries that vanish mid-listing are skipped instead of failing the call.
#[tauri::command]
pub fn list_dir(path: String) -> Result<Vec<DirEntryInfo>, String> {
    let dir = PathBuf::from(path);
    let mut entries = Vec::new();
    for entry in fs::read_dir(&dir).map_err(AppError::from)? {
        let Ok(entry) = entry else { continue };
        let Ok(meta) = entry.metadata() else { continue };
        entries.push(DirEntryInfo {
            name: entry.file_name().to_string_lossy().into_owned(),
            path: to_display_string(&entry.path())?,
            is_dir: meta.is_dir(),
            size: meta.len(),
            mtime_ms: mtime_ms(&meta)?,
        });
    }
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

/// Canonicalises a path so the JS layer can hand it to `convertFileSrc`.
///
/// The returned string is always absolute and symlink-resolved, which is what
/// the `asset:` protocol scope check compares against.
#[tauri::command]
pub fn resolve_asset_url(path: String) -> Result<String, String> {
    let canonical = fs::canonicalize(&path).map_err(|err| {
        AppError::Io(std::io::Error::new(
            err.kind(),
            format!("cannot resolve {path}: {err}"),
        ))
    })?;
    to_display_string(&canonical).map_err(Into::into)
}

#[tauri::command]
pub fn path_exists(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists())
}

/// The user's Documents folder, used as the "open file" dialog default.
#[tauri::command]
pub fn default_documents_dir(app: AppHandle) -> Result<String, String> {
    let dir = app
        .path()
        .document_dir()
        .or_else(|_| app.path().home_dir())
        .map_err(|err| err.to_string())?;
    to_display_string(&dir).map_err(Into::into)
}

#[tauri::command]
pub fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
