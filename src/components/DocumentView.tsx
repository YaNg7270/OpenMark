import { useRef } from 'react';
import { useStore, type DocumentState } from '@/app/store';
import { useReadingProgress, useTypesetting } from './useTypesetting';
import { RecentPanel } from './RecentPanel';
import { MathTools } from './MathTools';

/**
 * The reading surface.
 *
 * Three details make it behave like a document reader rather than a web page:
 *
 *  1. **The HTML is injected once per parse.** Typography and appearance come from CSS
 *     custom properties, so changing page width or font size is a style recalculation, not a
 *     re-render — and never a re-parse.
 *  2. **Expensive content is filled lazily**, via the shared typesetting hook. The run is
 *     aborted when the document changes so a stale render cannot write into the new one.
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

  const showProgress = useStore((s) => s.settings.reading.showReadingProgress);
  const hasRecent = useStore((s) => s.session.recent.length > 0);
  const mode = useStore((s) => s.ui.mode);
  const activeTabId = useStore((s) => s.activeTabId);
  const progress = useStore((s) => s.ui.progress);

  /*
   * Covers the tab, the file identity and the content.
   *
   * The tab has to be in here: bringing a parked tab forward replaces the rendered DOM while
   * the path and hash stay the same, so without it the typesetter would leave the previous
   * document's output on screen and the reading position would not be restored.
   */
  const signature = `${activeTabId}:${doc.path ?? ''}:${doc.hash}`;

  useTypesetting(hostRef, scrollRef, doc.render, signature, 0, doc.path);
  useReadingProgress(scrollRef, hostRef, { path: doc.path, hash: doc.hash }, signature);

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
        {hasRecent && (
          <section className="om-doc__recent">
            <h3>最近打开</h3>
            <RecentPanel compact />
          </section>
        )}
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
          dangerouslySetInnerHTML={{ __html: doc.render?.html ?? '' }}
          onClick={(event) => {
            const anchor = (event.target as HTMLElement).closest('a');
            if (!(anchor instanceof HTMLAnchorElement)) return;
            event.preventDefault();
            onNavigate(anchor.getAttribute('href') ?? '');
          }}
        />
      </div>
      <MathTools rootRef={hostRef} render={doc.render} documentKey={signature} />
    </>
  );
}
