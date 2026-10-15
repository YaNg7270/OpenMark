import { create } from 'zustand';
import type { MarkdownIt } from 'markdown-it';
import type { Diagnostic, OutlineEntry, ParsedDocument } from '@/core/markdown/types';
import { createEngine, parseDocument } from '@/core/markdown/engine';
import { sanitizeHtml } from '@/core/markdown/sanitize';
import * as files from '@/core/fs/fileService';
import { applyEol, contentHash, normalizeEol, type EolStyle } from '@/core/fs/encoding';
import { applySettingsToDocument, loadSettings, saveSettings, resolveTheme, type AppSettings } from './settings';
import {
  forgetFile,
  loadSession,
  saveSession,
  withReadingPosition,
  withRecentFile,
  type SessionState,
} from './session';

/** The four view modes the product promises. */
export type ViewMode = 'read' | 'instant' | 'source' | 'split';

export type SidebarPanel = 'outline' | 'search' | 'diagnostics' | 'settings' | 'recent' | null;

export interface DocumentState {
  path: string | null;
  name: string;
  /** Authoritative markdown source. This, and only this, is ever written to disk. */
  source: string;
  /** Content as of the last successful load/save, used for dirty detection. */
  savedSource: string;
  hash: string;
  render: ParsedDocument | null;
  encoding: { bom: boolean; eol: EolStyle };
  mtimeMs: number | null;
  size: number;
  /** True when the document must not be written back without an explicit user action. */
  readOnly: boolean;
  readOnlyReason: string | null;
  loading: boolean;
  error: string | null;
  /** Set when the file changed on disk after we loaded it. */
  externalChange: { mtimeMs: number } | null;
}

export interface UiState {
  mode: ViewMode;
  sidebar: SidebarPanel;
  searchQuery: string;
  activeHeadingId: string | null;
  progress: number;
  notice: { kind: 'info' | 'warning' | 'error'; message: string } | null;
}

/** The engine is stateless after construction, so one instance serves every document. */
const engine: MarkdownIt = createEngine();

export function parse(source: string): ParsedDocument {
  return parseDocument(source, engine, { sanitizeHtml });
}

const EMPTY_DOC: DocumentState = {
  path: null,
  name: 'untitled.md',
  source: '',
  savedSource: '',
  hash: contentHash(''),
  render: null,
  encoding: { bom: false, eol: 'lf' },
  mtimeMs: null,
  size: 0,
  readOnly: false,
  readOnlyReason: null,
  loading: false,
  error: null,
  externalChange: null,
};

interface AppStore {
  settings: AppSettings;
  doc: DocumentState;
  ui: UiState;
  /** Recently opened files and where the reader had got to in each. Persisted. */
  session: SessionState;
  /** Diagnostics from the last render, surfaced to the panel and the status bar. */
  diagnostics: Diagnostic[];

  openViaDialog: () => Promise<void>;
  openPath: (path: string) => Promise<void>;
  newDocument: () => void;
  setSource: (source: string) => void;
  /**
   * Sets the source from an editor whose value lives in LF-normalised space.
   *
   * A `<textarea>` cannot hold CRLF: the HTML specification normalises line breaks in its
   * `value` IDL attribute, so reading `element.value` after writing `"a\r\nb"` yields
   * `"a\nb"`. Committing that directly would rewrite every line ending in a Windows file on
   * the next save. The editor therefore displays normalised text and calls this, which
   * restores the document's own line-ending style before storing.
   */
  setSourceFromEditor: (normalizedSource: string) => void;
  /**
   * Applies an edit to one top-level block by splicing the replacement into the
   * authoritative source at the range the parser reported.
   *
   * Returns the block that now contains `caretOffset`, so a live editor can keep focus and
   * scroll position when the edit changes how the document is split into blocks (splitting a
   * paragraph in two, for instance). Returns `null` when the edit was refused.
   */
  applyBlockEdit: (blockIndex: number, text: string, caretOffset: number) => number | null;
  save: () => Promise<void>;
  saveAs: () => Promise<void>;
  checkExternalChange: () => Promise<void>;
  /**
   * Records how far the reader has got in the current document. Called on a debounce while
   * scrolling, so it must stay cheap.
   */
  rememberPosition: (position: { scrollTop: number; progress: number; headingId: string | null }) => void;
  /** Removes a file from the recent list, along with its saved position. */
  forgetRecent: (path: string) => void;

  setMode: (mode: ViewMode) => void;
  setSidebar: (panel: SidebarPanel) => void;
  setSearchQuery: (query: string) => void;
  setActiveHeading: (id: string | null) => void;
  setProgress: (value: number) => void;
  notify: (kind: 'info' | 'warning' | 'error', message: string) => void;
  clearNotice: () => void;
  /**
   * Merges diagnostics discovered while typesetting (MathJax errors, Mermaid failures)
   * into the parse-time list. Deduplicated by code + position so a re-typeset after a
   * theme switch does not multiply entries.
   */
  addRuntimeDiagnostics: (items: readonly Diagnostic[]) => void;

  updateSettings: (mutate: (draft: AppSettings) => AppSettings) => void;
}

/**
 * Decides whether a document should open read-only.
 *
 * The rule is intentionally conservative: a file opens writable only when it is small
 * enough to reason about and shows no structural damage. Merely opening a file must never
 * be able to modify it, and the user can always unlock editing explicitly.
 */
function evaluateReadOnly(
  source: string,
  size: number,
  diagnostics: readonly Diagnostic[],
  settings: AppSettings,
): { readOnly: boolean; reason: string | null } {
  if (!settings.safety.safeReadOnlyForComplexFiles) return { readOnly: false, reason: null };

  if (size > settings.safety.largeFileThresholdBytes) {
    return {
      readOnly: true,
      reason: `文件较大（${(size / 1024).toFixed(0)} KB），已用安全只读模式打开。`,
    };
  }

  const structural = diagnostics.filter(
    (d) =>
      d.severity === 'error' &&
      (d.code === 'unclosed-fence' || d.code === 'unclosed-math' || d.code === 'html-sanitized'),
  );
  if (structural.length > 0) {
    return {
      readOnly: true,
      reason: `检测到 ${structural.length} 处结构性问题（${structural[0]!.message}），已用安全只读模式打开以避免损坏源文件。`,
    };
  }

  // A file that is mostly raw HTML is not primarily markdown and is not safe to rewrite.
  const htmlBlocks = (source.match(/^\s*<[a-zA-Z]/gm) ?? []).length;
  if (htmlBlocks > 40 && htmlBlocks > source.split('\n').length * 0.2) {
    return { readOnly: true, reason: '文档包含大量原始 HTML，已用安全只读模式打开。' };
  }

  return { readOnly: false, reason: null };
}

const initialSettings = loadSettings();
applySettingsToDocument(initialSettings);
const initialSession = loadSession();

export const useStore = create<AppStore>((set, get) => ({
  settings: initialSettings,
  doc: EMPTY_DOC,
  ui: {
    mode: 'read',
    sidebar: 'outline',
    searchQuery: '',
    activeHeadingId: null,
    progress: 0,
    notice: null,
  },
  diagnostics: [],
  session: initialSession,

  openViaDialog: async () => {
    const path = await files.pickOpenPath();
    if (!path) return;
    await get().openPath(path);
  },

  openPath: async (path) => {
    set((s) => ({ doc: { ...s.doc, loading: true, error: null } }));
    try {
      const file = await files.readFile(path);
      const parsed = parse(file.text);
      const gate = evaluateReadOnly(file.text, file.size, parsed.diagnostics, get().settings);
      const nextSession = withRecentFile(get().session, { path: file.path, name: file.name });
      saveSession(nextSession);

      set((s) => ({
        session: nextSession,
        doc: {
          ...EMPTY_DOC,
          path: file.path,
          name: file.name,
          source: file.text,
          savedSource: file.text,
          hash: file.hash,
          render: parsed,
          encoding: { bom: file.bom, eol: file.eol },
          mtimeMs: file.mtimeMs,
          size: file.size,
          readOnly: gate.readOnly,
          readOnlyReason: gate.reason,
        },
        diagnostics: parsed.diagnostics,
        ui: { ...s.ui, notice: null, activeHeadingId: null, progress: 0 },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set((s) => ({ doc: { ...s.doc, loading: false, error: message } }));
    }
  },

  newDocument: () => {
    const parsed = parse('');
    set({
      doc: { ...EMPTY_DOC, render: parsed },
      diagnostics: [],
      ui: { mode: 'read', sidebar: 'outline', searchQuery: '', activeHeadingId: null, progress: 0, notice: null },
    });
  },

  setSource: (source) => {
    const { doc } = get();
    if (doc.readOnly) {
      get().notify('warning', '当前文档处于安全只读模式，编辑已禁用。');
      return;
    }
    const parsed = parse(source);
    set({
      doc: { ...doc, source, hash: contentHash(source), render: parsed },
      diagnostics: parsed.diagnostics,
    });
  },

  applyBlockEdit: (blockIndex, text, caretOffset) => {
    const { doc } = get();
    if (doc.readOnly) {
      get().notify('warning', '当前文档处于安全只读模式，编辑已禁用。');
      return null;
    }
    const block = doc.render?.blocks[blockIndex];
    if (!block) return null;

    /*
     * Block ranges are expressed against the LF-normalised source, because that is what the
     * parser sees. Splicing must therefore happen in the same space, and the file's own
     * line-ending style is restored afterwards — otherwise editing one paragraph of a CRLF
     * file would quietly convert every other line ending to LF.
     */
    const normalized = normalizeEol(doc.source);
    const start = block.range.start.offset;
    const end = block.range.end.offset;
    if (text === normalized.slice(start, end)) return blockIndex;

    const spliced = normalized.slice(0, start) + text + normalized.slice(end);
    get().setSource(applyEol(spliced, doc.encoding.eol));

    // Re-locate the caret: the edit may have added or removed blocks above it.
    const blocks = get().doc.render?.blocks ?? [];
    const target = blocks.find((candidate) => caretOffset >= candidate.range.start.offset && caretOffset <= candidate.range.end.offset);
    return target?.index ?? null;
  },

  setSourceFromEditor: (normalizedSource) => {
    const { doc } = get();
    get().setSource(applyEol(normalizedSource, doc.encoding.eol));
  },

  save: async () => {
    const { doc, settings } = get();
    if (doc.readOnly) {
      get().notify('warning', '安全只读模式下不会写入源文件。');
      return;
    }
    if (!doc.path) {
      await get().saveAs();
      return;
    }
    try {
      const result = await files.writeFile(doc.path, doc.source, {
        bom: doc.encoding.bom,
        eol: doc.encoding.eol,
        makeBackup: settings.safety.keepBackups,
        ...(doc.mtimeMs !== null ? { expectedMtimeMs: doc.mtimeMs } : {}),
      });
      set((s) => ({
        doc: { ...s.doc, savedSource: s.doc.source, mtimeMs: result.mtimeMs, size: result.size, externalChange: null },
        ui: { ...s.ui, notice: { kind: 'info', message: result.backupPath ? '已保存（已创建备份）' : '已保存' } },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set((s) => ({ ui: { ...s.ui, notice: { kind: 'error', message: `保存失败：${message}` } } }));
    }
  },

  saveAs: async () => {
    const { doc, settings } = get();
    const suggested = doc.name || 'untitled.md';
    const path = await files.pickSavePath(suggested);
    if (!path) return;
    try {
      const result = await files.writeFile(path, doc.source, {
        bom: doc.encoding.bom,
        eol: doc.encoding.eol,
        makeBackup: settings.safety.keepBackups,
      });
      set((s) => ({
        doc: {
          ...s.doc,
          path,
          name: path.split(/[\\/]/).pop() ?? suggested,
          savedSource: s.doc.source,
          mtimeMs: result.mtimeMs,
          size: result.size,
        },
        ui: { ...s.ui, notice: { kind: 'info', message: '已另存为' } },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set((s) => ({ ui: { ...s.ui, notice: { kind: 'error', message: `另存为失败：${message}` } } }));
    }
  },

  checkExternalChange: async () => {
    const { doc } = get();
    if (!doc.path || doc.mtimeMs === null) return;
    const stat = await files.statFile(doc.path);
    if (!stat?.exists || stat.mtimeMs === doc.mtimeMs) return;
    set((s) => ({ doc: { ...s.doc, externalChange: { mtimeMs: stat.mtimeMs } } }));
  },

  rememberPosition: (position) => {
    const { doc, session } = get();
    if (!doc.path) return;
    const next = withReadingPosition(session, doc.path, {
      ...position,
      hash: doc.hash,
      updatedAt: Date.now(),
    });
    saveSession(next);
    set({ session: next });
  },

  forgetRecent: (path) => {
    const next = forgetFile(get().session, path);
    saveSession(next);
    set({ session: next });
  },

  setMode: (mode) => set((s) => ({ ui: { ...s.ui, mode } })),
  setSidebar: (panel) => set((s) => ({ ui: { ...s.ui, sidebar: s.ui.sidebar === panel ? null : panel } })),
  setSearchQuery: (query) => set((s) => ({ ui: { ...s.ui, searchQuery: query } })),
  setActiveHeading: (id) => set((s) => ({ ui: { ...s.ui, activeHeadingId: id } })),
  setProgress: (value) => set((s) => ({ ui: { ...s.ui, progress: Math.min(1, Math.max(0, value)) } })),
  notify: (kind, message) => set((s) => ({ ui: { ...s.ui, notice: { kind, message } } })),
  clearNotice: () => set((s) => ({ ui: { ...s.ui, notice: null } })),

  addRuntimeDiagnostics: (items) => {
    if (items.length === 0) return;
    set((s) => {
      const seen = new Set(s.diagnostics.map((d) => `${d.code}@${d.range.start.offset}`));
      const merged = [...s.diagnostics];
      for (const item of items) {
        const key = `${item.code}@${item.range.start.offset}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(item);
      }
      return { diagnostics: merged };
    });
  },

  updateSettings: (mutate) => {
    const next = mutate(get().settings);
    applySettingsToDocument(next);
    saveSettings(next);
    set({ settings: next });
  },
}));

/** True when the document has unsaved edits. */
export function isDirty(doc: DocumentState): boolean {
  return doc.source !== doc.savedSource;
}

export function outlineOf(doc: DocumentState): OutlineEntry[] {
  return doc.render?.outline ?? [];
}

export { resolveTheme };
