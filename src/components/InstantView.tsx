import { useCallback, useEffect, useRef, useState } from 'react';
import type { SourceBlock } from '@/core/markdown/types';
import { useStore, type DocumentState } from '@/app/store';
import { useReadingProgress, useTypesetting } from './useTypesetting';

/**
 * Instant-rendering view — the Typora-style mode.
 *
 * The document is shown fully rendered, and clicking a block turns **that block alone** into
 * a source editor. Two properties make this both faithful and safe:
 *
 *  1. **The block's rendered HTML stays mounted while it is being edited**, merely hidden.
 *     MathJax and Mermaid output is expensive and is not part of React's virtual DOM; if the
 *     editor replaced it, leaving edit mode would re-typeset and visibly flash. Hiding keeps
 *     it.
 *  2. **Edits are committed as a splice of the authoritative source at the block's range.**
 *     There is no serialiser in the path, so a block the user did not touch cannot change —
 *     not its list markers, not its fence info string, not its line endings.
 *
 * The source textarea is uncontrolled while focused: a live commit re-parses the document and
 * therefore re-renders, and a controlled value would fight the caret on every keystroke.
 */

/** Idle time before an in-progress edit is committed to the document. */
const COMMIT_DELAY_MS = 320;

const NO_BLOCKS: SourceBlock[] = [];

interface InstantViewProps {
  doc: DocumentState;
  onNavigate: (href: string) => void;
}

export function InstantView({ doc, onNavigate }: InstantViewProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLElement | null>(null);

  const applyBlockEdit = useStore((s) => s.applyBlockEdit);
  const showProgress = useStore((s) => s.settings.reading.showReadingProgress);
  const progress = useStore((s) => s.ui.progress);

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);

  const blocks = doc.render?.blocks ?? NO_BLOCKS;
  const signature = `${doc.path ?? ''}:${doc.hash}`;

  useTypesetting(hostRef, scrollRef, doc.render, signature, revision);
  useReadingProgress(scrollRef, signature);

  // Leaving edit mode restores placeholders that were inside the edited block, so the
  // typesetter has to run again for them.
  useEffect(() => {
    if (editingIndex === null) setRevision((value) => value + 1);
  }, [editingIndex]);

  const commit = useCallback(
    (index: number, text: string) => {
      const block = blocks[index];
      if (!block) return;
      const caret = block.range.start.offset + text.length;
      const nextIndex = applyBlockEdit(index, text, caret);
      if (nextIndex !== null && nextIndex !== index) setEditingIndex(nextIndex);
    },
    [applyBlockEdit, blocks],
  );

  if (!doc.source) {
    return (
      <div className="om-doc om-doc--message">
        <h2>即时渲染</h2>
        <p>打开一个 Markdown 文件后，点击任意段落即可就地编辑。</p>
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
        <article className="om-doc om-doc--instant" ref={hostRef}>
          {blocks.map((block) => (
            <Block
              key={block.id}
              block={block}
              active={editingIndex === block.index}
              readOnly={doc.readOnly}
              onActivate={() => {
                if (doc.readOnly) return;
                setEditingIndex(block.index);
              }}
              onCommit={(text) => commit(block.index, text)}
              onExit={() => setEditingIndex(null)}
              onNavigate={onNavigate}
            />
          ))}
        </article>
      </div>
    </>
  );
}

interface BlockProps {
  block: SourceBlock;
  active: boolean;
  readOnly: boolean;
  onActivate: () => void;
  onCommit: (text: string) => void;
  onExit: () => void;
  onNavigate: (href: string) => void;
}

function Block({ block, active, readOnly, onActivate, onCommit, onExit, onNavigate }: BlockProps) {
  const timer = useRef(0);
  const latest = useRef(block.source);

  // Clear a pending commit if the block unmounts mid-edit, so a stale splice cannot land
  // on a different document.
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = 0;
    if (latest.current !== block.source) onCommit(latest.current);
  }, [block.source, onCommit]);

  return (
    <section
      className="om-block"
      data-om-block={block.index}
      data-om-kind={block.kind}
      data-editing={active ? 'true' : undefined}
    >
      <div
        className="om-block__rendered"
        onClick={(event) => {
          const anchor = (event.target as HTMLElement).closest('a');
          if (anchor instanceof HTMLAnchorElement) {
            event.preventDefault();
            onNavigate(anchor.getAttribute('href') ?? '');
            return;
          }
          if (readOnly) return;
          // Clicks that land on an interactive control inside the block (a task-list
          // checkbox, a code copy button) must not be swallowed by the edit affordance.
          if ((event.target as HTMLElement).closest('button, input, summary, mjx-container')) return;
          onActivate();
        }}
        /* Safe: produced by our renderer and passed through DOMPurify. */
        dangerouslySetInnerHTML={{ __html: block.html }}
      />
      {active && (
        <textarea
          className="om-block__editor"
          data-om-block-editor={block.index}
          // Uncontrolled on purpose: a controlled value would be reset by the re-render that
          // every live commit triggers, moving the caret to the end on each keystroke.
          defaultValue={block.source}
          autoFocus
          spellCheck={false}
          rows={Math.max(2, block.source.split('\n').length)}
          onChange={(event) => {
            latest.current = event.target.value;
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(flush, COMMIT_DELAY_MS);
          }}
          onBlur={flush}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              flush();
              onExit();
              return;
            }
            // Ctrl+Enter commits and leaves, matching the muscle memory of most editors.
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              flush();
              onExit();
            }
          }}
        />
      )}
    </section>
  );
}
