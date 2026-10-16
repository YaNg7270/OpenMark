import { useEffect, type RefObject } from 'react';

/**
 * Keeps the reader on the same part of the document when the view mode changes.
 *
 * Each view unmounts on a mode switch, so the views cannot hand a position to each other
 * directly. Instead every view keeps this module told which source line is at the top of its
 * viewport, and a view that mounts for the same document starts there. Source lines are the
 * only coordinate the rendered views and the source editor share: pixel offsets and scroll
 * proportions differ wildly between a rendered table and its one-line source.
 *
 * The anchor is keyed by tab and path, so it never carries one document's position into
 * another.
 */

let anchor: { key: string; line: number } | null = null;

export function anchorKey(tabId: string, path: string | null): string {
  return `${tabId}\u0000${path ?? ''}`;
}

export function rememberTopLine(key: string, line: number): void {
  anchor = { key, line };
}

/** The line the previous view had at the top, if it showed this same document. */
export function anchorLineFor(key: string): number | null {
  return anchor && anchor.key === key ? anchor.line : null;
}

/** Test seam: forget the anchor. */
export function resetViewAnchor(): void {
  anchor = null;
}

/**
 * Re-applies a restored position for a short while, until the reader takes over.
 *
 * Rendered views keep changing height after mount — formulas and diagrams near the viewport
 * are typeset lazily — and each change above the anchor pushes it down. Re-aligning on every
 * layout change for the first moments keeps the anchor on screen; any input from the reader
 * ends it immediately, so it never fights their own scrolling.
 */
export function holdPosition(scroller: HTMLElement, content: HTMLElement, apply: () => void, ms = 1200): () => void {
  apply();
  let active = true;
  const stop = () => {
    if (!active) return;
    active = false;
    observer.disconnect();
    clearTimeout(timer);
    for (const type of USER_INPUT) scroller.removeEventListener(type, stop);
  };
  const observer = new ResizeObserver(() => {
    if (active) apply();
  });
  observer.observe(content);
  const timer = setTimeout(stop, ms);
  for (const type of USER_INPUT) scroller.addEventListener(type, stop, { passive: true });
  return stop;
}

const USER_INPUT = ['wheel', 'pointerdown', 'keydown', 'touchstart'] as const;

function lineOf(element: Element): number {
  return Number(element.getAttribute('data-om-line')) || 0;
}

/** The source line of the first tagged block whose bottom is below the scroller's top edge. */
export function topLineIn(scroller: HTMLElement, root: HTMLElement): number | null {
  const blocks = root.querySelectorAll<HTMLElement>('[data-om-line]');
  if (blocks.length === 0) return null;
  const top = scroller.getBoundingClientRect().top;
  // Blocks are in document order, so the first one still visible can be found by bisection.
  let lo = 0;
  let hi = blocks.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (blocks[mid]!.getBoundingClientRect().bottom <= top + 1) lo = mid + 1;
    else hi = mid;
  }
  return lineOf(blocks[lo]!);
}

/** Scrolls so the last tagged block starting at or before `line` is at the top. */
export function scrollToLine(scroller: HTMLElement, root: HTMLElement, line: number): void {
  const blocks = root.querySelectorAll<HTMLElement>('[data-om-line]');
  let target: HTMLElement | null = null;
  for (const block of blocks) {
    if (lineOf(block) > line) break;
    target = block;
  }
  if (!target) {
    scroller.scrollTo({ top: 0, behavior: 'instant' });
    return;
  }
  const offset = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  scroller.scrollTo({ top: scroller.scrollTop + offset, behavior: 'instant' });
}

/**
 * The anchor hook for the rendered views (reading and instant mode).
 *
 * On mount, a remembered line for this document wins over the per-file reading position:
 * the reader was just looking at that line in another view. While mounted, the top line is
 * tracked on scroll, throttled to one measurement per frame.
 */
export function useViewAnchor(
  scrollRef: RefObject<HTMLElement | null>,
  rootRef: RefObject<HTMLElement | null>,
  key: string,
  ready: boolean,
): void {
  useEffect(() => {
    const scroller = scrollRef.current;
    const root = rootRef.current;
    if (!scroller || !root || !ready) return;

    const line = anchorLineFor(key);
    const release = line !== null ? holdPosition(scroller, root, () => scrollToLine(scroller, root, line)) : undefined;

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const top = topLineIn(scroller, root);
        if (top !== null) rememberTopLine(key, top);
      });
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      release?.();
      cancelAnimationFrame(frame);
      scroller.removeEventListener('scroll', onScroll);
    };
  }, [scrollRef, rootRef, key, ready]);
}
