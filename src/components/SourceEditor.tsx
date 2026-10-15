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
import { tags as t } from '@lezer/highlight';
import { normalizeEol } from '@/core/fs/encoding';
import type { DocumentState } from '@/app/store';

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
  { tag: t.heading, color: 'var(--om-accent)', fontWeight: '650' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: 'var(--om-accent)' },
  { tag: t.url, color: 'var(--om-text-muted)', textDecoration: 'underline' },
  { tag: t.monospace, color: 'var(--om-success)' },
  { tag: t.quote, color: 'var(--om-text-muted)', fontStyle: 'italic' },
  { tag: t.list, color: 'var(--om-accent)' },
  { tag: t.contentSeparator, color: 'var(--om-border-strong)' },
  { tag: t.comment, color: 'var(--om-text-faint)' },
  { tag: t.processingInstruction, color: 'var(--om-text-faint)' },
  { tag: t.keyword, color: 'var(--om-error)' },
  { tag: t.string, color: 'var(--om-success)' },
  { tag: t.number, color: 'var(--om-warning)' },
  { tag: t.typeName, color: 'var(--om-accent)' },
  { tag: t.invalid, color: 'var(--om-error)' },
]);

interface SourceEditorProps {
  doc: DocumentState;
  /** Receives LF-normalised text; the store restores the document's line-ending style. */
  onChange: (normalizedSource: string) => void;
  readOnly: boolean;
}

export function SourceEditor({ doc, onChange, readOnly }: SourceEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [caret, setCaret] = useState({ line: 1, column: 1 });

  // Callbacks are read through refs so a new `onChange` identity does not rebuild the view.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

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
          wrapCompartment.current.of(EditorView.lineWrapping),
          readOnlyCompartment.current.of(EditorState.readOnly.of(readOnly)),
          theme,
          EditorView.updateListener.of((update) => {
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
