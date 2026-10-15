import { useStore } from '@/app/store';
import { t } from '@/i18n';

/**
 * Recently opened files.
 *
 * Rendered in two places from one component: as a sidebar panel, and inside the empty state
 * where it is most valuable — an app with nothing open should offer the reader somewhere to
 * go rather than a blank page.
 *
 * Opening a file is a path round-trip through the same `openPath` action the file dialog
 * uses, so a recent entry exercises exactly the same code as a fresh open.
 */

interface RecentPanelProps {
  /** Compact rendering for the empty state, which has less room. */
  compact?: boolean;
}

export function RecentPanel({ compact = false }: RecentPanelProps) {
  const recent = useStore((s) => s.session.recent);
  const positions = useStore((s) => s.session.positions);
  const currentPath = useStore((s) => s.doc.path);
  const openPath = useStore((s) => s.openPath);
  const forgetRecent = useStore((s) => s.forgetRecent);

  if (recent.length === 0) {
    return <p className="om-panel__empty">{t('panel.recent.empty')}</p>;
  }

  return (
    <ul className="om-recent" data-om-testid="recent-list">
      {recent.slice(0, compact ? 6 : undefined).map((file) => {
        const position = positions[file.path];
        const percent = position ? Math.round(position.progress * 100) : 0;
        return (
          <li key={file.path} className="om-recent__item">
            <button
              type="button"
              className="om-recent__open"
              data-active={file.path === currentPath ? 'true' : undefined}
              title={file.path}
              onClick={() => void openPath(file.path)}
            >
              <span className="om-recent__name">{file.name}</span>
              <span className="om-recent__path">{parentOf(file.path)}</span>
              {percent > 0 && (
                <span className="om-recent__progress" title={`已读 ${percent}%`}>
                  {percent}%
                </span>
              )}
            </button>
            <button
              type="button"
              className="om-recent__forget"
              title={t('panel.recent.forget')}
              aria-label={`${t('panel.recent.forget')}: ${file.name}`}
              onClick={() => forgetRecent(file.path)}
            >
              ×
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The containing folder, shortened from the left so the nearest directory stays visible. */
function parentOf(path: string): string {
  const parts = path.split(/[\\/]/);
  parts.pop();
  if (parts.length === 0) return '';
  const tail = parts.slice(-2).join('/');
  return parts.length > 2 ? `…/${tail}` : tail;
}
