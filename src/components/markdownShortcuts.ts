import { Prec, type EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
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
import { autoPairEdit, isPairDelimiter } from '@/core/markdown/auto-pair';
import { continueList, shiftListItems } from '@/core/markdown/list-commands';
import { useStore } from '@/app/store';

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

/**
 * The auto-pairing rules, gated on the `editor.autoPair` setting.
 *
 * Reads the store at call time rather than taking the setting as an argument: the extension is
 * installed once with the view, and a compartment would rebuild the editor for a boolean that
 * one keystroke reads anyway — the same trade the typewriter-mode listener makes.
 */
export function autoPairEnabled(): boolean {
  return useStore.getState().settings.editor.autoPair;
}

/**
 * The slice of the document `autoPairEdit` needs, as offsets local to that slice.
 *
 * It avoids reading out and scanning a multi-megabyte string on every keystroke.
 *
 * **The window is not exactly equivalent to the whole document, and cannot be.** It reaches
 * back 4,000 characters; a paragraph longer than that — a single unbroken paragraph, no blank
 * line — loses the "a delimiter is already open" veto if the stray delimiter sits further back
 * than the window. The consequence is a redundant closing half, which the user deletes, not
 * corrupted text: every other rule is local to the caret and unaffected. Raising the bound
 * trades that rare case against paying more per keystroke on a large file.
 */
function windowAround(view: EditorView, from: number, to: number): { text: string; from: number; to: number } {
  // The end of the window has to clear the selection as well as the closing run, since a
  // non-empty selection is wrapped rather than typed over.
  const start = Math.max(0, from - 4_000);
  const end = Math.min(view.state.doc.length, Math.max(to, from) + 64);
  return { text: view.state.sliceDoc(start, end), from: from - start, to: to - start };
}

/**
 * True when `pos` sits inside a code block, an inline code span or a fence — places where
 * Markdown emphasis does not apply and an inserted pair would be literal text.
 *
 * Read from the syntax tree the editor already maintains, so there is no second parser and no
 * regular-expression guesswork. `resolveInner` with the default side lands on the innermost node
 * that actually contains the position.
 */
function inCode(state: EditorState, pos: number): boolean {
  // Typed structurally rather than imported from `@lezer/common`: that package is a transitive
  // dependency, and pnpm's strict layout does not expose it to this workspace.
  // The walk needs no type import: `parent` is `null` at the root, which typing infers from
  // `resolveInner` itself once the loop variable is left unannotated.
  for (let node = syntaxTree(state).resolveInner(pos, -1) as ReturnType<typeof syntaxTree>['topNode'] | null;
       node;
       node = node.parent) {
    if (CODE_NODES.has(node.name)) return true;
  }
  return false;
}

/** Node names that mean "literal text": emphasis delimiters typed here are not markup. */
const CODE_NODES: ReadonlySet<string> = new Set(['FencedCode', 'CodeBlock', 'InlineCode', 'CodeText']);

/**
 * CodeMirror adapter for auto-pairing.
 *
 * Uses `EditorView.inputHandler` rather than `domEventHandlers({ keydown })` because a keydown
 * handler sees the key, not the resulting edit: it cannot tell a `*` typed over a selection from
 * one typed at a caret, and it would have to re-implement CodeMirror's own selection replacement.
 * The input handler receives the range and the text actually being inserted, which is exactly the
 * input `autoPairEdit` is written against. It also runs for input that never produced a keydown at
 * all, such as a synthetic insert.
 *
 * **Composition is the reason this is not a plain `input` listener.** During IME composition
 * (Chinese, Japanese, Korean) WebView2 delivers intermediate text with the pinyin still in it; a
 * pair inserted then lands in the middle of a syllable. CodeMirror's own `closeBrackets` bails out
 * on `composing` for the same reason, and this does too.
 */
export function autoPairExtension(): Extension {
  return Prec.high(
    EditorView.inputHandler.of((view, from, to, insert) => {
      /*
       * Cheapest checks first, and the delimiter test before anything that touches the
       * document. A 3 MB file costs 2.6 ms to read out and scan, which is visible as input
       * lag if every letter pays it — and almost every letter is not a delimiter.
       */
      if (!isPairDelimiter(insert)) return false;
      if (!autoPairEnabled() || view.state.readOnly) return false;
      // Mid-composition text is provisional: the user is still choosing a character.
      if (view.composing || view.compositionStarted) return false;
      // Inside code a delimiter is literal, so a closing half would corrupt the listing.
      if (inCode(view.state, from)) return false;
      const result = autoPairEdit({ ...windowAround(view, from, to), insert });
      if (!result) return false;
      view.dispatch({
        changes: result.changes,
        selection: { anchor: result.selection.from, head: result.selection.to },
        scrollIntoView: true,
        userEvent: 'input.type',
      });
      return true;
    }),
  );
}

/**
 * Textarea adapter for the instant-mode block editor. Returns true when the event was handled.
 *
 * Installed on `beforeinput`, not on `input`: the browser has already committed the character by
 * the time `input` fires, and compensating for it afterwards means a visible flicker and a fight
 * with the undo stack. `beforeinput` can still be cancelled, and `execCommand('insertText')`
 * replaces the keystroke with the balanced pair in a single undoable step — the same mechanism
 * `applyShortcutToTextarea` uses, for the same reason.
 *
 * `insertCompositionText` is skipped: that is the IME mid-composition event, and pairing there
 * would insert delimiters between pinyin letters.
 */
export function applyAutoPairToTextarea(event: InputEvent, area: HTMLTextAreaElement): boolean {
  if (!autoPairEnabled() || area.readOnly) return false;
  if (event.inputType !== 'insertText' || event.isComposing) return false;
  const result = autoPairEdit({
    text: area.value,
    from: area.selectionStart,
    to: area.selectionEnd,
    insert: event.data ?? '',
  });
  if (!result) return false;

  /*
   * `preventDefault` on `beforeinput` stops the character from landing, so the pair is the only
   * thing inserted. The edit is written through `setRangeText` rather than `execCommand`:
   * `execCommand('insertText')` is asynchronous with respect to the DOM — it returns before the
   * selection it implies is applied — so a `setSelectionRange` straight afterwards is silently
   * overwritten and the caret ends up after the closing half instead of between the halves,
   * which is the entire point of the feature.
   */
  event.preventDefault();
  const text = area.value;
  const from = Math.min(...result.changes.map((c) => c.from));
  const to = Math.max(...result.changes.map((c) => c.to));
  let replacement = '';
  let cursor = from;
  for (const change of [...result.changes].sort((a, b) => a.from - b.from)) {
    replacement += text.slice(cursor, change.from) + change.insert;
    cursor = change.to;
  }
  replacement += text.slice(cursor, to);

  area.setRangeText(replacement, from, to, 'preserve');
  area.setSelectionRange(result.selection.from, result.selection.to);
  // The block editor commits on `input`, so one is dispatched explicitly: `setRangeText` does
  // not fire it, and without it the edit would sit in the textarea until the next keystroke.
  area.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}
