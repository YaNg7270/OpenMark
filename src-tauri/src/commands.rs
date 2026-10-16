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
// Serialised as camelCase: the TypeScript layer declares these fields in camelCase, and
// serde's default would emit `mtime_ms` where the other side reads `mtimeMs`.
#[serde(rename_all = "camelCase")]
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
// Serialised as camelCase: the TypeScript layer declares these fields in camelCase, and
// serde's default would emit `mtime_ms` where the other side reads `mtimeMs`.
#[serde(rename_all = "camelCase")]
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
// Serialised as camelCase: the TypeScript layer declares these fields in camelCase, and
// serde's default would emit `mtime_ms` where the other side reads `mtimeMs`.
#[serde(rename_all = "camelCase")]
pub struct FileStat {
    pub exists: bool,
    pub size: u64,
    /// Milliseconds since the Unix epoch; `0` when the file does not exist.
    pub mtime_ms: i64,
    pub is_dir: bool,
}

/// One entry of [`list_dir`].
#[derive(Debug, Serialize)]
// Serialised as camelCase: the TypeScript layer declares these fields in camelCase, and
// serde's default would emit `mtime_ms` where the other side reads `mtimeMs`.
#[serde(rename_all = "camelCase")]
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
    let expected_mtime = expected_mtime_ms(&request);
    let target = PathBuf::from(path);
    let dir = target
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    if !dir.is_dir() {
        return Err(format!("directory does not exist: {}", dir.display()));
    }

    /*
     * Refuse to overwrite a file that changed since it was read.
     *
     * The frontend also polls for external changes and shows a banner, but polling has a window
     * in which another program can write between two checks — and that window is exactly when a
     * save would destroy the other program's work. The guard belongs where the write happens.
     *
     * Compared against the filesystem rather than a cached value, so a change made by any tool
     * at any time is caught.
     */
    if let Some(expected) = expected_mtime {
        if let Ok(meta) = fs::metadata(&target) {
            if meta.is_file() {
                let actual = mtime_ms(&meta)?;
                if actual != expected {
                    return Err(format!(
                        "conflict: the file changed on disk since it was opened (expected mtime {expected}, found {actual})"
                    ));
                }
            }
        }
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
/// The mtime the caller believes the file has, if it supplied one.
///
/// Read from the raw request body because the value is optional and lives alongside the other
/// named arguments; declaring it as a command parameter would make it mandatory at the
/// TypeScript call site for no benefit.
fn expected_mtime_ms(request: &tauri::ipc::Request<'_>) -> Option<i64> {
    match request.body() {
        tauri::ipc::InvokeBody::Json(value) => value
            .get("expectedMtimeMs")
            .or_else(|| value.get("expected_mtime_ms"))
            .and_then(|flag| flag.as_i64()),
        tauri::ipc::InvokeBody::Raw(_) => None,
    }
}

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
/// Resolves an image reference authored relative to a document into an absolute path.
///
/// Takes the two halves rather than a pre-joined path because the join is the part that is easy
/// to get wrong: the document is written by hand, so the reference may use forward slashes, a
/// leading `./`, or `..` segments, and `canonicalize` is what actually resolves them (and any
/// symlink on the way) into the path the asset protocol is handed.
///
/// This signature is the contract both call sites in `src/core/fs/fileService.ts` already
/// assumed — `resolveAssetUrl` and `resolveAssetStatus` both pass `{documentPath, relativePath}`.
/// It previously took a single `path`, which Tauri refused to deserialise, so the invoke rejected,
/// `resolveLocalImages` caught it and marked the image missing, and every relative image in every
/// document rendered as a broken placeholder.
#[tauri::command]
pub fn resolve_asset_url(document_path: String, relative_path: String) -> Result<String, String> {
    let relative = relative_path.trim();
    if relative.is_empty() {
        return Err(AppError::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "the image reference is empty",
        ))
        .into());
    }

    let document = PathBuf::from(&document_path);
    let base = document.parent().unwrap_or_else(|| Path::new(""));
    // `join` replaces the base entirely when `relative` is itself absolute, which is the correct
    // reading of an absolute reference and matches what the frontend already filters for.
    let joined = base.join(relative);

    let canonical = fs::canonicalize(&joined).map_err(|err| {
        AppError::Io(std::io::Error::new(
            err.kind(),
            format!("cannot resolve {relative} against {document_path}: {err}"),
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

#[cfg(test)]
mod tests {
    use super::*;

    /// Serialises a value to a JSON object and returns its keys, sorted.
    ///
    /// Sorted because `serde_json::to_value` builds a `BTreeMap`, and because the order of keys
    /// in a JSON object carries no meaning — the assertion is about *names*, which is exactly
    /// what went wrong.
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
     * These pin the wire format of every response the TypeScript layer reads.
     *
     * They exist because of a real defect: serde's default is the Rust field name, so
     * `mtime_ms` was sent under that name while `src/core/fs/fileService.ts` declared
     * `mtimeMs`. The value arrived as `undefined`, the external-change check compared a real
     * timestamp against `undefined` on every poll, and the "modified by another program"
     * banner appeared on every document seconds after opening it. The same mistake silently
     * disabled the clobber guard after the first save, because the returned mtime was
     * `undefined` and was then sent back as the expected value.
     *
     * A TypeScript test cannot catch this — the compiler trusts the hand-written interface —
     * so the assertion lives on the side that produces the bytes.
     */

    /*
     * `resolve_asset_url` takes the document and the reference separately, because that is what
     * both call sites in `fileService.ts` pass. It used to take a single `path`, which Tauri
     * refused to deserialise, so the invoke rejected and every relative image in every document
     * was marked missing. The frontend test suite could not see it: its stub fabricates the
     * resolved path from `relativePath` alone, so it agrees with a contract the real command does
     * not have. These tests exercise the join for real.
     */

    /// Creates a scratch directory holding a document and one image beside it.
    fn scratch_document(name: &str) -> (PathBuf, PathBuf) {
        let dir = std::env::temp_dir().join(format!("openmark-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("img")).expect("scratch directory");
        fs::write(dir.join("img").join("figure-1.png"), b"\x89PNG").expect("scratch image");
        let document = dir.join("notes.md");
        fs::write(&document, b"# notes").expect("scratch document");
        (dir, document)
    }

    #[test]
    fn resolve_asset_url_joins_the_reference_against_the_document_directory() {
        let (dir, document) = scratch_document("join");
        let resolved = resolve_asset_url(
            to_display_string(&document).expect("document path"),
            "./img/figure-1.png".into(),
        )
        .expect("the reference resolves");

        let expected = fs::canonicalize(dir.join("img").join("figure-1.png")).expect("canonical");
        assert_eq!(resolved, to_display_string(&expected).expect("expected path"));
        assert!(resolved.replace('\\', "/").ends_with("img/figure-1.png"));
    }

    #[test]
    fn resolve_asset_url_refuses_an_empty_reference() {
        let (_dir, document) = scratch_document("empty");
        let err = resolve_asset_url(to_display_string(&document).expect("document path"), "  ".into())
            .expect_err("an empty reference has nothing to resolve");
        assert!(err.contains("empty"), "unexpected error: {err}");
    }

    #[test]
    fn resolve_asset_url_reports_a_missing_image_by_name() {
        let (_dir, document) = scratch_document("missing");
        let err = resolve_asset_url(
            to_display_string(&document).expect("document path"),
            "./img/absent.png".into(),
        )
        .expect_err("a file that is not there cannot resolve");
        assert!(err.contains("absent.png"), "unexpected error: {err}");
    }

    #[test]
    fn file_payload_uses_camel_case() {
        let payload = FilePayload {
            bytes: vec![1, 2, 3],
            path: "C:/docs/a.md".into(),
            size: 3,
            mtime_ms: 1_700_000_000_000,
        };
        assert_eq!(keys(&payload), vec!["bytes", "mtimeMs", "path", "size"]);
    }

    #[test]
    fn write_result_uses_camel_case() {
        let result = WriteResult {
            path: "C:/docs/a.md".into(),
            size: 3,
            mtime_ms: 1_700_000_000_000,
            backup_path: Some("C:/docs/.openmark-backups/a.md.bak".into()),
        };
        assert_eq!(keys(&result), vec!["backupPath", "mtimeMs", "path", "size"]);

        // An absent backup must still be present as a key, or the frontend reads `undefined`
        // where it expects `null` and the "backup created" notice can never be right.
        let without = WriteResult { backup_path: None, ..result };
        assert_eq!(keys(&without), vec!["backupPath", "mtimeMs", "path", "size"]);
    }

    #[test]
    fn file_stat_uses_camel_case() {
        let stat = FileStat {
            exists: true,
            size: 3,
            mtime_ms: 1_700_000_000_000,
            is_dir: false,
        };
        assert_eq!(keys(&stat), vec!["exists", "isDir", "mtimeMs", "size"]);
    }

    #[test]
    fn dir_entry_uses_camel_case() {
        let entry = DirEntryInfo {
            name: "a.md".into(),
            path: "C:/docs/a.md".into(),
            is_dir: false,
            size: 3,
            mtime_ms: 1_700_000_000_000,
        };
        assert_eq!(keys(&entry), vec!["isDir", "mtimeMs", "name", "path", "size"]);
    }
}
