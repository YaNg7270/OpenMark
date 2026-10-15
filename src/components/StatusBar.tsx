import { isDirty, useStore } from '@/app/store';
import { t } from '@/i18n';

/**
 * Status bar: the document's measured facts plus its save state.
 *
 * Counts come from the parse (`RenderStats`), so they cost nothing to display and stay
 * consistent with what the renderer actually produced.
 */
export function StatusBar() {
  const doc = useStore((s) => s.doc);
  const unlockEditing = useStore((s) => s.unlockEditing);
  const stats = doc.render?.stats;
  const readOnly = doc.readOnly;
  const dirty = isDirty(doc);

  return (
    <footer className="om-statusbar">
      <span className="om-statusbar__left">
        {doc.externalChange ? (
          <span className="om-statusbar__flag om-statusbar__flag--warn">{t('notice.externalChange')}</span>
        ) : readOnly ? (
          <span className="om-statusbar__flag om-statusbar__flag--readonly" title={doc.readOnlyReason ?? ''}>
            {t('toolbar.readOnly')}
            {/*
              The restriction is a default, not a lock. Without this the mode would be a dead
              end, and the only way to edit such a document would be to use another program.
            */}
            <button type="button" className="om-statusbar__unlock" data-om-testid="unlock-editing" onClick={unlockEditing}>
              {t('status.allowEditing')}
            </button>
          </span>
        ) : (
          <span className="om-statusbar__flag" data-dirty={dirty ? 'true' : undefined}>
            {dirty ? t('status.unsaved') : t('status.saved')}
          </span>
        )}
      </span>

      <span className="om-statusbar__right">
        {stats && (
          <>
            <span data-om-testid="stat-lines">
              {stats.sourceLines} {t('status.lines')}
            </span>
            <span data-om-testid="stat-words">
              {stats.wordCount} {t('status.words')}
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
      </span>
    </footer>
  );
}
