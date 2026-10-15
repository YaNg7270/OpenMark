import { useEffect, useRef, type RefObject } from 'react';
import type { Diagnostic, ParsedDocument } from '@/core/markdown/types';
import { typesetPlaceholders } from '@/core/render/typesetter';
import { resolveTheme } from '@/app/settings';
import { useStore } from '@/app/store';

/**
 * Fills the renderer's placeholders inside `rootRef`, lazily and cancellably.
 *
 * Shared by the reading view and the instant-rendering view so that both produce identical
 * output — including identical diagnostics, which is why the MathJax and Mermaid failure
 * reports flow into the same store list. A view that typeset differently from the other would
 * make the diagnostics panel lie about what the user is looking at.
 *
 * `signature` identifies the document content; `revision` forces a re-run when the same
 * document is re-rendered for another reason (leaving block-edit mode, for example).
 */
export function useTypesetting(
  rootRef: RefObject<HTMLElement | null>,
  scrollRef: RefObject<HTMLElement | null>,
  render: ParsedDocument | null,
  signature: string,
  revision: number,
): void {
  const themePreference = useStore((s) => s.settings.reading.theme);
  const reportError = useStore((s) => s.notify);
  const addRuntimeDiagnostics = useStore((s) => s.addRuntimeDiagnostics);

  // Keep the latest callbacks in a ref so the effect does not re-run when they change
  // identity, which would otherwise re-typeset on every store update.
  const callbacks = useRef({ reportError, addRuntimeDiagnostics });
  callbacks.current = { reportError, addRuntimeDiagnostics };

  useEffect(() => {
    const host = rootRef.current;
    if (!host || !render) return;

    const controller = new AbortController();
    const collected: Diagnostic[] = [];

    void typesetPlaceholders({
      root: host,
      scrollRoot: scrollRef.current,
      math: render.math,
      mermaid: render.mermaid,
      code: render.code,
      dark: resolveTheme(themePreference) === 'dark',
      signal: controller.signal,
      onMathError: (expr, error) => {
        callbacks.current.reportError('error', `公式渲染失败（第 ${expr.range.start.line} 行）：${error.message}`);
      },
      onDiagnostic: (diagnostic) => collected.push(diagnostic),
    }).then(() => {
      if (!controller.signal.aborted) callbacks.current.addRuntimeDiagnostics(collected);
    });

    return () => controller.abort();
  }, [rootRef, scrollRef, render, signature, revision, themePreference]);
}

/** How long to wait after scrolling stops before persisting the position. */
const POSITION_SAVE_DELAY_MS = 600;

export interface ReadingTarget {
  path: string | null;
  hash: string;
}

/**
 * Tracks and restores how far the reader has got.
 *
 * Restoring a pixel offset is only meaningful when the document is unchanged, so the stored
 * content hash is compared first. When it differs, the reader is placed at the heading they
 * were nearest to, which is the closest thing to a bookmark that survives editing above
 * their position. `progress` is the last resort for a document with no headings.
 *
 * Scroll handling is coalesced to one update per animation frame, and the write is debounced
 * well beyond that, so ordinary scrolling never touches storage.
 */
export function useReadingProgress(
  scrollRef: RefObject<HTMLElement | null>,
  rootRef: RefObject<HTMLElement | null>,
  target: ReadingTarget,
  signature: string,
): void {
  const setProgress = useStore((s) => s.setProgress);
  const rememberPosition = useStore((s) => s.rememberPosition);
  const setActiveHeading = useStore((s) => s.setActiveHeading);

  // Restore once per document identity, before the reader has had a chance to scroll.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !target.path) return;

    const stored = useStore.getState().session.positions[target.path];
    if (!stored) return;

    /*
     * Restored instantly, against the element's `scroll-behavior: smooth`.
     *
     * Smooth scrolling is right for a link the reader just clicked and wrong for a restore:
     * the document would visibly animate down from the top every time a file is reopened,
     * which reads as a glitch and leaves the position mid-flight if anything interrupts it.
     */
    if (stored.hash === target.hash && stored.scrollTop > 0) {
      scroller.scrollTo({ top: stored.scrollTop, behavior: 'instant' });
      return;
    }
    if (stored.headingId) {
      const heading = rootRef.current?.querySelector<HTMLElement>(`#${CSS.escape(stored.headingId)}`);
      if (heading) {
        heading.scrollIntoView({ block: 'start' });
        return;
      }
    }
    if (stored.progress > 0) {
      const max = scroller.scrollHeight - scroller.clientHeight;
      if (max > 0) scroller.scrollTo({ top: stored.progress * max, behavior: 'instant' });
    }
    // Runs on document identity only: re-running on every store update would fight the
    // reader's own scrolling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    let frame = 0;
    let saveTimer = 0;

    /*
     * The position is tracked continuously rather than read at save time.
     *
     * When the active document changes, React mutates the DOM *before* running this effect's
     * cleanup. Reading `scroller.scrollTop` in the cleanup would therefore record the incoming
     * document's offset under the outgoing document's path, destroying the position the reader
     * had actually reached. The ref holds the last value observed while this document was on
     * screen, which is the value worth keeping.
     */
    let lastScrollTop = scroller.scrollTop;

    const commit = (scrollTop: number, max: number) => {
      if (!target.path) return;
      // The path is captured from this effect, not resolved at save time: see
      // `rememberPosition` for why that distinction matters.
      rememberPosition(target.path, {
        scrollTop,
        progress: max <= 0 ? 1 : scrollTop / max,
        headingId: useStore.getState().ui.activeHeadingId,
      });
    };

    const onScroll = () => {
      lastScrollTop = scroller.scrollTop;
      if (frame === 0) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          const max = scroller.scrollHeight - scroller.clientHeight;
          setProgress(max <= 0 ? 1 : scroller.scrollTop / max);
        });
      }
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        commit(lastScrollTop, scroller.scrollHeight - scroller.clientHeight);
      }, POSITION_SAVE_DELAY_MS);
    };

    scroller.addEventListener('scroll', onScroll, { passive: true });
    // Establish an initial progress value so the bar is correct before any scrolling.
    const max = scroller.scrollHeight - scroller.clientHeight;
    setProgress(max <= 0 ? 1 : scroller.scrollTop / max);

    return () => {
      scroller.removeEventListener('scroll', onScroll);
      window.clearTimeout(saveTimer);
      if (frame) cancelAnimationFrame(frame);
      // Saves the last position observed for THIS document, not the one now on screen.
      commit(lastScrollTop, scroller.scrollHeight - scroller.clientHeight);
    };
  }, [scrollRef, setProgress, rememberPosition, signature, target]);

  // Track which heading the reader is looking at, for the outline highlight and for the
  // position bookmark's fallback anchor.
  useEffect(() => {
    const root = rootRef.current;
    const scroller = scrollRef.current;
    if (!root || !scroller || typeof IntersectionObserver === 'undefined') return;

    const headings = Array.from(root.querySelectorAll<HTMLElement>('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]'));
    if (headings.length === 0) return;

    // The topmost heading currently on screen wins; a small negative top margin prevents a
    // heading from becoming "active" while it is still below the fold.
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id;
          if (entry.isIntersecting) visible.set(id, entry.boundingClientRect.top);
          else visible.delete(id);
        }
        let bestId: string | null = null;
        let bestTop = Number.POSITIVE_INFINITY;
        for (const [id, top] of visible) {
          if (top < bestTop) {
            bestTop = top;
            bestId = id;
          }
        }
        if (bestId) setActiveHeading(bestId);
        else {
          // Scrolled past everything visible: fall back to the last heading above the fold.
          const above = headings.filter((heading) => heading.getBoundingClientRect().top < 0);
          setActiveHeading(above.length > 0 ? above[above.length - 1]!.id : null);
        }
      },
      { root: scroller, rootMargin: '-10% 0px -70% 0px', threshold: 0 },
    );

    for (const heading of headings) observer.observe(heading);
    return () => observer.disconnect();
  }, [rootRef, scrollRef, setActiveHeading, signature]);
}
