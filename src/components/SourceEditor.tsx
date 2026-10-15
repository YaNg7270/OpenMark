import { useEffect, useRef, useState } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, HighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { tags } from '@lezer/highlight';
import { normalizeEol } from '@/core/fs/encoding';
import { useStore, type DocumentState } from '@/app/store';
import { imageMarkdown, saveImageAsset } from '@/core/fs/assets';
import { t } from '@/i18n';

/**
 * Markdown source editor built on CodeMirror 6.
 *
 * ## Fidelity first
 *
 * The editor works in **LF-normalised space** and hands normalised text to `onChange`, which
 * restores the document's own line-ending style. This is not a detail: a `<textarea>` and a
 * contenteditable both normalise line breaks as a platform behaviour, so an editor that
 * committed what it displayed would convert every CRLF file to LF on the next save.
 *
 * ## Why the view is not controlled by React
 *
 * A CodeMirror view owns its own state, undo history, selection and scroll position. Driving
 * it from a React `value` prop would mean destroying and rebuilding the document on every
 * keystroke, losing the caret, the selection and the undo stack. The view is therefore
 * created once and updated through transactions; React only tells it when a *different*
 * document has been opened.
 *
 * ## Undo history
 *
 * History is CodeMirror's, not the browser's, so Ctrl+Z behaves correctly for a code editor:
 * it coalesces typing, restores selection, and is cleared when a different file is opened.
 * That clear is essential — undoing into the previous document's text would be data loss.
 */

const theme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'transparent',
    color: 'var(--om-text)',
    fontSize: '13px',
  },
  '.cm-scroller': {
    fontFamily: 'var(--om-font-mono)',
    lineHeight: '1.65',
    overflow: 'auto',
  },
  '.cm-content': {
    caretColor: 'var(--om-accent)',
    padding: '12px 0 40vh',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--om-text-faint)',
    border: 'none',
    paddingInlineEnd: '6px',
  },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--om-accent) 6%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--om-text-muted)' },
  '&.cm-focused .cm-cursor, .cm-cursor': { borderLeftColor: 'var(--om-accent)', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--om-accent) 28%, transparent)',
  },
  '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, var(--om-warning) 35%, transparent)' },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'color-mix(in srgb, var(--om-accent) 45%, transparent)',
  },
  '.cm-panels': {
    backgroundColor: 'var(--om-bg-subtle)',
    color: 'var(--om-text)',
    border: 'none',
    borderTop: '1px solid var(--om-border)',
  },
  '.cm-panels input, .cm-panels button': {
    font: 'inherit',
    fontSize: '12px',
    padding: '2px 6px',
    border: '1px solid var(--om-border)',
    borderRadius: 'var(--om-radius-sm)',
    background: 'var(--om-bg-elevated)',
    color: 'var(--om-text)',
  },
  '.cm-tooltip': {
    backgroundColor: 'var(--om-bg-elevated)',
    border: '1px solid var(--om-border)',
    borderRadius: 'var(--om-radius-sm)',
  },
});

/**
 * Markdown syntax highlighting mapped onto the app's design tokens, so the editor follows the
 * light/dark theme without a second palette to maintain.
 */
const highlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: 'var(--om-accent)', fontWeight: '650' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: 'var(--om-accent)' },
  { tag: tags.url, color: 'var(--om-text-muted)', textDecoration: 'underline' },
  { tag: tags.monospace, color: 'var(--om-success)' },
  { tag: tags.quote, color: 'var(--om-text-muted)', fontStyle: 'italic' },
  { tag: tags.list, color: 'var(--om-accent)' },
  { tag: tags.contentSeparator, color: 'var(--om-border-strong)' },
  { tag: tags.comment, color: 'var(--om-text-faint)' },
  { tag: tags.processingInstruction, color: 'var(--om-text-faint)' },
  { tag: tags.keyword, color: 'var(--om-error)' },
  { tag: tags.string, color: 'var(--om-success)' },
  { tag: tags.number, color: 'var(--om-warning)' },
  { tag: tags.typeName, color: 'var(--om-accent)' },
  { tag: tags.invalid, color: 'var(--om-error)' },
]);

/**
 * Keeps the caret line at a fixed height in the viewport.
 *
 * This is what "typewriter mode" means for an editor: the text moves under a stationary
 * insertion point instead of the insertion point travelling down the screen. Only typing and
 * deliberate caret movement recentre — recentring on a scroll would make the document
 * impossible to read ahead in, which is the opposite of useful.
 *
 * The adjustment nudges `scrollTop` by the measured distance rather than calling
 * `scrollIntoView`, so it never fights CodeMirror's own scrolling and never animates.
 */
function centreCaret(view: EditorView): void {
  const head = view.state.selection.main.head;
  const caret = view.coordsAtPos(head);
  if (!caret) return;

  const scroller = view.scrollDOM;
  const bounds = scroller.getBoundingClientRect();
  // 40% from the top leaves more of the paragraph being written visible than the one just
  // finished.
  const target = bounds.top + bounds.height * 0.4;
  const delta = caret.top - target;
  if (Math.abs(delta) > 2) scroller.scrollTop += delta;
}

/**
 * Returns the first image on a clipboard or drag payload, if any.
 *
 * Copying a picture out of a browser or a screenshot tool puts the bytes in `items` rather
 * than `files`, so both are checked; a plain file drag only populates `files`.
 */
function findImage(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const item of data.items) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
    const file = item.getAsFile();
    if (file) return file;
  }
  for (const file of data.files) {
    if (file.type.startsWith('image/')) return file;
  }
  return null;
}

interface SourceEditorProps {
  doc: DocumentState;
  /** Receives LF-normalised text; the store restores the document's line-ending style. */
  onChange: (normalizedSource: string) => void;
  readOnly: boolean;
}

/** Saves an image next to the document and inserts the markdown that references it. */
async function insertImageAtCaret(
  view: EditorView,
  file: File,
  documentPath: string | null,
  at?: number,
): Promise<void> {
  if (!documentPath) {
    useStore.getState().notify('warning', t('image.saveFirst'));
    return;
  }
  const notify = useStore.getState().notify;
  try {
    const asset = await saveImageAsset(documentPath, file);
    const position = at ?? view.state.selection.main.head;
    const insertion = imageMarkdown(asset);
    view.dispatch({
      changes: { from: position, insert: insertion },
      selection: { anchor: position + insertion.length },
      scrollIntoView: true,
    });
    notify(asset.absolutePath ? 'info' : 'warning', t('image.inserted', { path: asset.relativePath }));
  } catch (error) {
    notify('error', `${t('image.failed')}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function SourceEditor({ doc, onChange, readOnly }: SourceEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [caret, setCaret] = useState({ line: 1, column: 1 });

  // Callbacks are read through refs so a new `onChange` identity does not rebuild the view.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Read through a ref so the paste handler installed once always sees the current document.
  const documentPathRef = useRef(doc.path);
  documentPathRef.current = doc.path;

  const readOnlyCompartment = useRef(new Compartment());
  const wrapCompartment = useRef(new Compartment());

  // One view per document; recreated only when the file itself changes.
  const documentKey = `${doc.path ?? ''}`;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: normalizeEol(doc.source),
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          history(),
          drawSelection(),
          dropCursor(),
          EditorState.allowMultipleSelections.of(true),
          indentOnInput(),
          bracketMatching(),
          rectangularSelection(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          // Built-in find/replace, active when the editor has focus. The sidebar search
          // serves the reading views; this one serves the source view.
          search({ top: true }),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
          markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: true }),
          syntaxHighlighting(highlightStyle),
          /*
           * CodeMirror's content element is a textbox to assistive technology, so it needs a
           * name — an unnamed textbox is announced as "edit, blank" — and it needs to be an
           * explicit tab stop. Without `tabindex`, axe reports the surrounding `.cm-scroller`
           * as a scrollable region with no keyboard access, which is accurate: a keyboard user
           * could not reach the text at all.
           */
          EditorView.contentAttributes.of({
            'aria-label': t('editor.label'),
            tabindex: '0',
          }),
          EditorView.domEventHandlers({
            paste: (event, view) => {
              const file = findImage(event.clipboardData);
              if (!file) return false;
              // Handled here rather than by the browser, which would do nothing with it.
              event.preventDefault();
              void insertImageAtCaret(view, file, documentPathRef.current);
              return true;
            },
            drop: (event, view) => {
              const file = findImage(event.dataTransfer);
              if (!file) return false;
              event.preventDefault();
              const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
              void insertImageAtCaret(view, file, documentPathRef.current, position ?? undefined);
              return true;
            },
          }),
          wrapCompartment.current.of(EditorView.lineWrapping),
          readOnlyCompartment.current.of(EditorState.readOnly.of(readOnly)),
          theme,
          EditorView.updateListener.of((update) => {
            // Read the setting at update time rather than reconfiguring the extension: a
            // compartment adds a rebuild for something that is one boolean per keystroke.
            if (
              update.docChanged &&
              useStore.getState().settings.reading.typewriterMode &&
              !update.view.composing
            ) {
              centreCaret(update.view);
            }
            if (update.docChanged) {
              // Only the edit is forwarded; the view keeps ownership of its own state.
              onChangeRef.current(update.state.doc.toString());
            }
            if (update.selectionSet || update.docChanged) {
              const head = update.state.selection.main.head;
              const line = update.state.doc.lineAt(head);
              setCaret({ line: line.number, column: head - line.from + 1 });
            }
          }),
        ],
      }),
    });

    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Intentionally keyed on the document identity only: rebuilding on content change would
    // destroy the undo history and the caret on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentKey]);

  // Adopt content that changed outside this editor (a block edit, a reload from disk).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const next = normalizeEol(doc.source);
    const current = view.state.doc.toString();
    if (next === current) return;

    /*
     * Reached only when the text changed outside this editor — a reload from disk, or a block
     * edit made in instant mode. Applying it as a single minimal splice keeps the caret and
     * scroll position, which a rebuild would lose.
     *
     * Undo history is intentionally left alone: this is the same document, so stepping back
     * through its own history is correct. A *different* file recreates the view entirely
     * (see `documentKey`), which is what clears the history and prevents undoing into another
     * document's text.
     */
    view.dispatch({
      changes: { from: 0, to: current.length, insert: next },
      selection: { anchor: Math.min(view.state.selection.main.anchor, next.length) },
      scrollIntoView: false,
    });
  }, [doc.source, doc.hash]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: readOnlyCompartment.current.reconfigure(EditorState.readOnly.of(readOnly)),
    });
  }, [readOnly]);

  return (
    <div className="om-source">
      <div className="om-source__host" ref={hostRef} data-om-editor="source" />
      <div className="om-source__caret" aria-hidden="true" data-om-testid="source-caret">
        {caret.line}:{caret.column}
      </div>
    </div>
  );
}
