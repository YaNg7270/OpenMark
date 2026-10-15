import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t } from '@/i18n';

/**
 * In-document search.
 *
 * Matching happens against the rendered DOM, not the source, so a hit is always something
 * the reader can actually see — a formula's LaTeX source, for instance, is not text in the
 * page and should not be reported as a hit while its rendered glyphs are what the reader
 * is looking at.
 *
 * Highlighting uses the CSS Custom Highlight API where available (Chromium 105+, so every
 * WebView2 we support), which paints matches without mutating the document. Mutating would
 * invalidate the placeholder bookkeeping and force a re-typeset on every keystroke; the
 * fallback therefore scrolls without highlighting rather than risking that.
 */

interface SearchPanelProps {
  /** Resolves the element that holds the rendered document, or null in source mode. */
  getRoot: () => HTMLElement | null;
  /** Called with the query so other surfaces (source mode) can react. */
  onQueryChange?: (query: string, activeIndex: number) => void;
}

interface Match {
  range: Range;
  /** The text node the match sits in, used to render a context snippet. */
  node: Text;
  /** Stable identity within one query, used for React keys and the active index. */
  ordinal: number;
}

const supportsHighlightApi = typeof CSS !== 'undefined' && 'highlights' in CSS;

export function SearchPanel({ getRoot, onQueryChange }: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [matches, setMatches] = useState<Match[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const collect = useCallback(
    (needle: string): Match[] => {
      const root = getRoot();
      if (!root || needle.trim() === '') return [];
      const lower = needle.toLowerCase();
      const found: Match[] = [];

      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = (node as Text).parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          // Skip content that is not prose the reader reads as text.
          if (parent.closest('script, style, .om-code, .om-mermaid, .om-preserved')) {
            return NodeFilter.FILTER_REJECT;
          }
          return (node as Text).data.toLowerCase().includes(lower)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        },
      });

      let node = walker.nextNode();
      while (node) {
        const text = (node as Text).data;
        const haystack = text.toLowerCase();
        let index = haystack.indexOf(lower);
        while (index >= 0) {
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + needle.length);
          found.push({ range, node: node as Text, ordinal: found.length });
          index = haystack.indexOf(lower, index + needle.length);
        }
        node = walker.nextNode();
      }
      return found;
    },
    [getRoot],
  );

  // Recompute on query change, debounced so typing in a large document stays responsive.
  useEffect(() => {
    let timer = 0;
    const run = () => {
      const found = collect(query);
      setMatches(found);
      setActive(0);
      onQueryChange?.(query, 0);
    };
    if (query.trim() === '') {
      setMatches([]);
      return;
    }
    timer = window.setTimeout(run, 140);
    return () => window.clearTimeout(timer);
  }, [query, collect, onQueryChange]);

  // Paint all matches; the active one gets a distinct highlight.
  useEffect(() => {
    if (!supportsHighlightApi || matches.length === 0) return;
    const all = new Highlight(...matches.map((m) => m.range));
    CSS.highlights.set('om-search', all);
    const current = matches[active];
    if (current) {
      CSS.highlights.set('om-search-active', new Highlight(current.range));
    } else {
      CSS.highlights.delete('om-search-active');
    }
    return () => {
      CSS.highlights.delete('om-search');
      CSS.highlights.delete('om-search-active');
    };
  }, [matches, active]);

  const goTo = useCallback(
    (index: number) => {
      if (matches.length === 0) return;
      const next = ((index % matches.length) + matches.length) % matches.length;
      setActive(next);
      onQueryChange?.(query, next);
      const container = matches[next]?.range.startContainer;
      const target = container instanceof Element ? container : container?.parentElement;
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    },
    [matches, onQueryChange, query],
  );

  const summary = useMemo(() => {
    if (query.trim() === '') return t('panel.search.empty');
    if (matches.length === 0) return t('panel.search.none');
    return t('panel.search.count', { n: matches.length });
  }, [matches.length, query]);

  return (
    <div className="om-search">
      <div className="om-search__bar">
        <input
          ref={inputRef}
          type="search"
          className="om-search__input"
          value={query}
          placeholder={t('panel.search.placeholder')}
          aria-label={t('panel.search')}
          data-om-testid="search-input"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              goTo(event.shiftKey ? active - 1 : active + 1);
            } else if (event.key === 'Escape') {
              setQuery('');
            }
          }}
        />
        <button type="button" className="om-icon-button" disabled={matches.length === 0} onClick={() => goTo(active - 1)}>
          ↑
        </button>
        <button type="button" className="om-icon-button" disabled={matches.length === 0} onClick={() => goTo(active + 1)}>
          ↓
        </button>
      </div>
      <p className="om-search__summary" data-om-testid="search-summary">
        {summary}
      </p>
      {matches.length > 0 && (
        <ul className="om-search__list">
          {matches.slice(0, 200).map((match, index) => (
            <li key={match.ordinal}>
              <button
                type="button"
                className="om-search__result"
                data-active={index === active ? 'true' : undefined}
                onClick={() => goTo(index)}
              >
                <span className="om-search__context">{contextOf(match)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A short excerpt around a match, with the match itself visually marked. */
function contextOf(match: Match): string {
  const text = match.node.data;
  const start = Math.max(0, match.range.startOffset - 24);
  const end = Math.min(text.length, match.range.endOffset + 32);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return `${prefix}${text.slice(start, end).replace(/\s+/g, ' ')}${suffix}`;
}
