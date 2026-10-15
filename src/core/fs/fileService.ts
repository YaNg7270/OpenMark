import { convertFileSrc } from '@tauri-apps/api/core';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { decodeText, encodeText, contentHash, type EolStyle } from './encoding';

/**
 * File access, with a desktop backend and a browser fallback.
 *
 * The desktop backend talks to the Rust layer (`src-tauri/src/commands.rs`), which is
 * responsible for the parts a webview cannot do safely or at all: atomic replace,
 * backup rotation, and reading raw bytes without any encoding guesswork.
 *
 * The browser backend exists so the entire UI can be driven by Playwright against the
 * Vite dev server, and so the app degrades gracefully if the Tauri bridge is missing.
 * It deliberately implements only what a sandbox can do — no atomic write, no backups —
 * and reports that through `capabilities`.
 */

export interface FileStat {
  exists: boolean;
  size: number;
  mtimeMs: number;
  isDir: boolean;
}

export interface OpenedFile {
  path: string;
  /** Display name, e.g. `chapter-1.md`. */
  name: string;
  /** Text with the BOM stripped; line endings as they are on disk. */
  text: string;
  hash: string;
  size: number;
  mtimeMs: number;
  bom: boolean;
  eol: EolStyle;
  lossy: boolean;
  mixedEol: boolean;
}

export interface WriteResult {
  path: string;
  size: number;
  mtimeMs: number;
  backupPath: string | null;
}

export interface FileCapabilities {
  /** True when running inside the Tauri shell with the Rust commands available. */
  desktop: boolean;
  /** Atomic replace (temp file + rename). Browser downloads cannot do this. */
  atomicWrite: boolean;
  /** Rotating `.bak` backups before overwriting. */
  backups: boolean;
  /** Watching a file for changes made by other programs. */
  externalChangeDetection: boolean;
}

interface TauriInternals {
  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: TauriInternals;
    __OPENMARK_TEST_FILES__?: Record<string, string>;
  }
}

function tauriInvoke(): TauriInternals['invoke'] | null {
  const internals = globalThis.window?.__TAURI_INTERNALS__;
  if (!internals?.invoke) return null;
  return internals.invoke.bind(internals);
}

export function capabilities(): FileCapabilities {
  const desktop = tauriInvoke() !== null;
  return {
    desktop,
    atomicWrite: desktop,
    backups: desktop,
    externalChangeDetection: desktop,
  };
}

export function isDesktop(): boolean {
  return tauriInvoke() !== null;
}

function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

interface FilePayload {
  bytes: number[];
  path: string;
  size: number;
  mtime_ms: number;
}

/** File extension filter shared by the open and save dialogs. */
const MARKDOWN_FILTERS = [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'txt'] }];

/**
 * Shows the native open dialog. Returns `null` when the user cancels.
 * Kept separate from reading so the UI can decide what to do with the path.
 */
export async function pickOpenPath(): Promise<string | null> {
  if (!isDesktop()) return null;
  const selected = await openDialog({ multiple: false, directory: false, filters: MARKDOWN_FILTERS });
  return typeof selected === 'string' ? selected : null;
}

export async function pickSavePath(suggestedName = 'untitled.md'): Promise<string | null> {
  if (!isDesktop()) return null;
  const selected = await saveDialog({ defaultPath: suggestedName, filters: MARKDOWN_FILTERS });
  return selected ?? null;
}

/** Reads a file by path and returns its decoded text plus the metadata needed to save it back identically. */
export async function readFile(path: string): Promise<OpenedFile> {
  const invoke = tauriInvoke();
  if (!invoke) {
    // Browser/test backend: paths are looked up in a map the harness installs.
    const synthetic = globalThis.window?.__OPENMARK_TEST_FILES__?.[path];
    if (synthetic === undefined) throw new Error(`Cannot read "${path}" outside the desktop app.`);
    const bytes = new TextEncoder().encode(synthetic);
    const decoded = decodeText(bytes);
    return {
      path,
      name: baseName(path),
      text: decoded.text,
      hash: contentHash(decoded.text),
      size: bytes.length,
      mtimeMs: Date.now(),
      bom: decoded.bom,
      eol: decoded.eol,
      lossy: decoded.lossy,
      mixedEol: decoded.mixedEol,
    };
  }

  const payload = await invoke<FilePayload>('read_text_file', { path });
  const bytes = Uint8Array.from(payload.bytes);
  const decoded = decodeText(bytes);
  return {
    path: payload.path,
    name: baseName(payload.path),
    text: decoded.text,
    hash: contentHash(decoded.text),
    size: payload.size,
    mtimeMs: payload.mtime_ms,
    bom: decoded.bom,
    eol: decoded.eol,
    lossy: decoded.lossy,
    mixedEol: decoded.mixedEol,
  };
}

/**
 * Writes text, preserving the source file's BOM and line-ending style.
 *
 * `expectedMtimeMs` guards against clobbering: if the file changed on disk since it was
 * read, the Rust side rejects the write and the UI surfaces a conflict instead of
 * silently overwriting someone else's edit.
 */
export async function writeFile(
  path: string,
  text: string,
  options: { bom: boolean; eol: EolStyle; makeBackup?: boolean; expectedMtimeMs?: number },
): Promise<WriteResult> {
  const invoke = tauriInvoke();
  if (!invoke) {
    downloadText(path, text, options);
    const bytes = encodeText(text, options);
    return { path, size: bytes.length, mtimeMs: Date.now(), backupPath: null };
  }

  const bytes = encodeText(text, options);
  return invoke<WriteResult>('write_text_file_atomic', {
    path,
    bytes: Array.from(bytes),
    makeBackup: options.makeBackup ?? true,
    expectedMtimeMs: options.expectedMtimeMs ?? null,
  });
}

export async function statFile(path: string): Promise<FileStat | null> {
  const invoke = tauriInvoke();
  if (!invoke) return null;
  const result = await invoke<FileStat | null>('stat_file', { path });
  return result ?? null;
}

export async function pathExists(path: string): Promise<boolean> {
  const invoke = tauriInvoke();
  if (!invoke) return globalThis.window?.__OPENMARK_TEST_FILES__?.[path] !== undefined;
  return invoke<boolean>('path_exists', { path });
}

/**
 * Resolves a path that is relative to the open document into something the webview can
 * load as an image. Without this, `![](./img/figure-1.png)` cannot render at all, because
 * the webview has no filesystem access of its own.
 */
export async function resolveAssetUrl(documentPath: string, relative: string): Promise<string | null> {
  if (/^[a-z][a-z0-9+.-]*:/i.test(relative)) return relative; // already absolute (http:, data:, …)
  if (relative.startsWith('#')) return null;

  const invoke = tauriInvoke();
  if (!invoke) return null;

  const absolute = await invoke<string>('resolve_asset_url', {
    documentPath,
    relativePath: relative,
  });
  return convertFileSrc(absolute);
}

/** Opens an external URL in the system browser rather than inside the app webview. */
export async function openExternal(url: string): Promise<void> {
  const invoke = tauriInvoke();
  if (!invoke) {
    globalThis.open?.(url, '_blank', 'noopener,noreferrer');
    return;
  }
  await openUrl(url);
}

export async function defaultDocumentsDir(): Promise<string | null> {
  const invoke = tauriInvoke();
  if (!invoke) return null;
  return invoke<string>('default_documents_dir');
}

/** Browser fallback: hands the file to the download manager. */
function downloadText(path: string, text: string, options: { bom: boolean; eol: EolStyle }): void {
  const bytes = encodeText(text, options);
  const blob = new Blob([bytes as BlobPart], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = baseName(path);
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next task so the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
