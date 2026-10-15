import { useEffect, useRef } from 'react';
import type { Diagnostic } from '@/core/markdown/types';
import { typesetPlaceholders } from '@/core/render/typesetter';
import { resolveTheme } from '@/app/settings';
import { useStore, type DocumentState } from '@/app/store';

/**
 * The reading surface.
 *
 * Three details make it behave like a document reader rather than a web page:
 *
 *  1. **The HTML is injected once per parse.** Typography and appearance come from CSS
 *     custom properties, so changing page width or font size never re-parses or re-renders
 *     the document — it is a style recalculation, not a React update.
 *  2. **Expensive content is filled lazily.** `typesetPlaceholders` walks the injected DOM
 *     and fills only what approaches the viewport, which is what keeps a multi-megabyte
 *     textbook usable. The run is aborted when the document changes so a stale render
 *     cannot write into the new one.
 *  3. **Links are intercepted.** A fragment link is a document anchor, an external link
 *     opens in the system browser, and neither ever navigates the webview.
 */

interface DocumentViewProps {
  doc: DocumentState;
  /** Called with the raw `href` when the reader activates a link. */
  onNavigate: (href: string) => void;
}

export function DocumentView({ doc, onNavigate }: DocumentViewProps) {
  const hostRef = useRef<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const setProgress = useStore((s) => s.setProgress);
  const themePreference = useStore((s) => s.settings.reading.theme);
  const showProgress = useStore((s) => s.settings.reading.showReadingProgress);
  const mode = useStore((s) => s.ui.mode);
  const progress = useStore((s) => s.ui.progress);
  const reportError = useStore((s) => s.notify);
  const addRuntimeDiagnostics = useStore((s) => s.addRuntimeDiagnostics);

  const render = doc.render;
  const html = render?.html ?? '';
  // Covers file identity *and* content, so a re-parse re-typesets while an appearance
  // change (same signature) does not.
  const signature = `${doc.path ?? ''}:${doc.hash}`;

  useEffect(() => {
    const host = hostRef.current;
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
        reportError('error', `公式渲染失败（第 ${expr.range.start.line} 行）：${error.message}`);
      },
      onDiagnostic: (diagnostic) => collected.push(diagnostic),
    }).then(() => {
      if (!controller.signal.aborted) addRuntimeDiagnostics(collected);
    });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- signature encodes identity+content
  }, [signature, themePreference, render, reportError, addRuntimeDiagnostics]);

  // Reading progress from one scroll listener, coalesced into a single animation frame.
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
  }, [setProgress, signature]);

  if (doc.error) {
    return (
      <div className="om-doc om-doc--message" role="alert">
        <h2>无法打开文件</h2>
        <p>{doc.error}</p>
      </div>
    );
  }

  if (!doc.source) {
    return (
      <div className="om-doc om-doc--message">
        <h2>OpenMark</h2>
        <p>打开一个 Markdown 文件开始阅读，或将文件拖入窗口。</p>
        <p className="om-doc__hint">
          支持 <code>.md</code> 与 <code>.markdown</code>；公式、表格、流程图与代码高亮均可离线渲染。
        </p>
      </div>
    );
  }

  return (
    <>
      {showProgress && (
        <div className="om-progress" aria-hidden="true">
          <div className="om-progress__bar" style={{ transform: `scaleX(${progress})` }} />
        </div>
      )}
      <div className="om-doc-scroll" ref={scrollRef}>
        <article
          ref={hostRef}
          className="om-doc"
          data-om-mode={mode}
          /*
           * Safe: this string is produced by our renderer and passed through DOMPurify
           * before it reaches here, and every expensive construct is still an empty
           * placeholder at this point. See `core/markdown/sanitize.ts`.
           */
          dangerouslySetInnerHTML={{ __html: html }}
          onClick={(event) => {
            const anchor = (event.target as HTMLElement).closest('a');
            if (!(anchor instanceof HTMLAnchorElement)) return;
            event.preventDefault();
            onNavigate(anchor.getAttribute('href') ?? '');
          }}
        />
      </div>
    </>
  );
}
