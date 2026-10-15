import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { DocumentView } from './components/DocumentView';
import { InstantView } from './components/InstantView';
import { Sidebar } from './components/Sidebar';
import { SourceEditor } from './components/SourceEditor';
import { StatusBar } from './components/StatusBar';
import { Toolbar, AVAILABLE_MODES } from './components/Toolbar';
import { isDirty, useStore, type ViewMode } from './app/store';
import { isDesktop, openExternal } from './core/fs/fileService';
import { setLanguage, t } from '@/i18n';
import type { Diagnostic, OutlineEntry } from '@/core/markdown/types';

/**
 * Application shell.
 *
 * Responsibilities kept here are the ones that need the whole window: keyboard shortcuts,
 * drag-and-drop, external-change polling, auto-save, and dispatching link navigation.
 * Everything else lives in its own component so a change to the toolbar cannot affect the
 * reading surface.
 */

const MODE_ORDER: ViewMode[] = ['read', 'instant', 'source', 'split'];

export function App() {
  const doc = useStore((s) => s.doc);
  const ui = useStore((s) => s.ui);
  const settings = useStore((s) => s.settings);
  const openViaDialog = useStore((s) => s.openViaDialog);
  const openPath = useStore((s) => s.openPath);
  const save = useStore((s) => s.save);
  const setSource = useStore((s) => s.setSourceFromEditor);
  const setMode = useStore((s) => s.setMode);
  const setSidebar = useStore((s) => s.setSidebar);
  const setActiveHeading = useStore((s) => s.setActiveHeading);
  const updateSettings = useStore((s) => s.updateSettings);
  const clearNotice = useStore((s) => s.clearNotice);
  const checkExternalChange = useStore((s) => s.checkExternalChange);
  const notify = useStore((s) => s.notify);

  const [dragging, setDragging] = useState(false);
  // Source mode owns the caret; the reading surface owns its own scroll position.
  const sourceHostRef = useRef<HTMLDivElement | null>(null);
  const readHostRef = useRef<HTMLDivElement | null>(null);

  const getDocumentRoot = useCallback(() => {
    const host = readHostRef.current;
    return host?.querySelector<HTMLElement>('.om-doc') ?? sourceHostRef.current ?? null;
  }, []);

  useEffect(() => {
    setLanguage(settings.language);
  }, [settings.language]);

  // --- window title reflects the document and its dirty state -------------------
  useEffect(() => {
    const dirty = isDirty(doc) ? '• ' : '';
    document.title = `${dirty}${doc.name} — OpenMark`;
  }, [doc]);

  // --- file opened from the OS (file association / "Open with") -----------------
  //
  // The Rust side keeps the window hidden until the frontend reports it is listening, so
  // a file passed on the command line or by a second instance is delivered to a live
  // handler instead of racing the first render and being dropped.
  useEffect(() => {
    if (!isDesktop()) return;
    let disposed = false;
    void listen<string>('openmark://open-file', (event) => {
      if (event.payload) void openPath(event.payload);
    }).then(() => {
      if (!disposed) void invoke('frontend_ready');
    });
    return () => {
      disposed = true;
    };
  }, [openPath]);

  // --- external change detection -------------------------------------------------
  useEffect(() => {
    if (!isDesktop() || !doc.path) return;
    const timer = window.setInterval(() => void checkExternalChange(), 2500);
    return () => window.clearInterval(timer);
  }, [checkExternalChange, doc.path]);

  // --- auto save -----------------------------------------------------------------
  useEffect(() => {
    if (!settings.editor.autoSave || doc.readOnly || !doc.path) return;
    if (!isDirty(doc)) return;
    const timer = window.setTimeout(() => void save(), settings.editor.autoSaveDelayMs);
    return () => window.clearTimeout(timer);
  }, [doc, save, settings.editor.autoSave, settings.editor.autoSaveDelayMs]);

  // --- notices auto-dismiss ------------------------------------------------------
  useEffect(() => {
    if (!ui.notice) return;
    const timer = window.setTimeout(clearNotice, 4200);
    return () => window.clearTimeout(timer);
  }, [ui.notice, clearNotice]);

  const jumpToHeading = useCallback(
    (entry: OutlineEntry) => {
      setActiveHeading(entry.id);
      const target = getDocumentRoot()?.querySelector<HTMLElement>(`#${CSS.escape(entry.id)}`);
      target?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    },
    [getDocumentRoot, setActiveHeading],
  );

  const jumpToDiagnostic = useCallback(
    (diagnostic: Diagnostic) => {
      const root = getDocumentRoot();
      if (!root) return;
      // Prefer the real formula node so the reader sees the failure in place.
      const selector = diagnostic.mathId
        ? `[data-om-math="${CSS.escape(diagnostic.mathId)}"]`
        : diagnostic.source === 'mermaid'
          ? '[data-om-mermaid]'
          : null;
      const target = selector ? root.querySelector<HTMLElement>(selector) : null;
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      target?.classList.add('om-flash');
      window.setTimeout(() => target?.classList.remove('om-flash'), 1200);
    },
    [getDocumentRoot],
  );

  const handleLink = useCallback(
    (href: string) => {
      if (href.startsWith('#')) {
        const target = getDocumentRoot()?.querySelector<HTMLElement>(`#${CSS.escape(href.slice(1))}`);
        target?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        return;
      }
      if (/^https?:|^mailto:/i.test(href)) {
        void openExternal(href).catch(() => notify('warning', `无法打开链接：${href}`));
        return;
      }
      notify('info', `本地链接：${decodeURI(href)}（编辑里程碑中实现文件跳转）`);
    },
    [getDocumentRoot, notify],
  );

  // --- keyboard shortcuts --------------------------------------------------------
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      /*
       * When the source editor has focus it owns the keyboard, including Ctrl+F for its own
       * find/replace panel and Ctrl+Z for its own undo stack. Intercepting those here would
       * make the editor feel broken, so the global handler stands down.
       */
      if (event.target instanceof Element && event.target.closest('[data-om-editor]')) return;

      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 'o') {
        event.preventDefault();
        void openViaDialog();
        return;
      }
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save();
        return;
      }
      if (mod && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setSidebar('search');
        return;
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        setSidebar('diagnostics');
        return;
      }
      if (mod && event.key === ',') {
        event.preventDefault();
        setSidebar('settings');
        return;
      }
      if (event.key === 'Escape') {
        if (useStore.getState().settings.reading.focusMode) {
          updateSettings((draft) => ({ ...draft, reading: { ...draft.reading, focusMode: false } }));
        }
        return;
      }
      if (event.key === 'F11') {
        event.preventDefault();
        updateSettings((draft) => ({
          ...draft,
          reading: { ...draft.reading, focusMode: !draft.reading.focusMode },
        }));
        return;
      }
      // Ctrl+1..4 select a view mode, skipping modes that are not implemented yet.
      if (mod && /^[1-4]$/.test(event.key)) {
        const candidate = MODE_ORDER[Number(event.key) - 1];
        if (candidate && AVAILABLE_MODES[candidate]) {
          event.preventDefault();
          setMode(candidate);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openViaDialog, save, setMode, setSidebar, updateSettings]);

  // --- drag and drop -------------------------------------------------------------
  const onDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(false);
      const file = event.dataTransfer.files[0];
      if (!file) return;
      // The webview cannot read a dropped file's path for security reasons; only the
      // desktop shell can, and it reports it through `path` on the Tauri file object.
      const path = (file as File & { path?: string }).path;
      if (path) {
        await openPath(path);
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        notify('warning', '请通过「打开」按钮打开较大的文件。');
        return;
      }
      // Browser fallback: read the dropped content directly.
      const text = await file.text();
      useStore.setState((s) => ({
        doc: { ...s.doc, path: null, name: file.name, source: text, savedSource: text },
      }));
      setSource(text);
    },
    [notify, openPath, setSource],
  );

  const showReader = ui.mode === 'read' || ui.mode === 'split';
  const showInstant = ui.mode === 'instant';
  const showSource = ui.mode === 'source' || ui.mode === 'split';

  const body = useMemo(
    () => (
      <div className="om-body" data-mode={ui.mode}>
        <Sidebar
          getDocumentRoot={getDocumentRoot}
          onOutlineSelect={jumpToHeading}
          onDiagnosticSelect={jumpToDiagnostic}
          onSettingsChange={updateSettings}
        />
        <main className="om-main">
          {showSource && (
            <div className="om-main__pane om-main__pane--source" ref={sourceHostRef}>
              <SourceEditor doc={doc} onChange={setSource} readOnly={doc.readOnly} />
            </div>
          )}
          {showReader && (
            <div className="om-main__pane om-main__pane--reader" ref={readHostRef}>
              <DocumentView doc={doc} onNavigate={handleLink} />
            </div>
          )}
          {showInstant && (
            <div className="om-main__pane om-main__pane--instant">
              <InstantView doc={doc} onNavigate={handleLink} />
            </div>
          )}
        </main>
      </div>
    ),
    [
      doc,
      getDocumentRoot,
      handleLink,
      jumpToDiagnostic,
      jumpToHeading,
      setSource,
      showInstant,
      showReader,
      showSource,
      ui.mode,
      updateSettings,
    ],
  );

  return (
    <div
      className="om-shell"
      data-om-dragging={dragging ? 'true' : undefined}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => void onDrop(event)}
    >
      <Toolbar
        onOpen={() => void openViaDialog()}
        onSave={() => void save()}
        onToggleTheme={() =>
          updateSettings((draft) => {
            const next = draft.reading.theme === 'dark' ? 'light' : 'dark';
            return { ...draft, reading: { ...draft.reading, theme: next } };
          })
        }
      />
      {body}
      <StatusBar />

      {doc.externalChange && (
        <div className="om-banner" role="alert">
          <span>{t('notice.externalChange')}</span>
          <button type="button" className="om-button" onClick={() => doc.path && void openPath(doc.path)}>
            {t('notice.reload')}
          </button>
          <button type="button" className="om-button" onClick={() => void save()}>
            {t('notice.keepMine')}
          </button>
        </div>
      )}

      {ui.notice && (
        <div className="om-toast" data-kind={ui.notice.kind} role="status" onClick={clearNotice}>
          {ui.notice.message}
        </div>
      )}

      {dragging && <div className="om-dropzone">{t('drop.hint')}</div>}
    </div>
  );
}
