import { useStore, type SidebarPanel } from '@/app/store';
import { OutlinePanel } from './OutlinePanel';
import { SearchPanel } from './SearchPanel';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { SettingsPanel } from './SettingsPanel';
import { RecentPanel } from './RecentPanel';
import { VersionHistory } from './VersionHistory';
import { X } from './icons';
import { t } from '@/i18n';
import type { AppSettings } from '@/app/settings';
import type { Diagnostic, OutlineEntry } from '@/core/markdown/types';

/**
 * The margin: the column to the left of the page that carries the outline, search,
 * diagnostics and recent files.
 *
 * Panels mount only while selected, so the search panel's DOM walk never runs during ordinary
 * reading. The switch above them is a row of words, not icons: there are four, and each name is
 * shorter than the tooltip an icon would need.
 */

/**
 * Shared empty outline.
 *
 * A store selector must return a stable reference between updates. Writing
 * `s.doc.render?.outline ?? []` inline allocates a fresh array on every snapshot
 * comparison, so zustand sees a change on every store read and React re-renders forever
 * (React error #185). One module-level constant removes the whole class of bug.
 */
const NO_OUTLINE: readonly OutlineEntry[] = [];

const PANELS: { id: SidebarPanel; key: string }[] = [
  { id: 'outline', key: 'panel.outline' },
  { id: 'search', key: 'panel.search' },
  { id: 'diagnostics', key: 'panel.diagnostics' },
  { id: 'recent', key: 'panel.recentShort' },
];

interface SidebarProps {
  getDocumentRoot: () => HTMLElement | null;
  onOutlineSelect: (entry: OutlineEntry) => void;
  onDiagnosticSelect: (diagnostic: Diagnostic) => void;
}

export function Sidebar({ getDocumentRoot, onOutlineSelect, onDiagnosticSelect }: SidebarProps) {
  const sidebar = useStore((s) => s.ui.sidebar);
  const outline = useStore((s) => s.doc.render?.outline ?? NO_OUTLINE);
  const diagnostics = useStore((s) => s.diagnostics);
  const activeHeadingId = useStore((s) => s.ui.activeHeadingId);
  const setSidebar = useStore((s) => s.setSidebar);

  if (!sidebar) return null;

  // Errors and warnings are worth a count; an informational note is not.
  const problems = diagnostics.filter((d) => d.severity !== 'info').length;

  return (
    <aside className="om-margin" data-om-panel={sidebar} aria-label={t(`panel.${sidebar}`)}>
      <div className="om-pswitch" role="tablist" aria-label={t('panel.label')}>
        {PANELS.map((panel) => (
          <button
            key={panel.id}
            type="button"
            role="tab"
            className="om-pswitch__item"
            aria-selected={sidebar === panel.id}
            data-om-testid={`panel-${panel.id}`}
            onClick={() => setSidebar(panel.id)}
          >
            {t(panel.key)}
            {panel.id === 'diagnostics' && problems > 0 && (
              <span className="om-count" aria-label={t('panel.diagnostics.problems', { n: String(problems) })}>
                {problems}
              </span>
            )}
          </button>
        ))}
      </div>
      <h2 className="om-visually-hidden">{t(`panel.${sidebar}`)}</h2>
      <div className="om-margin__body">
        {sidebar === 'outline' && (
          <OutlinePanel outline={outline} activeId={activeHeadingId} onSelect={onOutlineSelect} />
        )}
        {sidebar === 'search' && <SearchPanel getRoot={getDocumentRoot} />}
        {sidebar === 'diagnostics' && <DiagnosticsPanel diagnostics={diagnostics} onSelect={onDiagnosticSelect} />}
        {sidebar === 'recent' && (
          <>
            <VersionHistory />
            <RecentPanel />
          </>
        )}
      </div>
    </aside>
  );
}

interface SettingsDrawerProps {
  onSettingsChange: (mutate: (draft: AppSettings) => AppSettings) => void;
}

/** The settings drawer, on the page's right-hand side, opposite the margin. */
export function SettingsDrawer({ onSettingsChange }: SettingsDrawerProps) {
  const open = useStore((s) => s.ui.settingsOpen);
  const toggleSettings = useStore((s) => s.toggleSettings);
  if (!open) return null;

  return (
    <aside className="om-drawer" data-om-panel="settings" aria-label={t('panel.settings')}>
      <header className="om-drawer__head">
        <h2>{t('panel.settings')}</h2>
        <button
          type="button"
          className="om-ibtn"
          aria-label={t('dialog.close')}
          title={t('dialog.close')}
          onClick={() => toggleSettings(false)}
        >
          <X />
        </button>
      </header>
      <SettingsPanel onChange={onSettingsChange} />
    </aside>
  );
}
