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
 * reports flow back into the same store list. A view that typeset differently from the
 * other would make the diagnostics panel lie about what the user is looking at.
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

/**
 * Tracks reading progress for a scrolling container, coalesced to one update per frame.
 */
export function useReadingProgress(
  scrollRef: RefObject<HTMLElement | null>,
  signature: string,
): void {
  const setProgress = useStore((s) => s.setProgress);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = scroller.scrollHeight - scroller.clientHeight;
      setProgress(max <= 0 ? 1 : scroller.scrollTop / max);
    };
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [scrollRef, setProgress, signature]);
}
