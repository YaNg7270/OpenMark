import { useStore } from '@/app/store';
import { OutlinePanel } from './OutlinePanel';
import { SearchPanel } from './SearchPanel';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { SettingsPanel } from './SettingsPanel';
import { RecentPanel } from './RecentPanel';
import { t } from '@/i18n';
import type { AppSettings } from '@/app/settings';
import type { Diagnostic, OutlineEntry } from '@/core/markdown/types';

/**
 * Side panel host.
 *
 * Panels mount only while selected, so the search panel's DOM walk and the settings
 * panel's control tree never exist during ordinary reading.
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

interface SidebarProps {
  getDocumentRoot: () => HTMLElement | null;
  onOutlineSelect: (entry: OutlineEntry) => void;
  onDiagnosticSelect: (diagnostic: Diagnostic) => void;
  onSettingsChange: (mutate: (draft: AppSettings) => AppSettings) => void;
}

export function Sidebar({ getDocumentRoot, onOutlineSelect, onDiagnosticSelect, onSettingsChange }: SidebarProps) {
  const sidebar = useStore((s) => s.ui.sidebar);
  const outline = useStore((s) => s.doc.render?.outline ?? NO_OUTLINE);
  const diagnostics = useStore((s) => s.diagnostics);
  const activeHeadingId = useStore((s) => s.ui.activeHeadingId);

  if (!sidebar) return null;

  return (
    <aside className="om-sidebar" data-om-panel={sidebar} aria-label={t(`panel.${sidebar}`)}>
      <header className="om-sidebar__header">
        <h2 className="om-sidebar__title">{t(`panel.${sidebar}`)}</h2>
      </header>
      <div className="om-sidebar__body">
        {sidebar === 'outline' && (
          <OutlinePanel outline={outline} activeId={activeHeadingId} onSelect={onOutlineSelect} />
        )}
        {sidebar === 'search' && <SearchPanel getRoot={getDocumentRoot} />}
        {sidebar === 'diagnostics' && <DiagnosticsPanel diagnostics={diagnostics} onSelect={onDiagnosticSelect} />}
        {sidebar === 'settings' && <SettingsPanel onChange={onSettingsChange} />}
        {sidebar === 'recent' && <RecentPanel />}
      </div>
    </aside>
  );
}
