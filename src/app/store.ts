import { create } from 'zustand';
import type { MarkdownIt } from 'markdown-it';
import type { Diagnostic, OutlineEntry, ParsedDocument } from '@/core/markdown/types';
import { createEngine, parseDocument } from '@/core/markdown/engine';
import { rebuildMathSource } from '@/core/markdown/math-source';
import { tryExportStandaloneHtml, tryExportPdf } from '@/core/export';
import { assetDiagnostics, type AssetStatus } from '@/core/diagnostics/assets';
import { encodingDiagnostics } from '@/core/diagnostics/encoding';
import type { ImageReference } from '@/core/markdown/types';
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

/**
 * Runs the document health check over a parse result.
 *
 * Separate from `parse` because it needs the filesystem, and `parse` is synchronous and runs
 * on every keystroke. Results are merged into the diagnostics list rather than being part of
 * the parse result, so a slow or unavailable filesystem degrades to "no asset diagnostics"
 * instead of blocking the first paint.
 */
async function checkAssets(images: readonly ImageReference[], documentPath: string | null): Promise<Diagnostic[]> {
  if (!documentPath || images.length === 0) return [];

  const statuses = new Map<string, AssetStatus>();
  for (const path of new Set(images.map((image) => image.path))) {
    statuses.set(path, await files.resolveAssetStatus(documentPath, path));
  }
  return assetDiagnostics(images, (path) => statuses.get(path) ?? 'unknown');
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
  /**
   * Tab ids in display order.
   *
   * The *inactive* documents live in `parkedTabs`; the active one is `doc`, which is what every
   * component already reads. Switching tabs swaps `doc` and nothing downstream has to know that
   * tabs exist.
   */
  tabOrder: string[];
  activeTabId: string;
  parkedTabs: Record<string, DocumentState>;
  /** Each parked tab's diagnostics, restored when it is brought forward. */
  parkedDiagnostics: Record<string, Diagnostic[]>;
  ui: UiState;
  /** Recently opened files and where the reader had got to in each. Persisted. */
  session: SessionState;
  /** Diagnostics from the last render, surfaced to the panel and the status bar. */
  diagnostics: Diagnostic[];

  openViaDialog: () => Promise<void>;
  openPath: (path: string) => Promise<void>;
  /** Opens a path in its own tab, regardless of what the current tab holds. */
  openPathInNewTab: (path: string) => Promise<void>;
  /** Brings a tab to the front. A no-op for the tab already showing. */
  activateTab: (id: string) => void;
  /** Closes a tab, activating a neighbour when the closed one was on screen. */
  closeTab: (id: string) => void;
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
  /**
   * Replaces the body of one formula, keeping its delimiters and formatting.
   *
   * The edit is spliced into the authoritative source at the expression's own range, so
   * nothing outside the formula can change. Returns `false` when the source could not be
   * rebuilt safely, in which case nothing is written.
   */
  applyMathEdit: (mathId: string, newTex: string) => boolean;
  /**
   * Writes a self-contained HTML copy of the document.
   *
   * The export is taken from the *live* rendered DOM when it is available, so the formulas and
   * diagrams in the file are the ones the reader is looking at rather than a second
   * typesetting pass that could differ. Lazy rendering leaves off-screen formulas empty, and
   * the exporter fills those in itself.
   */
  exportHtml: () => Promise<void>;
  /** Writes a PDF, printed from the same self-contained HTML by the desktop shell. */
  exportPdf: () => Promise<void>;
  save: () => Promise<void>;
  saveAs: () => Promise<void>;
  checkExternalChange: () => Promise<void>;
  /**
   * Lifts the safe read-only restriction on the current document.
   *
   * The restriction exists so that opening a file can never modify it. It is a default, not a
   * lock: the reader may know the file is theirs and simply want to edit it, and a mode with
   * no way out would be a dead end rather than a safety feature. Unlocking is always explicit
   * and never automatic.
   */
  unlockEditing: () => void;
  /**
   * Records how far the reader has got in a document. Called on a debounce while scrolling, so
   * it must stay cheap.
   *
   * `path` is passed in rather than read from the current document. A tab switch mutates the
   * DOM *before* running the outgoing view's effect cleanup, so resolving the path at save time
   * would file the position under whichever document had just arrived — losing the reader's
   * place in the one they left.
   */
  rememberPosition: (
    path: string,
    position: { scrollTop: number; progress: number; headingId: string | null },
  ) => void;
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

/**
 * Loads a path into the tab that is currently on screen.
 *
 * Shared by `openPath` and `openPathInNewTab`: the only difference between them is which tab is
 * active by the time it runs, and duplicating this would mean two places to keep encoding
 * detection, read-only gating and the asset check consistent.
 */
async function loadIntoActiveTab(
  path: string,
  set: (partial: Partial<AppStore> | ((state: AppStore) => Partial<AppStore>)) => void,
  get: () => AppStore,
): Promise<void> {
  set((s) => ({ doc: { ...s.doc, loading: true, error: null } }));
  try {
    const file = await files.readFile(path);
    const parsed = parse(file.text);
    const gate = evaluateReadOnly(file.text, file.size, parsed.diagnostics, get().settings);
    // Encoding facts are known only here, not by the parser: it receives text, not bytes.
    const encodingIssues = encodingDiagnostics(file);

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
      diagnostics: [...encodingIssues, ...parsed.diagnostics],
      ui: { ...s.ui, notice: null, activeHeadingId: null, progress: 0 },
    }));

    void checkAssets(parsed.images, file.path).then((assetIssues) => {
      // Ignore the result if another document has been opened in the meantime.
      if (get().doc.path === file.path) get().addRuntimeDiagnostics(assetIssues);
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    set((s) => ({ doc: { ...s.doc, loading: false, error: message } }));
  }
}

const initialSettings = loadSettings();
applySettingsToDocument(initialSettings);
const initialSession = loadSession();

/**
 * A tab that has never held anything is safe to reuse rather than opening another.
 * An empty untitled buffer is not something a user expects to have to close.
 */
function isPristineTab(doc: DocumentState): boolean {
  return doc.path === null && doc.source === '' && doc.savedSource === '';
}

/** The id of the tab already holding `path`, or null. */
function findTabByPath(state: AppStore, path: string): string | null {
  for (const id of state.tabOrder) {
    const tabDoc = id === state.activeTabId ? state.doc : state.parkedTabs[id];
    if (tabDoc?.path === path) return id;
  }
  return null;
}

/** Monotonic, so a closed tab's id is never handed to a later one. */
let nextTabId = 1;
function newTabId(): string {
  return `tab-${++nextTabId}`;
}

export const useStore = create<AppStore>((set, get) => ({
  settings: initialSettings,
  doc: EMPTY_DOC,
  /*
   * Multi-tab support keeps the *active* document in `doc`, where every component already
   * reads it, and parks the others here. Switching tabs swaps `doc`, so the entire reading and
   * editing pipeline is untouched by tabs — nothing downstream has to know they exist.
   */
  tabOrder: ['tab-1'],
  activeTabId: 'tab-1',
  parkedTabs: {},
  parkedDiagnostics: {},
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
    const state = get();
    // Opening a file that is already open brings its tab forward instead of duplicating it.
    const existing = findTabByPath(state, path);
    if (existing) {
      get().activateTab(existing);
      return;
    }
    if (isPristineTab(state.doc)) {
      await loadIntoActiveTab(path, set, get);
      return;
    }
    await get().openPathInNewTab(path);
  },

  openPathInNewTab: async (path) => {
    const state = get();
    const existing = findTabByPath(state, path);
    if (existing) {
      get().activateTab(existing);
      return;
    }
    const id = newTabId();
    set((s) => ({
      tabOrder: [...s.tabOrder, id],
      activeTabId: id,
      parkedTabs: { ...s.parkedTabs, [s.activeTabId]: s.doc },
      parkedDiagnostics: { ...s.parkedDiagnostics, [s.activeTabId]: s.diagnostics },
      doc: { ...EMPTY_DOC, loading: true },
      diagnostics: [],
    }));
    await loadIntoActiveTab(path, set, get);
  },

  activateTab: (id) => {
    const { activeTabId, parkedTabs, parkedDiagnostics, doc, diagnostics } = get();
    if (id === activeTabId) return;
    const target = parkedTabs[id];
    if (!target) return;

    const nextParked = { ...parkedTabs, [activeTabId]: doc };
    delete nextParked[id];
    const nextParkedDiagnostics = { ...parkedDiagnostics, [activeTabId]: diagnostics };
    const restored = nextParkedDiagnostics[id] ?? [];
    delete nextParkedDiagnostics[id];

    set({
      doc: target,
      diagnostics: restored,
      activeTabId: id,
      parkedTabs: nextParked,
      parkedDiagnostics: nextParkedDiagnostics,
      ui: { ...get().ui, notice: null, activeHeadingId: null, progress: 0 },
    });
  },

  closeTab: (id) => {
    const { tabOrder, activeTabId, parkedTabs, parkedDiagnostics } = get();
    const index = tabOrder.indexOf(id);
    if (index < 0) return;
    if (tabOrder.length <= 1) {
      // Closing the last tab leaves an empty document rather than an empty window.
      get().newDocument();
      return;
    }

    const nextOrder = tabOrder.filter((tabId) => tabId !== id);
    const nextParked = { ...parkedTabs };
    const nextParkedDiagnostics = { ...parkedDiagnostics };
    delete nextParked[id];
    delete nextParkedDiagnostics[id];

    if (id !== activeTabId) {
      set({ tabOrder: nextOrder, parkedTabs: nextParked, parkedDiagnostics: nextParkedDiagnostics });
      return;
    }

    // Prefer the tab to the left, which is what every editor does.
    const neighbour = nextOrder[Math.max(0, index - 1)]!;
    const target = nextParked[neighbour];
    if (!target) {
      set({ tabOrder: nextOrder, parkedTabs: nextParked, parkedDiagnostics: nextParkedDiagnostics });
      return;
    }
    delete nextParked[neighbour];
    const restored = nextParkedDiagnostics[neighbour] ?? [];
    delete nextParkedDiagnostics[neighbour];
    set({
      tabOrder: nextOrder,
      parkedTabs: nextParked,
      parkedDiagnostics: nextParkedDiagnostics,
      activeTabId: neighbour,
      doc: target,
      diagnostics: restored,
      ui: { ...get().ui, notice: null, activeHeadingId: null, progress: 0 },
    });
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

  applyMathEdit: (mathId, newTex) => {
    const { doc } = get();
    if (doc.readOnly) {
      get().notify('warning', '当前文档处于安全只读模式，编辑已禁用。');
      return false;
    }
    const expr = doc.render?.math.find((candidate) => candidate.id === mathId);
    if (!expr) return false;
    if (newTex === expr.tex) return true;

    const normalized = normalizeEol(doc.source);
    const start = expr.range.start.offset;
    const end = expr.range.end.offset;
    const replacement = rebuildMathSource(expr, newTex, normalized.slice(start, end));
    if (replacement === null) {
      get().notify('error', '无法安全地改写该公式的源码，已取消编辑。');
      return false;
    }

    const spliced = normalized.slice(0, start) + replacement + normalized.slice(end);
    get().setSource(applyEol(spliced, doc.encoding.eol));
    return true;
  },

  exportHtml: async () => {
    const { doc } = get();
    if (!doc.render || !doc.path) {
      get().notify('warning', '请先保存文档，再导出。');
      return;
    }
    const target = await files.pickSavePath(withExtension(doc.name, 'html'), 'html');
    if (!target) return;

    const outcome = await tryExportStandaloneHtml({
      result: doc.render,
      sourcePath: doc.path,
      liveRoot: document.querySelector<HTMLElement>('.om-doc'),
      theme: resolveTheme(get().settings.reading.theme),
    });
    if (!outcome.ok) {
      get().notify('error', `导出失败：${outcome.error.message}`);
      return;
    }
    // Report anything the export could not carry over, so the reader is not left wondering
    // why a figure is missing from the file they just produced.
    const report = outcome.result.report;
    if (!report.verification.selfContained) {
      get().notify('warning', '导出的文件包含外部引用，离线打开时可能无法完整显示。');
    } else if (report.missingImages.length > 0 || report.mathErrors.length > 0) {
      get().notify(
        'warning',
        `导出完成，但有 ${report.missingImages.length} 张图片和 ${report.mathErrors.length} 个公式未能包含。`,
      );
    }

    try {
      await files.writeFile(target, outcome.result.html, { bom: false, eol: 'lf', makeBackup: false });
      get().notify('info', `已导出 HTML：${baseName(target)}`);
    } catch (err) {
      get().notify('error', `写入失败：${err instanceof Error ? err.message : String(err)}`);
    }
  },

  exportPdf: async () => {
    const { doc } = get();
    if (!doc.render || !doc.path) {
      get().notify('warning', '请先保存文档，再导出。');
      return;
    }
    const target = await files.pickSavePath(withExtension(doc.name, 'pdf'), 'pdf');
    if (!target) return;

    // Print from the same self-contained HTML the HTML export produces, so the two outputs
    // cannot drift apart.
    const source = await tryExportStandaloneHtml({
      result: doc.render,
      sourcePath: doc.path,
      liveRoot: document.querySelector<HTMLElement>('.om-doc'),
      theme: 'light',
    });
    if (!source.ok) {
      get().notify('error', `导出失败：${source.error.message}`);
      return;
    }

    const outcome = await tryExportPdf(source.result.html, target);
    if (!outcome.ok) {
      get().notify('error', outcome.error.message);
      return;
    }
    get().notify('info', `已导出 PDF：${baseName(target)}${outcome.result.pageCount ? `（${outcome.result.pageCount} 页）` : ''}`);
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

  rememberPosition: (path, position) => {
    const { doc, session, parkedTabs } = get();
    if (!path) return;
    // The hash comes from the document that owns the path, which may be a parked tab.
    const owner = doc.path === path ? doc : Object.values(parkedTabs).find((tab) => tab.path === path);
    if (!owner) return;
    const next = withReadingPosition(session, path, {
      ...position,
      hash: owner.hash,
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

  unlockEditing: () => {
    set((s) => ({ doc: { ...s.doc, readOnly: false, readOnlyReason: null } }));
    get().notify('info', '已解除只读限制，保存将写入源文件。');
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

/** Replaces a markdown file name's extension with another one. */
function withExtension(name: string, extension: string): string {
  return `${name.replace(/\.(md|markdown|mdown|mkd|txt)$/i, '')}.${extension}`;
}

/** The file's own name, for a status message. */
function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** True when the document has unsaved edits. */
export function isDirty(doc: DocumentState): boolean {
  return doc.source !== doc.savedSource;
}

export function outlineOf(doc: DocumentState): OutlineEntry[] {
  return doc.render?.outline ?? [];
}

export { resolveTheme };
