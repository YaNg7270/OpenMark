import { useMemo } from 'react';
import type { OutlineEntry } from '@/core/markdown/types';
import { t } from '@/i18n';

/**
 * Document outline.
 *
 * Flat rendering with an indent derived from heading level, rather than a recursive
 * component: a 400-heading textbook then costs one array pass instead of 400 nested
 * React subtrees, and keyboard navigation stays linear.
 */

interface OutlinePanelProps {
  outline: readonly OutlineEntry[];
  activeId: string | null;
  onSelect: (entry: OutlineEntry) => void;
}

interface FlatEntry {
  entry: OutlineEntry;
  depth: number;
}

function flatten(entries: readonly OutlineEntry[], depth = 0, out: FlatEntry[] = []): FlatEntry[] {
  for (const entry of entries) {
    out.push({ entry, depth });
    flatten(entry.children, depth + 1, out);
  }
  return out;
}

export function OutlinePanel({ outline, activeId, onSelect }: OutlinePanelProps) {
  const flat = useMemo(() => flatten(outline), [outline]);

  if (flat.length === 0) {
    return <p className="om-panel__empty">{t('panel.outline.empty')}</p>;
  }

  return (
    <nav className="om-outline" aria-label={t('panel.outline')}>
      <ul className="om-outline__list">
        {flat.map(({ entry, depth }) => (
          <li key={entry.id} className="om-outline__item">
            <button
              type="button"
              className="om-outline__link"
              data-active={entry.id === activeId ? 'true' : undefined}
              data-level={depth}
              style={{ paddingInlineStart: `${8 + depth * 14}px` }}
              title={entry.plainText}
              onClick={() => onSelect(entry)}
            >
              <span className="om-outline__text">{entry.plainText || '—'}</span>
              <span className="om-outline__line">{entry.range.start.line}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
