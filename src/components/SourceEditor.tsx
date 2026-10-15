import { useCallback, useEffect, useRef, useState } from 'react';
import type { DocumentState } from '@/app/store';

/**
 * Source editor.
 *
 * This is a real, byte-exact editor: the textarea holds the authoritative markdown, so
 * whatever the author types is exactly what is written back. Unlike a DOM-backed
 * "wysiwyg" editor it cannot normalise list markers, line endings or fence info strings
 * behind the author's back — which is precisely the property the product requires.
 *
 * A CodeMirror 6 surface with syntax highlighting, bracket matching and multi-cursor
 * replaces this in the editing milestone; the contract (value in, `onChange` out) stays.
 */

interface SourceEditorProps {
  doc: DocumentState;
  onChange: (source: string) => void;
  /** Reported so the status bar can show a caret position. */
  onCursorChange?: (line: number, column: number) => void;
  readOnly: boolean;
}

export function SourceEditor({ doc, onChange, onCursorChange, readOnly }: SourceEditorProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [caret, setCaret] = useState({ line: 1, column: 1 });

  // Scroll the caret back into view when a new document loads.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.scrollTop = 0;
    setCaret({ line: 1, column: 1 });
  }, [doc.path]);

  const reportCaret = useCallback(
    (node: HTMLTextAreaElement) => {
      const upto = node.value.slice(0, node.selectionStart);
      const lines = upto.split('\n');
      const line = lines.length;
      const column = (lines[lines.length - 1]?.length ?? 0) + 1;
      setCaret({ line, column });
      onCursorChange?.(line, column);
    },
    [onCursorChange],
  );

  return (
    <div className="om-source">
      <textarea
        ref={ref}
        className="om-source__area"
        value={doc.source}
        readOnly={readOnly}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        wrap="off"
        aria-label="Markdown source"
        onChange={(event) => onChange(event.target.value)}
        onKeyUp={(event) => reportCaret(event.currentTarget)}
        onClick={(event) => reportCaret(event.currentTarget)}
        onSelect={(event) => reportCaret(event.currentTarget)}
        // Tab must insert a tab, not move focus: this is a text editor, not a form.
        onKeyDown={(event) => {
          if (event.key !== 'Tab' || readOnly) return;
          event.preventDefault();
          const node = event.currentTarget;
          const { selectionStart, selectionEnd, value } = node;
          const next = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`;
          onChange(next);
          requestAnimationFrame(() => {
            node.selectionStart = selectionStart + 2;
            node.selectionEnd = selectionStart + 2;
          });
        }}
      />
      <div className="om-source__caret" aria-hidden="true">
        {caret.line}:{caret.column}
      </div>
    </div>
  );
}
