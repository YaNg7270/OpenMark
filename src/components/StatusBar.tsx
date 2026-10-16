import { isDirty, useStore } from '@/app/store';
import { t } from '@/i18n';
import { WarningCircle } from './icons';

/**
 * The colophon: the document's measured facts plus its save state, set small along the foot of
 * the page the way a newspaper prints its imprint.
 *
 * Counts come from the parse (`RenderStats`), so they cost nothing to display and stay
 * consistent with what the renderer actually produced.
 */
export function StatusBar() {
  const doc = useStore((s) => s.doc);
  const unlockEditing = useStore((s) => s.unlockEditing);
  const progress = useStore((s) => s.ui.progress);
  const mode = useStore((s) => s.ui.mode);
  const showProgress = useStore((s) => s.settings.reading.showReadingProgress);
  const zoom = useStore((s) => s.settings.reading.zoom);
  const stats = doc.render?.stats;
  const readOnly = doc.readOnly;
  const dirty = isDirty(doc);

  return (
    <footer className="om-colo">
      <span className="om-colo__state">
        {doc.externalChange ? (
          <span className="om-colo__flag om-colo__flag--warn">
            <WarningCircle size={14} />
            {t('notice.externalChange')}
          </span>
        ) : readOnly ? (
          <span className="om-colo__flag om-colo__flag--readonly" title={doc.readOnlyReason ?? ''}>
            <span className="om-tag om-tag--accent-2">{t('toolbar.readOnly')}</span>
            {doc.readOnlyReason && <span className="om-colo__reason">{doc.readOnlyReason}</span>}
            {/*
              The restriction is a default, not a lock. Without this the mode would be a dead
              end, and the only way to edit such a document would be to use another program.
            */}
            <button type="button" className="om-btn om-btn--ghost om-btn--xs" data-om-testid="unlock-editing" onClick={unlockEditing}>
              {t('status.allowEditing')}
            </button>
          </span>
        ) : (
          <span className="om-colo__flag" data-dirty={dirty ? 'true' : undefined}>
            {dirty && <span className="om-dirty-dot" aria-hidden="true" />}
            {dirty ? t('status.unsaved') : t('status.saved')}
          </span>
        )}
      </span>

      {stats && (
        <>
          <span data-om-testid="stat-lines">
            {stats.sourceLines} {t('status.lines')}
          </span>
          <span data-om-testid="stat-words">
            {stats.wordCount.toLocaleString()} {t('status.words')}
          </span>
          <span>{t('status.readingTime', { n: stats.readingMinutes })}</span>
          {stats.mathCount > 0 && (
            <span data-om-testid="stat-math">
              {stats.mathCount} {t('status.math')}
            </span>
          )}
          {stats.parseMs > 0 && <span data-om-testid="stat-parse">{stats.parseMs.toFixed(0)} ms</span>}
        </>
      )}

      <span className="om-colo__end">
        {showProgress && mode !== 'source' && stats && (
          <span data-om-testid="stat-progress">{t('status.progress', { n: String(Math.round(progress * 100)) })}</span>
        )}
        <span>
          UTF-8{doc.encoding.bom ? ' BOM' : ''} · {doc.encoding.eol.toUpperCase()}
        </span>
        <span>{Math.round(zoom * 100)}%</span>
      </span>
    </footer>
  );
}
