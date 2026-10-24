import { useCallback, useEffect, useRef, useState } from 'react';
import type { SourceBlock } from '@/core/markdown/types';
import { useStore, type DocumentState } from '@/app/store';
import { useReadingProgress, useTypesetting } from './useTypesetting';
import { MathTools } from './MathTools';
import { anchorKey, useViewAnchor } from './viewAnchor';
import { TableEditor } from './TableEditor';
import { applyAutoPairToTextarea, applyShortcutToTextarea } from './markdownShortcuts';
import { readFenceLanguage, setFenceLanguage } from '@/core/markdown/edit-commands';
import { imageMarkdown, saveImageAsset } from '@/core/fs/assets';
import { t } from '@/i18n';

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
  const [editingTable, setEditingTable] = useState<SourceBlock | null>(null);
  const [revision, setRevision] = useState(0);

  const activeTabId = useStore((s) => s.activeTabId);
  const blocks = doc.render?.blocks ?? NO_BLOCKS;
  /*
   * Covers the tab, the file identity and the content.
   *
   * The tab has to be in here: bringing a parked tab forward replaces the rendered DOM while
   * the path and hash stay the same, so without it the typesetter would leave the previous
   * document's output on screen and the reading position would not be restored.
   */
  const signature = `${activeTabId}:${doc.path ?? ''}:${doc.hash}`;

  useTypesetting(hostRef, scrollRef, doc.render, signature, revision, doc.path);
  useReadingProgress(scrollRef, hostRef, { path: doc.path, hash: doc.hash }, signature);
  useViewAnchor(scrollRef, hostRef, anchorKey(activeTabId, doc.path), Boolean(doc.source));

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
              documentPath={doc.path}
              onActivate={() => {
                if (doc.readOnly) return;
                setEditingIndex(block.index);
              }}
              onCommit={(text) => commit(block.index, text)}
              onExit={() => setEditingIndex(null)}
              onNavigate={onNavigate}
              onEditTable={() => setEditingTable(block)}
            />
          ))}
        </article>
      </div>
      <MathTools rootRef={hostRef} render={doc.render} documentKey={signature} />

      {editingTable && (
        <TableEditor
          source={editingTable.source}
          onClose={() => setEditingTable(null)}
          onSave={(next) => {
            commit(editingTable.index, next);
            setEditingTable(null);
          }}
        />
      )}
    </>
  );
}

interface BlockProps {
  block: SourceBlock;
  documentPath: string | null;
  active: boolean;
  readOnly: boolean;
  onActivate: () => void;
  onCommit: (text: string) => void;
  onExit: () => void;
  onNavigate: (href: string) => void;
  /** Opens the grid editor. Tables are the one block a plain text box serves badly. */
  onEditTable: () => void;
}

function Block({
  block,
  active,
  readOnly,
  documentPath,
  onActivate,
  onCommit,
  onExit,
  onNavigate,
  onEditTable,
}: BlockProps) {
  const timer = useRef(0);
  const latest = useRef(block.source);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  /*
   * Auto-pairing listens to the *native* `beforeinput`, not React's `onBeforeInput`.
   *
   * React synthesises that prop from the legacy `textInput` event, whose object carries the
   * text but no `inputType` and no `isComposing` — the two fields that decide whether a
   * keystroke may be paired. Reading them off the synthetic event yields `undefined`, which
   * looks exactly like "pairing is switched off". The native event has both.
   */
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const onBeforeInput = (event: Event) => {
      if (event instanceof InputEvent) applyAutoPairToTextarea(event, area);
    };
    area.addEventListener('beforeinput', onBeforeInput);
    return () => area.removeEventListener('beforeinput', onBeforeInput);
  }, [active]);

  const [language, setLanguage] = useState(() => readFenceLanguage(block.source));

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
      data-om-line={block.range.start.line}
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
          /*
           * Interactive controls inside a block own their own clicks: a task-list checkbox,
           * a code copy button, and a rendered formula (which opens the formula tools) must
           * not also put the whole block into edit mode.
           */
          if ((event.target as HTMLElement).closest('button, input, summary, [data-om-math]')) return;
          onActivate();
        }}
        /* Safe: produced by our renderer and passed through DOMPurify. */
        dangerouslySetInnerHTML={{ __html: block.html }}
      />
      {!active && block.kind === 'table' && !readOnly && (
        /*
         * A table is offered the grid editor rather than the plain source box. Editing pipe
         * alignment by hand is exactly the work a grid exists to remove, and the grid writes
         * back through the same block splice, so nothing else in the document can move.
         */
        <button
          type="button"
          className="om-block__grid-button"
          data-om-testid={`table-edit-${block.index}`}
          onClick={(event) => {
            event.stopPropagation();
            onEditTable();
          }}
        >
          {t('table.edit')}
        </button>
      )}
      {active && block.kind === 'code' && language !== null && (
        /*
         * The language lives on the opening fence, where it is easy to mistype and hard to find
         * in a long block. The field rewrites only that token, through the same textarea, so the
         * change commits — and undoes — like any other edit to the block.
         */
        <label className="om-block__lang">
          <span>{t('code.language')}</span>
          <input
            type="text"
            list="om-code-languages"
            value={language}
            spellCheck={false}
            data-om-testid="code-language"
            onChange={(event) => {
              const area = areaRef.current;
              if (!area) return;
              const next = setFenceLanguage(area.value, event.target.value);
              setLanguage(event.target.value);
              if (next === null || next === area.value) return;
              area.value = next;
              latest.current = next;
              window.clearTimeout(timer.current);
              timer.current = window.setTimeout(flush, COMMIT_DELAY_MS);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === 'Escape') {
                event.preventDefault();
                areaRef.current?.focus();
              }
            }}
          />
          <datalist id="om-code-languages">
            {CODE_LANGUAGES.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>
      )}
      {active && (
        <textarea
          ref={areaRef}
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
            if (block.kind === 'code') setLanguage(readFenceLanguage(event.target.value));
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(flush, COMMIT_DELAY_MS);
          }}
          onBlur={flush}
          onPaste={(event) => {
            /*
             * A pasted image cannot become part of a markdown block, so it is stored beside the
             * document and the reference is inserted as text. Nothing is written to disk until
             * the paste is committed like any other edit.
             */
            const file = Array.from(event.clipboardData.items)
              .find((item) => item.kind === 'file' && item.type.startsWith('image/'))
              ?.getAsFile();
            if (!file || !documentPath) return;
            event.preventDefault();

            const area = event.currentTarget;
            void saveImageAsset(documentPath, file)
              .then((asset) => {
                const at = area.selectionStart;
                const text = imageMarkdown(asset);
                const next = `${area.value.slice(0, at)}${text}${area.value.slice(area.selectionEnd)}`;
                latest.current = next;
                area.value = next;
                area.selectionStart = at + text.length;
                area.selectionEnd = at + text.length;
                flush();
                useStore.getState().notify('info', t('image.inserted', { path: asset.relativePath }));
              })
              .catch((error: unknown) => {
                useStore
                  .getState()
                  .notify('error', `${t('image.failed')}: ${error instanceof Error ? error.message : String(error)}`);
              });
          }}
          onKeyDown={(event) => {
            // Formatting keys belong to the block being edited, not to the window: Ctrl+1..4
            // would otherwise also switch the view mode.
            if (applyShortcutToTextarea(event.nativeEvent, event.currentTarget)) {
              event.stopPropagation();
              return;
            }
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

/** Offered in the code-block language field; any other name can still be typed. */
const CODE_LANGUAGES = [
  'bash', 'c', 'cpp', 'csharp', 'css', 'diff', 'go', 'html', 'java', 'javascript', 'json', 'kotlin',
  'latex', 'lua', 'markdown', 'matlab', 'php', 'powershell', 'python', 'r', 'ruby', 'rust', 'scala',
  'shell', 'sql', 'swift', 'toml', 'tsx', 'typescript', 'xml', 'yaml',
];
