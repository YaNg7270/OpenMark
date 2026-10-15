import { useStore, type SidebarPanel, type ViewMode } from '@/app/store';
import { t } from '@/i18n';

/**
 * Application toolbar.
 *
 * Mode switching is a segmented control because the four modes are mutually exclusive
 * views of the same document — a dropdown would hide the current state and add a click to
 * every switch. Panel toggles are independent, so they are ordinary toggle buttons.
 */

const MODES: { id: ViewMode; key: string }[] = [
  { id: 'read', key: 'mode.read' },
  { id: 'instant', key: 'mode.instant' },
  { id: 'source', key: 'mode.source' },
  { id: 'split', key: 'mode.split' },
];

const PANELS: { id: Exclude<SidebarPanel, null>; key: string; glyph: string }[] = [
  { id: 'outline', key: 'toolbar.outline', glyph: '☰' },
  { id: 'recent', key: 'toolbar.recent', glyph: '↺' },
  { id: 'search', key: 'toolbar.search', glyph: '⌕' },
  { id: 'diagnostics', key: 'toolbar.diagnostics', glyph: '⚠' },
  { id: 'settings', key: 'toolbar.settings', glyph: '⚙' },
];

/**
 * Which view modes are implemented.
 *
 * Unavailable modes are hidden rather than shown broken, so the control never offers
 * something that does not work.
 */
export const AVAILABLE_MODES: Record<ViewMode, boolean> = {
  read: true,
  instant: true,
  source: true,
  split: true,
};

interface ToolbarProps {
  onOpen: () => void;
  onSave: () => void;
  onToggleTheme: () => void;
  onExportHtml: () => void;
  onExportPdf: () => void;
}

export function Toolbar({ onOpen, onSave, onToggleTheme, onExportHtml, onExportPdf }: ToolbarProps) {
  const mode = useStore((s) => s.ui.mode);
  const sidebar = useStore((s) => s.ui.sidebar);
  const theme = useStore((s) => s.settings.reading.theme);
  const focusMode = useStore((s) => s.settings.reading.focusMode);
  const doc = useStore((s) => s.doc);
  const diagnostics = useStore((s) => s.diagnostics);
  const setMode = useStore((s) => s.setMode);
  const setSidebar = useStore((s) => s.setSidebar);
  const updateSettings = useStore((s) => s.updateSettings);

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;

  return (
    <header className="om-toolbar" data-om-focus-hidden={focusMode ? 'true' : undefined}>
      <div className="om-toolbar__group om-toolbar__group--brand">
        <span className="om-toolbar__brand">{t('app.name')}</span>
        <span className="om-toolbar__filename" title={doc.path ?? undefined} data-om-testid="document-name">
          {doc.name}
        </span>
        {doc.readOnly && (
          <span className="om-badge om-badge--readonly" title={doc.readOnlyReason ?? undefined}>
            {t('toolbar.readOnly')}
          </span>
        )}
      </div>

      <div className="om-toolbar__group">
        <button type="button" className="om-button" onClick={onOpen} data-om-testid="open-button">
          {t('toolbar.open')}
        </button>
        <button
          type="button"
          className="om-button"
          onClick={onSave}
          disabled={doc.readOnly}
          data-om-testid="save-button"
        >
          {t('toolbar.save')}
        </button>
      </div>

      <div className="om-toolbar__group om-segmented" role="tablist" aria-label="View mode">
        {MODES.filter((m) => AVAILABLE_MODES[m.id]).map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={mode === m.id}
            className="om-segmented__item"
            data-active={mode === m.id ? 'true' : undefined}
            data-om-testid={`mode-${m.id}`}
            onClick={() => setMode(m.id)}
          >
            {t(m.key)}
          </button>
        ))}
      </div>

      <div className="om-toolbar__group">
        {/*
          Export is disabled until the document has a path: a self-contained HTML file needs a
          directory to resolve relative images against, and offering the button before that
          would produce a broken export.
        */}
        <button
          type="button"
          className="om-button"
          onClick={onExportHtml}
          disabled={!doc.path || !doc.render}
          data-om-testid="export-html"
        >
          {t('toolbar.exportHtml')}
        </button>
        <button
          type="button"
          className="om-button"
          onClick={onExportPdf}
          disabled={!doc.path || !doc.render}
          data-om-testid="export-pdf"
        >
          {t('toolbar.exportPdf')}
        </button>
      </div>

      <div className="om-toolbar__group om-toolbar__group--end">
        <button
          type="button"
          className="om-icon-button"
          title={t('toolbar.focus')}
          data-active={focusMode ? 'true' : undefined}
          onClick={() => updateSettings((draft) => ({ ...draft, reading: { ...draft.reading, focusMode: !focusMode } }))}
        >
          ◱
        </button>
        <button
          type="button"
          className="om-icon-button"
          title={t(`toolbar.theme.${theme}`)}
          onClick={onToggleTheme}
          data-om-testid="theme-toggle"
        >
          {theme === 'dark' ? '☾' : '☀'}
        </button>
        {PANELS.map((panel) => (
          <button
            key={panel.id}
            type="button"
            className="om-icon-button"
            title={t(panel.key)}
            aria-pressed={sidebar === panel.id}
            data-active={sidebar === panel.id ? 'true' : undefined}
            data-om-testid={`panel-${panel.id}`}
            onClick={() => setSidebar(panel.id)}
          >
            {panel.glyph}
            {panel.id === 'diagnostics' && errorCount > 0 && (
              <span className="om-icon-button__count">{errorCount}</span>
            )}
          </button>
        ))}
      </div>
    </header>
  );
}
