import { Prec, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  insertBlock,
  insertLink,
  setHeading,
  shiftHeading,
  toggleLinePrefix,
  toggleWrap,
  type EditResult,
  type TextSelection,
} from '@/core/markdown/edit-commands';
import { continueList, shiftListItems } from '@/core/markdown/list-commands';

/**
 * The Markdown formatting shortcuts, shared by the source editor and the instant-mode block
 * editor.
 *
 * Keys follow Typora, which is what this app's users bring as muscle memory. They are matched
 * on `event.code` — the physical key — so `Ctrl+Shift+[` works the same on layouts where `[`
 * needs AltGr or produces a different character.
 */

type Command = (text: string, sel: TextSelection) => EditResult;

export interface MarkdownShortcut {
  /** Physical key, as `KeyboardEvent.code`. */
  code: string;
  shift?: boolean;
  alt?: boolean;
  /** Human-readable key, for the user guide and tooltips. */
  keys: string;
  command: Command;
}

const heading = (level: number): Command => (text, sel) => setHeading(text, sel, level);

export const MARKDOWN_SHORTCUTS: readonly MarkdownShortcut[] = [
  { code: 'KeyB', keys: 'Ctrl+B', command: (t, s) => toggleWrap(t, s, '**') },
  { code: 'KeyI', keys: 'Ctrl+I', command: (t, s) => toggleWrap(t, s, '*') },
  { code: 'KeyU', keys: 'Ctrl+U', command: (t, s) => toggleWrap(t, s, '<u>', '</u>') },
  { code: 'Digit5', alt: true, shift: true, keys: 'Alt+Shift+5', command: (t, s) => toggleWrap(t, s, '~~') },
  { code: 'Backquote', shift: true, keys: 'Ctrl+Shift+`', command: (t, s) => toggleWrap(t, s, '`') },
  { code: 'KeyK', keys: 'Ctrl+K', command: (t, s) => insertLink(t, s) },
  { code: 'KeyI', shift: true, keys: 'Ctrl+Shift+I', command: (t, s) => insertLink(t, s, true) },
  { code: 'Digit0', keys: 'Ctrl+0', command: heading(0) },
  { code: 'Digit1', keys: 'Ctrl+1', command: heading(1) },
  { code: 'Digit2', keys: 'Ctrl+2', command: heading(2) },
  { code: 'Digit3', keys: 'Ctrl+3', command: heading(3) },
  { code: 'Digit4', keys: 'Ctrl+4', command: heading(4) },
  { code: 'Digit5', keys: 'Ctrl+5', command: heading(5) },
  { code: 'Digit6', keys: 'Ctrl+6', command: heading(6) },
  { code: 'Equal', keys: 'Ctrl+=', command: (t, s) => shiftHeading(t, s, 1) },
  { code: 'Minus', keys: 'Ctrl+-', command: (t, s) => shiftHeading(t, s, -1) },
  { code: 'KeyQ', shift: true, keys: 'Ctrl+Shift+Q', command: (t, s) => toggleLinePrefix(t, s, 'quote') },
  { code: 'BracketLeft', shift: true, keys: 'Ctrl+Shift+[', command: (t, s) => toggleLinePrefix(t, s, 'ordered') },
  { code: 'BracketRight', shift: true, keys: 'Ctrl+Shift+]', command: (t, s) => toggleLinePrefix(t, s, 'bullet') },
  { code: 'KeyX', shift: true, keys: 'Ctrl+Shift+X', command: (t, s) => toggleLinePrefix(t, s, 'task') },
  { code: 'KeyK', shift: true, keys: 'Ctrl+Shift+K', command: (t, s) => insertBlock(t, s, 'code') },
  { code: 'KeyM', shift: true, keys: 'Ctrl+Shift+M', command: (t, s) => insertBlock(t, s, 'math') },
  { code: 'KeyT', keys: 'Ctrl+T', command: (t, s) => insertBlock(t, s, 'table') },
];

/** The shortcut an event triggers, or null. Every shortcut needs Ctrl (Cmd on macOS). */
export function matchShortcut(event: KeyboardEvent): MarkdownShortcut | null {
  if (!(event.ctrlKey || event.metaKey) && !event.altKey) return null;
  for (const shortcut of MARKDOWN_SHORTCUTS) {
    const wantsMod = !shortcut.alt;
    if (wantsMod !== (event.ctrlKey || event.metaKey)) continue;
    if (Boolean(shortcut.alt) !== event.altKey) continue;
    if (Boolean(shortcut.shift) !== event.shiftKey) continue;
    if (shortcut.code === event.code) return shortcut;
  }
  return null;
}

/**
 * List keys: Tab / Shift+Tab nest and un-nest list items (renumbering ordered lists), and — in
 * editors that ask for it — Enter continues the list. Returns null when the key does not apply
 * here (not on a list item, or a different key), so the editor's own behaviour runs instead.
 */
function listKeyCommand(event: KeyboardEvent, withEnter: boolean): Command | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (event.key === 'Tab') {
    const direction = event.shiftKey ? -1 : 1;
    return (text, sel) => shiftListItems(text, sel, direction) ?? NOT_APPLICABLE;
  }
  if (withEnter && event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    return (text, sel) => continueList(text, sel) ?? NOT_APPLICABLE;
  }
  return null;
}

/** Sentinel result: the command does not apply at this position. */
const NOT_APPLICABLE: EditResult = { changes: [], selection: { from: -1, to: -1 } };

/**
 * CodeMirror adapter. Highest precedence, because several keys collide with CodeMirror's own
 * defaults (`Ctrl+I` selects the parent syntax node, `Ctrl+Shift+K` deletes a line) and a
 * Markdown editor's formatting keys should win there.
 */
export function markdownShortcutsExtension(): Extension {
  return Prec.highest(
    EditorView.domEventHandlers({
      keydown: (event, view) => {
        // Enter is left to CodeMirror's own Markdown continuation, which already renumbers.
        const command = matchShortcut(event)?.command ?? listKeyCommand(event, false);
        if (!command || view.state.readOnly) return false;
        const range = view.state.selection.main;
        const result = command(view.state.doc.toString(), { from: range.from, to: range.to });
        if (result === NOT_APPLICABLE) return false;
        view.dispatch({
          changes: result.changes,
          selection: { anchor: result.selection.from, head: result.selection.to },
          scrollIntoView: true,
          userEvent: 'input.format',
        });
        event.preventDefault();
        return true;
      },
    }),
  );
}

/**
 * Textarea adapter for the instant-mode block editor. Returns true when the event was handled.
 *
 * The edits are collapsed into one replacement and inserted with `execCommand('insertText')`,
 * which — unlike assigning `value` — keeps the textarea's own undo stack and fires the `input`
 * event the block editor already listens to.
 */
export function applyShortcutToTextarea(event: KeyboardEvent, area: HTMLTextAreaElement): boolean {
  const command = matchShortcut(event)?.command ?? listKeyCommand(event, true);
  if (!command || area.readOnly) return false;

  const text = area.value;
  const result = command(text, { from: area.selectionStart, to: area.selectionEnd });
  if (result === NOT_APPLICABLE) return false;
  event.preventDefault();
  if (result.changes.length > 0) {
    const from = Math.min(...result.changes.map((c) => c.from));
    const to = Math.max(...result.changes.map((c) => c.to));
    let replacement = '';
    let cursor = from;
    for (const change of [...result.changes].sort((a, b) => a.from - b.from)) {
      replacement += text.slice(cursor, change.from) + change.insert;
      cursor = change.to;
    }
    replacement += text.slice(cursor, to);

    area.focus();
    area.setSelectionRange(from, to);
    const inserted =
      replacement === ''
        ? document.execCommand('delete')
        : document.execCommand('insertText', false, replacement);
    if (!inserted) {
      area.setRangeText(replacement, from, to, 'end');
      area.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  area.setSelectionRange(result.selection.from, result.selection.to);
  return true;
}
